---
title: C# 抽象类、接口、密封类、部分类
date: 2026-06-23
tags: [C#, 面向对象, 接口, 抽象类]
summary: 抽象类 vs 接口的选型、默认接口方法、sealed 封闭扩展、partial 拆分类型，附模板方法综合示例。
---

# 抽象类、接口、密封类、部分类

这几个关键字都是为"如何组织继承与契约"服务的。核心是搞清 **abstract（有共享实现的基类）** 和 **interface（纯行为契约）** 的取舍。

## 一、抽象类 abstract class

抽象出共性的基类，**不能直接实例化**，可同时包含已实现成员和抽象成员（强制子类实现）。

```csharp
public abstract class Shape
{
    public abstract double Area { get; }       // 抽象成员，子类必须实现
    public virtual string Name => "Shape";      // 虚成员，子类可选重写
    public abstract double Perimeter();
}

public sealed class Circle : Shape
{
    public double Radius { get; }
    public Circle(double r) => Radius = r;

    public override double Area => Math.PI * Radius * Radius;
    public override double Perimeter() => 2 * Math.PI * Radius;
    public override string Name => "Circle";
}
```

特点：可有字段、构造函数、共享逻辑；抽象成员不能是 `private`。

## 二、接口 interface

只描述"**能做什么**"的契约，不含实例字段。一个类可实现**多个**接口（弥补单继承的限制）。

```csharp
public interface IRepository<T>
{
    T? GetById(Guid id);
    IEnumerable<T> GetAll();
    void Add(T entity);

    // C# 8+ 默认实现：实现类不写也能用（谨慎使用）
    void AddRange(IEnumerable<T> items)
    {
        foreach (var item in items) Add(item);
    }
}

public class InMemoryRepo<T> : IRepository<T>
{
    private readonly Dictionary<Guid, T> _store = new();
    public T? GetById(Guid id) => _store.TryGetValue(id, out var v) ? v : default;
    public IEnumerable<T> GetAll() => _store.Values;
    public void Add(T entity) => _store[Guid.NewGuid()] = entity;
}
```

接口成员默认 `public`、不允许字段。面向接口编程 + 依赖注入是解耦与单测的基础。

## 三、抽象类 vs 接口怎么选

| | 抽象类 | 接口 |
|---|---|---|
| 实例字段/状态 | ✅ 可有 | ❌ 无 |
| 构造函数 | ✅ | ❌ |
| 多重继承 | ❌ 单继承 | ✅ 可实现多个 |
| 默认实现 | ✅ 一直支持 | ✅ C# 8+ |
| 语义 | "是一种"（is-a），纵向 | "能做"（can-do），横向 |

选型口诀：

- 需要**共享实现/状态/构造逻辑** → 抽象类。
- 只需**行为契约、强调组合与解耦** → 接口。
- 两者都要 → 抽象类 **+** 接口并用。

## 四、密封类 sealed

`sealed` 修饰类表示**不可被继承**；修饰 `override` 方法表示**到此为止不可再重写**。

```csharp
public sealed class IdGenerator         // 不能再有子类
{
    private long _counter;
    public long Next() => Interlocked.Increment(ref _counter);
}

public class Dog : Animal
{
    public sealed override string Speak() => "Woof";   // 子类不能再重写 Speak
}
```

用途：不希望被扩展的工具类/值对象/不可变类型；JIT 还能做去虚拟化优化。对外公共库默认 `sealed`、按需开放，可避免不受控扩展破坏不变式。

## 五、部分类 partial

把一个类型拆到**多个文件**，编译期合并。最常见于**代码生成与手写分离**——WinForms/WPF 设计器、Source Generator 等。

```csharp
// Person.Core.cs
public partial class Person
{
    public string FirstName { get; set; } = "";
    public string LastName  { get; set; } = "";
    public string FullName => $"{FirstName} {LastName}";
}

// Person.Validation.cs
public partial class Person
{
    public bool IsValid() =>
        !string.IsNullOrWhiteSpace(FirstName) && !string.IsNullOrWhiteSpace(LastName);
}
```

各片段的访问修饰符、命名空间、泛型约束需保持一致。`partial` 也可用于方法、结构、接口。

## 六、综合示例：模板方法

抽象类定义流程骨架（模板方法），把差异点留给子类：

```csharp
public interface ILogger { void Log(string message); }

public sealed class ConsoleLogger : ILogger
{
    public void Log(string m) => Console.WriteLine($"[{DateTime.Now:T}] {m}");
}

public abstract class Processor<T>
{
    protected readonly ILogger Logger;
    protected Processor(ILogger logger) => Logger = logger;

    public void Run(IEnumerable<T> inputs)        // 模板方法：固定流程
    {
        foreach (var item in inputs)
            Logger.Log(Format(Process(item)));
    }

    protected abstract T Process(T input);        // 差异点
    protected abstract string Format(T output);
}

public sealed class SquareProcessor : Processor<int>
{
    public SquareProcessor(ILogger logger) : base(logger) { }
    protected override int Process(int x) => x * x;
    protected override string Format(int o) => $"Square: {o}";
}
```

## 速记

- 共享实现选 **abstract**，纯契约选 **interface**，可叠加。
- `sealed` 封死继承/重写；公共库默认收紧。
- `partial` 拆文件，专治"设计器生成 + 手写"分离。
- 接口默认实现跨版本演进需谨慎，避免二义性。

---

**延伸阅读**：[接口](https://learn.microsoft.com/zh-cn/dotnet/csharp/fundamentals/types/interfaces) · 委托与 Lambda 见 [C# 委托](c-委托.html)
