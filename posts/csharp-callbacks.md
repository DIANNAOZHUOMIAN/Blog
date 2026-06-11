---
title: C# 回调（Callback）模式
date: 2026-06-11
tags: [C#, 回调, async]
summary: 回调的几种形态、APM/EAP/TAP 演进、TaskCompletionSource、回调地狱与现代替代。
---

# C# 回调

回调 = 把"完成后该做什么"作为参数传进去，被调方在合适时机调用。

## 一、基本形态：委托作参数

```csharp
public void DownloadAsync(string url, Action<string> onDone, Action<Exception>? onError = null) {
    Task.Run(() => {
        try {
            var data = new HttpClient().GetStringAsync(url).Result;
            onDone(data);
        } catch (Exception ex) {
            onError?.Invoke(ex);
        }
    });
}

DownloadAsync("https://x", html => Console.WriteLine(html.Length));
```

简单清晰，但层数一多容易"回调地狱"：

```csharp
LoadUser(u =>
    LoadOrders(u, os =>
        LoadItems(os[0], items =>
            Render(items, () => Done()))));
```

## 二、.NET 异步编程模型演进

### 1. APM（Asynchronous Programming Model，老）

`BeginXxx / EndXxx` + `IAsyncResult`：

```csharp
var fs = File.OpenRead("a.txt");
var buf = new byte[1024];
fs.BeginRead(buf, 0, buf.Length, ar => {
    int n = fs.EndRead(ar);
    Console.WriteLine(n);
}, null);
```

冗长易错，资源管理麻烦。已被 TAP 取代。

### 2. EAP（Event-based Asynchronous Pattern）

事件式：`XxxAsync` + `XxxCompleted` 事件 + `XxxCancel`：

```csharp
var wc = new WebClient();
wc.DownloadStringCompleted += (s, e) => {
    if (e.Error == null) Console.WriteLine(e.Result);
};
wc.DownloadStringAsync(new Uri(url));
```

WinForms 时代常用，现代代码避免。

### 3. TAP（Task-based Asynchronous Pattern，现代）

返回 `Task` / `Task<T>`，配合 `async/await`：

```csharp
public async Task<string> GetAsync(string url) {
    using var http = new HttpClient();
    return await http.GetStringAsync(url);
}
```

`async/await` 本质就是编译器替你写**回调**，但保留了顺序写法。

## 三、TaskCompletionSource：回调 → Task 桥

老 API（事件、回调）转成 Task：

```csharp
public static Task<byte[]> ReadFrameAsync(SerialPort sp, TimeSpan timeout, CancellationToken ct) {
    var tcs = new TaskCompletionSource<byte[]>(
        TaskCreationOptions.RunContinuationsAsynchronously);

    void OnData(object? s, SerialDataReceivedEventArgs e) {
        int n = sp.BytesToRead;
        var buf = new byte[n];
        sp.Read(buf, 0, n);
        tcs.TrySetResult(buf);
    }

    sp.DataReceived += OnData;
    var reg = ct.Register(() => tcs.TrySetCanceled(ct));
    var cts = new CancellationTokenSource(timeout);
    cts.Token.Register(() => tcs.TrySetException(new TimeoutException()));

    return tcs.Task.ContinueWith(t => {
        sp.DataReceived -= OnData;
        reg.Dispose();
        cts.Dispose();
        return t.GetAwaiter().GetResult();   // 透传结果/异常
    }, TaskContinuationOptions.ExecuteSynchronously);
}
```

要点：
- `RunContinuationsAsynchronously` 防止 continuation 在 SetResult 线程同步跑；
- 一定 `TrySetResult/TrySetException/TrySetCanceled`，避免重复 set 抛异常；
- 配套清理订阅、CTS。

## 四、回调中的上下文

UI 应用中回调常需切回 UI 线程：

```csharp
// 旧：手动 Invoke
control.BeginInvoke((Action)(() => label.Text = "done"));

// 现代：用 await，自动回到 UI 上下文
var data = await FetchAsync();
label.Text = data;

// 或 IProgress<T>，构造时捕获当前 SynchronizationContext
var p = new Progress<int>(v => progressBar.Value = v);
```

## 五、回调 vs 委托 vs 事件 vs Task

| 抽象 | 形态 | 适用 |
|---|---|---|
| 回调 | 方法参数（委托） | 一次性、一对一 |
| 事件 | 类成员 | 一对多通知、UI 交互 |
| `Task<T>` | 返回值 | 一次性异步结果 |
| `IObservable<T>` | 返回值 | 推送流（Rx） |
| `IAsyncEnumerable<T>` | 返回值 | 异步流，await foreach |
| `Channel<T>` | 数据结构 | 高吞吐生产者消费者 |

## 六、回调陷阱

1. **回调中操作 UI**：必须切回 UI 线程；
2. **异常吞没**：回调里抛异常一般丢失，调用方收不到——要么 `Task` 化，要么显式传 `onError`；
3. **重复触发**：异步 + 用户多次点击 → 加禁用 / 重入保护；
4. **资源生命周期**：回调里访问已释放的对象会异常，注意 `IDisposable`；
5. **回调地狱**：嵌套深时改用 async/await。

## 七、与 Promise / Future 对比

| 概念 | 实现 |
|---|---|
| Callback | 委托参数 |
| Promise / Future | `Task<T>` / `ValueTask<T>` |
| Async/Await | C# 5+ 编译器糖 |
| Continuation | `Task.ContinueWith` 或 await 后续代码 |

## 八、典型 C# 回调场景

- 计时器：`Timer(callback, state, due, period)`；
- 多线程同步：`SynchronizationContext.Post(callback, state)`；
- 文件系统观察：`FileSystemWatcher` 事件（本质是回调）；
- WCF / gRPC 双工：服务端回调客户端；
- DI 容器解析：注册工厂委托 `services.AddTransient<T>(sp => ...);`。

## 九、最佳实践

- 新代码优先 `Task` / `async`，回调只在底层桥接层用；
- 接口签名喜欢 `Func<T,Task>` 而不是 `Action<T>`，把异步性传递出去；
- 多回调（成功/失败/进度）合并成结果对象或 `Result<T>`，不要四五个委托参数；
- 始终接受 `CancellationToken`；
- 回调里抛异常用 `try/catch` 隔离，避免影响后续注册者。
