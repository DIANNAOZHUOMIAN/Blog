---
title: C# 时间操作
date: 2026-06-11
tags: [C#, DateTime, 时区]
summary: DateTime / DateTimeOffset / DateOnly / TimeOnly、时区、格式化、解析、计算、Stopwatch 与 Unix 时间戳。
---

# C# 时间操作

## 一、四个时间类型

| 类型 | 含义 | 何时用 |
|---|---|---|
| `DateTime` | 日期 + 时间 + Kind | 内部存时间，简单场景 |
| `DateTimeOffset` | 时间 + 时区偏移 | **跨时区、推荐默认** |
| `DateOnly` (.NET 6+) | 仅日期 | 生日、纪念日 |
| `TimeOnly` (.NET 6+) | 仅时间 | 营业时间 |
| `TimeSpan` | 时间间隔 | 持续时长 |

## 二、当前时间

```csharp
DateTime.Now;                   // 本地，DateTimeKind.Local
DateTime.UtcNow;                // UTC
DateTime.Today;                 // 本地零点
DateTimeOffset.Now;             // 本地 + 偏移
DateTimeOffset.UtcNow;          // UTC + 偏移 0
DateOnly.FromDateTime(DateTime.Now);
TimeOnly.FromDateTime(DateTime.Now);
```

`DateTime` 有个三态字段 `Kind`（`Unspecified / Utc / Local`），常引发 bug。`DateTimeOffset` 强制带时区偏移，更不易出错。

## 三、构造

```csharp
new DateTime(2026, 6, 11);
new DateTime(2026, 6, 11, 14, 30, 0, DateTimeKind.Utc);
new DateTime(ticks);            // 1 tick = 100ns
new DateTimeOffset(2026, 6, 11, 14, 30, 0, TimeSpan.FromHours(8));
DateOnly.Parse("2026-06-11");
TimeOnly.Parse("14:30");
```

最小/最大：`DateTime.MinValue` (0001-01-01) / `MaxValue` (9999-12-31)。

## 四、格式化

```csharp
dt.ToString("yyyy-MM-dd HH:mm:ss.fff");
dt.ToString("o");               // ISO 8601 完整往返格式
dt.ToString("R");               // RFC 1123 GMT
dt.ToString("s");               // 排序友好 ISO

DateTime.Now.ToString("D");     // 长日期
DateTime.Now.ToString("F");     // 完整长日期 + 时间
```

| 占位符 | 含义 |
|---|---|
| `yyyy` | 四位年 |
| `MM` / `M` | 月（补 0 / 不补） |
| `dd` / `d` | 日 |
| `HH` / `H` | 24 时（补 0 / 不补） |
| `hh` / `h` | 12 时 |
| `mm` `ss` | 分秒 |
| `tt` | AM/PM |
| `fff` | 毫秒 |
| `zzz` | 时区偏移 |
| `ddd` / `dddd` | 周缩写 / 全称 |
| `MMM` / `MMMM` | 月缩写 / 全称 |

文化敏感：

```csharp
dt.ToString("F", CultureInfo.InvariantCulture);
dt.ToString("F", new CultureInfo("zh-CN"));
```

服务端日志/接口固定用 `InvariantCulture`，避免本地化坑。

## 五、解析

```csharp
DateTime.Parse("2026-06-11");
DateTime.ParseExact("2026/06/11", "yyyy/MM/dd", CultureInfo.InvariantCulture);
DateTime.TryParse(s, out var dt);
DateTime.TryParseExact("2026-06-11 14:30",
    "yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture,
    DateTimeStyles.AssumeUniversal, out var dt2);
```

`DateTimeStyles`：
- `AssumeLocal` / `AssumeUniversal`：未指定偏移时默认假设；
- `AdjustToUniversal`：解析后转 UTC；
- `RoundtripKind`：保持原 Kind。

## 六、计算

```csharp
dt.AddDays(7).AddHours(-3).AddMinutes(30);

TimeSpan diff = end - start;
diff.TotalSeconds; diff.TotalMilliseconds; diff.TotalDays;
diff.Days; diff.Hours; diff.Minutes; diff.Seconds;

TimeSpan.FromSeconds(30);
TimeSpan.FromMilliseconds(500);
TimeSpan.FromHours(1.5);
TimeSpan.Zero;

// 比较
dt1 < dt2;
DateTime.Compare(dt1, dt2);
```

## 七、时区

```csharp
TimeZoneInfo.Local;
TimeZoneInfo.Utc;
TimeZoneInfo.GetSystemTimeZones();

// 找特定时区（Windows / IANA 两套 ID，.NET 6+ 自动互转）
var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Shanghai");
// Windows: "China Standard Time"

// UTC ↔ 本地
DateTime utc = DateTime.UtcNow;
DateTime sh  = TimeZoneInfo.ConvertTimeFromUtc(utc, tz);
DateTime back = TimeZoneInfo.ConvertTimeToUtc(sh, tz);

// DateTimeOffset 自带偏移
var dto = new DateTimeOffset(dt, tz.GetUtcOffset(dt));
```

**最佳实践**：
- 数据库存 **UTC**；
- 接口传 **ISO 8601 带偏移**（`2026-06-11T14:30:00+08:00`）；
- 显示给用户时再按用户时区格式化。

## 八、Unix 时间戳

```csharp
long sec = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
long ms  = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

DateTimeOffset dto = DateTimeOffset.FromUnixTimeSeconds(sec);
DateTimeOffset dto2 = DateTimeOffset.FromUnixTimeMilliseconds(ms);
```

## 九、高精度计时 Stopwatch

```csharp
var sw = Stopwatch.StartNew();
DoWork();
sw.Stop();
Console.WriteLine(sw.ElapsedMilliseconds);
Console.WriteLine(sw.Elapsed.TotalMicroseconds);
Stopwatch.GetTimestamp();          // 原始 ticks
Stopwatch.Frequency;               // 每秒 ticks 数
Stopwatch.IsHighResolution;
```

`Stopwatch` 用系统性能计数器，比 `DateTime.Now` 差精度高、不受系统时间修改影响。

## 十、DateOnly / TimeOnly

```csharp
var d = new DateOnly(2026, 6, 11);
d.AddDays(7); d.DayOfWeek; d.DayOfYear;
DateOnly.FromDayNumber(739365);   // 序号
d.ToDateTime(TimeOnly.MinValue);

var t = new TimeOnly(14, 30);
t.AddHours(1); t.IsBetween(start, end);
```

更窄的类型，避免误把 `DateTime` 用做日期时丢时间或反之。

## 十一、Cron / 定时

简单延时：`Timer`、`PeriodicTimer`、`Task.Delay`。

正经定时调度：`Quartz.NET` / `Hangfire` / `Cronos`：

```csharp
// Cronos 解析 Cron
var cron = CronExpression.Parse("0 9 * * MON-FRI", CronFormat.Standard);
var next = cron.GetNextOccurrence(DateTime.UtcNow, TimeZoneInfo.Local);
```

`PeriodicTimer`（.NET 6+）取代旧 `System.Threading.Timer` 用于异步循环：

```csharp
using var t = new PeriodicTimer(TimeSpan.FromSeconds(5));
while (await t.WaitForNextTickAsync(ct)) {
    DoTick();
}
```

## 十二、常见坑

1. **`DateTime.Now` 与时区**：服务器在不同时区运行结果不一致，统一用 `UtcNow`；
2. **Kind 不一致**：序列化 `DateTime` 失去 Kind 信息；
3. **DST（夏令时）**：某些时间点不存在或重复，加减不可靠；用 `DateTimeOffset`；
4. **闰秒**：.NET 默认忽略；
5. **Ticks 互转**：`DateTime` 和 `Stopwatch` 的 tick 不是同一回事；
6. **2038 问题**：32 位 Unix 时间戳越界，用 `Int64` Unix 毫秒；
7. **`TimeSpan.Parse("1:30")`** 默认是 1 小时 30 分钟，不是 1 分 30 秒。

## 十三、检查清单

- 接口/数据库统一 UTC；
- 新代码默认 `DateTimeOffset` 或 `DateOnly`；
- 解析用 `TryParseExact` + `InvariantCulture`；
- 测量耗时用 `Stopwatch`；
- 时区显示在最外层做转换，业务层不感知；
- 数据序列化（JSON）用 ISO 8601 + 偏移；
- 不要在循环里反复 `DateTime.Now`，缓存或用 `Stopwatch`。
