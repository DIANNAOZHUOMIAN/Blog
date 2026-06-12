---
title: Rust 应用与生态
date: 2026-06-12
tags: [Rust, 生态]
summary: Cargo 工程、常用 crate、异步、Web、CLI、嵌入式与 WASM 等落地场景。
---

# Rust 应用与生态

Rust 的工程体验很大程度来自 Cargo 和成熟的 crate 生态。本文梳理项目组织、关键库与主要应用方向。

## 一、Cargo：构建与包管理

```bash
cargo new myapp            # 新建二进制项目
cargo new mylib --lib      # 新建库项目
cargo build                # 编译（debug）
cargo build --release      # 优化编译
cargo run                  # 编译并运行
cargo test                 # 跑测试
cargo check                # 只检查不生成二进制，最快
cargo fmt                  # 格式化
cargo clippy               # 静态检查
cargo doc --open           # 生成并打开文档
cargo add serde            # 添加依赖
cargo update               # 更新依赖
```

项目结构：

```
myapp/
├── Cargo.toml          # 清单：元数据 + 依赖
├── Cargo.lock          # 锁定精确版本（二进制项目应提交）
├── src/
│   ├── main.rs         # 二进制入口
│   └── lib.rs          # 库入口（可同时存在）
├── tests/              # 集成测试
├── benches/            # 基准测试
└── examples/           # 示例
```

`Cargo.toml` 示例：

```toml
[package]
name = "myapp"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
anyhow = "1"

[dev-dependencies]
criterion = "0.5"

[profile.release]
lto = true              # 链接时优化
codegen-units = 1
```

## 二、测试

```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_adds() {
        assert_eq!(add(2, 3), 5);
        assert!(add(1, 1) > 0);
    }

    #[test]
    #[should_panic(expected = "除数为零")]
    fn it_panics() {
        divide(1, 0);
    }
}
```

文档注释里的代码也会被当测试运行：

```rust
/// # Examples
/// ```
/// assert_eq!(myapp::add(2, 2), 4);
/// ```
```

## 三、序列化：serde

近乎事实标准，几乎所有数据格式都在它之上：

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct Config {
    name: String,
    port: u16,
    tags: Vec<String>,
}

let json = serde_json::to_string(&cfg)?;          // 序列化
let cfg: Config = serde_json::from_str(&json)?;   // 反序列化
let toml_str = toml::to_string(&cfg)?;            // 换格式只换 crate
```

配套：`serde_json`、`toml`、`serde_yaml`、`bincode`、`csv`。

## 四、异步编程

Rust 的 `async/await` 本身只产生状态机，需要一个运行时来驱动，事实标准是 **Tokio**：

```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let h = tokio::spawn(async {
        sleep(Duration::from_millis(100)).await;
        "done"
    });
    println!("{}", h.await.unwrap());
}

// 并发等待多个任务
async fn fetch_all() {
    let (a, b) = tokio::join!(fetch("x"), fetch("y"));
}
```

`Future` 惰性，不 `.await` 不执行；`tokio::spawn` 并发，`join!` 并行等待。HTTP 客户端常用 `reqwest`：

```rust
let body = reqwest::get("https://example.com")
    .await?
    .text()
    .await?;
```

## 五、Web 后端

主流框架（按流行度）：

- **axum**：Tokio 官方系，基于 tower，类型安全、组合性好；
- **actix-web**：性能强、生态老牌；
- **Rocket**：宏驱动、上手友好。

axum 最小示例：

```rust
use axum::{routing::get, Router, Json};
use serde::Serialize;

#[derive(Serialize)]
struct Msg { text: String }

async fn hello() -> Json<Msg> {
    Json(Msg { text: "hi".into() })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(hello));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

数据库常用 `sqlx`（编译期校验 SQL）、`sea-orm`、`diesel`。

## 六、命令行工具

Rust 写 CLI 体验极好，`clap` 负责参数解析：

```rust
use clap::Parser;

#[derive(Parser)]
#[command(version, about = "示例工具")]
struct Cli {
    /// 输入文件
    path: String,
    /// 详细输出
    #[arg(short, long)]
    verbose: bool,
    #[arg(short, long, default_value_t = 1)]
    count: u32,
}

fn main() {
    let cli = Cli::parse();
    if cli.verbose { println!("处理 {}", cli.path); }
}
```

许多知名 CLI 都用 Rust 重写：`ripgrep`(rg)、`fd`、`bat`、`exa/eza`、`fzf` 的部分实现、`starship`、`zoxide`。

## 七、错误处理库

```rust
// 应用层：anyhow，一把梭传播任意错误
use anyhow::{Result, Context};
fn run() -> Result<()> {
    let data = std::fs::read_to_string("a.txt")
        .context("读取配置失败")?;     // 加上下文
    Ok(())
}

// 库层：thiserror，定义结构化错误枚举
use thiserror::Error;
#[derive(Error, Debug)]
enum MyError {
    #[error("找不到: {0}")]
    NotFound(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
```

## 八、其他高频 crate

| 领域 | crate |
| --- | --- |
| 日志 | `tracing` / `log` + `env_logger` |
| 时间 | `chrono` / `time` |
| 正则 | `regex` |
| 随机 | `rand` |
| 错误 | `anyhow` / `thiserror` |
| 并行迭代 | `rayon`（`.par_iter()` 一行并行） |
| HTTP 客户端 | `reqwest` |
| 测试基准 | `criterion` |
| 命令行 | `clap` |
| UUID | `uuid` |

`rayon` 示例（数据并行几乎零改动）：

```rust
use rayon::prelude::*;
let sum: i32 = (0..1_000_000).into_par_iter()
    .map(|x| x % 7)
    .sum();
```

## 九、应用方向

- **系统 / 底层**：操作系统（Redox）、内核模块（Linux 已引入 Rust）、驱动；
- **网络与基础设施**：代理、数据库（如 TiKV）、消息队列、Cloudflare 大量服务；
- **Web 后端 / 微服务**：高并发、低延迟、低内存占用；
- **CLI 工具**：单文件分发、启动快；
- **WebAssembly**：`wasm-bindgen` + `wasm-pack`，把 Rust 跑进浏览器；
- **嵌入式**：`#![no_std]` + `embassy` / HAL，裸机与 RTOS；
- **游戏**：`bevy`（ECS 引擎）；
- **跨平台 GUI / 桌面**：`tauri`（轻量 Electron 替代）、`egui`、`slint`。

### no_std 嵌入式片段

```rust
#![no_std]
#![no_main]

use panic_halt as _;
use cortex_m_rt::entry;

#[entry]
fn main() -> ! {
    loop { /* 裸机主循环 */ }
}
```

## 十、上手路线建议

1. 通读《The Rust Programming Language》（官方「圣经」，中文版齐全）；
2. 用 `rustlings` 做交互练习；
3. 写一个 CLI 小工具熟悉 Cargo + clap + 错误处理；
4. 再上 async + axum 做个小服务；
5. 全程开 `cargo clippy`，把编译器和 lint 当老师——Rust 的学习曲线陡在前期，越过所有权这关后会非常顺。
