---
title: Rust 模式匹配
date: 2026-06-14
tags: [Rust, 模式匹配]
summary: match、if let、while let、let else、解构、守卫、绑定与可反驳性。
---

# Rust 模式匹配

模式匹配是 Rust 的核心表达力来源，贯穿 `match`、`let`、函数参数、`if let` 等处。

## 一、match 基础

`match` 必须穷尽所有可能，编译器会检查：

```rust
let n = 3;
let s = match n {
    0 => "zero",
    1 | 2 => "one or two",     // 多个模式
    3..=9 => "few",            // 范围（含端点）
    _ => "many",               // 兜底
};
```

`match` 是表达式，每个分支返回同类型值。

## 二、解构

### 结构体

```rust
struct Point { x: i32, y: i32 }
let p = Point { x: 0, y: 7 };

match p {
    Point { x: 0, y } => println!("在 Y 轴，y={y}"),
    Point { x, y: 0 } => println!("在 X 轴，x={x}"),
    Point { x, y }    => println!("({x}, {y})"),
}

let Point { x, y } = p;        // let 里直接解构
```

### 枚举

```rust
enum Msg { Quit, Move { x: i32, y: i32 }, Write(String), Color(u8, u8, u8) }

match msg {
    Msg::Quit => {}
    Msg::Move { x, y } => println!("move {x},{y}"),
    Msg::Write(text) => println!("{text}"),
    Msg::Color(r, g, b) => println!("#{r:02x}{g:02x}{b:02x}"),
}
```

### 元组 / 数组 / 切片

```rust
match (1, -1) {
    (0, y) => {}
    (x, 0) => {}
    (x, y) if x == y => {}
    _ => {}
}

let arr = [1, 2, 3, 4, 5];
match arr {
    [first, .., last] => println!("{first}..{last}"),   // .. 忽略中间
}

let v = vec![1, 2, 3];
match v.as_slice() {
    [] => "空",
    [x] => "一个",
    [first, rest @ ..] => "多个",   // rest 绑定剩余
};
```

## 三、守卫与绑定

```rust
let n = Some(5);
match n {
    Some(x) if x > 3 => println!("大于 3: {x}"),   // if 守卫
    Some(x) => println!("{x}"),
    None => {}
}

// @ 绑定：在匹配范围的同时把值绑定到变量
match age {
    n @ 0..=12 => println!("儿童 {n}"),
    n @ 13..=19 => println!("青少年 {n}"),
    n => println!("成人 {n}"),
}
```

## 四、if let / let else / while let

```rust
// if let：只关心一种情况
if let Some(x) = opt {
    println!("{x}");
} else {
    println!("空");
}

// let else：不匹配则走发散分支（return / break / panic）
let Some(x) = opt else {
    return;
};
// 这里 x 已可用

// while let：循环直到不匹配
let mut stack = vec![1, 2, 3];
while let Some(top) = stack.pop() {
    println!("{top}");
}
```

`let else`（1.65+）特别适合"早返回"风格，避免层层嵌套。

## 五、忽略与剩余

```rust
let _ = compute();                 // 忽略返回值（仍会求值）
let (first, _, third) = (1, 2, 3); // 忽略第二个
struct Cfg { a: i32, b: i32, c: i32 }
let Cfg { a, .. } = cfg;           // 只取 a，其余忽略
```

`_` 不绑定（不接管所有权），`_name` 绑定但不警告。

## 六、ref 与可变绑定

```rust
let ref x = 5;            // 等价 let x = &5
match &mut value {
    Some(n) => *n += 1,   // n 是 &mut，解引用修改
    None => {}
}
```

现代 Rust 大多靠"匹配人体工程学"自动推断 `ref`/`ref mut`，少需手写。

## 七、可反驳性（refutable）

- **不可反驳模式**：一定匹配，如 `let x = 5;`、函数参数；
- **可反驳模式**：可能不匹配，如 `Some(x)`，只能用于 `if let` / `match` 等。

```rust
// let Some(x) = opt;   // 错误：可反驳模式不能直接 let
if let Some(x) = opt { }  // 正确
```

## 八、matches! 宏与工具技巧

```rust
// matches!：模式匹配返回 bool，比 if let 更短
let ch = 'k';
matches!(ch, 'a'..='z')                      // true
matches!(status, Status::Active | Status::Pending)

// 在迭代器里过滤枚举变体
let active: Vec<_> = users.iter()
    .filter(|u| matches!(u.role, Role::Admin))
    .collect();

// Option/Result 上的模式辅助
opt.is_some_and(|v| v > 3)       // Some 且满足条件
res.is_ok_and(|v| v > 0)
```

`assert!(matches!(x, Pattern))` 在测试里断言"形状"而不比较全部字段，很好用。

## 九、模式驱动的状态机

枚举 + match 是 Rust 里写状态机最自然的方式，编译器保证不漏分支：

```rust
enum State {
    Idle,
    Running { progress: u8 },
    Done(Result<String, String>),
}

enum Event { Start, Tick(u8), Finish(String), Fail(String) }

fn step(state: State, event: Event) -> State {
    use {Event::*, State::*};
    match (state, event) {
        (Idle, Start)                => Running { progress: 0 },
        (Running { .. }, Tick(p))    => Running { progress: p },
        (Running { .. }, Finish(s))  => Done(Ok(s)),
        (Running { .. }, Fail(e))    => Done(Err(e)),
        (s, _)                       => s,      // 其余事件忽略
    }
}
```

新增状态或事件时，去掉兜底分支，编译器会把所有需要处理的组合列给你——这是"让非法状态不可表示"的实践。

## 十、常见用法小结

| 场景 | 写法 |
|---|---|
| 多分支取值 | `match` |
| 单种情况 | `if let` |
| 早返回 | `let else` |
| 循环消费 | `while let` |
| 函数参数解构 | `fn f((x, y): (i32, i32))` |
| 闭包参数解构 | `\|Point { x, y }\| x + y` |

模式匹配配合枚举（尤其 `Option`/`Result`）是 Rust 处理分支与错误的主力，详见《Rust 错误处理》。
