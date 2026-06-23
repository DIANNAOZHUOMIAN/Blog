---
title: C# 结构体、枚举、迭代器、索引器、静态类
date: 2026-06-23
tags: [C#, 值类型, 枚举, 迭代器, 索引器]
summary: 枚举与 [Flags] 位标记、结构体（值类型的类）、yield 迭代器、this[] 索引器、静态类与扩展方法。
---

# 结构体、枚举、迭代器、索引器、静态类

把几个容易混淆的"特殊类型"放在一起对比记忆。

## 一、枚举 enum

一组命名常量，默认基础类型 `int`，第一个成员值为 `0` 后续递增，可显式赋值。用来替代"魔法数字"，让状态可读。

```csharp
public enum OrderStatus
{
    Pending = 0,
    Paid = 1,
    Shipped = 2,
    Completed = 3,
    Cancelled = 4
}

OrderStatus s = OrderStatus.Paid;
Console.WriteLine(s);              // "Paid"
Console.WriteLine((int)s);        // 1
Enum.TryParse("Shipped", out OrderStatus r);   // 字符串 → 枚举
```

### [Flags] 位标记

用 `[Flags]` 把枚举当作可组合的位集合，配合位运算判断复合状态：

```csharp
[Flags]
public enum FilePermission : byte
{
    None    = 0,
    Read    = 1 << 0,   // 1
    Write   = 1 << 1,   // 2
    Execute = 1 << 2,   // 4
    ReadWrite = Read | Write
}

var p = FilePermission.Read | FilePermission.Write;
bool canWrite = (p & FilePermission.Write) == FilePermission.Write;   // true
```

> 用 `byte`/`int` 等小整型作基础类型可省空间；位值必须是 2 的幂。

## 二、结构体 struct

结构体是**值类型的"类"**——有字段、属性、方法，但语义是值拷贝。

```csharp
public readonly struct Point2D
{
    public double X { get; }
    public double Y { get; }
    public Point2D(double x, double y) => (X, Y) = (x, y);

    public double DistanceTo(Point2D o)
        => Math.Sqrt(Math.Pow(X - o.X, 2) + Math.Pow(Y - o.Y, 2));
}
```

与类的区别：

| | class | struct |
|---|---|---|
| 类型 | 引用类型（堆） | 值类型（栈/内联） |
| 赋值/传参 | 拷贝引用 | 拷贝整个值 |
| 继承 | 支持 | **不支持**（只能实现接口） |
| 无参构造 | 可自定义 | C# 11 起才可自定义 |
| 默认值 | `null` | 各字段的零值 |

**何时用 struct**：小而频繁、不可变的数据载体——坐标、颜色、矩形等。大对象或需要继承/多态时用 class。`readonly struct` 保证不可变、避免防御性拷贝；`ref struct`（如 `Span<T>`）只能在栈上，配合高性能内存操作。

## 三、迭代器 iterator

用 `yield return` 定义**惰性序列**，编译器自动生成状态机，逐个产出元素，不必一次性构造整个集合。

```csharp
public static IEnumerable<int> Fibonacci(int count)
{
    int cur = 0, next = 1;
    for (int i = 0; i < count; i++)
    {
        yield return cur;                 // 每次产出一个，暂停在此
        (cur, next) = (next, cur + next);
    }
}

foreach (var n in Fibonacci(10)) Console.Write($"{n} ");   // 0 1 1 2 3 5 ...
```

- `yield break;` 提前结束序列。
- 适合大数据流、分页、日志流——按需计算，省内存。
- C# 8+ 支持异步迭代器 `IAsyncEnumerable<T>` + `await foreach`。

## 四、索引器 indexer

让对象像数组一样用 `[]` 访问，通过 `this[...]` 定义：

```csharp
public class SettingsBag
{
    private readonly Dictionary<string, object?> _data = new();

    public object? this[string key]
    {
        get => _data.TryGetValue(key, out var v) ? v : null;
        set => _data[key] = value;
    }
}

var bag = new SettingsBag();
bag["theme"] = "dark";              // 像字典一样用
var t = bag["theme"];
```

可重载多个参数实现多维访问，如矩阵 `this[int row, int col]`。

## 五、静态类 static class

只含静态成员、不能实例化、不能继承，专门放工具函数、常量和**扩展方法**。

```csharp
public static class MathUtil
{
    public const double GoldenRatio = 1.618;
    public static double Clamp(double v, double min, double max)
        => Math.Min(Math.Max(v, min), max);
}

double x = MathUtil.Clamp(120, 0, 100);   // 不用 new，直接类名.方法
```

### 扩展方法

第一个参数加 `this`，就能给现有类型"添加"方法（必须定义在静态类里）：

```csharp
public static class StringExt
{
    public static bool IsNullOrEmpty(this string? s)
        => string.IsNullOrEmpty(s);
}

"hello".IsNullOrEmpty();   // 像实例方法一样调用

// using static 可省略类名直接用静态成员
// using static System.Math;  →  之后可直接写 Sqrt(2)
```

> 静态构造函数 `static MyClass() { }` 只执行一次，可用于线程安全地初始化昂贵的静态资源。

## 速记

- 状态用 **enum**，可组合状态加 `[Flags]`；
- 小而不可变的数据用 **struct**（值语义、无继承）；
- 惰性产出用 **yield 迭代器**；
- `[]` 访问用 **索引器**；
- 工具函数/扩展方法放 **静态类**。

---

**延伸阅读**：[结构类型](https://learn.microsoft.com/zh-cn/dotnet/csharp/language-reference/builtin-types/struct) · [迭代器](https://learn.microsoft.com/zh-cn/dotnet/csharp/iterators)
