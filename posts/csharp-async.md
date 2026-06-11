---
title: C# 异步编程（async/await）
date: 2026-06-11
tags: [C#, async, await, Task]
summary: 异步本质、状态机、ConfigureAwait、ValueTask、异步流、取消、异常、常见死锁与最佳实践。
---

# C# async / await

异步 = 让 IO 等待期间释放线程做别的事。`async/await` 把异步代码写得像同步。

## 一、基本写法

```csharp
public async Task<string> GetAsync(string url) {
    using var http = new HttpClient();
    HttpResponseMessage resp = await http.GetAsync(url);
    string body = await resp.Content.ReadAsStringAsync();
    return body;
}
```

`async` 修饰方法 → 方法可包含 `await`。`await` 拆点：之前同步执行，之后挂在 Task 完成回调上。

返回类型：
- `Task` / `Task<T>`：普通异步；
- `ValueTask` / `ValueTask<T>`：可能同步完成的高频热路径，少一次堆分配；
- `void`：**只用于事件处理器**，否则异常不可捕获、Task 不可观察；
- 自定义任务类型（C# 7+）：底层基础设施才用。

## 二、状态机原理

编译器把每个 `async` 方法翻译成一个状态机（`IAsyncStateMachine`），`await` 处保存局部变量，注册延续（continuation）：

```text
1. 进入方法
2. 同步跑到第一个 await
3. await 检查 Task：
   - 已完成 → 直接拿结果继续
   - 未完成 → 把"剩余代码"作为 continuation 挂到 Task 上，返回未完成的 Task
4. Task 完成时，由原 SynchronizationContext 或 ThreadPool 调度 continuation 跑下半段
```

效果：一次 IO 阻塞期间线程被归还到池里。

## 三、ConfigureAwait(false)

`await` 默认会捕获当前 `SynchronizationContext`（UI 线程、ASP.NET 经典上下文），完成后回到原上下文继续。

**库代码**应该 `ConfigureAwait(false)` 跳过这个捕获：

```csharp
var data = await http.GetStringAsync(url).ConfigureAwait(false);
```

理由：避免不必要的上下文切换；防止"主线程同步等待异步"造成死锁。

ASP.NET Core 没有 `SynchronizationContext`，库以外的应用代码可不写。WPF/WinForms 库必须写。

## 四、并发组合

```csharp
// 并行启动，全部完成
var (a, b) = (FetchA(), FetchB());     // 两个 Task 已启动
int ra = await a;
int rb = await b;

// 或者
await Task.WhenAll(a, b);

// 任意一个完成
Task done = await Task.WhenAny(t1, t2);

// 超时
var work = LongJobAsync();
if (await Task.WhenAny(work, Task.Delay(5000)) == work)
    Console.WriteLine(work.Result);
else
    throw new TimeoutException();

// .NET 6+：Task 自带 WaitAsync
await work.WaitAsync(TimeSpan.FromSeconds(5));
```

## 五、取消

```csharp
async Task DoAsync(CancellationToken ct) {
    while (true) {
        ct.ThrowIfCancellationRequested();
        await Task.Delay(100, ct);
    }
}

var cts = new CancellationTokenSource(3000);
try { await DoAsync(cts.Token); }
catch (OperationCanceledException) { /* 处理 */ }
```

设计原则：
- 所有公开异步方法接受 `CancellationToken ct = default`；
- 把 token 一路传下去；
- `OperationCanceledException` 由 await 内自动抛，不要吞掉。

## 六、异常

异步异常被包装进 Task。`await` 时重新抛出原始异常（不是 `AggregateException`，除非用 `.Result/.Wait`）：

```csharp
try { await BadAsync(); }
catch (HttpRequestException ex) { ... }
```

`Task.WhenAll` 多个异常会包装成 `AggregateException`，但 `await` 只重新抛**第一个**。要拿全部：

```csharp
var t = Task.WhenAll(t1, t2, t3);
try { await t; }
catch { foreach (var ex in t.Exception!.InnerExceptions) Log(ex); }
```

`async void` 异常无法捕获，会导致进程崩溃。

## 七、ValueTask

`Task` 是引用类型，每次返回都堆分配。`ValueTask<T>` 是结构体，热路径里多数同步完成可省分配。

```csharp
public ValueTask<int> GetCachedAsync(int id) {
    if (_cache.TryGetValue(id, out var v)) return new(v);
    return new(LoadAsync(id));
}
```

约束：
- 只能 `await` 一次；
- 不能多次 `.Result` / `.AsTask()` 转换；
- 误用比 `Task` 还坑，热路径才用。

## 八、异步流 IAsyncEnumerable

```csharp
public async IAsyncEnumerable<string> ReadLinesAsync(string path,
    [EnumeratorCancellation] CancellationToken ct = default) {
    using var sr = new StreamReader(path);
    string? line;
    while ((line = await sr.ReadLineAsync(ct)) != null)
        yield return line;
}

await foreach (var line in ReadLinesAsync("a.txt").WithCancellation(ct)) {
    Process(line);
}
```

适合数据库流式查询、SignalR、gRPC 服务端流。

## 九、Task.Run 与 CPU 密集

UI 线程不要跑 CPU 密集，开线程池：

```csharp
private async void OnClick(...) {
    var r = await Task.Run(() => HeavyCompute());
    label.Text = r.ToString();
}
```

`Task.Run` 把同步代码丢到线程池跑；IO 异步本身不需要 `Task.Run`，那是反模式。

## 十、TaskCompletionSource

把回调式 API 转为 `Task`：

```csharp
Task<string> ReadOnceAsync(SerialPort sp) {
    var tcs = new TaskCompletionSource<string>(
        TaskCreationOptions.RunContinuationsAsynchronously);  // 重要
    sp.DataReceived += Handler;
    return tcs.Task;

    void Handler(object? s, SerialDataReceivedEventArgs e) {
        sp.DataReceived -= Handler;
        tcs.TrySetResult(sp.ReadExisting());
    }
}
```

`RunContinuationsAsynchronously` 防止 continuation 在 `TrySetResult` 调用线程上同步运行造成意外死锁。

## 十一、常见死锁

经典 WPF / WinForms / 老 ASP.NET：

```csharp
public string Get() {
    return GetAsync().Result;   // ❌ 主线程阻塞
}
async Task<string> GetAsync() {
    await Task.Delay(100);      // 默认捕获主线程同步上下文
    return "x";
}
// Delay 完成后，continuation 需要 UI 线程，UI 线程在等 Result → 永久死锁
```

修复：
1. 全栈 await，不要 `.Result/.Wait`；
2. 库内 `ConfigureAwait(false)`；
3. 顶层入口用 `await MainAsync()`。

## 十二、IProgress<T>

异步进度上报：

```csharp
public async Task DoAsync(IProgress<int>? progress = null) {
    for (int i = 1; i <= 100; i++) {
        await Task.Delay(50);
        progress?.Report(i);
    }
}

var p = new Progress<int>(v => progressBar.Value = v);  // 自动回 UI 线程
await DoAsync(p);
```

`Progress<T>` 捕获当前 SynchronizationContext，回调发到 UI 线程，安全。

## 十三、AsyncLocal

跨 await 传递上下文（请求 ID、用户）：

```csharp
private static AsyncLocal<string?> _user = new();

_user.Value = "alice";
await Task.Run(() => Console.WriteLine(_user.Value));   // alice
```

类似 Java 的 `InheritableThreadLocal`，但跟随逻辑调用链而不是物理线程。

## 十四、检查清单

- 名字加 `Async` 后缀；
- 接受并传递 `CancellationToken`；
- 库代码 `ConfigureAwait(false)`；
- 不要 `async void`；
- 不要 `.Result/.Wait`；
- IO 不需要 `Task.Run`；CPU 才需要；
- 高频同步完成路径用 `ValueTask`；
- 大量并发用 `SemaphoreSlim` 限流；
- 流式数据用 `IAsyncEnumerable<T>`；
- 接口式 API 用 `TaskCompletionSource` 桥接。
