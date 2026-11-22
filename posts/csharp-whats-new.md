---
title: C# 新特性速览（C# 12 / 13 / 14 / 15）
date: 2026-06-23
tags: [C#, 新特性, 版本]
summary: 近四个版本的语言更新——主构造函数、集合表达式、params 集合、新 lock 语义、扩展成员、字段支持属性，以及 C# 15 的联合类型等。
---

# C# 新特性速览（C# 12 / 13 / 14 / 15）

C# 随 .NET 每年一个大版本。这里汇总近四版值得关注的语言特性，并补上文档里已经发布、上文还没写到的点。语法糖的横向整理另见 [C# 常用语法糖](c-常用语法糖.html)。

对照官方文档：《C# 发展历史》（C# 12 已并入此文）、《C# 13 中的新增功能》、《C# 14 中的新增功能》、《C# 15 中的新增功能》。

## C# 12（2023-11，.NET 8）

### 主构造函数

任意 `class` / `struct` 都能写主构造，参数在整个类体内可见。只有 record 会为这些参数合成公共属性：

```csharp
public class Logger(string category)
{
    public void Log(string msg) => Console.WriteLine($"[{category}] {msg}");
}
```

### 集合表达式

统一的 `[...]` 初始化语法，`..` 展开任意集合：

```csharp
int[] a = [1, 2, 3];
List<int> b = [..a, 4, 5];        // 展开 a 再追加
Span<int> c = [1, 2, 3];
```

### 其他

- **内联数组**：`struct` 中声明固定长度数组，用于高性能场景。
- **Lambda 可选参数**：`(int x = 10) => x * 2`。默认值的规则与方法、局部函数相同。
- **`ref readonly` 参数**：比 `in` 语义更清晰，表示 API 要的是只读引用。
- **别名任意类型**：`using Point = (int X, int Y);`。元组、数组、指针类型也都能起别名。
- **实验性 API**：用 `ExperimentalAttribute` 标记类型、方法或程序集，编译器会警告调用方。
- **拦截器（实验性预览）**：编译期用一个方法替换对另一个方法的调用，并标出被替换调用的源位置，供源生成器改已有代码。官方不建议用于正式发布的程序。

## C# 13（2024-11，.NET 9）

### params 集合

`params` 不再限于数组。可以用于 `Span<T>`、`ReadOnlySpan<T>`，以及实现了 `IEnumerable<T>` 且带 `Add` 方法的类型。接口 `IEnumerable<T>`、`IReadOnlyCollection<T>`、`IReadOnlyList<T>`、`ICollection<T>`、`IList<T>` 也可以；此时编译器会为传入的实参合成存储：

```csharp
void Print(params ReadOnlySpan<int> nums) { }
Print(1, 2, 3);                   // 无需分配数组
```

### 新的 lock 类型与语义

当锁对象是 `System.Threading.Lock` 时，编译器生成 `Lock.EnterScope()`，比 `lock(object)` 更高效。若把 `Lock` 转成其他类型，则仍走原来的 `Monitor`：

```csharp
private readonly Lock _gate = new();
void Work() { lock (_gate) { /* 临界区 */ } }
```

### 其他

- **`\e` 转义序列**：表示 ESC 字符（`U+001B`）。比 `\x1b` 安全，后面的十六进制数字不会被吃进转义。
- 对象初始化器中支持**隐式 `^` 索引**（从末尾），用于一维集合。
- **迭代器/异步方法**中允许 `ref` 局部变量和 `unsafe`。这类局部变量不能跨 `await` 或 `yield return`；`yield return` / `yield break` 本身必须留在安全上下文。
- **`ref struct` 增强**：可以实现接口，但不能装箱转换成接口类型。要当作泛型实参，类型参数得写成 `where T : allows ref struct`。
- **`partial` 属性和索引器**：一处声明、一处实现，签名必须一致。实现声明不能写成自动属性。
- **方法组自然类型**：确定自然类型时，先在当前作用域去掉不适用的候选（泛型元数不对，或约束不满足），没有候选才向外层找。
- **重载解析优先级**：库作者用 `OverloadResolutionPriorityAttribute` 指定某一重载优先于其他重载。
- **`field` 上下文关键字**（预览）：在自动属性的访问器里访问编译器合成的后备字段。若类型里已有名为 `field` 的成员，用 `@field` 或 `this.field` 区分。

```csharp
// field 关键字（预览）：无需手写后备字段即可加逻辑
public string Name
{
    get => field;
    set => field = value?.Trim() ?? "";
}
```

## C# 14（2025-11，.NET 10）

随 .NET 10 发布，不再是预览。

- **扩展成员**：扩展不再限于实例方法。`extension` 块可以写实例属性、实例方法；只给出类型、不给出实例的块则表现为该类型的静态成员，包括静态方法、静态属性和用户定义运算符。
- **空条件赋值**：`?.` 与 `?[]` 可以出现在赋值或复合赋值的左侧，仅当实例非 null 时才赋值，右侧也不会被求值。不能用于 `++` / `--`。

```csharp
customer?.Order = GetCurrentOrder();
```

- **字段支持的属性**：`field` 关键字转正，平滑从自动属性过渡到自定义属性。与名为 `field` 的成员冲突时，同样用 `@field` 或 `this.field`。
- **未绑定泛型中的 `nameof`**：`nameof(List<>)` 得到 `"List"`。此前只能写封闭类型，如 `nameof(List<int>)`。
- **隐式 Span 转换**：`Span<T>` / `ReadOnlySpan<T>` 与数组之间的隐式转换更顺，也能做扩展方法的接收者，并参与其他转换和泛型推断。
- **简单 Lambda 参数上的修饰符**：不必写出参数类型，即可加 `scoped`、`ref`、`in`、`out` 或 `ref readonly`。`params` 仍要求显式类型。

```csharp
TryParse<int> parse = (text, out result) => int.TryParse(text, out result);
```

- **`partial` 构造函数和事件**：各有且仅有一处定义声明、一处实现声明。`this()` / `base()` 只能写在构造函数的实现声明上；主构造语法只能出现在一个部分声明里。事件的实现声明必须带 `add` 和 `remove`，定义声明则是字段式事件。
- **用户定义的复合赋值运算符**：可以重载 `+=` 等，让目标就地修改，而不是先算出新实例再赋回去。

```csharp
public void operator +=(int x) => Value += x;
```

- **基于文件的应用的新预处理器指令**：用 `dotnet run Program.cs` 跑单个文件时，编译器忽略以 `#:` 或 `#!` 开头的指令，改由生成系统解析。文件首行可以是 `#!/usr/bin/env dotnet`。这些指令出现在普通项目编译里会产生警告。

## C# 15（2026-11，.NET 11）

面向 `net11.0` 时，C# 15 是默认语言版本。除内存安全预览外，不必再打开 `preview`。

### 集合表达式参数

集合表达式的第一项可以写 `with(...)`，把容量、比较器等参数交给底层构造函数或工厂方法：

```csharp
List<string> names = [with(capacity: values.Length * 2), ..values];
HashSet<string> set = [with(StringComparer.OrdinalIgnoreCase), "Hello", "HELLO"];
```

### 联合类型

`union` 表示值是若干 case 类型之一。每个 case 都能隐式转成联合类型，`switch` 必须覆盖全部 case：

```csharp
public union Pet(Cat, Dog, Bird);

string NameOf(Pet pet) => pet switch
{
    Dog d => d.Name,
    Cat c => c.Name,
    Bird b => b.Name,
};
```

### 其他

- **封闭层次结构**：`closed` 类只能在声明它的程序集里被派生，直接派生类的集合在编译期就固定，因此覆盖每个直接派生类的 `switch` 是穷尽的，不必再写默认分支。`closed` 是上下文关键字，该类隐式为 `abstract`，不能再与 `sealed`、`static` 或显式 `abstract` 组合。派生关系不传递：未标 `closed` 的派生类仍可在其他程序集里继续派生。
- **扩展索引器**：在带接收者参数的 `extension` 块里声明索引器，调用处像类型自带的成员。例如 `public int this[int index] => sequence.ElementAt(index);`。
- **带标签的 `break` / `continue`**：标签写在外层循环或 `switch` 上，`break outer;` 离开它，`continue outer;` 进入它的下一轮。不写标签时行为与原来相同。

```csharp
outer: for (int row = 0; row < height; row++)
    for (int column = 0; column < width; column++)
        if (grid[row, column].IsGoal) break outer;
```

- **旧运行时上的非虚拟静态接口成员**：即使目标运行时不支持默认接口实现，接口也可以声明带实现的非虚拟静态成员，并直接在接口上调用，如 `IMeasurement.ToMeters(250)`。实例默认实现、`static abstract`、`static virtual` 以及受保护的接口成员仍然需要运行时支持。
- **内存安全（预览）**：把 `unsafe` 收束到真正访问非托管内存的操作。语言版本设为 `preview` 后，声明指针并取址、`fixed`、把 `stackalloc` 转成指针、对任意非托管类型使用 `sizeof`，可以不再包在 `unsafe` 里；解引用（`*p`、`p->member`、`p[i]`）和函数指针调用仍然要。另有只覆盖一个表达式的 `unsafe(...)`，方便字段初始化器这类写不了 `unsafe` 块的位置。更新后的调用方义务还要打开编译器功能 `updated-memory-safety-rules`。

## 升级建议

- 主构造函数 + 集合表达式让 DTO/初始化代码大幅简洁，可立即采用。
- `params Span<T>`、隐式 Span 转换面向性能敏感库。
- C# 14 的 `field` 与扩展成员已随 .NET 10 发布。C# 13 里的 `field` 仍是预览。
- 拦截器，以及 C# 15 的内存安全，仍是预览，正式程序先不要依赖。

---

**官方更新日志**：[《C# 发展历史》](https://learn.microsoft.com/zh-cn/dotnet/csharp/whats-new/csharp-version-history)
