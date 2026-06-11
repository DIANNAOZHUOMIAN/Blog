---
title: C# 线程与并发
date: 2026-06-11
tags: [C#, 线程, 并发, 锁]
summary: 线程基础、线程池、Task、同步原语、并发集合、内存模型与死锁排查。
---

# C# 线程与并发

## 一、Thread 基础

```csharp
var t = new Thread(() => DoWork()) {
    IsBackground = true,        // 后台线程，主线程退出即终止
    Name = "Worker",
    Priority = ThreadPriority.Normal,
};
t.Start();
t.Join();                       // 等待结束

Thread.Sleep(100);              // 让出 CPU 100ms
Thread.CurrentThread.ManagedThreadId;
```

前台线程会阻止进程退出；后台线程不会。日志、心跳等通常设 `IsBackground = true`。

## 二、ThreadPool（线程池）

`Thread` 每次创建昂贵（栈默认 1MB，分配/调度成本高）。短任务用线程池：

```csharp
ThreadPool.QueueUserWorkItem(_ => DoWork());
```

更推荐 `Task.Run`，本质也是丢到 `ThreadPool`：

```csharp
Task.Run(() => DoWork());
```

线程池有最小/最大线程数限制，IO 密集场景突发可能起不来，导致 await 排队。可调：

```csharp
ThreadPool.SetMinThreads(workerThreads: 50, completionPortThreads: 50);
```

## 三、Task / TPL

`Task` 表示一个异步操作，可组合：

```csharp
Task<int> t1 = Task.Run(() => Compute1());
Task<int> t2 = Task.Run(() => Compute2());
int sum = (await t1) + (await t2);

await Task.WhenAll(t1, t2);              // 等全部完成
Task done = await Task.WhenAny(t1, t2);  // 等第一个完成

Task.Delay(1000);
Task.FromResult(42);
Task.CompletedTask;
Task.FromException(new Exception());
```

`Task` vs `Thread`：Task 是抽象的工作单元，可能根本不占线程（IO 异步）；Thread 是 OS 线程。

## 四、Parallel

数据并行：

```csharp
Parallel.For(0, 1000, i => Process(i));
Parallel.ForEach(items, item => Handle(item));

// 异步
await Parallel.ForEachAsync(urls,
    new ParallelOptions { MaxDegreeOfParallelism = 8 },
    async (url, ct) => await DownloadAsync(url, ct));
```

适合 CPU 密集、循环无依赖。

`Parallel.Invoke` 同时跑多个任务：

```csharp
Parallel.Invoke(() => A(), () => B(), () => C());
```

## 五、同步原语对比

| 原语 | 跨进程 | 用途 |
|---|---|---|
| `lock` (`Monitor`) | ✗ | 单进程，最常用 |
| `Mutex` | ✓ | 跨进程互斥，单实例应用 |
| `Semaphore` / `SemaphoreSlim` | `Semaphore`✓ / `SemaphoreSlim`✗ | 限流，N 个并发 |
| `ReaderWriterLockSlim` | ✗ | 读多写少 |
| `Interlocked` | ✗ | 原子加减、CAS |
| `SpinLock` / `SpinWait` | ✗ | 超短临界区 |
| `ManualResetEventSlim` / `AutoResetEvent` | `Slim`✗ | 信号量同步 |
| `Barrier` | ✗ | 多线程相互等待到栅栏 |
| `CountdownEvent` | ✗ | 倒计数 |

### lock 用法

```csharp
private readonly object _lock = new();

void Add(int x) {
    lock (_lock) {       // 等价 Monitor.Enter/Exit + try/finally
        _sum += x;
    }
}
```

注意：
- 锁对象用 `private readonly object`，不要锁 `this`、`typeof(T)`、字符串字面量；
- 临界区越短越好，不要在锁内 IO、await；
- C# 13 引入 `Lock` 类型，更清晰。

### SemaphoreSlim 限流

```csharp
private static readonly SemaphoreSlim _gate = new(initialCount: 8, maxCount: 8);

async Task DoAsync() {
    await _gate.WaitAsync();
    try { await WorkAsync(); }
    finally { _gate.Release(); }
}
```

### Interlocked

```csharp
Interlocked.Increment(ref _counter);
Interlocked.Add(ref _total, x);
Interlocked.CompareExchange(ref _state, newVal, oldVal);
Interlocked.Exchange(ref _ref, newObj);
```

无锁 CAS，比 lock 快得多，但只适合简单原子操作。

### ReaderWriterLockSlim

```csharp
var rw = new ReaderWriterLockSlim();
rw.EnterReadLock();   try { ... } finally { rw.ExitReadLock(); }
rw.EnterWriteLock();  try { ... } finally { rw.ExitWriteLock(); }
```

读多写少场景比 lock 吞吐高。

## 六、并发集合

| 集合 | 替代 |
|---|---|
| `ConcurrentDictionary<,>` | `Dictionary` |
| `ConcurrentQueue<>` | `Queue` |
| `ConcurrentStack<>` | `Stack` |
| `ConcurrentBag<>` | 无序集合 |
| `BlockingCollection<>` | 生产者-消费者 |

```csharp
var dict = new ConcurrentDictionary<string,int>();
dict.AddOrUpdate("k", 1, (k, old) => old + 1);
dict.GetOrAdd("k", k => 0);
dict.TryRemove("k", out _);
```

注意 `AddOrUpdate` 工厂可能并发执行多次，要么幂等，要么自己加锁。

## 七、生产者 - 消费者

`Channel<T>`（推荐，现代高性能）：

```csharp
var ch = Channel.CreateBounded<int>(capacity: 100);
_ = Task.Run(async () => {
    for (int i = 0; i < 1000; i++)
        await ch.Writer.WriteAsync(i);
    ch.Writer.Complete();
});
await foreach (var x in ch.Reader.ReadAllAsync())
    Process(x);
```

`BlockingCollection<T>`（老风格）也可用。

## 八、内存模型

CLR 内存模型保证：

- 写后读（同一线程）按序；
- 跨线程顺序需要内存屏障：`volatile`、`Interlocked`、`Thread.MemoryBarrier()`、`lock`；
- `volatile` 字段：读 = acquire，写 = release，禁止重排序，但不是"原子"，不能用于 64 位字段在 32 位平台。

```csharp
private volatile bool _stop;

void Run() {
    while (!_stop) DoWork();
}
void Stop() => _stop = true;
```

简单 bool 标志 / 双重检查锁单例 用 volatile。复杂场景用 `Interlocked` 或 `lock`。

## 九、CancellationToken

合作式取消：

```csharp
var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));   // 5s 超时
try {
    await DoAsync(cts.Token);
}
catch (OperationCanceledException) { ... }

// 内部：
async Task DoAsync(CancellationToken ct) {
    while (!ct.IsCancellationRequested) {
        ct.ThrowIfCancellationRequested();
        await Task.Delay(100, ct);    // Delay 也支持 token
    }
}
```

链接多个 token：

```csharp
using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct1, ct2);
```

## 十、死锁

四个必要条件：互斥、占有等待、不可剥夺、循环等待。

常见死锁：

1. **嵌套加锁顺序不一**：A 锁 1→2，B 锁 2→1；
2. **UI 线程同步等待异步**：`task.Result` / `task.Wait()`，await 试图回到 UI 上下文，UI 上下文却被阻塞——经典 .NET Framework WPF/WinForms 死锁；
3. **异步内调同步外部接口**：触发线程池耗尽，所有线程都在等待对方完成。

避免：
- 永远按相同顺序加锁；
- 异步用 `await`，不要 `.Result`；库代码 `ConfigureAwait(false)`；
- 用 `TryEnter` + 超时检测；
- 单元测试用 `Stress` / `Chaos`。

排查工具：`dotnet-stack`、`WinDbg` `!syncblk` / `!clrstack`、`Visual Studio` Parallel Stacks。

## 十一、ThreadLocal / AsyncLocal

```csharp
private static ThreadLocal<int> _localCount = new(() => 0);
_localCount.Value++;

private static AsyncLocal<string> _user = new();
_user.Value = "alice";    // 在 await 链路里仍可见
```

`AsyncLocal` 用于跨 await 传递上下文（请求 ID、租户、用户身份），ASP.NET Core 的 `HttpContext` 就是这样实现的。

## 十二、检查清单

- 短任务用 `Task.Run`，不要每次 `new Thread`；
- 共享可变状态加锁或用并发集合；
- IO 密集用 async/await；CPU 密集用 `Parallel` 或 `Task.Run`；
- 锁对象私有，临界区简短，禁止锁内 await；
- 全部异步流程支持 `CancellationToken`；
- 不要混用 `.Result` 和 `await`；
- 线程池突发不够大 → 提前 `SetMinThreads` 或换 `Channel`/异步流处理。
