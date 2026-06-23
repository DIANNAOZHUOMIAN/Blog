---
title: C# 新特性速览（C# 12 / 13 / 14）
date: 2026-06-23
tags: [C#, 新特性, 版本]
summary: 近三个版本的语言更新——主构造函数、集合表达式、params 集合、新 lock 语义、扩展成员、字段支持属性等。
---

# C# 新特性速览（C# 12 / 13 / 14）

C# 随 .NET 每年一个大版本。这里汇总近三版值得关注的语言特性。语法糖的横向整理另见 [C# 常用语法糖](c-常用语法糖.html)。

## C# 12（2023-11，.NET 8）

### 主构造函数

任意 `class` / `struct` 都能写主构造，参数在整个类体内可见：

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
- **Lambda 可选参数**：`(int x = 10) => x * 2`。
- **`ref readonly` 参数**：比 `in` 语义更清晰。
- **别名任意类型**：`using Point = (int X, int Y);` 给元组等也能起别名。

## C# 13（2024-11，.NET 9）

### params 集合

`params` 不再限于数组，可用于 `Span<T>`、`IEnumerable<T>` 等：

```csharp
void Print(params ReadOnlySpan<int> nums) { }
Print(1, 2, 3);                   // 无需分配数组
```

### 新的 lock 类型与语义

当锁对象是 `System.Threading.Lock` 时，编译器生成 `Lock.EnterScope()`，比 `lock(object)` 更高效：

```csharp
private readonly Lock _gate = new();
void Work() { lock (_gate) { /* 临界区 */ } }
```

### 其他

- **`\e` 转义序列**：表示 ESC 字符（``）。
- 对象初始化器中支持**隐式 `^` 索引**（从末尾）。
- **迭代器/异步方法**中允许 `ref` 局部变量和 `unsafe`。
- **`ref struct` 增强**：可实现接口、可作为泛型类型参数。
- **`partial` 属性和索引器**。
- **`field` 上下文关键字**（预览）：在自动属性的访问器里访问后备字段。

```csharp
// field 关键字（预览）：无需手写后备字段即可加逻辑
public string Name
{
    get => field;
    set => field = value?.Trim() ?? "";
}
```

## C# 14（2025，.NET 10）

> 部分为预览特性，最终行为以正式发布为准。

- **扩展成员改进**：扩展不再限于实例方法，支持**静态方法、实例属性、静态属性**，并引入新的 `extension` 块语法。
- **Null 条件赋值**：仅当实例非 null 时才赋值——`obj?.Prop = value;`。
- **字段支持的属性**：`field` 关键字转正，平滑从自动属性过渡到自定义属性。
- **无界泛型中的 `nameof`**：`nameof(List<>)`。
- **隐式 Span 转换**：数组到 `Span<T>` / `ReadOnlySpan<T>` 的隐式转换更顺。
- **简单 Lambda 参数上的修饰符**：无需写类型即可加 `ref` / `in`。

## 升级建议

- 主构造函数 + 集合表达式让 DTO/初始化代码大幅简洁，可立即采用。
- `params Span<T>`、隐式 Span 转换面向性能敏感库。
- 预览特性（`field`、C# 14 扩展成员）建议在生产环境等正式发布后再用。

---

**官方更新日志**：[C# 版本历史 — What's new in C#](https://learn.microsoft.com/zh-cn/dotnet/csharp/whats-new/)
