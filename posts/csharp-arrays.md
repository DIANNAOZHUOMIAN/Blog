---
title: C# 数组与排序
date: 2026-06-23
tags: [C#, 数组, 排序算法, 比较器]
summary: 数组声明与遍历、Array 常用方法、冒泡/选择排序、最值与去重、Sort + Lambda 比较器、IComparer。
---

# C# 数组与排序

数组是**定长、连续、同类型**的集合。长度固定是它的核心约束——"增删"本质上是构造新数组。

## 一、声明与基础操作

```csharp
int[] a = new int[5];              // 默认全 0
int[] b = { 1, 2, 3 };             // 初始化器
int[] c = new int[] { 1, 2, 3 };

Console.WriteLine(b.Length);       // 3
Console.WriteLine(b[0]);           // 索引从 0 开始，越界抛 IndexOutOfRangeException

int[,] grid = new int[3, 4];       // 二维数组
int[][] jagged = new int[3][];     // 交错数组（每行长度可不同）

foreach (var x in b) Console.Write(x);
```

## 二、Array 常用方法

```csharp
Array.Sort(arr);                   // 升序排序
Array.Reverse(arr);                // 反转
int i = Array.IndexOf(arr, 3);     // 查找下标，找不到返回 -1
bool has = Array.Exists(arr, x => x > 5);
int f = Array.Find(arr, x => x > 5);
Array.ForEach(arr, Console.WriteLine);
int[] copy = (int[])arr.Clone();   // 浅拷贝
Array.Copy(src, dst, length);
```

## 三、经典排序算法（手写）

### 冒泡排序（升序）

相邻两两比较，大的往后冒。

```csharp
for (int i = 0; i < arr.Length - 1; i++)            // 外层 n-1 轮
    for (int j = 0; j < arr.Length - 1 - i; j++)    // 内层上界递减
        if (arr[j] > arr[j + 1])
            (arr[j], arr[j + 1]) = (arr[j + 1], arr[j]);   // 元组交换
```

### 选择排序（升序）

每轮把当前最小值放到第 `i` 位。

```csharp
for (int i = 0; i < arr.Length - 1; i++)
    for (int j = i + 1; j < arr.Length; j++)        // 内层从 i+1 开始
        if (arr[i] > arr[j])
            (arr[i], arr[j]) = (arr[j], arr[i]);
```

## 四、最值与汇总

```csharp
int max = arr[0], min = arr[0];
for (int i = 1; i < arr.Length; i++)
{
    if (arr[i] > max) max = arr[i];
    if (arr[i] < min) min = arr[i];
}

int sum = 0; foreach (var x in arr) sum += x;
double avg = (double)sum / arr.Length;   // 注意：别用整除丢精度
```

## 五、定长数组的增删（构造新数组）

```csharp
// 删除一个值：新数组长度 -1，遍历跳过目标
var newArr = new int[arr.Length - 1];
int k = 0;
foreach (var x in arr)
    if (x != target) newArr[k++] = x;
arr = newArr;
```

> 频繁增删请直接用 `List<T>`，别和定长数组较劲——见 [C# 集合](c-集合.html)。

## 六、Sort + Lambda 比较器

`Array.Sort` 可传一个比较函数：返回值 `<0` 表示 `x` 在前，`>0` 表示 `y` 在前。

```csharp
int[] ints = { 2, 1, 3 };
Array.Sort(ints, (x, y) => x - y);    // 正序（从小到大）
Array.Sort(ints, (x, y) => y - x);    // 倒序

// 字符串不能相减，用 Comparer
Array.Sort(strings, (x, y) =>
    CaseInsensitiveComparer.Default.Compare(y, x));   // 倒序

// 复杂对象按字段排序
Array.Sort(people, (a, b) => a.Age.CompareTo(b.Age));
```

> ⚠️ 用 `x - y` 排 `int` 在极端值时可能**整数溢出**，更稳妥用 `x.CompareTo(y)`。

## 七、自定义比较器 IComparer

`ArrayList` 等老集合的 `Sort` 需要一个实现 `IComparer` 的比较器类：

```csharp
class DescComparer : IComparer
{
    public int Compare(object? x, object? y)
        => CaseInsensitiveComparer.Default.Compare(y, x);   // 倒序
}

var list = new ArrayList { 2, 1, 3 };
list.Sort(new DescComparer());
```

泛型版本实现 `IComparer<T>`：

```csharp
class AgeComparer : IComparer<Person>
{
    public int Compare(Person? a, Person? b) => a!.Age.CompareTo(b!.Age);
}
people.Sort(new AgeComparer());
```

实际开发更常用 LINQ 一行搞定：`people.OrderBy(p => p.Age).ToArray()`，见 [C# LINQ](c-linq.html)。

## 速记

- 冒泡：外 `n-1`，内 `n-1-i`，相邻交换。
- 选择：外 `n-1`，内 `i+1..`，第 `i` 位放最小。
- `Array.Sort(arr, (x,y) => x-y)` 正序、`y-x` 倒序；字符串/对象用 `CompareTo`。
- 真实项目优先 `List<T>` + LINQ，手写排序主要用于理解原理。
