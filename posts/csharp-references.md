---
title: C# 引用与值：ref/out/in/ref struct
date: 2026-06-11
tags: [C#, 引用, 值类型, ref]
summary: 值类型与引用类型本质、ref/out/in 参数、ref 返回与 ref 局部变量、ref struct、Span<T> 应用。
---

# C# 引用语义全解

## 一、值类型 vs 引用类型

| 项 | 值类型 (struct/enum/基元) | 引用类型 (class/interface/delegate/数组) |
|---|---|---|
| 内存位置 | 栈 或 包含它的对象里 | 托管堆 |
| 赋值 | 拷贝 | 拷贝引用 |
| `==` | 默认成员比较（基元）/ 需自己实现 | 引用相等 |
| 默认值 | 零值 | `null` |
| GC | 不参与 | 参与 |

```csharp
struct P { public int X; }
class  Q { public int X; }

var p1 = new P{X=1}; var p2 = p1; p2.X = 9; // p1.X 仍是 1（值拷贝）
var q1 = new Q{X=1}; var q2 = q1; q2.X = 9; // q1.X 变 9（同一对象）
```

`string` 是引用类型但不可变，行为像值类型。

## 二、ref / out / in 参数

| 修饰符 | 入参约束 | 内部赋值 | 用途 |
|---|---|---|---|
| `ref` | 调用方必须已赋值 | 可读可写 | 双向 |
| `out` | 调用方可不赋值 | 方法内必须赋值 | 多返回值 |
| `in` | 必须已赋值 | 方法内只读 | 大结构体只读传引用，避免复制 |

```csharp
void Swap(ref int a, ref int b) { (a, b) = (b, a); }
bool TryParse(string s, out int v) { v = 0; ... return true; }
double Dot(in Vector3 a, in Vector3 b) => a.X*b.X + a.Y*b.Y + a.Z*b.Z;
```

调用必须显式带关键字（除 `in` 外）：

```csharp
int x = 1, y = 2;
Swap(ref x, ref y);
TryParse("1", out int n);
TryParse("2", out var n2);
TryParse("3", out _);          // 弃元
```

### in 的注意点

`in` 实参可以隐式传，但读取时若类型不是 readonly struct，编译器会创建**防御性拷贝**反而变慢。修复：`readonly struct Vector3`。

## 三、ref 返回 / ref 局部变量

```csharp
public ref int Find(int[] arr, int target) {
    for (int i = 0; i < arr.Length; i++)
        if (arr[i] == target) return ref arr[i];
    throw new KeyNotFoundException();
}

int[] a = {1,2,3};
ref int slot = ref Find(a, 2);   // ref 局部变量
slot = 999;                       // 等价 a[1]=999
```

应用：大型数组/结构体集合就地修改、字典原地更新（`CollectionsMarshal.GetValueRefOrAddDefault`）。

限制：不能把局部变量的引用返回到外部（编译器静态检查防止悬空引用）。

## 四、ref readonly

只读引用返回，避免大对象复制又禁止修改：

```csharp
public ref readonly Matrix4x4 World { get { return ref _world; } }
```

C# 12 引入 `ref readonly` 参数，更清晰地表达"引用 + 只读"。

## 五、ref struct（栈分配结构体）

`ref struct` 只能在栈上：

- 不能装箱、不能赋给 `object` / 泛型类型参数（除非有 `allows ref struct`）;
- 不能作为类的字段、不能作为异步方法/迭代器的局部、不能作为 lambda 闭包变量；
- 不能实现接口（除非接口方法非虚）。

代表：`Span<T>` / `ReadOnlySpan<T>` / `Utf8JsonReader` / `ValueStringBuilder`。

```csharp
Span<byte> buf = stackalloc byte[256];  // 栈上 256B 缓冲
Random.Shared.NextBytes(buf);

ReadOnlySpan<char> s = "hello world".AsSpan(0, 5);
```

### Span 的价值

零拷贝切片、统一访问数组/栈/非托管内存：

```csharp
byte[] heap = new byte[1024];
Span<byte> s1 = heap;
Span<byte> s2 = heap.AsSpan(100, 200);   // 视图，不分配
Span<byte> s3 = stackalloc byte[64];     // 栈
```

字符串解析的现代写法：

```csharp
ReadOnlySpan<char> input = "12,34,56".AsSpan();
while (true) {
    int idx = input.IndexOf(',');
    var token = idx < 0 ? input : input[..idx];
    Process(token);
    if (idx < 0) break;
    input = input[(idx+1)..];
}
```

## 六、装箱与拆箱

值类型 → `object` / 接口 = 装箱（堆分配 + 拷贝）；反之拆箱。

```csharp
int x = 1;
object o = x;          // 装箱
int y = (int)o;        // 拆箱，类型必须精确匹配

IComparable c = 1;     // 装箱（int 实现 IComparable）
```

性能：避免在循环里把值类型存入 `ArrayList`、传给非泛型方法、字符串拼接等场景触发装箱。

常见隐式装箱：
- `string.Format("{0}", intValue)`（已优化，但仍小心）；
- 在泛型方法里用 `==`（应改用 `EqualityComparer<T>.Default`）；
- 实现接口的值类型作为接口调用。

## 七、不可变（immutable）

`readonly` 字段：构造期赋值后不可改。

`readonly struct`：所有字段必须 `readonly`，方法不会修改字段（编译器保证），适合 `in` 参数避免防御拷贝：

```csharp
public readonly struct Point {
    public readonly int X, Y;
    public Point(int x, int y) { X = x; Y = y; }
    public Point Move(int dx, int dy) => new(X+dx, Y+dy);
}
```

`record struct` / `record class`：编译器自动生成 `with`、`Equals`、`GetHashCode`：

```csharp
public readonly record struct Vector(double X, double Y);
var v = new Vector(1,2);
var v2 = v with { X = 10 };
```

## 八、scoped 与生命周期

C# 11 引入 `scoped`：限制引用的逃逸范围，让编译器允许更宽松的 ref 用法又不破坏安全：

```csharp
void Use(scoped Span<int> s) { ... }   // s 不会逃出本方法
```

## 九、深拷贝与浅拷贝

- 浅拷贝：拷贝引用（`object.MemberwiseClone()`、数组 `Clone()`）；
- 深拷贝：递归拷贝所有引用对象。常见实现：序列化反序列化、`record` 的 `with` 表达式（一层）、`AutoMapper`、手写复制构造。

## 十、检查清单

- 大于 16~24B 的 struct 慎用，要么用 `class`，要么 `in` / `ref` 传；
- 频繁解析字符串 / 二进制 → `Span<T>` + `stackalloc`，几乎零分配；
- 多返回值优先 `out` 或返回元组 `(bool ok, T val)`；
- 集合元素就地修改用 `CollectionsMarshal.AsSpan(list)`；
- 跨方法返回引用要谨慎，编译器虽然帮你检查，但要清楚被引用对象的生命周期。
