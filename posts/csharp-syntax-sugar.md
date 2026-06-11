---
title: C# 常用语法糖
date: 2026-06-11
tags: [C#, 语法糖, 新特性]
summary: 从 C# 6 到 12 的关键语法糖：插值字符串、模式匹配、record、target-typed new、主构造函数、集合表达式、原始字符串、List 模式等。
---

# C# 语法糖

按"使用频率"组织，不严格按版本分。

## 一、var / 类型推断

```csharp
var list = new List<int>();
var (a, b) = (1, "x");        // 元组解构
var users = db.Users.Where(...).ToList();
```

谨慎：右侧不直观时显式写类型。

## 二、空合并 / 空条件

```csharp
string name = user?.Profile?.Name ?? "anonymous";
list?.Add(x);
arr?[0]?.Method();
config["key"] ??= "default";    // 仅在 null 时赋值
```

`?.` 短路，`??` 合并，`??=` 赋值合并。

## 三、目标类型 new

```csharp
List<int> nums = new();
Dictionary<string, List<User>> map = new() { ["a"] = new() };
Person p = new("Alice", 30);
```

类型从左推断。

## 四、集合表达式（C# 12）

```csharp
int[] a = [1, 2, 3];
List<int> l = [1, 2, 3];
int[] all = [..a, 4, 5, ..b];   // 展开符（spread）
ReadOnlySpan<int> s = [1, 2, 3];
```

替代 `new int[]{...}`、`new List<int>{...}`、`Array.Concat`。

## 五、字符串插值与原始字符串

```csharp
$"Hello {name}, age={age:D3}";        // 插值
$"{val,10:N2}";                       // 对齐 + 格式

// 原始字符串（C# 11）
string json = """
{
    "name": "Alice"
}
""";

// 插值原始字符串：用 $$ 让 {{ 视为字面量 {
string s = $$"""{ "name": "{{name}}" }""";
```

## 六、模式匹配

```csharp
if (o is int n && n > 0) ...
if (o is string { Length: > 5 } s) ...

string desc = o switch {
    null => "null",
    int n when n > 0 => "pos",
    int n => "neg/zero",
    string s => $"str:{s.Length}",
    Point { X: 0, Y: 0 } => "origin",
    Point { X: var x, Y: var y } => $"({x},{y})",
    [1, 2, ..] => "starts 1 2",        // C# 11 列表模式
    _ => "other"
};

// 关系 / 逻辑模式（C# 9+）
if (age is >= 18 and < 65) ...
if (ch is 'a' or 'A') ...
if (x is not null) ...
```

## 七、record / record struct

值语义的类/结构体，编译器生成：

```csharp
public record User(string Name, int Age);

var u1 = new User("Alice", 30);
var u2 = u1 with { Age = 31 };       // 不变 + 复制修改
u1 == u2;                            // 比较值
u1.Deconstruct(out var n, out var a);

// record struct
public readonly record struct Vector(double X, double Y);
```

自动生成：`Equals` / `GetHashCode` / `ToString` / `Deconstruct` / `<copy ctor>`。

## 八、init / required

```csharp
public class User {
    public required string Name { get; init; }   // 只能初始化时赋值
    public int Age { get; init; }
}
var u = new User { Name = "Alice", Age = 30 };
```

`required` 强制对象初始化时必须赋值。

## 九、主构造函数（C# 12）

```csharp
public class Repo(IDb db) {
    public Task<User?> Get(int id) => db.GetAsync<User>(id);
}

public class Logger(string category) {
    public void Log(string msg) => Console.WriteLine($"[{category}] {msg}");
}
```

类、结构体、record 都可用。

## 十、表达式体成员

```csharp
public int Square(int x) => x * x;
public string Name => $"{First} {Last}";
public override string ToString() => $"User({Name})";

// 构造、析构、属性 setter
public Foo(int x) => _x = x;
~Foo() => Cleanup();
public string Name {
    get => _name;
    set => _name = value ?? throw new ArgumentNullException();
}
```

## 十一、元组与解构

```csharp
(string name, int age) tup = ("Alice", 30);
var (n, a) = tup;
var dict = new Dictionary<int, (string, int)>();

// 多返回值
public (bool ok, int val) TryFind(int key) { ... }
var (ok, v) = TryFind(1);

// 弃元
var (_, age) = tup;
```

## 十二、Range / Index

```csharp
int[] arr = [1, 2, 3, 4, 5];
arr[^1];            // 5（最后）
arr[^2];            // 4
arr[1..3];          // [2,3]
arr[..2];           // [1,2]
arr[2..];           // [3,4,5]
arr[..];            // 全部（拷贝）
Range r = 1..3; arr[r];
Index i = ^2;       arr[i];
```

字符串、`Span`、`List` 均支持。

## 十三、using 声明

```csharp
using var fs = File.OpenRead("a.txt");
// 离开作用域时自动 Dispose
```

比 `using(...) { ... }` 少一层缩进。

## 十四、nameof / nameof 表达式

```csharp
throw new ArgumentNullException(nameof(arg));
PropertyChanged?.Invoke(this, new(nameof(Name)));
```

编译期取标识符字符串，重命名安全。

## 十五、全局 using / 文件作用域命名空间

```csharp
// GlobalUsings.cs
global using System.Linq;
global using System.Threading.Tasks;

// 文件作用域命名空间（少一层缩进）
namespace App.Services;

public class Foo { ... }
```

## 十六、Top-level statements

新项目 `Program.cs`：

```csharp
using Microsoft.AspNetCore.Builder;

var app = WebApplication.Create();
app.MapGet("/", () => "hello");
app.Run();
```

没有 `Main`、没有命名空间样板。

## 十七、Lambda 改进

```csharp
// 自然类型
var add = (int a, int b) => a + b;       // 推断 Func<int,int,int>

// 默认值（C# 12）
var sum = (int a, int b = 10) => a + b;

// params lambda
var f = (params int[] xs) => xs.Sum();

// attribute on lambda
var g = [SomeAttr] (int x) => x;
```

## 十八、文件本地类型 / using static

```csharp
file class Internal { ... }      // 仅在本文件可见
using static System.Math;        // 直接写 Sqrt、PI
```

## 十九、初始化器

```csharp
// 对象初始化
var u = new User { Name = "A", Age = 1 };

// 集合初始化
var list = new List<int> { 1, 2, 3 };
var dict = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2 };

// 索引初始化
var arr = new int[] { 1, 2, 3 };
```

## 二十、scoped / ref 改进

```csharp
void Use(scoped Span<int> s) { ... }     // 限制 ref 不会逃逸
ref readonly int First(int[] a) => ref a[0];
```

## 二十一、async 迭代器 / await foreach

```csharp
public async IAsyncEnumerable<int> StreamAsync() {
    for (int i = 0; i < 10; i++) {
        await Task.Delay(100);
        yield return i;
    }
}

await foreach (var x in StreamAsync()) Console.WriteLine(x);
```

## 二十二、checked 运算符 / 自定义

```csharp
checked { int x = int.MaxValue + 1; }   // 抛 OverflowException
unchecked { ... }

// C# 11 用户自定义 checked
public static User operator checked +(User a, User b) { ... }
```

## 二十三、其他细节

```csharp
// using 别名（C# 12 支持任意类型，含元组、数组）
using Coord = (int X, int Y);
using IntList = System.Collections.Generic.List<int>;

// 数字分隔符
const int big = 1_000_000;
const long mask = 0b_0010_1010;

// stackalloc 表达式
Span<int> buf = stackalloc int[16];

// 接口默认方法（C# 8）
public interface I { void M() { /* 默认实现 */ } }

// 静态抽象成员（C# 11）
public interface IAddable<T> where T : IAddable<T> {
    static abstract T operator +(T a, T b);
}

// throw 表达式
public string Name { get; set; }
public Foo(string name) => Name = name ?? throw new ArgumentNullException();
```

## 二十四、速查表

| 特性 | C# 版本 |
|---|---|
| `var` / LINQ | 3.0 |
| async/await / dynamic | 5 |
| 内联 out / nameof / 表达式体 | 6 |
| 元组 / 模式匹配 | 7 |
| 范围 / using 声明 / Index/Range | 8 |
| record / init / 模式增强 / 顶层语句 | 9 |
| 文件作用域命名空间 / 全局 using | 10 |
| 原始字符串 / 列表模式 / required | 11 |
| 集合表达式 / 主构造 / 别名任意类型 | 12 |
| params 集合 / ref readonly 参数 | 13 |
