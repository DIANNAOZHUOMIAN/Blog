---
title: Rust 集合与迭代器
date: 2026-06-14
tags: [Rust, 集合, 迭代器]
summary: Vec、HashMap、BTreeMap、HashSet、VecDeque 常用操作，以及迭代器适配器与消费器。
---

# Rust 集合与迭代器

标准库 `std::collections` 提供常用容器，配合迭代器形成 Rust 处理数据的主力工具。

## 一、Vec：动态数组

```rust
let mut v: Vec<i32> = Vec::new();
let mut v = vec![1, 2, 3];
let zeros = vec![0; 5];          // [0,0,0,0,0]

v.push(4);
v.pop();                          // Option<T>
v.insert(0, 9);
v.remove(1);
v.extend([5, 6]);
v.truncate(2);
v.clear();

v[0];                             // 越界 panic
v.get(10);                        // 安全，返回 Option
v.first(); v.last();
v.len(); v.is_empty();
v.contains(&2);
v.sort(); v.sort_by(|a, b| b.cmp(a)); v.sort_by_key(|x| x.abs());
v.dedup();                        // 去相邻重复
v.reverse();
v.retain(|&x| x > 0);             // 原地过滤
v.swap(0, 1);
let slice = &v[1..3];             // 切片
```

容量优化：`Vec::with_capacity(n)` 预分配，避免反复扩容。

## 二、HashMap

```rust
use std::collections::HashMap;

let mut m: HashMap<String, i32> = HashMap::new();
m.insert("a".into(), 1);
m.get("a");                       // Option<&i32>
m.get("a").copied().unwrap_or(0);
m.contains_key("a");
m.remove("a");
m.len();

// entry API：不存在才插入 / 累加计数
*m.entry("a".into()).or_insert(0) += 1;
m.entry("b".into()).or_insert_with(Vec::new).push(1);

for (k, v) in &m { }              // 无序
for k in m.keys() { }
for v in m.values_mut() { *v += 1; }

// 从迭代器构造
let counts: HashMap<char, usize> = "hello".chars()
    .fold(HashMap::new(), |mut acc, c| { *acc.entry(c).or_insert(0) += 1; acc });
```

键需实现 `Eq + Hash`。需要确定性顺序用 `BTreeMap`。

## 三、其他集合

```rust
use std::collections::{BTreeMap, HashSet, BTreeSet, VecDeque};

// BTreeMap：按键有序
let mut bt = BTreeMap::new();
bt.insert(3, "c"); bt.insert(1, "a");
for (k, v) in &bt { }             // 按 key 升序

// HashSet / BTreeSet
let mut set: HashSet<i32> = HashSet::new();
set.insert(1);
set.contains(&1);
let a: HashSet<_> = [1, 2, 3].into();
let b: HashSet<_> = [2, 3, 4].into();
let inter: HashSet<_> = a.intersection(&b).copied().collect();  // 交
a.union(&b); a.difference(&b); a.symmetric_difference(&b);

// VecDeque：双端队列
let mut dq = VecDeque::new();
dq.push_back(1); dq.push_front(0);
dq.pop_front(); dq.pop_back();
```

## 四、迭代器三要素

迭代器**惰性**：不被消费就不执行。

```rust
let v = vec![1, 2, 3, 4, 5];

// 获取迭代器
v.iter()        // 产出 &T，不动所有权
v.iter_mut()    // 产出 &mut T
v.into_iter()   // 产出 T，消费集合
```

## 五、适配器（产出新迭代器，惰性）

```rust
let r: Vec<i32> = v.iter()
    .filter(|&&x| x % 2 == 0)     // 过滤
    .map(|&x| x * 10)             // 变换
    .collect();

v.iter().enumerate();             // (index, &item)
v.iter().zip(other.iter());       // 配对
v.iter().rev();                   // 反向
v.iter().skip(2).take(3);         // 跳过/截取
v.iter().step_by(2);
v.iter().chain(other.iter());     // 拼接
v.iter().flatten();               // 摊平嵌套
v.iter().flat_map(|x| 0..*x);
v.iter().scan(0, |st, &x| { *st += x; Some(*st) });  // 带状态
v.windows(2);                     // 相邻窗口（切片方法）
v.chunks(3);                      // 分块
```

## 六、消费器（产出最终值）

```rust
let sum: i32 = v.iter().sum();
let prod: i32 = v.iter().product();
let max = v.iter().max();         // Option
let min = v.iter().min();
let count = v.iter().filter(|&&x| x > 2).count();

v.iter().any(|&x| x > 4);         // 存在
v.iter().all(|&x| x > 0);         // 全部
v.iter().find(|&&x| x > 3);       // 第一个满足，Option
v.iter().position(|&x| x == 3);   // 下标，Option

let total = v.iter().fold(0, |acc, &x| acc + x);   // 折叠
let s = v.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",");

// 收集到不同类型
let set: std::collections::HashSet<_> = v.iter().collect();
let map: std::collections::HashMap<_, _> = pairs.into_iter().collect();

// Result/Option 短路收集
let nums: Result<Vec<i32>, _> = ["1", "2", "x"].iter().map(|s| s.parse::<i32>()).collect();
// 任意一个 Err 则整体 Err

// 分组 / 分区
let (evens, odds): (Vec<i32>, Vec<i32>) = v.iter().partition(|&&x| x % 2 == 0);
```

## 七、实战示例

```rust
// 统计词频取前 3
use std::collections::HashMap;
let text = "the cat the dog the bird";
let mut freq: HashMap<&str, usize> = HashMap::new();
for w in text.split_whitespace() {
    *freq.entry(w).or_insert(0) += 1;
}
let mut top: Vec<_> = freq.into_iter().collect();
top.sort_by(|a, b| b.1.cmp(&a.1));
top.truncate(3);
```

迭代器链是零成本抽象：编译后与手写循环同等高效，且更易读。

## 八、Entry API 与 HashMap 进阶

"查一次，然后按有无分别处理"，避免两次哈希：

```rust
use std::collections::HashMap;
let mut map: HashMap<String, Vec<i32>> = HashMap::new();

map.entry("k".into()).or_default().push(1);       // 无则建默认值
map.entry("k".into())
   .and_modify(|v| v.push(2))                     // 有则修改
   .or_insert_with(|| vec![0]);                   // 无则惰性构造

// 自定义 key：需要 Eq + Hash（一般 derive）
#[derive(PartialEq, Eq, Hash)]
struct Point { x: i32, y: i32 }

// 借用查询：HashMap<String, _> 可以直接用 &str 查
map.get("k");            // 因为 String: Borrow<str>
```

容量：`HashMap::with_capacity(n)` 预分配；`retain(|k, v| ...)` 原地过滤；要稳定顺序用 `BTreeMap`（还支持范围查询 `map.range("a".."m")`）。

## 九、实现自定义迭代器

只需实现 `next()`，全部适配器立刻免费可用：

```rust
struct Fib { a: u64, b: u64 }

impl Iterator for Fib {
    type Item = u64;
    fn next(&mut self) -> Option<u64> {
        let out = self.a;
        (self.a, self.b) = (self.b, self.a + self.b);
        Some(out)                        // 无限迭代器，靠 take 截断
    }
}

let first: Vec<_> = Fib { a: 0, b: 1 }.take(8).collect();
// [0, 1, 1, 2, 3, 5, 8, 13]
```

给自己的集合实现 `IntoIterator`（值、`&`、`&mut` 三件套），就能直接用于 `for` 循环；反向实现 `FromIterator` 则让它能作为 `collect()` 的目标。

## 十、collect 的目标类型

`collect()` 由**目标类型**驱动，同一条链可以收成完全不同的东西：

```rust
let pairs = [("a", 1), ("b", 2)];

let v: Vec<(&str, i32)>          = pairs.iter().copied().collect();
let m: HashMap<&str, i32>        = pairs.iter().copied().collect();
let s: String                    = ["ab", "cd"].concat();
let (evens, odds): (Vec<i32>, Vec<i32>) =
    (1..10).partition(|x| x % 2 == 0);          // 一次分成两组

// Result 收集：任一 Err 短路（错误处理笔记有详述）
let nums: Result<Vec<i32>, _> =
    ["1", "2"].iter().map(|s| s.parse::<i32>()).collect();
```

性能提示：`iter().map().collect::<Vec<_>>()` 会利用 `size_hint` 一次性分配；中间避免 `collect` 成临时 Vec 再继续链——直接把链写通常更省。
