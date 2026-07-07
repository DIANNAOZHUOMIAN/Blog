---
title: Rust 错误处理
date: 2026-06-14
tags: [Rust, 错误处理]
summary: Option、Result、? 运算符、组合子、自定义错误、anyhow 与 thiserror、panic。
---

# Rust 错误处理

Rust 没有异常，错误是普通的值，靠 `Option<T>` 与 `Result<T, E>` 编码进类型系统，编译器强制你处理。

## 一、Option：可能没有值

```rust
fn first_char(s: &str) -> Option<char> {
    s.chars().next()
}

match first_char("hi") {
    Some(c) => println!("{c}"),
    None => println!("空串"),
}
```

常用方法：

```rust
opt.is_some(); opt.is_none();
opt.unwrap();              // None 则 panic
opt.unwrap_or(default);
opt.unwrap_or_else(|| compute());
opt.unwrap_or_default();   // 用类型的 Default
opt.expect("必须有值");     // 带信息 panic
opt.map(|x| x + 1);        // Some 内变换
opt.and_then(|x| f(x));    // 链式，f 返回 Option
opt.filter(|x| *x > 0);
opt.or(other);             // None 时取 other
opt.ok_or("缺值")?;        // Option -> Result
opt.take();                // 取出并置 None（&mut）
```

## 二、Result：可能失败

```rust
use std::num::ParseIntError;

fn parse(s: &str) -> Result<i32, ParseIntError> {
    s.parse::<i32>()
}

match parse("42") {
    Ok(n)  => println!("{n}"),
    Err(e) => eprintln!("错误: {e}"),
}
```

常用方法与 Option 类似，外加：

```rust
res.is_ok(); res.is_err();
res.ok();                  // Result -> Option（丢弃错误）
res.err();
res.map(|v| ...);          // 变换 Ok
res.map_err(|e| ...);      // 变换 Err（常用于转换错误类型）
res.unwrap_or(default);
```

## 三、? 运算符：错误传播

`?` 是 Rust 错误处理的核心：成功则取出值，失败则提前 `return Err(...)`，并自动用 `From` 转换错误类型。

```rust
use std::fs;

fn read_number(path: &str) -> Result<i32, Box<dyn std::error::Error>> {
    let text = fs::read_to_string(path)?;   // io::Error 自动转 Box<dyn Error>
    let n: i32 = text.trim().parse()?;       // ParseIntError 自动转
    Ok(n * 2)
}
```

`?` 也能用于返回 `Option` 的函数：

```rust
fn third_char(s: &str) -> Option<char> {
    s.chars().nth(2)?;       // None 则直接返回 None
    s.chars().next()
}
```

`main` 也能返回 `Result`：

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let n = read_number("a.txt")?;
    println!("{n}");
    Ok(())
}
```

## 四、组合子链式处理

避免层层 `match`：

```rust
let result = "  42 "
    .trim()
    .parse::<i32>()
    .map(|n| n * 2)
    .unwrap_or(0);

// Option 链
let len = config.get("name")
    .map(|s| s.len())
    .filter(|&n| n > 0);
```

## 五、自定义错误类型

库代码推荐定义结构化错误枚举：

```rust
use std::fmt;

#[derive(Debug)]
enum AppError {
    NotFound(String),
    Invalid { field: String, reason: String },
    Io(std::io::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::NotFound(s) => write!(f, "找不到: {s}"),
            AppError::Invalid { field, reason } => write!(f, "{field} 非法: {reason}"),
            AppError::Io(e) => write!(f, "IO 错误: {e}"),
        }
    }
}

impl std::error::Error for AppError {}

// 让 ? 能把 io::Error 自动转成 AppError
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e) }
}
```

## 六、thiserror：少写样板（库）

上面的样板可用 `thiserror` 宏一键生成：

```rust
use thiserror::Error;

#[derive(Error, Debug)]
enum AppError {
    #[error("找不到: {0}")]
    NotFound(String),
    #[error("{field} 非法: {reason}")]
    Invalid { field: String, reason: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),     // 自动实现 From
}
```

## 七、anyhow：一把梭（应用）

应用层不在乎具体错误类型，只想传播 + 加上下文：

```rust
use anyhow::{Result, Context, bail, ensure};

fn run() -> Result<()> {
    let data = std::fs::read_to_string("config.toml")
        .context("读取配置失败")?;      // 加上下文
    ensure!(!data.is_empty(), "配置为空");
    if data.len() > 1_000_000 {
        bail!("配置过大: {} 字节", data.len());
    }
    Ok(())
}
```

`Result<T>` 是 `anyhow::Result<T, anyhow::Error>` 的别名，能容纳任意实现了 `Error` 的错误。

## 八、panic：不可恢复

```rust
panic!("非法状态");
unreachable!();            // 标记不可能到达
todo!();                   // 未实现占位
unimplemented!();
assert!(x > 0, "x 必须为正");
assert_eq!(a, b);
debug_assert!(cond);       // 仅 debug 构建检查
```

`panic` 用于程序 bug（违反不变量），`Result` 用于可预期的失败（文件不存在、网络超时）。库一般不主动 panic，把选择权留给调用方。

## 九、Option / Result 互转速查

```rust
let opt: Option<i32> = Some(1);
let res: Result<i32, &str> = Ok(1);

opt.ok_or("empty")?;             // Option → Result（None 变 Err）
opt.ok_or_else(|| err())?;       // 惰性版本
res.ok();                        // Result → Option（Err 丢弃）
res.err();                       // 取出 Err 侧

// 嵌套翻转：Option<Result<T,E>> ⇄ Result<Option<T>,E>
let x: Option<Result<i32, E>> = Some(Ok(1));
let y: Result<Option<i32>, E> = x.transpose();

// 集合级：任一 Err 则整体 Err
let nums: Result<Vec<i32>, _> =
    ["1", "2", "x"].iter().map(|s| s.parse::<i32>()).collect();

// 只要成功的，忽略失败
let ok_only: Vec<i32> =
    ["1", "x", "3"].iter().filter_map(|s| s.parse().ok()).collect();
```

## 十、错误分层设计实践

库和应用的错误策略应该不同，混着用是大多数"错误处理很乱"的根源：

```rust
// ── 库层（lib.rs）：thiserror 定义精确的错误枚举 ──
#[derive(thiserror::Error, Debug)]
pub enum StoreError {
    #[error("记录不存在: {0}")]
    NotFound(String),
    #[error("数据库错误")]
    Db(#[from] sqlx::Error),        // 保留 source 链
}

// ── 应用层（main.rs）：anyhow 聚合 + context 补充现场 ──
use anyhow::{Context, Result};

fn run() -> Result<()> {
    let cfg = load_config("app.toml")
        .context("读取配置失败")?;           // 出错时多一层人话
    let user = store.get(&cfg.user_id)
        .with_context(|| format!("查询用户 {}", cfg.user_id))?;
    Ok(())
}
```

- 库**永不**返回 `anyhow::Error`——调用者没法 match；
- 应用打日志时用 `{:#}` 打印完整 context 链；
- 需要区分"可重试/不可重试"时，在枚举上加 `fn is_retryable(&self)` 方法而不是靠字符串判断。

## 十一、panic 捕获与钩子

```rust
// 自定义 panic 输出（上报、写日志）
std::panic::set_hook(Box::new(|info| {
    eprintln!("panic: {info}");
    // 上报到监控……
}));

// 边界处兜底（线程池/FFI/插件宿主），不要当 try-catch 用
let result = std::panic::catch_unwind(|| risky());
if result.is_err() {
    eprintln!("任务崩溃，已隔离");
}
```

- `Cargo.toml` 里 `panic = "abort"` 可减小二进制、不可捕获；
- 线程里的 panic 只杀该线程，`JoinHandle::join()` 返回 `Err` 时能拿到；
- 业务错误一律 `Result`，`panic` 只留给"程序写错了"的断言。

## 十二、选型小结

| 场景 | 用 |
|---|---|
| 可能没值 | `Option<T>` |
| 可能失败、调用方需处理 | `Result<T, E>` |
| 库，定义错误类型 | `thiserror` |
| 应用，传播 + 上下文 | `anyhow` |
| 程序 bug / 违反不变量 | `panic!` |
| 原型期占位 | `todo!()` |
