---
title: C# 方法与参数
date: 2026-06-23
tags: [C#, 基础, 方法, 参数传递]
summary: 方法定义与调用、形参实参、值传递 vs 引用传递、ref/out/in、可选参数、params、返回值与本地函数。
---

# C# 方法与参数

方法把一组相关代码封装起来，供反复调用。它分两步：**定义**（声明做什么）和**调用**（执行）。

## 一、定义与调用

```csharp
// 修饰符 返回类型 方法名(参数列表) { 方法体 }
public static int Add(int a, int b)
{
    return a + b;
}

int sum = Add(3, 5);   // 调用，() 是执行运算符
```

- **修饰符**：`public` / `private` / `static` …
- **返回类型**：无返回值写 `void`。
- **静态方法**只能直接调用静态方法；在 `Main`（静态）里调用的方法也要 `static`。
- 方法名用**大驼峰** `PascalCase`。

表达式体方法（单语句的语法糖）：

```csharp
public static int Square(int x) => x * x;
```

## 二、形参与实参

- **形参**：定义时写在括号里的变量，值由实参决定。
- **实参**：调用时实际传入的数据，类型必须与形参匹配。

```csharp
void Greet(string name) => Console.WriteLine($"你好，{name}");
Greet("张三");   // "张三" 是实参，赋值给形参 name
```

## 三、参数传递的本质

C# 默认**按值传递**——传的是变量的"值"的一份拷贝。关键在于值类型和引用类型"值"的含义不同：

```csharp
// 值类型：拷贝的是数据本身，方法内改动不影响外部
void AddOne(int n) { n++; }
int x = 5; AddOne(x);   // x 仍是 5

// 引用类型：拷贝的是地址，所以能改到同一个对象
void Rename(Person p) { p.Name = "李四"; }
var p = new Person { Name = "张三" };
Rename(p);              // p.Name 变成 "李四"

// 但如果在方法内 new 一个新对象，只是改了局部那份地址拷贝，外部不受影响
void Replace(Person p) { p = new Person { Name = "王五" }; }
Replace(p);             // p.Name 仍是 "李四"
```

## 四、ref / out / in

| 关键字 | 方向 | 调用前需初始化 | 方法内必须赋值 | 用途 |
|---|---|---|---|---|
| `ref` | 传入 + 传出 | ✅ 需要 | 否 | 方法内修改调用方变量 |
| `out` | 仅传出 | ❌ 可不初始化 | ✅ 必须 | 返回多个结果 |
| `in` | 仅传入（只读） | ✅ 需要 | 不可改 | 大结构体避免拷贝 |

```csharp
// ref：传变量本身，方法内的修改会反映到外部
void Swap(ref int a, ref int b) => (a, b) = (b, a);
int m = 1, n = 2;
Swap(ref m, ref n);     // m=2, n=1，调用处也要写 ref

// out：经典用法是 TryParse，返回"成功与否" + "结果"
if (int.TryParse("123", out int value))
    Console.WriteLine(value);
```

## 五、可选参数与命名参数

```csharp
void Log(string msg, string level = "INFO", bool toFile = false) { }

Log("启动");                       // 用默认值
Log("出错", "ERROR");              // 覆盖一部分
Log("写盘", toFile: true);         // 命名参数，跳过中间的可选参数
```

> 可选参数必须排在必填参数**之后**：`F(int a, int b = 2)` ✅，`F(int a = 1, int b)` ❌。

## 六、params 变长参数

接收任意数量的同类型参数，内部当数组用：

```csharp
int Sum(params int[] nums)
{
    int s = 0;
    foreach (var n in nums) s += n;
    return s;
}

Sum(1, 2, 3);          // 6
Sum();                 // 0
Sum(new[] { 1, 2 });   // 也能直接传数组

// 可与普通参数混用，params 必须在最后
void Print(string title, params object[] items) { }
```

C# 13 起 `params` 不再限于数组，也可用于 `Span<T>`、`IEnumerable<T>` 等集合类型。

## 七、返回值

```csharp
public int Max(int a, int b)
{
    if (a > b) return a;   // return 还能提前终止方法
    return b;
}
```

- `void` 方法的 `return;` 仅用于提前退出。
- 想返回多个值，用元组（比 `out` 更现代）：

```csharp
(int min, int max) MinMax(int[] arr)
    => (arr.Min(), arr.Max());

var (lo, hi) = MinMax(new[] { 3, 1, 5 });   // 解构
```

## 八、本地函数

方法内部还能定义方法，用于封装只在当前方法用到的逻辑：

```csharp
int Factorial(int n)
{
    return Calc(n);
    int Calc(int x) => x <= 1 ? 1 : x * Calc(x - 1);  // 本地函数，可递归
}
```

## 速记

- 默认按值传递；引用类型"按值传地址"，所以能改对象内部、不能换对象。
- `ref` 双向、`out` 只出、`in` 只读防拷贝。
- 多返回值优先用**元组**，其次才考虑 `out`。
- 交换变量语法糖：`(a, b) = (b, a);`

---

**延伸阅读**：[方法（C# 编程指南）](https://learn.microsoft.com/zh-cn/dotnet/csharp/programming-guide/classes-and-structs/methods)
