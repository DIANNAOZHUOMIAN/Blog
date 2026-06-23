---
title: C# 集合
date: 2026-06-23
tags: [C#, 集合, List, Dictionary]
summary: List/Dictionary/HashSet/Stack/Queue 泛型集合，Hashtable/SortedList/ArrayList 老集合，选型与性能、并发集合。
---

# C# 集合

集合是一组数据的容器，提供增删改查。.NET 分两套：**泛型集合**（`System.Collections.Generic`，类型安全、无装箱，**首选**）和**老的非泛型集合**（`System.Collections`，元素是 `object`，会装箱，了解即可）。

## 一、List&lt;T&gt; 动态数组

最常用的集合，自动扩容、按索引访问、与 LINQ 完美配合。

```csharp
var list = new List<int> { 1, 2, 3 };
list.Add(4);
list.AddRange(new[] { 5, 6 });
list.Insert(0, 99);
list.Remove(99);                 // 删第一个等于 99 的
list.RemoveAll(x => x % 2 == 0); // 按条件批量删
int x = list[0];                 // 索引访问
int idx = list.IndexOf(3);
bool has = list.Contains(3);
int found = list.Find(n => n > 4);
list.Sort();
list.ForEach(Console.WriteLine);
```

常用成员：`Add/AddRange/Insert/Remove/RemoveAt/RemoveAll/Clear`、`Contains/IndexOf/Find/Exists`、`Sort/Reverse/ConvertAll`、`Count/Capacity`。

> 频繁在**中间**插入/删除会触发元素位移，考虑 `LinkedList<T>`；只读对外暴露 `IReadOnlyList<T>`。

## 二、Dictionary&lt;TKey, TValue&gt; 键值对

基于哈希表，键唯一，查找接近 O(1)。

```csharp
var dict = new Dictionary<string, int>
{
    ["Alice"] = 18,
    ["Bob"] = 20
};
dict.Add("Charlie", 22);
dict["Alice"] = 19;                          // 存在则覆盖

bool ok = dict.TryGetValue("Bob", out int age);   // 推荐：不存在不抛异常
if (dict.ContainsKey("Alice")) { }
dict.Remove("Charlie");

foreach (var (key, value) in dict)           // 解构遍历
    Console.WriteLine($"{key}: {value}");

// 自定义键比较（如忽略大小写）
var ci = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
ci["ID"] = "001";
Console.WriteLine(ci.ContainsKey("id"));     // True
```

> ⚠️ `dict[key]` 访问不存在的键抛 `KeyNotFoundException`，优先用 `TryGetValue`。别用**可变对象**当键，会破坏哈希一致性。

## 三、HashSet&lt;T&gt; 去重集合

只存唯一元素，`Contains` 是 O(1)，适合去重和集合运算：

```csharp
var set = new HashSet<int> { 1, 2, 2, 3 };   // 实际只有 {1,2,3}
set.Add(4);
set.UnionWith(new[] { 5, 6 });               // 并集
set.IntersectWith(new[] { 2, 4 });           // 交集
```

## 四、Stack&lt;T&gt; 与 Queue&lt;T&gt;

```csharp
// 栈：后进先出 LIFO
var s = new Stack<string>();
s.Push("李四");
string top = s.Peek();    // 看栈顶不弹出
string pop = s.Pop();     // 弹出栈顶

// 队列：先进先出 FIFO
var q = new Queue<string>();
q.Enqueue("老大");        // 入队
string head = q.Peek();   // 看队首
string deq = q.Dequeue(); // 出队
```

## 五、老的非泛型集合（了解）

元素都是 `object`，存取值类型会**装箱拆箱**，已被泛型集合取代。

```csharp
// Hashtable：键值不限类型
var hash = new Hashtable();
hash.Add("a", "张三");
hash[2.2] = "李四";
Console.WriteLine(hash["a"]);
bool hk = hash.ContainsKey("a");

// SortedList：哈希表 + 有序列表，按键自动升序
var sl = new SortedList();
sl.Add(10, "x");
var byKey = sl[10];              // 按键访问 → 哈希表
var byIdx = sl.GetByIndex(0);    // 按索引访问 → 已排序

// ArrayList：动态数组，元素是 object
var al = new ArrayList { 1, "two", 3.0 };
```

## 六、选型对照

| 需求 | 选用 |
|---|---|
| 有序、可重复、按索引 | `List<T>` |
| 键值映射、快速查 | `Dictionary<TKey,TValue>` |
| 去重 / 集合运算 | `HashSet<T>` |
| 后进先出 | `Stack<T>` |
| 先进先出 | `Queue<T>` |
| 按键有序遍历 | `SortedDictionary<,>` / `SortedSet<T>` |
| 多线程读写 | `ConcurrentDictionary<,>`、`ConcurrentQueue<T>`、`BlockingCollection<T>` |
| 只读对外暴露 | `IReadOnlyList<T>` / `IReadOnlyDictionary<,>` |

## 七、并发集合

多线程写普通集合会破坏内部状态，应使用 `System.Collections.Concurrent`：

```csharp
var cache = new ConcurrentDictionary<string, int>();
int v = cache.GetOrAdd("k", _ => ExpensiveCompute());   // 原子获取或创建
cache.AddOrUpdate("k", 1, (key, old) => old + 1);
```

## 速记

- 默认全用**泛型集合**；老集合（Hashtable/ArrayList）只在维护旧代码时遇到。
- 查找密集用 `Dictionary`/`HashSet`（O(1)），别用 `List.Contains`（O(n)）。
- 不存在键优先 `TryGetValue`；多线程用 `Concurrent*`。
- 集合配合 LINQ 威力倍增，见 [C# LINQ](c-linq.html)。
