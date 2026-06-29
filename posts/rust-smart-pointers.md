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

## 九、选型小结

| 需求 | 用 |
|---|---|
| 堆分配 / 递归类型 / trait 对象 | `Box<T>` |
| 单线程多所有者（只读） | `Rc<T>` |
| 多线程多所有者 | `Arc<T>` |
| 单线程共享可变 | `Rc<RefCell<T>>` |
| 多线程共享可变 | `Arc<Mutex<T>>` |
| Copy 类型内部可变 | `Cell<T>` |
| 打破引用循环 | `Weak<T>` |
