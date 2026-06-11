---
title: C# 文件操作
date: 2026-06-11
tags: [C#, IO, 文件]
summary: File / FileStream / Path / Directory、文本与二进制、异步、Span 零分配、监听与压缩。
---

# C# 文件操作

`System.IO` 提供完整的文件 IO。

## 一、File 静态类（最常用）

```csharp
// 文本
File.WriteAllText("a.txt", "hello", Encoding.UTF8);
string s = File.ReadAllText("a.txt", Encoding.UTF8);

File.WriteAllLines("a.txt", new[]{"line1","line2"});
string[] lines = File.ReadAllLines("a.txt");

File.AppendAllText("log.txt", "more\n");
File.AppendAllLines("log.txt", new[]{"more"});

// 二进制
File.WriteAllBytes("a.bin", bytes);
byte[] buf = File.ReadAllBytes("a.bin");

// 异步（.NET Core+）
await File.WriteAllTextAsync("a.txt", s);
string t = await File.ReadAllTextAsync("a.txt");

// 流式读取（不一次性加载）
foreach (var line in File.ReadLines("big.txt")) ...
await foreach (var l in File.ReadLinesAsync("big.txt")) ...

// 复制、移动、删除
File.Copy("a.txt", "b.txt", overwrite: true);
File.Move("a.txt", "c.txt", overwrite: true);
File.Delete("c.txt");
File.Exists("a.txt");

// 时间戳
File.GetLastWriteTime("a.txt");
File.SetCreationTime("a.txt", DateTime.Now);

// 属性
var info = new FileInfo("a.txt");
info.Length; info.Extension; info.DirectoryName;
info.IsReadOnly = true;
```

`File.ReadAllLines` 一次返回数组（小文件用）；`ReadLines` 返回 `IEnumerable`，惰性，适合大文件。

## 二、Directory 与 DirectoryInfo

```csharp
Directory.CreateDirectory("data/sub");
Directory.Delete("data", recursive: true);
Directory.Exists("data");
Directory.Move("a", "b");

// 列出
foreach (var f in Directory.EnumerateFiles("data",
                       "*.json", SearchOption.AllDirectories)) ...
foreach (var d in Directory.EnumerateDirectories("data")) ...
foreach (var entry in Directory.EnumerateFileSystemEntries("data")) ...
```

`Enumerate*` 流式返回，比 `Get*` 省内存。

`DirectoryInfo` 是 OO 风：

```csharp
var di = new DirectoryInfo(".");
foreach (var f in di.GetFiles("*.cs", SearchOption.AllDirectories))
    Console.WriteLine(f.FullName);
```

## 三、Path（路径处理）

```csharp
Path.Combine("dir", "sub", "a.txt");    // 跨平台拼接，dir/sub/a.txt
Path.GetFileName("/a/b.txt");            // b.txt
Path.GetFileNameWithoutExtension("a.tar.gz");   // a.tar
Path.GetExtension("a.tar.gz");           // .gz
Path.GetDirectoryName("/a/b.txt");       // /a
Path.GetFullPath("a.txt");               // 绝对路径
Path.GetTempFileName();                  // 临时文件
Path.GetTempPath();                      // 临时目录
Path.GetRandomFileName();                // 随机名
Path.ChangeExtension("a.txt", ".bak");

// .NET 5+ Span 版本，零分配
ReadOnlySpan<char> ext = Path.GetExtension("a.txt".AsSpan());
```

绝不要自己 `"a" + "/" + "b"`，永远 `Path.Combine`。

## 四、Stream 体系

```text
Stream（抽象）
├── FileStream         文件
├── MemoryStream       内存
├── NetworkStream      套接字
├── GZipStream         压缩
├── DeflateStream      压缩
├── BufferedStream     缓冲包装
├── CryptoStream       加解密
```

`Stream` 三大能力：`Read / Write / Seek`。

```csharp
using var fs = new FileStream("a.bin", FileMode.OpenOrCreate,
                              FileAccess.ReadWrite, FileShare.Read,
                              bufferSize: 4096, useAsync: true);
fs.Write(buf, 0, buf.Length);
await fs.WriteAsync(buf);
fs.Seek(0, SeekOrigin.Begin);
int n = fs.Read(buf, 0, buf.Length);
```

`FileMode`：`CreateNew / Create / Open / OpenOrCreate / Truncate / Append`。

`FileShare`：限制并发：`None / Read / Write / ReadWrite / Delete`。

## 五、Reader / Writer

字符流：

```csharp
using var sw = new StreamWriter("a.txt", append: false, Encoding.UTF8);
sw.WriteLine("hi"); sw.WriteLine("ok");

using var sr = new StreamReader("a.txt", Encoding.UTF8);
string? line;
while ((line = sr.ReadLine()) != null) ...
```

二进制：

```csharp
using var bw = new BinaryWriter(File.Create("a.bin"));
bw.Write(42);            // int
bw.Write("hello");       // 长度前缀的字符串
bw.Write(new byte[]{1,2,3});

using var br = new BinaryReader(File.OpenRead("a.bin"));
int i = br.ReadInt32();
string s = br.ReadString();
```

## 六、Span / 零分配读取

```csharp
using var fs = File.OpenRead("a.bin");
Span<byte> buf = stackalloc byte[1024];
int n = fs.Read(buf);
ReadOnlySpan<byte> slice = buf[..n];
```

`PipeReader / PipeWriter`（`System.IO.Pipelines`）：高性能流式解析。

## 七、JSON / XML / CSV

```csharp
// JSON
using var fs = File.OpenRead("a.json");
var user = await JsonSerializer.DeserializeAsync<User>(fs);

await using var fs2 = File.Create("b.json");
await JsonSerializer.SerializeAsync(fs2, user,
    new JsonSerializerOptions { WriteIndented = true });

// XML
XDocument doc = XDocument.Load("a.xml");
doc.Descendants("user").Where(x => (int)x.Attribute("age")! > 18);

// CSV：用库 CsvHelper / Sylvan.Data.Csv
```

## 八、文件监视 FileSystemWatcher

```csharp
var w = new FileSystemWatcher("data") {
    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
    Filter = "*.json",
    IncludeSubdirectories = true,
    EnableRaisingEvents = true,
};
w.Created += (s, e) => Console.WriteLine($"new: {e.FullPath}");
w.Changed += (s, e) => Console.WriteLine($"chg: {e.FullPath}");
w.Renamed += (s, e) => Console.WriteLine($"ren: {e.OldFullPath}→{e.FullPath}");
w.Deleted += (s, e) => Console.WriteLine($"del: {e.FullPath}");
w.Error   += (s, e) => Console.WriteLine($"err: {e.GetException()}");
```

注意：
- 写入过程会触发多次 `Changed`，自己去抖（300ms 内合并）；
- 编辑器替换写文件（先写临时再 rename）只会触发 `Renamed`；
- 缓冲区满会丢事件，`InternalBufferSize` 调大；
- 跨平台行为不一致。

## 九、压缩

```csharp
// GZip
using (var fs = File.Create("a.gz"))
using (var gz = new GZipStream(fs, CompressionLevel.Optimal))
using (var src = File.OpenRead("a.txt"))
    src.CopyTo(gz);

// Zip 压缩
ZipFile.CreateFromDirectory("data", "data.zip");
ZipFile.ExtractToDirectory("data.zip", "out");

// 流式访问 Zip 内文件
using var zip = ZipFile.OpenRead("data.zip");
foreach (var e in zip.Entries) {
    using var s = e.Open();
    /* 读 */
}
```

## 十、内存映射文件

跨进程共享大文件：

```csharp
using var mmf = MemoryMappedFile.CreateFromFile("big.bin");
using var acc = mmf.CreateViewAccessor(0, 100);
int x = acc.ReadInt32(0);
acc.Write(4, 42);
```

## 十一、临时文件与原子写

不要直接覆盖重要文件。**先写临时 → rename**：

```csharp
var tmp = Path.GetTempFileName();
File.WriteAllText(tmp, content);
File.Move(tmp, "target.txt", overwrite: true);
```

写日志大文件可考虑追加 + 滚动（按日期切割）。

## 十二、跨平台路径与编码

- 路径分隔符用 `Path.DirectorySeparatorChar` 或 `Path.Combine`；
- Windows 默认 UTF-8 with BOM；Linux 无 BOM；显式指定编码避免乱码：`new UTF8Encoding(false)`；
- 大小写敏感：Windows 不敏感，Linux 敏感；
- 行结束符：CRLF vs LF，按需 `String.Replace`。

## 十三、检查清单

- 永远 `using`（或 `using var`）保证关闭；
- 大文件 `ReadLines / EnumerateFiles` 避免一次性加载；
- 异步 IO：`*Async` 方法 + `await`；
- 写文件原子化：临时文件 + Move；
- 高并发监视：先 watcher，再启动业务，避免错过初始变化；
- 跨平台路径用 `Path.Combine`；
- 加密敏感数据：`CryptoStream` + AES。
