---
title: Rust 并发编程
date: 2026-06-14
tags: [Rust, 并发, 多线程]
summary: 线程、Arc/Mutex/RwLock、通道、Send/Sync、原子类型与 rayon 数据并行。
---

# Rust 并发编程

Rust 的所有权 + `Send`/`Sync` 标记让数据竞争在**编译期**就被拒绝——"无畏并发"。

## 一、创建线程

```rust
use std::thread;

let handle = thread::spawn(|| {
    for i in 1..5 { println!("子线程 {i}"); }
});
handle.join().unwrap();        // 等待结束

// move 把变量所有权移入线程
let data = vec![1, 2, 3];
thread::spawn(move || println!("{:?}", data)).join().unwrap();
```

`spawn` 返回 `JoinHandle`，`join()` 阻塞等待并取回返回值。

## 二、共享状态：Arc + Mutex

跨线程共享所有权用 `Arc`，共享可变数据再套 `Mutex`：

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let mut handles = vec![];

for _ in 0..10 {
    let c = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        let mut num = c.lock().unwrap();   // 加锁，返回守卫
        *num += 1;
    }));                                    // 守卫离开作用域自动解锁
}
for h in handles { h.join().unwrap(); }
println!("{}", *counter.lock().unwrap());   // 10
```

`lock()` 返回 `Result`（持锁线程 panic 会"中毒"）。守卫遵循 RAII，无需手动 unlock。

## 三、RwLock：读写锁

多读单写场景，读不互斥、写独占：

```rust
use std::sync::{Arc, RwLock};

let data = Arc::new(RwLock::new(vec![1, 2, 3]));
{
    let r = data.read().unwrap();    // 多个读可并行
    println!("{:?}", *r);
}
{
    let mut w = data.write().unwrap();   // 写独占
    w.push(4);
}
```

## 四、通道：消息传递

"不要用共享内存通信，用通信共享内存"。`mpsc` = 多生产者、单消费者：

```rust
use std::sync::mpsc;
use std::thread;

let (tx, rx) = mpsc::channel();

for i in 0..3 {
    let tx = tx.clone();             // 多生产者
    thread::spawn(move || tx.send(i * 10).unwrap());
}
drop(tx);                             // 关掉原始发送端，否则 rx 不会结束

for received in rx {                  // 迭代直到所有发送端关闭
    println!("收到 {received}");
}
```

同步通道（带缓冲/背压）：`mpsc::sync_channel(capacity)`。

## 五、Send 与 Sync

两个自动 trait，决定类型能否跨线程：

- **`Send`**：可在线程间**转移所有权**（绝大多数类型）；
- **`Sync`**：可在线程间**共享引用**（`&T` 是 `Send`）。

```rust
// Rc 不是 Send → 编译器拒绝跨线程
// let rc = Rc::new(1);
// thread::spawn(move || println!("{rc}"));  // 错误！用 Arc

// Mutex<T> 在 T: Send 时是 Sync，所以 Arc<Mutex<T>> 能共享
```

这就是为什么编译器能在编译期挡住数据竞争——非线程安全类型根本传不进线程。

## 六、原子类型

无锁的简单共享计数/标志：

```rust
use std::sync::atomic::{AtomicUsize, AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

let count = Arc::new(AtomicUsize::new(0));
let mut handles = vec![];
for _ in 0..10 {
    let c = Arc::clone(&count);
    handles.push(thread::spawn(move || {
        c.fetch_add(1, Ordering::SeqCst);   // 原子自增
    }));
}
for h in handles { h.join().unwrap(); }
println!("{}", count.load(Ordering::SeqCst));   // 10
```

内存序常用 `SeqCst`（最强、最易用）；性能敏感再研究 `Acquire`/`Release`/`Relaxed`。

## 七、scoped 线程（1.63+）

借用栈上数据而不需 `'static`：

```rust
use std::thread;

let mut data = vec![1, 2, 3];
thread::scope(|s| {
    s.spawn(|| println!("{:?}", &data));     // 可借用 data
    s.spawn(|| println!("len = {}", data.len()));
});                                           // 作用域结束前自动 join
data.push(4);                                 // 之后又能用
```

## 八、rayon：数据并行

把串行迭代器一行变并行，自动用线程池：

```rust
use rayon::prelude::*;

let sum: u64 = (0..1_000_000u64).into_par_iter()
    .map(|x| x % 7)
    .sum();

let mut v = vec![5, 3, 1, 4, 2];
v.par_sort();                          // 并行排序

let results: Vec<_> = inputs.par_iter()
    .map(|x| expensive(x))
    .collect();
```

CPU 密集型批处理用 rayon；IO 密集型用异步（见《Rust 异步编程》）。

## 九、Condvar：条件变量

"等到某个条件成立再继续"，和 `Mutex` 配对使用：

```rust
use std::sync::{Arc, Condvar, Mutex};

let pair = Arc::new((Mutex::new(false), Condvar::new()));
let pair2 = Arc::clone(&pair);

std::thread::spawn(move || {
    let (lock, cvar) = &*pair2;
    *lock.lock().unwrap() = true;
    cvar.notify_one();                    // 通知等待方
});

let (lock, cvar) = &*pair;
let mut ready = lock.lock().unwrap();
while !*ready {                           // while 防虚假唤醒
    ready = cvar.wait(ready).unwrap();    // 等待时自动释放锁
}
```

## 十、手写一个极简线程池

理解 `channel + Arc<Mutex>` 组合的经典练习：

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

struct Pool { tx: mpsc::Sender<Job> }

impl Pool {
    fn new(n: usize) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        let rx = Arc::new(Mutex::new(rx));
        for _ in 0..n {
            let rx = Arc::clone(&rx);
            thread::spawn(move || loop {
                // 锁只包住 recv，取到任务立刻释放
                let job = match rx.lock().unwrap().recv() {
                    Ok(j) => j,
                    Err(_) => break,          // 发送端关闭，线程退出
                };
                job();
            });
        }
        Pool { tx }
    }
    fn execute<F: FnOnce() + Send + 'static>(&self, f: F) {
        self.tx.send(Box::new(f)).unwrap();
    }
}
```

生产代码直接用 `rayon` 或 `threadpool` crate，但这 30 行值得亲手写一遍。

## 十一、死锁与排查

```rust
// 经典死锁：两把锁、相反顺序
let a = Arc::new(Mutex::new(1));
let b = Arc::new(Mutex::new(2));
// 线程1: lock(a) → lock(b)；线程2: lock(b) → lock(a) → 卡死
```

- **纪律一**：全项目给锁定固定的获取顺序（按地址、按业务层级）；
- **纪律二**：锁的作用域越小越好，`let v = *m.lock().unwrap();` 取完即放；
- **纪律三**：别在持锁时 `.await`（异步里用 `tokio::sync::Mutex`）；
- 排查工具：卡住时 `gdb -p` 看线程栈；`parking_lot` 的 `deadlock_detection` feature 能在测试期主动报告死锁环。

## 十二、选型小结

| 场景 | 用 |
|---|---|
| 独立任务 | `thread::spawn` |
| 借用栈数据的并发 | `thread::scope` |
| 共享可变状态 | `Arc<Mutex<T>>` / `Arc<RwLock<T>>` |
| 任务间传数据 | `mpsc` 通道 |
| 简单计数/标志 | 原子类型 |
| 数据并行批处理 | `rayon` |
| 大量 IO 并发 | 异步 + tokio |
