---
title: C# 事件详解
date: 2026-06-11
tags: [C#, 事件, Event]
summary: 事件本质、声明模式、线程安全触发、弱事件、内存泄漏、与 Rx 对比。
---

# C# 事件

事件是**受限的委托字段**，外部只能 `+=`/`-=`，不能直接赋值或触发。语言层级的观察者模式。

## 一、定义与触发

```csharp
public class Button {
    // 1) 字段式事件（编译器自动生成 add/remove）
    public event EventHandler? Click;

    public void OnClick() {
        // 2) 触发：本地拷贝防止多线程下 NullReference
        var h = Click;
        h?.Invoke(this, EventArgs.Empty);
    }
}

var btn = new Button();
btn.Click += (s, e) => Console.WriteLine("clicked");
btn.OnClick();
```

`Click?.Invoke(...)` 等价于上面写法（`?.` 已是原子读取）。

## 二、标准事件模式

.NET 约定：

1. 委托用 `EventHandler` 或 `EventHandler<TArgs>`；
2. `TArgs` 派生自 `EventArgs`；
3. 触发方法命名 `OnXxx`，`protected virtual` 让子类可覆盖；
4. 第一个参数 `object? sender`，第二个事件数据。

```csharp
public class DataEventArgs : EventArgs {
    public byte[] Data { get; }
    public DataEventArgs(byte[] d) { Data = d; }
}

public class Reader {
    public event EventHandler<DataEventArgs>? DataReceived;
    protected virtual void OnDataReceived(DataEventArgs e)
        => DataReceived?.Invoke(this, e);

    public void Run(byte[] data) => OnDataReceived(new(data));
}
```

## 三、自定义 add / remove

需要自定义订阅逻辑时（例如弱事件、加锁、节流）：

```csharp
private EventHandler? _click;
public event EventHandler Click {
    add    { lock (_lock) _click += value; }
    remove { lock (_lock) _click -= value; }
}
```

字段式事件默认 add/remove 早期版本会加锁（编译器生成），现代 Roslyn 用 `Interlocked.CompareExchange` 实现无锁原子操作。

## 四、事件 vs 委托字段

| 区别 | 委托字段 | 事件 |
|---|---|---|
| 外部可否赋值 | ✓ | ✗（只能 += / -=） |
| 外部可否直接触发 | ✓ | ✗ |
| 适合作公开 API | 通常不 | 是 |

事件本质是访问受限的委托字段，加了一层封装。

## 五、线程安全触发

多线程下别人可能正在 `-=` 把你最后一个订阅者删掉：

```csharp
// 错的：先检查后调用，中间可能为 null
if (Click != null) Click(this, e);

// 对的：本地拷贝（委托不可变，拷贝后即使原字段改了也安全）
var h = Click;
h?.Invoke(this, e);
```

## 六、异常隔离

多播事件中一个处理器抛异常，后续都不执行。需要"全部执行 + 收集异常"：

```csharp
protected void RaiseSafe(EventHandler<EventArgs>? h, EventArgs e) {
    if (h == null) return;
    var errs = new List<Exception>();
    foreach (EventHandler<EventArgs> d in h.GetInvocationList())
        try { d(this, e); } catch (Exception ex) { errs.Add(ex); }
    if (errs.Count > 0) throw new AggregateException(errs);
}
```

## 七、内存泄漏与弱事件

**最常见的 .NET 内存泄漏**：长寿命发布者持有短寿命订阅者的引用，订阅者无法 GC。

```csharp
// 假设 AppEvents 是单例
AppEvents.LanguageChanged += this.OnLangChanged;  // this 被根住
```

修复：
1. 显式 `-=`（`IDisposable` / `Dispose`）；
2. 弱事件模式：`WeakReference<EventHandler>` 包装；
3. WPF 用 `WeakEventManager`；
4. 现代 MVVM 用 `Messenger` 模式，订阅者实现 `IRecipient<T>`，自动弱引用。

```csharp
public class WeakHandler<TArgs> {
    private readonly WeakReference _target;
    private readonly MethodInfo _method;
    public WeakHandler(EventHandler<TArgs> h) {
        _target = new WeakReference(h.Target);
        _method = h.Method;
    }
    public void Invoke(object? s, TArgs e) {
        var t = _target.Target;
        if (t != null) _method.Invoke(t, new[]{s, e});
    }
}
```

## 八、典型应用

- UI 控件交互；
- 任务进度通知（`IProgress<T>` 是更现代的替代）；
- 网络/串口数据到达；
- MVVM 中 `INotifyPropertyChanged` / `INotifyCollectionChanged`；
- 业务领域事件（聚合根触发，应用层订阅）。

## 九、INotifyPropertyChanged 实战

```csharp
public class VM : INotifyPropertyChanged {
    public event PropertyChangedEventHandler? PropertyChanged;
    private string _name = "";
    public string Name {
        get => _name;
        set => Set(ref _name, value);
    }
    protected bool Set<T>(ref T field, T value,
        [CallerMemberName] string name = "") {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}
```

`CommunityToolkit.Mvvm` 的源生成器更简洁：

```csharp
public partial class VM : ObservableObject {
    [ObservableProperty] private string _name = "";
}
```

## 十、事件 vs Rx vs Channel

| 抽象 | 包 | 特点 |
|---|---|---|
| 事件 | 语言级 | 简单，无缓冲、无背压、无组合 |
| `IObservable<T>` | `System.Reactive` | 函数式组合：throttle/buffer/window/merge |
| `Channel<T>` | `System.Threading.Channels` | 高吞吐生产者消费者，背压 |
| `IAsyncEnumerable<T>` | 内置 | 异步流，`await foreach` |

事件适合 UI / 跨组件解耦；高频数据流推荐 Rx 或 Channel。

## 十一、检查清单

- 触发前本地拷贝；
- 用 `EventHandler<TArgs>` + 派生 `EventArgs`；
- 类公开事件，命名 `XxxOccurred` / `XxxChanged` / `XxxCompleted`；
- 配对 `BeforeXxx` / `Xxx` / `AfterXxx`；
- 长期订阅记得反订阅，避免内存泄漏；
- 跨线程触发 UI 事件要切回 UI 上下文（`Dispatcher` / `SynchronizationContext`）。
