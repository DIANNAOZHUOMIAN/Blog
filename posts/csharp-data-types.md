---
title: C# 数据类型与变量
date: 2026-06-23
tags: [C#, 基础, 数据类型, 运算符]
summary: 值类型 vs 引用类型、内存模型（栈/堆）、内置类型与取值范围、装箱拆箱、类型转换、可空类型、运算符与优先级。
---

# C# 数据类型与变量

C# 是强类型语言：每个变量在编译期就确定了类型。类型决定了它**占多少内存、存什么、能做哪些运算**。

## 一、三大类型分类

| 分类 | 存储方式 | 示例 | 内存 |
|---|---|---|---|
| 值类型（Value Type） | 直接存数据 | `int` `float` `char` `bool` `enum` `struct` | 栈 / 内联 |
| 引用类型（Reference Type） | 存的是地址 | `string` `array` `class` `interface` `object` | 堆 |
| 指针类型（Pointer Type） | 需 `unsafe` | `int*` | — |

所有值类型派生自 `System.ValueType`，所有类型最终派生自 `object`。

### 栈 vs 堆，一张图理解

```text
int a = 10;            // 栈：a = 10
int[] arr = {1,2,3};   // 栈：arr = 0x1A2B（地址）→ 堆：[1,2,3]
```

- **值类型**变量本身就装着值，赋值是**拷贝一份**。
- **引用类型**变量装的是堆上对象的地址，赋值只是**拷贝地址**——两个变量指向同一个对象。

```csharp
int x = 1; int y = x; y = 2;      // x 仍是 1（值拷贝）
int[] a = {1}; int[] b = a; b[0] = 9;  // a[0] 也变成 9（共享引用）
```

## 二、内置值类型与取值范围

### 整数类型

| 类型 | 字节 | 位 | 取值范围 |
|---|---|---|---|
| `byte` | 1 | 8 | 0 ~ 255（无符号） |
| `sbyte` | 1 | 8 | -128 ~ 127 |
| `short` | 2 | 16 | -32,768 ~ 32,767 |
| `int` | 4 | 32 | ±21 亿 |
| `long` | 8 | 64 | ±922 京 |

无符号版本：`uint` `ushort` `ulong`，范围从 0 开始。有符号范围公式：`-2^(n-1)` ~ `2^(n-1) - 1`。

### 浮点类型

| 类型 | 字节 | 有效数字 | 后缀 | 用途 |
|---|---|---|---|---|
| `float` | 4 | 6~7 位 | `f` | 精度低、最快 |
| `double` | 8 | 15~16 位 | （默认） | 通用 |
| `decimal` | 16 | 28~29 位 | `m` | **金额**、财务计算 |

> 💡 金额一律用 `decimal`。`float`/`double` 是二进制浮点，`0.1 + 0.2 != 0.3`，会丢精度。

### 其他

| 类型 | 字节 | 说明 |
|---|---|---|
| `char` | 2 | 单个 UTF-16 字符 `'张'` |
| `bool` | 1 | `true` / `false` |
| `enum` | 同基础整型 | 一组命名常量 |
| `struct` | 自定义 | 值类型的"类" |

记忆口诀：**字节一，短二，整四，长八；单双浮点四八差，精确货币十六大。**

## 三、装箱与拆箱（boxing / unboxing）

值类型转 `object`（或接口）时，会在堆上**装箱**；反向取回是**拆箱**。这是隐藏的性能开销。

```csharp
int n = 42;
object boxed = n;        // 装箱：在堆上分配，拷贝 42 进去
int back = (int)boxed;   // 拆箱：类型必须完全匹配，否则 InvalidCastException
```

热路径里频繁装箱（如老式 `ArrayList`、`Hashtable`）会制造大量垃圾。**用泛型集合 `List<int>` / `Dictionary<,>` 避免装箱。**

## 四、类型转换

```csharp
// 1. 隐式转换：小 → 大，无损，自动
int i = 100; long l = i; double d = i;

// 2. 显式转换（强制）：大 → 小，可能溢出/截断
double pi = 3.99; int t = (int)pi;   // 3，直接截断小数

// 3. Convert：跨类型，null 安全些
int a = Convert.ToInt32("123");

// 4. Parse / TryParse：字符串 → 数值
int b = int.Parse("123");            // 失败抛异常
bool ok = int.TryParse("abc", out int c);  // 失败返回 false，推荐
```

> 规则：解析用户输入、可能失败的场景，**永远优先 `TryParse`**，别用 `Parse` + try/catch。

## 五、可空类型 Nullable

值类型默认不能为 `null`，加 `?` 即可：

```csharp
int? age = null;
if (age.HasValue) Console.WriteLine(age.Value);
int real = age ?? 0;        // 空合并运算符，null 时取默认
int? len = name?.Length;    // 空条件运算符
```

## 六、变量与常量

```csharp
string name = "张三";       // 显式类型
var count = 10;             // 隐式类型（编译期推断，仍是强类型）
const double Pi = 3.14159;  // 编译期常量，必须初始化
readonly int _id;          // 运行期常量，只能在构造函数赋值
```

`var` 不是"弱类型"——它在编译期就被推断为确定类型，只是少写一遍。

## 七、运算符与优先级

| 分类 | 运算符 |
|---|---|
| 算术 | `+ - * / % ++ --` |
| 比较 | `> < >= <= == !=` |
| 逻辑 | `&& \|\| !`（短路求值） |
| 位运算 | `& \| ^ ~ << >>` |
| 三元 | `条件 ? 真 : 假` |
| 赋值 | `= += -= *= /= %=` … |
| 空处理 | `?? ??= ?.` |

**优先级（从高到低）**：一元 → `* / %` → `+ -` → 移位 → 关系 `< > is as` → 相等 `== !=` → `&` → `^` → `\|` → `&&` → `\|\|` → `?:` → 赋值。

```csharp
Console.WriteLine(5 + 3 * 2 > 10 && 4 < 8);   // 先 *，再 +，再比较，再 && → False
```

> 拿不准优先级时，**加括号**。可读性永远比"少打几个字符"重要。

## 八、易错点

- 整数除法：`5 / 2 == 2`，要小数得写 `5 / 2.0` 或 `5d / 2`。
- `==` 比较引用类型默认比**引用**（`string` 重载成比内容是特例）。
- `decimal` 字面量别忘 `m`：`decimal d = 1.1;` 编译报错，应写 `1.1m`。
- 位运算 `&` `|` 不短路、`&&` `||` 短路，逻辑判断用后者。

---

**延伸阅读**：[内置类型（C# 参考） — Microsoft Learn](https://learn.microsoft.com/zh-cn/dotnet/csharp/language-reference/builtin-types/built-in-types)
