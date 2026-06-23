---
title: C# 正则表达式
date: 2026-06-23
tags: [C#, 正则表达式, Regex]
summary: Regex 五大方法、元字符与限定符、定位点、分组与反向引用、零宽断言、条件匹配、替换中的 $ 语法，附常用模式。
---

# C# 正则表达式

正则在 `System.Text.RegularExpressions` 命名空间，核心类是 `Regex`。可用静态方法（一次性）或实例方法（复用同一模式，更高效）。

```csharp
using System.Text.RegularExpressions;

Regex reg = new Regex(@"\d+");   // 用 @ 原义字符串，免去 \\ 转义地狱
```

## 一、五大方法

### IsMatch — 是否匹配

```csharp
Regex.IsMatch(s, @"\d");              // 静态
reg.IsMatch(s);                       // 实例
reg.IsMatch(s, 7);                    // 从索引 7 开始
```

### Match — 第一个匹配

返回 `Match` 对象，含值、位置、分组：

```csharp
string s = "现在的日期为：2022-01-12";
Match m = Regex.Match(s, @"(\d{4})-(\d{2})-(?<day>\d{2})");
m.Value;          // "2022-01-12"
m.Index;          // 匹配起始位置
m.Groups[0];      // 整个匹配（第 0 组）
m.Groups[1];      // 第一个 () → "2022"
m.Groups["day"];  // 具名分组 → "12"
```

### Matches — 所有匹配

```csharp
foreach (Match v in Regex.Matches(s, @"\d"))
    Console.WriteLine(v.Value);
```

### Replace / Split

```csharp
reg.Replace(s, "*");                  // 把匹配处替换为 *
string[] parts = Regex.Split("1a2b3", @"\d");   // 按数字切分
```

## 二、限定符（量词）

| 量词 | 含义 | 等价 |
|---|---|---|
| `*` | 0 次或多次 | `{0,}` |
| `+` | 1 次或多次 | `{1,}` |
| `?` | 0 次或 1 次 | `{0,1}` |
| `{n}` / `{n,}` / `{n,m}` | 精确 / 至少 / 区间 | |

量词后再加 `?` 变**非贪婪**（尽量少匹配）：`.+?` vs 贪婪的 `.+`。

## 三、字符类

| 元字符 | 匹配 |
|---|---|
| `\d` / `\D` | 数字 / 非数字 |
| `\w` / `\W` | 单词字符（字母、数字、汉字、`_`）/ 非单词字符 |
| `\s` / `\S` | 空白（空格 `\n` `\t` `\f`）/ 非空白 |
| `.` | 除换行外任意字符 |
| `[abc]` / `[^abc]` | 集合内 / 集合外任一字符 |
| `[a-z0-9]` | 范围 |

## 四、定位点（锚）

| 锚 | 含义 |
|---|---|
| `^` | 行首（多行模式下每行）；在 `[^...]` 中表示"非" |
| `$` | 行尾或字符串结尾 |
| `\A` | 字符串开头（不支持多行） |
| `\Z` / `\z` | 字符串结尾（`\Z` 允许结尾换行前；`\z` 必须是最末） |
| `\b` / `\B` | 单词边界 / 非单词边界 |
| `\G` | 必须紧接上一次匹配结束的位置 |

`^表达式$` 表示整串完全匹配。多行匹配开启 `RegexOptions.Multiline`：

```csharp
reg = new Regex(@"^a", RegexOptions.Multiline);
```

## 五、分组与反向引用

```csharp
// () 分组，\1 引用第 1 组；具名 (?<name>...) 用 \k<name> 引用
new Regex(@"(?<year>\d{4})-(?<month>\d{2})-\k<year>-\k<month>");

// 非捕获分组 (?:...)：分组但不保存，不能引用
new Regex(@"(?:[a-z])([0-9])\1");
```

内联选项：`(?i:...)` 忽略大小写、`(?m:...)` 多行、`(?mi:...)` 组合，加 `-` 表示关闭（如 `(?-i:...)`）。

## 六、零宽断言（lookaround）

只判断、不消耗字符：

| 语法 | 含义 |
|---|---|
| `a(?=b)` | 要 a，但后面必须是 b（正前瞻） |
| `a(?!b)` | 要 a，但后面不能是 b（负前瞻） |
| `(?<=a)b` | 要 b，但前面必须是 a（正后顾） |
| `(?<!a)b` | 要 b，但前面不能是 a（负后顾） |

## 七、备用构造与条件匹配

```csharp
// | 表示"或"
new Regex(@"(cat|dog|fish)");

// 条件：(?(分组)成立时正则|不成立时正则)
// 下例：若捕获到引号则匹配到下一个引号，否则匹配非空白
new Regex(@"(?<t>"")?(?(t).+?""|\S+\s)", RegexOptions.IgnorePatternWhitespace);
```

## 八、替换中的 $ 语法

`Replace` 的替换串里可引用捕获内容：

| 符号 | 含义 |
|---|---|
| `$1 $2 …` | 第 n 个分组 |
| `${name}` | 具名分组 |
| `$&` | 整个匹配 |
| `` $` `` | 匹配项**前**的所有字符 |
| `$'` | 匹配项**后**的所有字符 |
| `$$` | 字面量 `$` |

```csharp
var reg = new Regex(@"\b(?<a>\w+)\s(?<b>\w+)\b");
reg.Replace("one two", "${b}-${a}");   // "two-one"

new Regex(@"\d+").Replace("123abc456", "（$&）");   // （123）abc（456）
```

## 九、常用模式备查

```csharp
@"^\d{11}$"                                    // 手机号（粗略）
@"^[\w.+-]+@[\w-]+(\.[\w-]+)+$"                 // 邮箱
@"^\d{4}-\d{2}-\d{2}$"                          // 日期 yyyy-MM-dd
@"^1[3-9]\d{9}$"                                // 中国大陆手机号
@"(?<=<title>)(.*?)(?=</title>)"               // 提取标签内文本
```

## 性能提示

- 复用同一模式时**创建 `Regex` 实例**或加 `RegexOptions.Compiled`，别反复用静态方法。
- 警惕"灾难性回溯"：嵌套量词如 `(a+)+` 在不匹配时可能指数级爆炸。
- .NET 7+ 可用 `[GeneratedRegex]` 源生成器获得编译期最优正则。

---

**在线测试**：[regex101.com](https://regex101.com)（选 .NET 风格）· [正则表达式语言参考](https://learn.microsoft.com/zh-cn/dotnet/standard/base-types/regular-expression-language-quick-reference)
