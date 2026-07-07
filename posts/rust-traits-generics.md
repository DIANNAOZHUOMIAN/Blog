---
title: Rust Trait 与泛型
date: 2026-06-14
tags: [Rust, Trait, 泛型]
summary: Trait 定义与实现、泛型约束、关联类型、trait 对象、运算符重载、常用标准 Trait。
---

# Rust Trait 与泛型

Trait 定义共享行为（类似接口），泛型实现零成本复用，二者结合是 Rust 抽象的基石。

## 一、定义与实现 Trait

```rust
trait Summary {
    fn summarize(&self) -> String;             // 必须实现
    fn preview(&self) -> String {              // 默认实现
        format!("{}…", &self.summarize()[..1])
    }
}

struct Article { title: String, body: String }

impl Summary for Article {
    fn summarize(&self) -> String { self.title.clone() }
}
```

孤儿规则：只能为"本地类型"或"本地 trait"实现 trait（防冲突）。

## 二、泛型函数与约束

```rust
fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {
    let mut max = list[0];
    for &x in list { if x > max { max = x; } }
    max
}

// where 子句（约束多时更清晰）
fn process<T, U>(t: T, u: U) -> String
where
    T: std::fmt::Display,
    U: std::fmt::Debug + Clone,
{
    format!("{t} {u:?}")
}
```

泛型经**单态化**：编译期为每个具体类型生成专用代码，运行时零开销。

## 三、impl Trait 语法

```rust
fn notify(item: &impl Summary) {            // 参数：任意实现 Summary 的类型
    println!("{}", item.summarize());
}

fn make_adder(x: i32) -> impl Fn(i32) -> i32 {  // 返回：某个匿名实现
    move |y| x + y
}
```

`impl Trait` 适合简单场景；返回位置只能返回单一具体类型。

## 四、泛型结构体与方法

```rust
struct Wrapper<T> { value: T }

impl<T> Wrapper<T> {
    fn new(value: T) -> Self { Self { value } }
    fn get(&self) -> &T { &self.value }
}

// 仅对满足约束的 T 提供方法
impl<T: std::fmt::Display> Wrapper<T> {
    fn show(&self) { println!("{}", self.value); }
}
```

## 五、关联类型

比泛型参数更适合"每个实现只有一种对应类型"的场景（如 `Iterator::Item`）：

```rust
trait Container {
    type Item;                       // 关联类型
    fn get(&self, i: usize) -> Option<&Self::Item>;
    fn len(&self) -> usize;
}

struct Stack<T> { items: Vec<T> }

impl<T> Container for Stack<T> {
    type Item = T;
    fn get(&self, i: usize) -> Option<&T> { self.items.get(i) }
    fn len(&self) -> usize { self.items.len() }
}
```

## 六、自定义迭代器

```rust
struct Counter { count: u32 }

impl Iterator for Counter {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.count < 5 { self.count += 1; Some(self.count) } else { None }
    }
}

let sum: u32 = Counter { count: 0 }.map(|x| x * 2).sum();   // 自动获得全部适配器
```

只要实现 `next`，就能用上所有迭代器适配器/消费器。

## 七、trait 对象（动态分发）

泛型是静态分发（编译期定死类型）；要在运行时存放不同类型，用 `dyn`：

```rust
trait Draw { fn draw(&self); }

let shapes: Vec<Box<dyn Draw>> = vec![
    Box::new(Circle), Box::new(Square),
];
for s in &shapes { s.draw(); }      // 虚表动态分发

fn render(item: &dyn Draw) { item.draw(); }   // 也可作参数
```

`dyn` 有轻微运行时开销（虚表），换来异构集合的灵活。对象安全要求：方法不能返回 `Self`、不能有泛型方法等。

## 八、运算符重载

通过实现 `std::ops` 里的 trait：

```rust
use std::ops::Add;

#[derive(Clone, Copy)]
struct V2 { x: f64, y: f64 }

impl Add for V2 {
    type Output = V2;
    fn add(self, rhs: V2) -> V2 {
        V2 { x: self.x + rhs.x, y: self.y + rhs.y }
    }
}

let c = V2 { x: 1.0, y: 2.0 } + V2 { x: 3.0, y: 4.0 };
```

类似的：`Sub`/`Mul`/`Index`/`Deref`/`PartialEq`/`PartialOrd` 等。

## 九、常用标准 Trait

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
struct Id(u32);
```

| Trait | 作用 |
|---|---|
| `Debug` / `Display` | `{:?}` / `{}` 格式化 |
| `Clone` / `Copy` | 复制 |
| `PartialEq` / `Eq` | `==` 比较 / 可作 HashMap 键 |
| `PartialOrd` / `Ord` | 排序、比较大小 |
| `Hash` | HashMap/HashSet 键 |
| `Default` | `T::default()` |
| `From` / `Into` | 类型转换（实现 `From` 自动获得 `Into`） |
| `Iterator` | 迭代 |
| `Drop` | 自定义析构 |

```rust
// From / Into
impl From<&str> for Id {
    fn from(s: &str) -> Self { Id(s.parse().unwrap_or(0)) }
}
let id: Id = "42".into();
```

## 十、泛型约束进阶

```rust
// 多约束、关联类型约束
fn sum_all<I>(iter: I) -> i32
where I: IntoIterator<Item = i32> { iter.into_iter().sum() }

// blanket impl：为所有满足条件的类型统一实现
trait Printable { fn print(&self); }
impl<T: std::fmt::Display> Printable for T {
    fn print(&self) { println!("{self}"); }
}

// supertrait：依赖另一个 trait
trait Named: std::fmt::Display {
    fn name(&self) -> String;
}
```

选型：能用泛型（静态分发）就用泛型，性能最好；需要异构集合 / 运行时多态再用 `dyn`。

## 十一、trait 与生命周期

```rust
// trait 对象默认带 'static 约束：Box<dyn Trait> ≡ Box<dyn Trait + 'static>
fn spawn_job(job: Box<dyn Fn() + Send + 'static>) { /* ... */ }

// 借用数据的 trait 对象要显式标注生命周期
struct Parser<'a> {
    on_token: Box<dyn Fn(&str) + 'a>,     // 允许闭包借用外部数据
}

// 泛型 + 引用参数：约束"引用活得够久"
fn largest<'a, T: PartialOrd>(items: &'a [T]) -> &'a T {
    let mut max = &items[0];
    for it in items { if it > max { max = it; } }
    max
}
```

遇到 `may not live long enough` 时先问：这个 trait 对象/闭包是否真的要 `'static`（比如跨线程），不需要就放宽为 `+ 'a`。

## 十二、PhantomData 与类型状态

零大小的"幽灵字段"，让类型系统替你记状态——非法操作直接编译不过：

```rust
use std::marker::PhantomData;

struct Open;
struct Closed;

struct Conn<State> {
    addr: String,
    _st: PhantomData<State>,
}

impl Conn<Closed> {
    fn connect(addr: &str) -> Conn<Open> {
        Conn { addr: addr.into(), _st: PhantomData }
    }
}
impl Conn<Open> {
    fn send(&self, _data: &[u8]) { /* 只有 Open 才有 send */ }
    fn close(self) -> Conn<Closed> {
        Conn { addr: self.addr, _st: PhantomData }
    }
}

// Conn::<Closed>::send(...)  ← 编译错误：未连接就发送
```

`PhantomData<T>` 不占内存，只参与类型检查与 drop 检查，FFI 封装、单位类型（米/秒）、builder 状态机都靠它。

## 十三、孤儿规则与 newtype

孤儿规则：**trait 或类型至少有一个在本 crate**，才能写 `impl`——不能给 `Vec<i32>` 实现 `Display`。绕法是 newtype 包一层：

```rust
struct Wrapper(Vec<String>);

impl std::fmt::Display for Wrapper {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "[{}]", self.0.join(", "))
    }
}

// 想让 Wrapper 直接当 Vec 用：实现 Deref（慎用，仅限"就是它的别名"语义）
impl std::ops::Deref for Wrapper {
    type Target = Vec<String>;
    fn deref(&self) -> &Self::Target { &self.0 }
}
```

newtype 还能提供**语义强类型**：`struct UserId(u64)` 和 `struct OrderId(u64)` 不会传错位置，编译器帮你查——零运行时成本。
