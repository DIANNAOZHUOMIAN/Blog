---
title: C# 字符串操作
date: 2026-06-11
tags: [C#, string, 性能]
summary: string 不可变性、插值与格式化、StringBuilder、Span/ROS、编码、正则、常见 API 与性能。
---

# C# 字符串操作

## 一、不可变性

`string` 是引用类型但**不可变**。每次"修改"都创建新对象：

```csharp
string s = "ab";
s += "c";          // 新对象，旧 "ab" 等待 GC
```

频繁拼接 → `StringBuilder` 或 `string.Concat / Join` 一次合并。

## 二、字符与编码

- `char` 是 UTF-16 代码单元（16bit），不是字符——Emoji 用 2 个 char（surrogate pair）；
- `string` 是 `char` 数组（内部 `ImmutableArray<char>` 风格）；
- 编码转换：`Encoding.UTF8.GetBytes / GetString`；

```csharp
byte[] b = Encoding.UTF8.GetBytes("中文");
string t = Encoding.UTF8.GetString(b);

Encoding.UTF8;          // UTF-8 无 BOM（new UTF8Encoding(false)）
Encoding.UTF8.GetPreamble();
Encoding.Unicode;       // UTF-16 LE
Encoding.GetEncoding("GB2312");   // 需 System.Text.Encoding.CodePages
```

字符位置遍历用 `StringInfo` 处理代理对：

```csharp
foreach (var e in StringInfo.GetTextElementEnumerator("a😀b")) ...
```

.NET 8+ 字符运行（grapheme cluster）支持更完整。

## 三、创建与字面量

```csharp
string a = "hello";
string b = "line1\nline2";
string c = @"C:\path\with\backslash";       // 逐字字符串
string d = $"name={name}";                  // 插值
string e = $"""他说："{msg}" """;            // C# 11 原始字符串
char[] arr = {'a','b','c'};
string f = new string(arr);
string g = new string('=', 80);              // 80 个 '='
```

## 四、格式化 / 插值

```csharp
string r = $"{x,10:N2}";        // 右对齐宽 10，保留 2 位小数
$"{dt:yyyy-MM-dd}";
$"{val:#,##0.00}";
string.Format("Name={0}, Age={1}", name, age);
$"{p:P1}";                      // 百分比 1 位

// 复合格式
string s = $$"""{ "name":"{{name}}" }""";   // C# 11，{{ 表示一个 {
```

复用模板：

```csharp
var msg = string.Format(CultureInfo.InvariantCulture, "{0:F2}", val);
```

`CompositeFormat`（.NET 8+）解析一次复用：

```csharp
private static readonly CompositeFormat _fmt = CompositeFormat.Parse("Hi {0}");
string s = string.Format(null, _fmt, name);
```

## 五、常用 API

```csharp
"abc".Length;
"abc"[1];                       // 'b'
"abc".StartsWith("a");
"abc".EndsWith("c");
"abc".Contains("b");
"abcabc".IndexOf("b");          // 1
"abcabc".LastIndexOf("b");      // 4
"abc".Replace("a", "A");
"abc".Replace('a', 'A');
"  x  ".Trim();
"xx_x".TrimStart('x');
"abc".PadLeft(5, '0');          // "00abc"
"abc".PadRight(5);
"a,b,c".Split(',');             // ["a","b","c"]
"a,b,,c".Split(',', StringSplitOptions.RemoveEmptyEntries);
string.Join("-", arr);
"abc".ToUpper(); "abc".ToLower();
"abc".ToUpperInvariant();       // 文化无关
"abc".Substring(1, 2);          // "bc"
"abc".Insert(1, "X");           // "aXbc"
"abc".Remove(1, 1);             // "ac"
"abc".Reverse();                // 注意：返回 IEnumerable<char>，要 new string(...)
string.IsNullOrEmpty(s);
string.IsNullOrWhiteSpace(s);
"a".CompareTo("b");
string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
```

## 六、Range / Index

```csharp
"hello"[..3];        // "hel"
"hello"[1..];        // "ello"
"hello"[^1];         // 'o'
"hello"[1..^1];      // "ell"
```

## 七、StringBuilder

频繁拼接（循环、多步骤构造）：

```csharp
var sb = new StringBuilder(capacity: 256);
sb.Append("a").Append(123).AppendLine();
sb.AppendFormat("{0:N2}", 3.14);
sb.AppendJoin(",", arr);
sb.Replace("foo", "bar");
sb.Insert(0, "head:");
sb.Length = 0;                   // 清空
string s = sb.ToString();
```

**何时用**：循环里拼字符串、动态构建（SQL/HTML/JSON）。

少量拼接（`a + b + c`）编译器已优化为 `string.Concat`，不需要 SB。

## 八、Span / ReadOnlySpan

零分配切片，热路径首选：

```csharp
ReadOnlySpan<char> s = "12,34,56".AsSpan();
int i = s.IndexOf(',');
ReadOnlySpan<char> first = s[..i];
ReadOnlySpan<char> rest  = s[(i+1)..];

if (int.TryParse(first, out int x)) ...
```

构建：`Span<char> buf = stackalloc char[256]; buf[0]='x';`。

`string.Create`：原地填充避免中间数组：

```csharp
string s = string.Create(10, state, (span, st) => {
    span[0] = 'A'; /* ... */
});
```

## 九、StringComparison（必须显式）

C# 字符串比较默认依赖文化，跨平台/服务端务必传 `StringComparison`：

| 值 | 含义 |
|---|---|
| `Ordinal` | 按字节，最快 |
| `OrdinalIgnoreCase` | 按字节、忽略大小写 |
| `InvariantCulture` | 文化无关排序 |
| `InvariantCultureIgnoreCase` | 同上 + 忽略大小写 |
| `CurrentCulture` | 当前文化（少用） |

```csharp
"a".Equals("A", StringComparison.OrdinalIgnoreCase);    // 推荐
dict = new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
```

## 十、正则

```csharp
using System.Text.RegularExpressions;

Regex.IsMatch("abc123", @"^\w+$");
foreach (Match m in Regex.Matches(s, @"\d+")) Console.WriteLine(m.Value);
Regex.Replace(s, @"\s+", " ");
Regex.Split(s, @"\s+");

// 编译期生成（.NET 7+），无运行时反射，零分配
[GeneratedRegex(@"^\d+$")]
private static partial Regex DigitsRegex();
```

热路径用 `RegexOptions.Compiled` 或 `[GeneratedRegex]`。

`Match.Groups[i]` 捕获组，`(?<name>...)` 命名组。

## 十一、字符串池（intern）

字面量自动 intern，相同字面量是同一对象：

```csharp
string.IsInterned("abc");       // 返回引用 / null
string s = string.Intern("ab" + "c");  // 强制 intern
```

谨慎使用，intern 池不会被 GC，泄漏内存。

## 十二、性能要点

1. 大量拼接用 `StringBuilder`；
2. 单次拼少量用 `+` 或 `$"..."`，编译器优化为 `Concat`；
3. `string.Join` 一次性合并优于多次 `+=`；
4. 解析数字 / 时间用 `TryParse(ReadOnlySpan<char>)` 重载，避免 `Substring` 分配；
5. 比较加 `StringComparison`，避免 culture 检查；
6. 字符串作为字典键，注意 `EqualityComparer` 选择；
7. 大字符串切片用 `AsSpan(...)`，几乎免费；
8. JSON 序列化优先 `Utf8JsonReader/Writer`，不要先转 `string`；
9. 拼 SQL/HTML 用专用 builder（防注入）。

## 十三、常见坑

- 中文字符串 `Length != 显示宽度`；
- `string.Replace` 不修改原对象，要赋值回去；
- `Split(',')` 默认会保留空段；
- `"".Split(',')` 返回 `[""]`，不是空数组；
- `StringComparer.OrdinalIgnoreCase`：用于字典/集合的键比较；
- `string.Format` 数字超过占位符索引会抛 `FormatException`；
- `string.IsNullOrEmpty` 不会判空白字符，要 `IsNullOrWhiteSpace`；
- 文件读写编码不匹配 → 乱码，显式 `Encoding.UTF8`。

## 十四、检查清单

- 比较：`StringComparison.OrdinalIgnoreCase` 是默认；
- 拼接：循环里 SB，简单 +；
- 解析：`TryParse`、`Span` 版本；
- 正则：`[GeneratedRegex]`；
- 编码：明确指定 `Encoding.UTF8`；
- 国际化：用资源文件 `.resx`，不要硬编码字面量。
