---
title: Rust 基本概念
date: 2026-06-12
tags: [Rust, 核心概念]
summary: 所有权、借用、生命周期、Trait、泛型、闭包、错误处理与智能指针。
---

# Rust 基本概念

语法只是表层，Rust 真正的门槛是所有权系统——它让程序在没有 GC、没有手动 `free` 的情况下保证内存安全。本文讲清这套机制及其衍生概念。

## 一、所有权三原则

1. 每个值有且只有一个所有者（owner）；
2. 同一时刻只能有一个所有者；
3. 所有者离开作用域，值被自动释放（调用 `drop`）。

```rust
{
    let s = String::from("hi");   // s 拥有这段堆内存
}                                 // s 离开作用域，内存自动释放
```

### move：所有权转移

对没有 `Copy` 的类型，赋值/传参是「移动」，原变量失效：

```rust
let a = String::from("hi");
let b = a;             // 所有权移到 b
// println!("{a}");    // 编译错误：a 已被移动

fn take(s: String) { }
let c = String::from("x");
take(c);               // c 移入函数
// take(c);            // 错误：c 已失效
```

`Copy` 类型（整数、布尔、char、浮点、以及全是 Copy 的元组）是按位复制，不会失效：

```rust
let x = 5;
let y = x;             // 复制，x 仍可用
println!("{x} {y}");
```

显式深拷贝用 `.clone()`：`let b = a.clone();`。

## 二、借用与引用

为了不转移所有权地使用值，用「借用」（reference）：

```rust
fn len(s: &String) -> usize { s.len() }   // 借用，不取所有权

let s = String::from("hi");
let n = len(&s);       // 传引用
println!("{s}");       // s 仍可用
```

借用规则（编译期强制，防数据竞争）：

- 任意多个**不可变借用** `&T`，**或**
- 唯一一个**可变借用** `&mut T`，
- 二者不能同时存在。

```rust
let mut s = String::from("hi");
let r1 = &s;
let r2 = &s;           // 多个 &T 没问题
println!("{r1} {r2}");

let m = &mut s;        // 此时 r1/r2 已不再使用，OK
m.push('!');
// println!("{r1}");   // 若在这里用 r1，会与 m 冲突 → 报错
```

这条规则在编译期消灭了「一个线程读、另一个写」的数据竞争。悬垂引用也被禁止——引用不能比它指向的数据活得久。

## 三、生命周期

生命周期是「引用有效的作用域」的名字，多数情况编译器自动推断，只有在函数返回引用、关系不明时才要显式标注：

```rust
// 'a 表示：返回的引用活得和较短的那个输入一样久
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// 结构体持有引用时也要标注
struct Excerpt<'a> {
    part: &'a str,
}
```

`'static` 表示活整个程序期间（如字符串字面量 `&'static str`）。生命周期不改变值能活多久，只是向编译器描述引用之间的关系。

## 四、Trait（特征）

Trait 类似接口，定义共享行为：

```rust
trait Summary {
    fn summarize(&self) -> String;
    fn preview(&self) -> String {           // 默认实现
        format!("{}...", self.summarize())
    }
}

struct Article { title: String }

impl Summary for Article {
    fn summarize(&self) -> String {
        self.title.clone()
    }
}
```

### Trait 作为参数 / 约束

```rust
fn notify(item: &impl Summary) {            // impl Trait 语法
    println!("{}", item.summarize());
}

fn notify2<T: Summary>(item: &T) { }        // 泛型约束写法

fn complex<T>(item: &T)                      // 多约束 + where
where T: Summary + Clone { }
```

### 常用标准 Trait

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
struct Config { level: u32 }
```

- `Debug`：`{:?}` 打印；`Display`：`{}`（需手写）；
- `Clone`/`Copy`：复制；`PartialEq`/`Eq`：比较；
- `PartialOrd`/`Ord`：排序；`Hash`：作 HashMap 键；
- `Default`：`Config::default()`；
- `From`/`Into`：类型转换；`Iterator`：自定义迭代器；
- `Drop`：自定义析构逻辑。

## 五、泛型

```rust
fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {
    let mut max = list[0];
    for &x in list { if x > max { max = x; } }
    max
}

struct Pair<T> { a: T, b: T }

impl<T: std::fmt::Display> Pair<T> {
    fn show(&self) { println!("{} {}", self.a, self.b); }
}
```

泛型是零成本抽象：编译期单态化（为每个具体类型生成专用代码），运行时无开销。

## 六、闭包

```rust
let add = |a, b| a + b;            // 类型可推断
let mul = |a: i32, b: i32| -> i32 { a * b };

let factor = 3;
let scale = |x| x * factor;        // 捕获环境变量 factor
println!("{}", scale(10));         // 30

// 三种捕获方式对应三个 Trait：
// Fn      —— 不可变借用环境
// FnMut   —— 可变借用环境
// FnOnce  —— 取得所有权（move）
let s = String::from("hi");
let consume = move || println!("{s}");   // move 强制取所有权
consume();
```

闭包常作为高阶函数参数：`v.iter().map(|x| x * 2)`。

## 七、错误处理

Rust 不用异常，用 `Result<T, E>` 与 `Option<T>` 把错误编码进类型系统。

```rust
use std::fs;

fn read_config() -> Result<String, std::io::Error> {
    let content = fs::read_to_string("config.toml")?;  // ? 传播错误
    Ok(content)
}
```

`?` 运算符：成功取出 `Ok` 里的值，失败则提前 `return Err(...)`（会自动 `From` 转换错误类型）。

```rust
// 组合子，避免显式 match
opt.map(|x| x + 1).unwrap_or(0);
result.map_err(|e| format!("出错: {e}"))?;
opt.ok_or("缺值")?;            // Option → Result

// panic：不可恢复的错误
panic!("非法状态");
assert!(x > 0, "x 必须为正");
```

工程中常用 `anyhow`（应用层，简化错误传播）和 `thiserror`（库层，定义错误枚举）。

## 八、智能指针

```rust
// Box<T>：堆分配，常用于递归类型 / trait 对象
let b = Box::new(5);
enum List { Cons(i32, Box<List>), Nil }     // 递归枚举必须 Box

// Rc<T>：引用计数，单线程共享所有权
use std::rc::Rc;
let a = Rc::new(vec![1, 2, 3]);
let b = Rc::clone(&a);                       // 计数 +1，不深拷贝
println!("{}", Rc::strong_count(&a));        // 2

// RefCell<T>：内部可变性，借用规则在运行时检查
use std::cell::RefCell;
let c = RefCell::new(5);
*c.borrow_mut() += 1;                         // 运行时借用检查
println!("{}", c.borrow());

// 多线程共享：Arc<T> + Mutex<T>
use std::sync::{Arc, Mutex};
let shared = Arc::new(Mutex::new(0));
*shared.lock().unwrap() += 1;
```

`Box` 独占、`Rc` 共享（单线程）、`Arc` 共享（多线程）、`RefCell`/`Mutex` 提供内部可变性。

## 九、trait 对象与动态分发

泛型是静态分发（编译期定死类型）。要在运行时存不同类型，用 trait 对象：

```rust
trait Draw { fn draw(&self); }

let shapes: Vec<Box<dyn Draw>> = vec![
    Box::new(Circle),
    Box::new(Square),
];
for s in &shapes { s.draw(); }   // dyn = 运行时动态分发
```

`dyn Trait` 通过虚表调用，有轻微运行时开销，换来异构集合的灵活性。

## 十、并发安全

所有权 + 两个标记 Trait 让并发安全在编译期可检查：

- `Send`：类型可在线程间转移所有权；
- `Sync`：类型可在线程间共享引用。

```rust
use std::thread;
use std::sync::{Arc, Mutex};

let counter = Arc::new(Mutex::new(0));
let mut handles = vec![];
for _ in 0..10 {
    let c = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        *c.lock().unwrap() += 1;
    }));
}
for h in handles { h.join().unwrap(); }
println!("{}", *counter.lock().unwrap());   // 10
```

编译器拒绝把非 `Send` 类型（如 `Rc`）跨线程传递——这就是「无畏并发」。

## 十一、心智模型小结

| 概念 | 解决的问题 |
| --- | --- |
| 所有权 / move | 谁负责释放内存，何时释放 |
| 借用 / 引用 | 不转移所有权地访问数据 |
| 借用规则 | 编译期消除数据竞争与悬垂引用 |
| 生命周期 | 描述引用之间存活关系 |
| Trait | 共享行为 / 抽象 / 泛型约束 |
| 泛型 | 零成本复用 |
| Result / ? | 把错误纳入类型系统 |
| 智能指针 | 共享所有权与内部可变性 |
| Send / Sync | 编译期保证并发安全 |

理解了这张表，再回头看编译器的报错，多数都会变成「它在帮你避免一个真实的 bug」。
