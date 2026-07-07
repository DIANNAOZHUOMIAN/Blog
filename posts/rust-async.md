---
title: Rust 异步编程
date: 2026-06-14
tags: [Rust, async, tokio]
summary: async/await、Future、Tokio 运行时、任务、并发组合、通道与异步 IO。
---

# Rust 异步编程

异步适合**高并发 IO**（网络、文件、数据库）。Rust 的 `async/await` 只生成状态机，需要一个运行时来驱动，事实标准是 **Tokio**。

## 一、async / await

```rust
async fn fetch(url: &str) -> String {
    // ...异步获取...
    format!("内容: {url}")
}

async fn run() {
    let body = fetch("https://example.com").await;   // .await 取结果
    println!("{body}");
}
```

`async fn` 返回一个 `Future`——**惰性**，不 `.await` 或交给运行时就什么都不做。

## 二、Tokio 运行时

```toml
# Cargo.toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```

```rust
#[tokio::main]
async fn main() {
    let result = fetch("x").await;
    println!("{result}");
}
```

`#[tokio::main]` 把 `main` 包装成创建运行时并阻塞执行。手动建运行时：

```rust
let rt = tokio::runtime::Runtime::new().unwrap();
rt.block_on(async { /* ... */ });
```

## 三、并发执行任务

```rust
use tokio::time::{sleep, Duration};

// spawn：交给运行时并发执行（类似线程）
let handle = tokio::spawn(async {
    sleep(Duration::from_millis(100)).await;
    "done"
});
let r = handle.await.unwrap();

// join!：并发等待多个 future 全部完成
let (a, b) = tokio::join!(fetch("a"), fetch("b"));

// try_join!：任一出错即返回 Err
let (a, b) = tokio::try_join!(load("a"), load("b"))?;

// select!：谁先完成用谁
tokio::select! {
    r = fetch("fast") => println!("先到: {r}"),
    _ = sleep(Duration::from_secs(1)) => println!("超时"),
}
```

注意：`spawn` 的任务要求 `'static + Send`；跨 `.await` 持有的数据需满足 `Send`。

## 四、并发处理集合

```rust
use futures::future::join_all;

let urls = vec!["a", "b", "c"];
let futures = urls.iter().map(|u| fetch(u));
let results: Vec<String> = join_all(futures).await;    // 全部并发

// 限制并发数：用 stream + buffer_unordered
use futures::stream::{self, StreamExt};
let results: Vec<_> = stream::iter(urls)
    .map(|u| fetch(u))
    .buffer_unordered(8)        // 最多 8 个并发
    .collect()
    .await;
```

## 五、异步 IO 与网络

```rust
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

async fn io() -> std::io::Result<()> {
    let content = fs::read_to_string("a.txt").await?;
    fs::write("b.txt", content).await?;
    Ok(())
}

// TCP 回声服务器
use tokio::net::TcpListener;
async fn server() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        let (mut socket, _) = listener.accept().await?;
        tokio::spawn(async move {            // 每连接一个任务
            let mut buf = [0u8; 1024];
            let n = socket.read(&mut buf).await.unwrap();
            socket.write_all(&buf[..n]).await.unwrap();
        });
    }
}
```

HTTP 客户端用 `reqwest`：

```rust
let body = reqwest::get("https://example.com").await?.text().await?;
```

## 六、异步通道与同步原语

```rust
use tokio::sync::{mpsc, Mutex};
use std::sync::Arc;

let (tx, mut rx) = mpsc::channel(32);     // 有界异步通道
tokio::spawn(async move {
    for i in 0..5 { tx.send(i).await.unwrap(); }
});
while let Some(v) = rx.recv().await {
    println!("收到 {v}");
}

// 异步互斥锁（持锁可跨 .await）
let shared = Arc::new(Mutex::new(0));
let mut guard = shared.lock().await;
*guard += 1;
```

要点：跨 `.await` 持有锁时，必须用 `tokio::sync::Mutex`，不能用 `std::sync::Mutex`（会阻塞整个 worker）。

## 七、阻塞代码的处理

CPU 密集或同步阻塞调用别直接放进 async，会卡住 worker 线程：

```rust
// 把阻塞工作丢到专用线程池
let result = tokio::task::spawn_blocking(|| {
    heavy_cpu_work()        // 同步、耗时
}).await.unwrap();
```

## 八、超时与重试

```rust
use tokio::time::{timeout, Duration};

match timeout(Duration::from_secs(3), fetch("slow")).await {
    Ok(body) => println!("{body}"),
    Err(_)   => println!("超时"),
}
```

## 九、select! 与取消

同时等多路事件，先完成者胜出，**其余分支的 Future 被丢弃（即取消）**：

```rust
use tokio::{select, time::{sleep, Duration}};

select! {
    res = fetch_data() => println!("拿到数据: {res:?}"),
    _ = sleep(Duration::from_secs(3)) => println!("超时放弃"),
    _ = shutdown_signal() => println!("收到退出信号"),
}
```

取消安全（cancel safety）：分支被丢弃时不能弄丢已读的数据。`recv()` 之类的方法文档会注明是否 cancel-safe；不安全的操作先 `Box::pin` 存到循环外，或改用消息模式。

```rust
// 循环里 select：把长任务 pin 在外面，避免每轮重建
let task = fetch_data();
tokio::pin!(task);
loop {
    select! {
        res = &mut task => break res,
        _ = tick.tick() => println!("still waiting..."),
    }
}
```

## 十、Stream：异步迭代器

```rust
use tokio_stream::{self as stream, StreamExt};

let mut s = stream::iter(1..=5)
    .map(|x| x * 2)
    .filter(|x| *x > 4);
while let Some(v) = s.next().await {      // 目前用 while let 消费
    println!("{v}");
}

// 并发消费集合：类似"异步版 rayon"
use futures::stream::{FuturesUnordered, StreamExt as _};
let mut futs: FuturesUnordered<_> =
    urls.iter().map(|u| fetch(u)).collect();
while let Some(res) = futs.next().await {
    handle(res);
}

// buffer_unordered：带并发上限的流水线
futures::stream::iter(urls)
    .map(|u| async move { fetch(&u).await })
    .buffer_unordered(8)                   // 最多 8 个在飞
    .collect::<Vec<_>>()
    .await;
```

## 十一、async trait 与生态

```rust
// 1.75+ 原生支持 trait 里写 async fn
trait Store {
    async fn get(&self, key: &str) -> Option<String>;
}

// 但要作为 dyn Store 用（动态分发）仍需 async-trait 宏
#[async_trait::async_trait]
trait DynStore: Send + Sync {
    async fn get(&self, key: &str) -> Option<String>;
}
```

生态速查：运行时 **tokio**（事实标准）/ async-std（停更）；HTTP 客户端 **reqwest**；服务端 **axum**（tokio 官方系）/ actix-web；跨运行时抽象 **futures** crate。库代码尽量只依赖 `futures` 的 trait，把运行时选择留给使用者。

## 十二、常见坑

1. **忘了 `.await`**：future 不执行，且会有"unused" 警告；
2. **在 async 里用 `std::thread::sleep`**：阻塞整个线程，要用 `tokio::time::sleep`；
3. **跨 `.await` 持有 `std::sync::Mutex`**：用 `tokio::sync::Mutex`；
4. **CPU 密集塞进 async**：用 `spawn_blocking` 或 rayon；
5. **`spawn` 的 future 捕获非 `Send` 数据**：编译报错，注意 `Rc`/`RefCell`；
6. **混用运行时**：一个程序固定一个（通常 Tokio）。

并发 IO 选异步 + Tokio；CPU 密集批处理选 rayon（见《Rust 并发编程》）。
