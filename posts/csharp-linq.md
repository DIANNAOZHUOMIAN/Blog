---
title: C# LINQ 详解
date: 2026-06-11
tags: [C#, LINQ]
summary: 基础用法、查询语法、延迟执行、IEnumerable vs IQueryable、性能优化与进阶技巧。
---

# C# LINQ 详解

LINQ（Language Integrated Query）= 把查询带进语言。统一查询数组、集合、XML、数据库等任何 `IEnumerable<T>` / `IQueryable<T>` 数据源。

## 一、两种写法

```csharp
// 方法语法（链式，推荐）
var q = users.Where(u => u.Age > 18)
             .OrderBy(u => u.Name)
             .Select(u => new { u.Id, u.Name });

// 查询语法（SQL 风格）
var q2 = from u in users
         where u.Age > 18
         orderby u.Name
         select new { u.Id, u.Name };
```

二者等价。查询语法在多表 join、group by、let 时更直观；其他场合方法语法更灵活。

## 二、基础操作符全集

### 1. 筛选 / 投影

| 方法 | 说明 |
|---|---|
| `Where` | 过滤 |
| `Select` | 一对一投影 |
| `SelectMany` | 一对多扁平化 |
| `OfType<T>` | 按类型筛选 |
| `Cast<T>` | 强转所有元素 |

```csharp
var tags = users.SelectMany(u => u.Tags).Distinct();
```

### 2. 排序

```csharp
users.OrderBy(u => u.Age).ThenByDescending(u => u.Name);
users.OrderByDescending(u => u.Score);
users.Reverse();        // 反转（非排序）
```

C# 7+ `OrderBy` 稳定排序（相同 key 保留原顺序）。

### 3. 分组与聚合

```csharp
var byCity = users.GroupBy(u => u.City);
foreach (var g in byCity)
    Console.WriteLine($"{g.Key}: {g.Count()}");

users.Sum(u => u.Score);
users.Average(u => u.Age);
users.Min(u => u.Age);
users.Max(u => u.Age);
users.Count(u => u.Vip);
users.Aggregate(0, (acc, u) => acc + u.Score);
```

### 4. 集合操作

```csharp
a.Union(b);         // 并
a.Intersect(b);     // 交
a.Except(b);        // 差
a.Distinct();       // 去重
a.DistinctBy(x => x.Id);   // .NET 6+
```

### 5. 取数

| 方法 | 行为 |
|---|---|
| `First` | 没有抛异常 |
| `FirstOrDefault` | 没有返回默认值 |
| `Single` | 必须恰好一个，多了少了都抛 |
| `SingleOrDefault` | 可零或一个 |
| `Last` / `LastOrDefault` |  |
| `ElementAt(n)` | 按索引 |
| `Take(n)` / `Skip(n)` |  |
| `TakeWhile` / `SkipWhile` | 条件取舍 |
| `TakeLast(n)` / `SkipLast(n)` | .NET Core+ |
| `Chunk(n)` | .NET 6+ 分块 |

### 6. 量词

```csharp
users.Any();             // 是否有元素
users.Any(u => u.Vip);
users.All(u => u.Age > 0);
users.Contains(u);
```

### 7. 关联

```csharp
var q = from u in users
        join o in orders on u.Id equals o.UserId
        select new { u.Name, o.Total };

// 左连接：GroupJoin + DefaultIfEmpty
var q2 = from u in users
         join o in orders on u.Id equals o.UserId into uo
         from o in uo.DefaultIfEmpty()
         select new { u.Name, Total = o?.Total ?? 0 };
```

### 8. Zip / Range / Repeat

```csharp
new[]{1,2,3}.Zip(new[]{"a","b","c"}, (n,s) => $"{n}{s}");  // ["1a","2b","3c"]
Enumerable.Range(1, 100);
Enumerable.Repeat("x", 5);
Enumerable.Empty<int>();
```

### 9. 转换

```csharp
list.ToArray();
list.ToList();
list.ToDictionary(u => u.Id);
list.ToHashSet();
list.ToLookup(u => u.City);     // 一对多查找
```

## 三、延迟执行

LINQ 算子大多返回**生成器**，真正迭代时才执行：

```csharp
var q = list.Where(x => { Console.Write("."); return x > 0; });
// 此时还没打印任何点
foreach (var x in q) { ... }    // 这里才执行
var arr = q.ToArray();          // 再次执行
```

立即执行的算子：`ToList/ToArray/ToDictionary/ToHashSet/Count/Sum/First/All/Any/Last/Min/Max/Aggregate/...`。

陷阱：每次迭代都重新计算，热路径要 `ToList()` 缓存。

## 四、IEnumerable vs IQueryable

| 项 | `IEnumerable<T>` | `IQueryable<T>` |
|---|---|---|
| 实现 | LINQ to Objects（内存） | LINQ to SQL/EF（表达式树） |
| 委托类型 | `Func<T,bool>` 等 | `Expression<Func<T,bool>>` |
| 执行位置 | 本地 | 翻译为 SQL 数据库执行 |
| 适用 | 已经在内存 | 远程数据源 |

```csharp
IQueryable<User> q = db.Users;
q = q.Where(u => u.Age > 18);                  // 没翻译，只是构建表达式树
var ls = await q.ToListAsync();                // 此时翻译成 SQL 执行
```

误把 `IQueryable` 转成 `IEnumerable`（如 `.AsEnumerable()` 或在中间用了不可翻译方法）会导致剩余操作变成内存计算，全表拉回——严重性能问题。

## 五、进阶技巧

### 1. 投影与匿名类型

```csharp
var slim = users.Select(u => new { u.Id, u.Name, FullCity = $"{u.Country}-{u.City}" });
```

EF 中投影到匿名/具体 DTO 减少字段加载量。

### 2. 自定义扩展方法

```csharp
public static class LinqExt {
    public static IEnumerable<T> WhereIf<T>(this IEnumerable<T> src,
        bool cond, Func<T,bool> pred)
        => cond ? src.Where(pred) : src;
}

var q = users.WhereIf(!string.IsNullOrEmpty(name), u => u.Name.Contains(name))
             .WhereIf(minAge > 0, u => u.Age >= minAge);
```

### 3. 动态条件 / PredicateBuilder

EF 复杂查询用 `Expression` 拼接：

```csharp
Expression<Func<User,bool>> p = u => true;
if (vip) p = p.And(u => u.Vip);
if (city != null) p = p.And(u => u.City == city);
db.Users.Where(p);
```

需要 `LinqKit.PredicateBuilder` 或自己实现 `ExpressionVisitor`。

### 4. 分组 + 聚合

```csharp
var report = orders
    .GroupBy(o => new { o.UserId, Month = o.Date.Month })
    .Select(g => new {
        g.Key.UserId, g.Key.Month,
        Total = g.Sum(o => o.Amount),
        Cnt = g.Count()
    })
    .OrderBy(x => x.UserId).ThenBy(x => x.Month);
```

### 5. Distinct 自定义

```csharp
users.DistinctBy(u => u.Email);                    // .NET 6+
// 旧写法：
users.GroupBy(u => u.Email).Select(g => g.First());
```

### 6. 并行 PLINQ

```csharp
var result = bigData.AsParallel()
                    .Where(x => Heavy(x))
                    .Select(Map)
                    .ToList();
```

适合 CPU 密集、无副作用、数据量大的纯计算。带 IO 用 `Task.WhenAll`。

### 7. 异步 LINQ

EF Core：`ToListAsync / FirstOrDefaultAsync / AnyAsync / CountAsync / SumAsync / ...`。

`IAsyncEnumerable<T>` + `System.Linq.Async` 包：`await foreach` 与 LINQ 算子结合。

```csharp
await foreach (var u in db.Users.Where(u => u.Vip).AsAsyncEnumerable())
    Process(u);
```

## 六、性能要点

1. **避免重复迭代**：链尾 `ToList()` 一次，后续多次访问；
2. **大集合查找用 `Dictionary` / `HashSet`**：`Contains` 在 List 是 O(n)，HashSet 是 O(1)；
3. **避免 N+1**：EF 用 `Include` 或投影；
4. **`Count() > 0` → `Any()`**：`Any()` 找到一个就停；
5. **`Where().First()` → `First(pred)`**：少一次委托调用（差别小，但语义更清晰）；
6. **不要在 `Select` 里做 I/O**：变成同步阻塞，用 `Task.WhenAll`；
7. **Span / 数组优先**：极致性能场景 `for` 比 LINQ 快；
8. **`AsNoTracking()`**：EF 只读场景必加；
9. **多次 GroupBy / Join 复杂查询**：检查生成的 SQL，必要时手写。

## 七、常见错误

- 在 `IQueryable` 上调用不可翻译方法（自定义 C# 方法、`DateTime.Now.AddDays(...)` 配合复杂表达式）；
- `Single` 当 `First` 用，导致多记录抛异常；
- 在 lambda 里捕获 `using` 资源，迭代时资源已释放；
- `ToList()` 后又 `.AsQueryable()` 想回到数据库，已经不可能；
- 在循环里写 LINQ：`for (var i…) list.Where(…).First()`，应改为字典预处理。

## 八、查询语法 vs 方法语法选择

查询语法更好读：

```csharp
var q = from u in users
        join o in orders on u.Id equals o.UserId
        where o.Total > 100
        group new { u, o } by u.City into g
        let total = g.Sum(x => x.o.Total)
        where total > 1000
        orderby total descending
        select new { City = g.Key, Total = total };
```

`let`、多重 `from`、`join … into` 在方法语法下比较啰嗦，可混用。
