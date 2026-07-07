---
title: Rust 智能指针
date: 2026-06-14
tags: [Rust, 智能指针]
summary: Box、Rc、Arc、RefCell、Cell、Weak，以及 Deref 与 Drop。
---

# Rust 智能指针

智能指针是实现了 `Deref`/`Drop` 的类型，封装了所有权、引用计数或内部可变性。

## 一、Box\<T\>：堆分配

最简单的智能指针，把值放到堆上，独占所有权：

```rust
let b = Box::new(5);
println!("{}", *b);            // 解引用

// 递归类型必须用 Box（否则大小无限）
enum List {
    Cons(i32, Box<List>),
    Nil,
}
use List::*;
let list = Cons(1, Box::new(Cons(2, Box::new(Nil))));

// trait 对象也常装箱
let drawables: Vec<Box<dyn std::fmt::Display>> = vec![Box::new(1), Box::new("hi")];
```

## 二、Rc\<T\>：引用计数（单线程）

多个所有者共享同一数据，计数归零才释放：

```rust
use std::rc::Rc;

let a = Rc::new(vec![1, 2, 3]);
let b = Rc::clone(&a);          // 计数 +1，不深拷贝（只复制指针）
let c = a.clone();              // 同上

println!("{}", Rc::strong_count(&a));   // 3
// 离开作用域逐个 -1，归零时释放
```

`Rc` 只读共享，且**不是线程安全**的。

## 三、Arc\<T\>：原子引用计数（多线程）

`Rc` 的线程安全版本，用原子操作维护计数：

```rust
use std::sync::Arc;
use std::thread;

let data = Arc::new(vec![1, 2, 3]);
let mut handles = vec![];
for i in 0..3 {
    let d = Arc::clone(&data);
    handles.push(thread::spawn(move || {
        println!("线程 {i}: {:?}", d);
    }));
}
for h in handles { h.join().unwrap(); }
```

## 四、RefCell\<T\>：内部可变性（运行时借用检查）

借用规则通常在编译期检查；`RefCell` 把检查推迟到运行时，让你在持有不可变引用时仍能修改内部：

```rust
use std::cell::RefCell;

let c = RefCell::new(5);
*c.borrow_mut() += 1;           // 可变借用
println!("{}", c.borrow());     // 不可变借用

// 违反借用规则不会编译错误，而是运行时 panic：
// let a = c.borrow_mut();
// let b = c.borrow_mut();      // panic: already borrowed
```

`borrow()` / `borrow_mut()` 返回守卫，超出作用域自动释放借用。

## 五、Cell\<T\>：Copy 类型的内部可变性

对 `Copy` 类型更轻量，整体存取、无运行时借用检查：

```rust
use std::cell::Cell;

let x = Cell::new(5);
x.set(10);
let v = x.get();               // 拷贝出来
```

## 六、组合模式

### Rc<RefCell<T>>：单线程共享 + 可变

```rust
use std::rc::Rc;
use std::cell::RefCell;

let shared = Rc::new(RefCell::new(vec![1, 2, 3]));
let clone = Rc::clone(&shared);
clone.borrow_mut().push(4);
println!("{:?}", shared.borrow());   // [1, 2, 3, 4]
```

### Arc<Mutex<T>>：多线程共享 + 可变

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let mut handles = vec![];
for _ in 0..10 {
    let c = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        *c.lock().unwrap() += 1;
    }));
}
for h in handles { h.join().unwrap(); }
println!("{}", *counter.lock().unwrap());  // 10
```

## 七、Weak\<T\>：弱引用，打破循环

`Rc` 之间相互强引用会造成内存泄漏（计数永不归零）。`Weak` 不增加强计数，访问时 `upgrade()` 得到 `Option<Rc<T>>`：

```rust
use std::rc::{Rc, Weak};
use std::cell::RefCell;

struct Node {
    value: i32,
    parent: RefCell<Weak<Node>>,    // 指向父：弱引用，避免循环
    children: RefCell<Vec<Rc<Node>>>,
}

let leaf = Rc::new(Node {
    value: 3,
    parent: RefCell::new(Weak::new()),
    children: RefCell::new(vec![]),
});
let branch = Rc::new(Node {
    value: 5,
    parent: RefCell::new(Weak::new()),
    children: RefCell::new(vec![Rc::clone(&leaf)]),
});
*leaf.parent.borrow_mut() = Rc::downgrade(&branch);
// 访问父节点
if let Some(p) = leaf.parent.borrow().upgrade() {
    println!("父值: {}", p.value);
}
```

## 八、Deref 与 Drop

自定义智能指针靠这两个 trait：

```rust
use std::ops::Deref;

struct MyBox<T>(T);
impl<T> Deref for MyBox<T> {
    type Target = T;
    fn deref(&self) -> &T { &self.0 }   // 让 *b 与方法自动解引用生效
}

struct Guard;
impl Drop for Guard {
    fn drop(&mut self) { println!("释放资源"); }   // 离开作用域自动调用
}
```

`Drop` 用于 RAII（文件、锁、连接的自动释放）；手动提前释放用 `std::mem::drop(x)`，不能直接调 `x.drop()`。

## 九、Cow\<T\>：写时克隆

`Clone on Write`——读时借用零成本，需要修改才克隆：

```rust
use std::borrow::Cow;

fn ensure_prefix(s: &str) -> Cow<'_, str> {
    if s.starts_with("id_") {
        Cow::Borrowed(s)                    // 已合规：不分配
    } else {
        Cow::Owned(format!("id_{s}"))       // 需修正：才分配
    }
}

// to_mut()：借用态会先克隆再给可变引用
let mut c: Cow<str> = Cow::Borrowed("abc");
c.to_mut().push('!');                       // 此刻才发生克隆
```

适合"配置默认值 + 偶尔覆盖"、"清洗多数已干净的数据"这类场景。

## 十、自定义智能指针实战

实现 `Deref` + `Drop` 就得到一个"带行为的指针"，这也是 `MutexGuard` 的原理：

```rust
use std::ops::{Deref, DerefMut};

struct Tracked<T> {
    value: T,
    name: &'static str,
}

impl<T> Deref for Tracked<T> {
    type Target = T;
    fn deref(&self) -> &T { &self.value }
}
impl<T> DerefMut for Tracked<T> {
    fn deref_mut(&mut self) -> &mut T { &mut self.value }
}
impl<T> Drop for Tracked<T> {
    fn drop(&mut self) {
        println!("[{}] 释放", self.name);    // 归还连接、解锁、计时……
    }
}

let mut v = Tracked { value: vec![1, 2], name: "buf" };
v.push(3);                    // Deref 强转：直接用 Vec 的方法
```

RAII 守卫模式：资源获取放 `new`，清理放 `Drop`，作用域一结束自动归还——数据库连接池、文件锁、性能计时器都是这个套路。

## 十一、内存布局与开销对比

| 指针 | 栈上大小 | 堆上额外开销 | 运行时成本 |
|---|---|---|---|
| `Box<T>` | 1 指针 | 无 | 无 |
| `Rc<T>` | 1 指针 | strong + weak 两个计数 | 克隆/析构改计数（非原子） |
| `Arc<T>` | 1 指针 | 同上 | 原子操作，跨核有争用成本 |
| `RefCell<T>` | T + 借用标记 | — | 运行时借用检查 |
| `Box<dyn Trait>` | 2 指针（胖指针） | vtable 共享 | 虚调用，不可内联 |

- `Rc`/`Arc` 的 `clone()` 只复制指针加计数，O(1)，别怕用；
- 热路径上 `Arc<Mutex<T>>` 争用明显时，考虑分片锁或消息传递重构；
- `dyn Trait` 的胖指针 = 数据指针 + vtable 指针，`size_of::<Box<dyn T>>() == 16`（64 位）。

## 十二、选型小结

| 需求 | 用 |
|---|---|
| 堆分配 / 递归类型 / trait 对象 | `Box<T>` |
| 单线程多所有者（只读） | `Rc<T>` |
| 多线程多所有者 | `Arc<T>` |
| 单线程共享可变 | `Rc<RefCell<T>>` |
| 多线程共享可变 | `Arc<Mutex<T>>` |
| Copy 类型内部可变 | `Cell<T>` |
| 打破引用循环 | `Weak<T>` |
