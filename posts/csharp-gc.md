---
title: C# 垃圾回收（GC）
date: 2026-06-11
tags: [C#, GC, 性能]
summary: 分代回收、SOH/LOH/POH、Workstation/Server、Background/Concurrent、Finalizer、Dispose、内存泄漏排查与调优。
---

# C# GC

CLR 的 GC 自动管理托管堆，开发者只关心 `new`，不用手动 free。

## 一、托管堆结构

托管堆分代 + 多区：

| 区 | 容纳 | 回收频率 |
|---|---|---|
| **Gen 0** | 新分配的小对象 | 最高 |
| **Gen 1** | Gen 0 存活下来的 | 中 |
| **Gen 2** | Gen 1 存活下来的（"老年代"） | 最低 |
| **LOH** (Large Object Heap) | ≥85KB 的对象（大数组、大字符串） | 与 Gen 2 一起 |
| **POH** (Pinned Object Heap, .NET 5+) | 固定对象（互操作场景） | 与 Gen 2 一起 |

晋升规则：被回收时存活 → 晋升下一代。SOH（Small Object Heap）逐代晋升，LOH/POH 一开始就在 Gen 2 级别。

## 二、GC 流程

1. **标记**：从根（栈、寄存器、静态字段、GCHandle）出发，可达性分析；
2. **清理**：不可达对象释放；
3. **压缩**：SOH 默认压缩消除碎片；**LOH 默认不压缩**（昂贵），3.0+ 可手动 `GCSettings.LargeObjectHeapCompactionMode = CompactOnce`；
4. **晋升**：存活对象进入下一代。

## 三、工作模式

| 模式 | 配置 | 特点 |
|---|---|---|
| **Workstation** | 客户端默认 | 单 GC 堆，UI 友好 |
| **Server** | `<ServerGarbageCollection>true</ServerGarbageCollection>` | 每核一个堆，多线程回收，吞吐高，内存占用大 |
| **Concurrent / Background** | 默认开启 | Gen 2 与用户线程并行 |
| **Workstation Non-Concurrent** | 关闭并发 | 暂停时间不可接受场景慎用 |

ASP.NET Core / 高吞吐后端 → Server GC；桌面 / 内存敏感 → Workstation。

`.csproj`：

```xml
<PropertyGroup>
    <ServerGarbageCollection>true</ServerGarbageCollection>
    <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

## 四、值类型与堆栈

- **值类型**：通常在栈上、寄存器或对象内联字段里；
- **引用类型**：托管堆；
- **装箱**：值类型→`object`/接口 时进入堆；

栈上的值类型由方法返回时自动释放，不参与 GC。

## 五、根（Root）

GC 标记从根开始：
1. 线程栈上的局部变量；
2. 寄存器；
3. 静态字段；
4. `GCHandle`（互操作固定）；
5. 终结器队列。

事件订阅、静态集合、缓存表是**常见泄漏源**——长寿对象隐式把短寿对象固定在根。

## 六、Finalizer（终结器）

`~Class` 析构函数 = 终结器。

```csharp
public class Conn {
    private IntPtr _handle;
    ~Conn() {
        if (_handle != IntPtr.Zero) NativeMethods.Free(_handle);
    }
}
```

代价：
- 有终结器的对象第一次 GC 时不释放，而是进入终结队列；
- 由终结线程异步调用 `~`；
- 至少再活一代才能真正释放——影响性能；
- 必须 `IDisposable` + `GC.SuppressFinalize(this)` 配合。

## 七、IDisposable 模式

标准实现（覆盖非托管资源、托管资源、子类扩展）：

```csharp
public class Conn : IDisposable {
    private bool _disposed;
    private IntPtr _native;
    private Stream? _managed;

    public void Dispose() {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing) {
        if (_disposed) return;
        if (disposing) {
            _managed?.Dispose();    // 托管资源
        }
        if (_native != IntPtr.Zero) // 非托管资源
            NativeMethods.Free(_native);
        _disposed = true;
    }

    ~Conn() => Dispose(false);
}
```

只有持有非托管句柄时才需要终结器。多数业务类只实现 `IDisposable`，靠 `using` 释放即可。

`IAsyncDisposable`：异步释放（.NET Core 3+）：

```csharp
await using var x = new MyAsyncResource();
```

## 八、内存泄漏典型场景

1. **事件订阅未取消**：长寿对象订阅短寿事件 → 短寿对象被根住。
2. **静态集合 / 缓存**：缓存无淘汰 → 越积越多。
3. **闭包捕获**：`Task.Run(() => bigObject.X())` 把 `bigObject` 引用进堆字段。
4. **Timer / 后台线程**：未停止的 `Timer` 引用回调目标。
5. **未释放非托管资源**：句柄、Native 内存、GDI 对象。
6. **大对象重复分配**：进入 LOH，碎片化撑大工作集。
7. **WeakReference 误用**：忘了"目标可能为 null"。

排查：
- `dotnet-counters monitor --process-id <pid>`；
- `dotnet-dump collect` + `dotnet-dump analyze`；
- Visual Studio "诊断工具"内存快照；
- JetBrains dotMemory / dotTrace；
- WinDbg + SOS：`!dumpheap -stat`、`!gcroot <addr>`。

## 九、调优工具

| 工具 | 作用 |
|---|---|
| `dotnet-counters` | 实时指标 |
| `dotnet-trace` | ETW/EventPipe 跟踪 |
| `dotnet-gcdump` | 堆快照 |
| `dotnet-dump` | 完整转储 |
| PerfView | Windows ETW 分析 |
| Visual Studio 分析器 | 集成 |
| dotMemory | 图形化 |

关键计数器：
- `% Time in GC`（>10% 警示）；
- Gen 0/1/2 collection count；
- Heap size、Allocation Rate；
- LOH size；
- Pause Time。

## 十、配置项

`runtimeconfig.json` 或 `.csproj`：

```xml
<ServerGarbageCollection>true</ServerGarbageCollection>
<ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
<RetainVMGarbage>false</RetainVMGarbage>
<TieredCompilation>true</TieredCompilation>
```

环境变量（DOTNET_gcServer 等）也可改。

`GC.TryStartNoGCRegion(size)`：在关键热点段禁止 GC，结束后 `GC.EndNoGCRegion()`。

## 十一、API

```csharp
GC.GetTotalMemory(forceFullCollection: false);
GC.GetGCMemoryInfo();
GC.CollectionCount(0);  GC.CollectionCount(1);  GC.CollectionCount(2);

GC.Collect();           // 强制回收（生产慎用）
GC.WaitForPendingFinalizers();
GC.SuppressFinalize(obj);
GC.KeepAlive(obj);      // 防止过早回收（互操作）
GC.AddMemoryPressure(bytes);   // 通知 GC 隐式占用

WeakReference<T> wr = new(obj);
wr.TryGetTarget(out var t);
```

`GC.Collect()` 在压测、内存敏感测试时偶尔有用，业务代码不要调用。

## 十二、减少分配的实战手段

1. **`Span<T>` / `ReadOnlySpan<T>`** 切片、`stackalloc`；
2. **`ArrayPool<T>.Shared.Rent(n)`** + `Return` 复用缓冲；
3. **`MemoryPool<T>`** 同理；
4. **`StringBuilder` + `ArrayPool` 内部**；
5. **`ValueTask` / `ValueTask<T>`** 高频同步完成；
6. **`struct` 替代小 class**（≤16~24B）；
7. **`ObjectPool<T>`** 重型对象池（`Microsoft.Extensions.ObjectPool`）；
8. **避免装箱**：`EqualityComparer<T>.Default`、泛型方法；
9. **缓存 lambda**：无捕获 lambda 是静态，但每次写 `=>` 仍可能新建；
10. **`[SkipLocalsInit]`** 跳过 0 初始化（高级）；
11. **Span 解析 / Utf8JsonReader**：JSON、数字解析零分配；
12. **避免 LOH 碎片**：复用大数组（`ArrayPool`）或预分配池。

## 十三、检查清单

- 长寿对象不要订阅短寿事件，或自己 `-=` / 用弱事件；
- 所有 `IDisposable` 一律 `using`；
- 缓存设上限和 TTL（`MemoryCache`）；
- 高频热路径用 `Span` + `stackalloc` + `ArrayPool`；
- 服务端开 Server GC；
- 上线前看一眼 `% Time in GC`、Gen 2 频率；
- 大数组（>85KB）尽量复用，避免反复进 LOH；
- 互操作固定数组 → POH（.NET 5+ 自动）或用 `fixed` 语句；
- 不要随便 `GC.Collect()`。
