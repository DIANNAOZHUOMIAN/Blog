---
title: C# 泛型
date: 2026-06-11
tags: [C#, 泛型]
summary: 泛型本质、类型约束、协变逆变、性能差异、典型实战与陷阱。
---

# C# 泛型

泛型 = 类型参数化。把类型当参数延迟到使用时再决定，编译期类型安全，避免装箱拆箱。

## 一、为什么需要泛型

没有泛型时只能用 `object`：

```csharp
public class ObjectStack {
    public void Push(object item) { ... }
    public object Pop() { ... }
}
ObjectStack s = new();
s.Push(1);            // int → object，装箱（堆分配）
int x = (int)s.Pop(); // 强制转换，运行期可能 InvalidCastException
```

泛型版本：

```csharp
public class Stack<T> {
    private T[] _arr = new T[16];
    private int _idx;
    public void Push(T item) => _arr[_idx++] = item;
    public T Pop() => _arr[--_idx];
}
var s = new Stack<int>();
s.Push(1);   // 无装箱
int x = s.Pop();   // 无强转
```

收益：编译期类型检查、零装箱、IDE 智能提示。

## 二、泛型的"形态"

| 用法 | 例子 |
|---|---|
| 泛型类 | `class List<T>` |
| 泛型接口 | `interface IEnumerable<T>` |
| 泛型方法 | `T Max<T>(T a, T b)` |
| 泛型委托 | `Func<T,TResult>` / `Action<T>` |
| 泛型结构体 | `Nullable<T>` / `Span<T>` |
| 泛型属性 | 类型参数继承自类 |

泛型方法可独立于类存在，类型参数可由实参推断：

```csharp
public static T Max<T>(T a, T b) where T : IComparable<T>
    => a.CompareTo(b) > 0 ? a : b;

int m = Max(1, 2);       // 推断 T=int
```

## 三、类型约束 where

| 约束 | 含义 |
|---|---|
| `where T : class` | 引用类型 |
| `where T : struct` | 值类型（非 Nullable） |
| `where T : new()` | 必须有无参构造 |
| `where T : 基类` | 派生自 |
| `where T : 接口` | 实现接口 |
| `where T : U` | 另一个类型参数 |
| `where T : unmanaged` | 非托管（无引用字段，可固定指针） |
| `where T : notnull` | 不可空（C# 8 NRT） |
| `where T : enum` | C# 7.3+，枚举 |
| `where T : Delegate` | 委托 |
| `where T : allows ref struct` | C# 13+ |

多约束：

```csharp
public class Repo<T> where T : class, IEntity, new() {
    public T Create() => new T();
}
```

约束让方法体内可以使用对应能力（`new T()`、调用接口方法、`==` 比较等）。

## 四、协变 / 逆变（in / out）

仅作用于**接口与委托**的类型参数。

```csharp
// 协变 out：T 只能作为返回（输出）位置
public interface IEnumerable<out T> { ... }
IEnumerable<object> objs = new List<string>();   // 合法

// 逆变 in：T 只能作为参数（输入）位置
public interface IComparer<in T> { int Compare(T a, T b); }
IComparer<string> sc = (IComparer<object>)objCmp;
```

口诀：**返回是协变，参数是逆变**（Producer Out / Consumer In，PECS）。

类不能协/逆变，类的派生关系是不变（invariant）。

## 五、运行期实现

CLR 对泛型采用**特化 + 共享**策略：

- **值类型**：每个具体类型独立生成一份机器代码（`List<int>` 和 `List<double>` 各一份）；
- **引用类型**：所有引用类型共享同一份代码（按引用大小相同）；

因此泛型在值类型上几乎零开销，引用类型上略有方法表查找成本，但比强转 `object` 快得多。

`typeof(T)` 和 `default(T)` 在运行期都可用：

```csharp
public T Default<T>() => default;     // 引用类型→null，值类型→零值
public string Name<T>() => typeof(T).Name;
```

## 六、典型场景

集合：`List<T>` / `Dictionary<TKey,TValue>` / `HashSet<T>` / `Queue<T>` / `Stack<T>` / `ConcurrentDictionary<,>`。

委托：`Func<T1,T2,TResult>`、`Action<T>`、`Predicate<T>`、`EventHandler<TArgs>`。

仓储 / 服务：

```csharp
public interface IRepo<T> where T : class, IEntity {
    Task<T?> GetAsync(int id);
    Task SaveAsync(T entity);
}
```

工厂：

```csharp
public static T CreateFromJson<T>(string json) where T : new()
    => JsonSerializer.Deserialize<T>(json) ?? new T();
```

## 七、泛型 + 反射

```csharp
// 在运行期构造闭合泛型类型
Type openList = typeof(List<>);
Type intList = openList.MakeGenericType(typeof(int));
object instance = Activator.CreateInstance(intList)!;

// 调用泛型方法
var mi = typeof(JsonSerializer).GetMethods()
    .First(m => m.Name == "Deserialize" && m.IsGenericMethod);
var closed = mi.MakeGenericMethod(typeof(User));
var user = closed.Invoke(null, new object[]{ json, null });
```

代价：MakeGenericType/Method 性能差，热路径用 `Expression.Compile()` 或 `IL Emit` 缓存。

## 八、性能与陷阱

1. **静态字段不共享**：每个闭合类型独立。`Container<int>.X` 和 `Container<string>.X` 是两份。
2. **泛型方法 vs 重载**：泛型不参与重载解析，会优先匹配具体重载。
3. **不能 `new T(参数)`**：`new()` 约束只允许无参构造。
4. **值类型相等用 `EqualityComparer<T>.Default`**：直接 `==` 在泛型方法中会装箱。
   ```csharp
   bool Eq<T>(T a, T b) => EqualityComparer<T>.Default.Equals(a, b);
   ```
5. **协变陷阱**：`IList<T>` 不协变（因为有 set），`IReadOnlyList<T>` 才协变。
6. **泛型与异步**：`ValueTask<T>` 比 `Task<T>` 适合高频热路径。

## 九、与模板（C++）对比

| 项 | C# 泛型 | C++ 模板 |
|---|---|---|
| 编译/运行期 | CLR 运行期实例化 | 编译期展开 |
| 类型约束 | `where` 显式 | 隐式 SFINAE / concepts |
| 跨程序集 | 是（IL 描述） | 否（头文件展开） |
| 元编程 | 弱 | 强（Turing 完备） |
| 错误信息 | 直观 | 著名的天书 |

## 十、检查清单

- 接口尽量加 `in`/`out`；
- 集合返回类型用 `IEnumerable<T>` / `IReadOnlyList<T>`；
- 频繁创建的轻量类型考虑 `struct` + 泛型避免装箱；
- 工厂/仓储/缓存常用泛型 + `new()` + `class`；
- 比较与相等永远走 `Comparer<T>.Default` 或 `EqualityComparer<T>.Default`。
