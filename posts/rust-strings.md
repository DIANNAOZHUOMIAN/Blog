---
title: Rust 字符串处理
date: 2026-06-14
tags: [Rust, 字符串]
summary: String 与 &str、UTF-8 与字符遍历、常用方法、格式化、解析与切分。
---

# Rust 字符串处理

Rust 字符串是 **UTF-8** 编码。理解 `String` 与 `&str` 的区别是关键。

## 一、两种字符串类型

| 类型 | 含义 | 所有权 |
|---|---|---|
| `String` | 堆上、可增长 | 拥有 |
| `&str` | 字符串切片（一段视图） | 借用 |

```rust
let literal: &str = "字面量";        // &'static str
let owned: String = String::from("hi");
let owned2 = "hi".to_string();
let owned3 = "hi".to_owned();

let view: &str = &owned;            // String -> &str（自动解引用）
fn takes_str(s: &str) {}            // 函数参数优先用 &str（更通用）
takes_str(&owned);
takes_str("literal");
```

经验法则：函数参数用 `&str`，需要拥有/修改时用 `String`。

## 二、构建与拼接

```rust
let mut s = String::new();
s.push_str("hello");                // 追加 &str
s.push('!');                         // 追加 char
s += " world";                       // += 拼 &str

let a = String::from("foo");
let b = String::from("bar");
let c = a + &b;                      // a 被移动，+ 右侧要 &str
let d = format!("{a2}-{b}-{}", 42);  // format! 不消耗参数，最常用

let joined = ["a", "b", "c"].join(", ");
let repeated = "ab".repeat(3);       // "ababab"
```

## 三、UTF-8 与遍历

字符串不能用整数索引（`s[0]` 编译错误），因为 UTF-8 字符长度不定：

```rust
let s = "héllo中文";
s.len();                    // 字节数（不是字符数！）
s.chars().count();          // 字符数

for c in s.chars() { }      // 按 Unicode 标量遍历
for b in s.bytes() { }      // 按字节
for (i, c) in s.char_indices() { }   // (字节偏移, 字符)

let third = s.chars().nth(2);        // Option<char>
let slice = &s[0..1];                // 字节切片，须落在字符边界，否则 panic
```

## 四、常用查询方法

```rust
s.is_empty();
s.contains("llo");
s.starts_with("hé");  s.ends_with("文");
s.find("llo");                       // Option<usize>（字节位置）
s.rfind('l');
s.matches("l").count();
```

## 五、变换方法

```rust
s.to_uppercase();  s.to_lowercase();
s.trim();  s.trim_start();  s.trim_end();
s.trim_matches('*');
s.replace("l", "L");
s.replacen("l", "L", 1);             // 只替换 n 次
let padded = format!("{:>8}", "hi"); // 右对齐宽 8
let padded = format!("{:0>3}", 7);   // "007"
```

注意：这些方法返回**新 `String`**（Rust 字符串内容不可变地原地改通常要 `&mut String` 方法）。

## 六、切分与收集

```rust
let csv = "a,b,c";
let parts: Vec<&str> = csv.split(',').collect();
csv.splitn(2, ',');                  // 最多切 2 段
csv.rsplit(',');                     // 从右切
"a  b   c".split_whitespace();       // 按空白
"line1\nline2".lines();              // 按行

let cleaned: String = "a1b2c3".chars()
    .filter(|c| c.is_alphabetic())
    .collect();                      // "abc"
```

## 七、解析（parse）

```rust
let n: i32 = "42".parse().unwrap();
let f: f64 = "3.14".parse().unwrap();
let b: bool = "true".parse().unwrap();
let r: Result<i32, _> = "x".parse::<i32>();   // Err，安全处理

// 数字转字符串
let s = 42.to_string();
let s = format!("{:.2}", 3.14159);   // "3.14"
let hex = format!("{:x}", 255);      // "ff"
let bin = format!("{:b}", 5);        // "101"
```

## 八、格式化语法

```rust
let name = "Alice";
let age = 30;
format!("{name} is {age}");          // 内联变量（1.58+）
format!("{} is {}", name, age);      // 位置
format!("{0} {1} {0}", "a", "b");    // 索引
format!("{:>10}", "x");              // 右对齐
format!("{:<10}", "x");              // 左对齐
format!("{:^10}", "x");              // 居中
format!("{:+}", 5);                  // 带符号 +5
format!("{:.3}", 3.14159);           // 3.142
format!("{:08.2}", 3.14);            // 00003.14
format!("{:#x}", 255);               // 0xff
format!("{:?}", vec![1, 2]);         // Debug
format!("{:#?}", config);            // 美化 Debug
```

## 九、与字节 / 其他类型互转

```rust
let bytes: &[u8] = s.as_bytes();
let s = String::from_utf8(vec![104, 105]).unwrap();   // "hi"
let s = String::from_utf8_lossy(&bytes);              // 非法字节替换为 �

let c = 'A';
c as u32;                            // 65
char::from_u32(0x4e2d);              // Some('中')
c.is_alphabetic(); c.is_numeric(); c.is_whitespace();
c.to_ascii_uppercase();
```

## 十、Cow\<str\>：按需分配

"多数情况借用、偶尔需要修改"时避免无谓克隆：

```rust
use std::borrow::Cow;

fn normalize(input: &str) -> Cow<'_, str> {
    if input.contains(' ') {
        Cow::Owned(input.replace(' ', "_"))   // 真要改，才分配
    } else {
        Cow::Borrowed(input)                  // 不用改，零拷贝
    }
}

let s = normalize("no_space");    // 没有分配
let t = normalize("has space");   // 只有这次分配
```

标准库自身也在用：`String::from_utf8_lossy` 返回 `Cow<str>` —— 全合法时借用，有坏字节才替换并分配。

## 十一、OsStr / Path / CString

```rust
use std::path::{Path, PathBuf};

let p: PathBuf = ["logs", "2026", "app.log"].iter().collect();
p.extension();                    // Some("log")
p.with_extension("bak");          // logs/2026/app.bak
p.to_str();                       // Option<&str>：路径未必是合法 UTF-8

// 环境变量 / 命令行参数是 OsString
let home = std::env::var_os("HOME");     // 不因非 UTF-8 而 panic

// FFI 传 C 字符串
use std::ffi::CString;
let c = CString::new("hello").unwrap();  // 内部不能含 \0
unsafe { libc_puts(c.as_ptr()); }
```

规则：文件路径用 `Path`/`PathBuf`，跨 FFI 用 `CString`/`CStr`，别急着 `to_string()`。

## 十二、容量管理与性能

```rust
// 预分配：已知大小时避免反复扩容
let mut s = String::with_capacity(1024);
for item in &items {
    s.push_str(item);
}
s.shrink_to_fit();               // 归还多余容量

// 拼接选择（从快到慢，视场景）：
// 1. write! 到 String（无中间分配）
use std::fmt::Write;
let mut out = String::new();
write!(out, "{}-{}", a, b).unwrap();
// 2. concat / join
let joined = vec!["a", "b", "c"].join("-");
// 3. 循环 + push_str（预分配后也很快）
// 反例：s = s + x 每次都移动/可能重分配
```

`String` 是 `Vec<u8>` 的封装：`len()`/`capacity()` 都按字节算，中文一个字 3 字节。

## 十三、常见坑

1. **`s.len()` 是字节数**，要字符数用 `s.chars().count()`；
2. **不能整数索引** `s[0]`，用 `chars().nth()` 或字节切片；
3. **切片必须落在字符边界**，否则运行时 panic；
4. **`+` 拼接消耗左操作数**，多段拼接用 `format!`；
5. **大量拼接**先 `String::with_capacity` 预分配，减少扩容。
