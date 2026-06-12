---
title: Rust 基本语法
date: 2026-06-12
tags: [Rust, 基本语法]
summary: 变量、类型、控制流、函数、复合类型、模式匹配与常用集合速查。
---

# Rust 基本语法

Rust 是静态强类型、编译型语言，默认不可变、无 GC、内存安全靠所有权在编译期保证。本文是语法速查，所有权等概念见《Rust 基本概念》。

## 一、第一个程序

```rust
// main.rs
fn main() {
    println!("hello world");
}
```

编译运行：`rustc main.rs && ./main`，工程化用 `cargo run`。

注释：`//` 单行，`/* */` 块，`///` 文档注释（生成 API 文档），`//!` 模块级文档。

## 二、变量与可变性

```rust
let x = 1;            // 默认不可变
let mut y = 2;        // mut 才能改
y += 1;

let x = x + 1;        // shadowing：同名重新绑定，可换类型
let x = "now str";

const MAX: u32 = 100_000;   // 常量必须标类型、编译期求值
static NAME: &str = "blog"; // 静态变量，'static 生命周期
```

`_` 开头的变量名不会触发 unused 警告。

## 三、基本类型

```rust
// 整数：i8/i16/i32/i64/i128/isize，u 开头为无符号
let a: i32 = -10;
let b: u64 = 42;
let big = 1_000_000u64;     // 字面量带类型后缀

// 浮点
let f: f64 = 3.14;          // 默认 f64
let g: f32 = 1.0;

// 布尔 / 字符（char 是 4 字节 Unicode 标量）
let ok: bool = true;
let c: char = '中';

// 溢出：debug 下 panic，release 下回绕；显式用 wrapping_/checked_/saturating_
let n = 255u8.wrapping_add(1);   // 0
```

进制：`0b1010`、`0o17`、`0xff`，下划线分隔 `1_000`。

## 四、字符串

Rust 有两种：`String`（堆上、可增长、拥有所有权）与 `&str`（字符串切片，借用）。

```rust
let s1: &str = "字面量";          // &'static str
let mut s2 = String::from("hi");
s2.push_str(", world");
s2.push('!');

let s3 = format!("{}-{}", "a", 1);   // 不消耗参数
let n: i32 = "42".parse().unwrap();  // 解析

// 常用
s2.len();                 // 字节数，不是字符数
s2.is_empty();
s2.contains("wor");
s2.replace("hi", "yo");
s2.to_uppercase();
s2.trim();
"a,b,c".split(',').collect::<Vec<_>>();
for ch in s2.chars() { /* 按 Unicode 字符遍历 */ }
```

`String` 与 `&str` 转换：`&s`（取切片）、`s.to_string()` / `s.to_owned()`（拷贝成 String）。

## 五、复合类型

### 元组

```rust
let t: (i32, f64, char) = (1, 2.0, 'a');
let (x, y, z) = t;        // 解构
let first = t.0;          // 按下标
let unit = ();            // 空元组（单元类型）
```

### 数组与切片

```rust
let arr: [i32; 3] = [1, 2, 3];   // 定长，栈上
let zeros = [0; 5];              // [0,0,0,0,0]
let slice: &[i32] = &arr[0..2];  // 切片，借用一段
arr.len();
```

变长用 `Vec<T>`（见集合）。

## 六、控制流

```rust
// if 是表达式，可赋值
let n = if x > 0 { 1 } else { -1 };

// loop / while / for
let mut i = 0;
let result = loop {           // loop 可带返回值
    i += 1;
    if i == 10 { break i * 2; }
};

while i < 20 { i += 1; }

for k in 0..5 { }             // 0..5 不含 5
for k in 0..=5 { }            // 含 5
for x in &arr { }             // 遍历引用
for (idx, v) in arr.iter().enumerate() { }

// 带标签的循环
'outer: for a in 0..3 {
    for b in 0..3 {
        if a + b == 3 { break 'outer; }
    }
}
```

Rust 没有三元运算符，用 `if/else` 表达式。

## 七、函数

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b            // 最后一个表达式即返回值，无分号
}

fn early(x: i32) -> i32 {
    if x < 0 { return 0; }   // return 显式提前返回
    x * 2
}

fn no_return() { }           // 默认返回 ()
```

函数指针、闭包见《Rust 基本概念》与生态篇。

## 八、结构体

```rust
struct User {
    name: String,
    age: u32,
    active: bool,
}

let mut u = User { name: "Bob".into(), age: 30, active: true };
u.age += 1;

// 字段同名简写 + 更新语法
fn build(name: String) -> User {
    User { name, age: 0, active: true }
}
let u2 = User { name: "Al".into(), ..u };   // 其余字段从 u 取

// 元组结构体 / 单元结构体
struct Point(i32, i32);
struct Marker;

// 方法：impl 块
impl User {
    fn new(name: &str) -> Self {        // 关联函数（无 self），相当于构造器
        Self { name: name.into(), age: 0, active: true }
    }
    fn greet(&self) -> String {         // &self 借用
        format!("Hi, {}", self.name)
    }
    fn birthday(&mut self) {            // &mut self 可变借用
        self.age += 1;
    }
}

let u3 = User::new("Cara");
println!("{}", u3.greet());
```

## 九、枚举

```rust
enum Shape {
    Circle(f64),                 // 可携带数据
    Rect { w: f64, h: f64 },
    Unit,
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle(r) => 3.14 * r * r,
            Shape::Rect { w, h } => w * h,
            Shape::Unit => 0.0,
        }
    }
}
```

标准库两个核心枚举：

```rust
enum Option<T> { Some(T), None }          // 代替 null
enum Result<T, E> { Ok(T), Err(E) }       // 代替异常
```

## 十、模式匹配

```rust
let opt = Some(5);

match opt {
    Some(n) if n > 3 => println!("big {n}"),  // 守卫
    Some(n) => println!("{n}"),
    None => println!("nothing"),
}

// if let / let else：只关心一种情况
if let Some(n) = opt { println!("{n}"); }

let Some(n) = opt else { return; };   // 不匹配则走 else（必须发散）

// while let
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() { println!("{top}"); }

// 解构 + 范围 + 绑定
match (x, y) {
    (0, 0) => "origin",
    (x, 0) | (0, x) => "on axis",
    _ => "elsewhere",
};
match age {
    0..=12 => "child",
    n @ 13..=19 => "teen",   // @ 绑定值
    _ => "adult",
};
```

`match` 必须穷尽所有情况，`_` 兜底。

## 十一、常用集合

```rust
use std::collections::{HashMap, HashSet, BTreeMap, VecDeque};

// Vec
let mut v = vec![1, 2, 3];
v.push(4);
v.pop();
v.insert(0, 0);
v.remove(1);
v[0];                     // 越界 panic
v.get(10);                // 返回 Option，安全
v.iter().sum::<i32>();
v.contains(&2);
v.sort();
v.sort_by(|a, b| b.cmp(a));
v.dedup();

// HashMap
let mut m: HashMap<String, i32> = HashMap::new();
m.insert("a".into(), 1);
m.get("a");                       // Option<&i32>
*m.entry("a".into()).or_insert(0) += 1;  // 不存在则插入默认再改
for (k, val) in &m { }

// HashSet
let mut set = HashSet::new();
set.insert(1);
set.contains(&1);
```

`BTreeMap`/`BTreeSet` 有序，`VecDeque` 双端队列。

## 十二、迭代器

```rust
let v = vec![1, 2, 3, 4, 5];

let result: Vec<i32> = v.iter()
    .filter(|&&x| x % 2 == 0)
    .map(|&x| x * 10)
    .collect();                 // [20, 40]

let total: i32 = v.iter().sum();
let max = v.iter().max();
let found = v.iter().find(|&&x| x > 3);   // Option
let any = v.iter().any(|&x| x > 4);
let count = v.iter().filter(|&&x| x > 2).count();

// 惰性：不 collect/for 不执行
for (i, x) in v.iter().enumerate() { }
let zipped: Vec<_> = v.iter().zip(["a","b"]).collect();
let folded = v.iter().fold(0, |acc, x| acc + x);
```

`iter()` 借用、`iter_mut()` 可变借用、`into_iter()` 取所有权。

## 十三、错误处理速记

```rust
fn read_num(s: &str) -> Result<i32, std::num::ParseIntError> {
    let n = s.parse::<i32>()?;   // ? 出错就提前 return Err
    Ok(n * 2)
}

opt.unwrap();          // None 则 panic
opt.expect("必须有值"); // 带信息 panic
opt.unwrap_or(0);      // 默认值
opt.unwrap_or_else(|| compute());
```

`?` 与 `Result` 的完整模型见《Rust 基本概念》。

## 十四、模块与可见性

```rust
mod network {
    pub fn connect() { }          // pub 才对外可见
    pub mod client {
        pub fn send() {}
    }
    fn private_helper() { }       // 默认私有
}

use network::client;
client::send();

// 跨文件：mod foo; 对应 foo.rs 或 foo/mod.rs
```

`crate::` 当前包根，`super::` 父模块，`self::` 当前模块。

## 十五、风格与工具

- 缩进 4 空格；命名：`snake_case` 函数/变量、`PascalCase` 类型/Trait、`UPPER_SNAKE` 常量；
- 格式化：`cargo fmt`（rustfmt）；
- Lint：`cargo clippy`（极其有用，建议常开）；
- 文档：`cargo doc --open`；
- `{}` 用 `Display`，`{:?}` 用 `Debug`，`{:#?}` 美化打印，`{x}` 内联变量。

## 十六、常见坑

1. 整数默认 `i32`、浮点默认 `f64`，溢出在 debug 下 panic；
2. `String` 不能用索引 `s[0]`，按 `.chars()` 或 `.bytes()`；
3. `==` 比较需要类型实现 `PartialEq`；
4. `match` 必须穷尽；
5. `let x = 1` 默认不可变，改值要 `mut`；
6. 表达式末尾加分号会变成语句，丢掉返回值。
