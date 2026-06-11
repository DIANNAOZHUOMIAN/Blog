---
title: SqlSugar 深入
date: 2026-06-11
tags: [ORM, SqlSugar, .NET]
summary: 国产 ORM，链式查询、CRUD、关联、批量、事务、CodeFirst、AOP、多数据库、分表与读写分离。
---

# SqlSugar

国产开源 ORM（"果糖"），轻量、链式、SQL 控制力强，多数据库统一 API，文档与社区中文友好。NuGet 包：`SqlSugarCore`。

## 一、定位与优势

- 灵活：表达式翻译 + 直接拼 SQL；
- 多库统一：SqlServer / MySQL / PostgreSQL / Oracle / SQLite / 国产达梦 / 金仓 / 人大金仓 / 神舟通用…一份代码切换；
- 性能好，链式 API 直观；
- 一站特性：CodeFirst、AOP、读写分离、分表、雪花 ID、租户、缓存；
- 中文文档详尽（`donet.code.sqlsugar.com`）。

## 二、安装与配置

```bash
dotnet add package SqlSugarCore
```

单实例：

```csharp
var db = new SqlSugarClient(new ConnectionConfig {
    ConnectionString = "Server=.;Database=app;Uid=sa;Pwd=...;TrustServerCertificate=True",
    DbType = DbType.SqlServer,
    IsAutoCloseConnection = true,
    InitKeyType = InitKeyType.Attribute,    // 用特性识别主键
    LanguageType = LanguageType.Default,
});

db.Aop.OnLogExecuting = (sql, p) => {
    Console.WriteLine(UtilMethods.GetSqlString(DbType.SqlServer, sql, p));
};
db.Aop.OnError = ex => Console.WriteLine($"SQL Error: {ex.Sql}, {ex}");
```

`SqlSugarScope`（多线程安全 + 上下文）推荐生产：

```csharp
var sugar = new SqlSugarScope(new ConnectionConfig{...},
    db => {
        db.Aop.OnLogExecuting = (s, p) => Console.WriteLine(s);
    });

// 依赖注入
services.AddSingleton<ISqlSugarClient>(sugar);
```

## 三、实体特性

```csharp
[SugarTable("user")]
public class User {
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    [SugarColumn(ColumnName = "name", Length = 50, IsNullable = false)]
    public string Name { get; set; } = "";

    [SugarColumn(IsIgnore = true)]
    public string Tmp { get; set; } = "";

    [SugarColumn(ColumnDataType = "datetime2", InsertServerTime = true)]
    public DateTime CreatedAt { get; set; }

    [Navigate(NavigateType.OneToMany, nameof(Order.UserId))]
    public List<Order>? Orders { get; set; }
}
```

特性常用：`IsPrimaryKey / IsIdentity / IsNullable / ColumnName / Length / ColumnDataType / IsOnlyIgnoreUpdate / IsIgnore / DefaultValue / InsertServerTime / UpdateServerTime`。

## 四、CRUD

### 查询

```csharp
// 全部
var all = db.Queryable<User>().ToList();

// 条件
var list = db.Queryable<User>()
    .Where(u => u.Age > 18)
    .WhereIF(!string.IsNullOrEmpty(name), u => u.Name.Contains(name))
    .OrderBy(u => u.Id)
    .Select(u => new { u.Id, u.Name })
    .ToPageList(pageIndex: 1, pageSize: 10, ref totalCount);

// 主键
var u = db.Queryable<User>().InSingle(1);
var us = db.Queryable<User>().In(u => u.Id, new[]{1,2,3}).ToList();

// 异步
var ls = await db.Queryable<User>().ToListAsync();
```

### 关联（多表 JOIN）

```csharp
var q = db.Queryable<User, Order>((u, o) => new JoinQueryInfos(
        JoinType.Left, u.Id == o.UserId))
    .Where((u, o) => u.Vip)
    .Select((u, o) => new { u.Name, o.Total })
    .ToList();

// 3 表
var q3 = db.Queryable<A, B, C>((a, b, c) => new JoinQueryInfos(
        JoinType.Left, a.Id == b.AId,
        JoinType.Inner, b.Id == c.BId))
    .Select((a, b, c) => new { a.Name, b.Code, c.Detail })
    .ToList();

// 子查询
var q4 = db.Queryable<User>()
    .Where(u => SqlFunc.Subqueryable<Order>()
                       .Where(o => o.UserId == u.Id && o.Status == "paid")
                       .Any())
    .ToList();
```

### 导航属性查询（5.x+）

```csharp
var list = db.Queryable<User>()
    .Includes(u => u.Orders, o => o.Items)
    .ToList();
```

### 新增

```csharp
db.Insertable(new User{ Name = "a" }).ExecuteCommand();

// 取自增 ID
int id = db.Insertable(u).ExecuteReturnIdentity();
long sid = db.Insertable(u).ExecuteReturnBigIdentity();

// 批量（自动分页）
db.Insertable(list).PageSize(500).ExecuteCommand();

// 部分字段
db.Insertable(u).InsertColumns(x => new {x.Name, x.Age}).ExecuteCommand();
db.Insertable(u).IgnoreColumns(x => x.Tmp).ExecuteCommand();
```

### 更新

```csharp
// 按主键整对象更新
db.Updateable(u).ExecuteCommand();

// 只更新指定列
db.Updateable(u).UpdateColumns(x => new {x.Name, x.Vip}).ExecuteCommand();

// 按条件批量
db.Updateable<User>()
    .SetColumns(u => u.Vip == true)
    .SetColumns(u => u.UpdatedAt == DateTime.UtcNow)
    .Where(u => u.City == "SH")
    .ExecuteCommand();

// 表达式 +1
db.Updateable<User>()
    .SetColumns(u => u.LoginCount == u.LoginCount + 1)
    .Where(u => u.Id == 1).ExecuteCommand();
```

### 删除

```csharp
db.Deleteable<User>().Where(u => u.Id == 1).ExecuteCommand();
db.Deleteable<User>().In(new[]{1,2,3}).ExecuteCommand();
db.Deleteable(u).ExecuteCommand();
```

### Storageable（Upsert / 智能存储）

判断主键存在则 UPDATE，不存在则 INSERT：

```csharp
db.Storageable(list)
  .SplitInsert(it => true)
  .SplitUpdate(it => it.Any())
  .ExecuteCommand();
```

## 五、事务

```csharp
db.Ado.UseTran(() => {
    db.Insertable(u).ExecuteCommand();
    db.Updateable(...).ExecuteCommand();
});

// 手动
db.Ado.BeginTran();
try {
    ...
    db.Ado.CommitTran();
} catch { db.Ado.RollbackTran(); throw; }
```

跨多 db 上下文用分布式事务（CAP / DTM 等）。

## 六、CodeFirst / DbFirst

CodeFirst 建表：

```csharp
db.CodeFirst.InitTables<User, Order>();
db.CodeFirst.SetStringDefaultLength(200).InitTables(typeof(User), typeof(Order));
db.CodeFirst.BackupTable().InitTables<User>();
```

DbFirst 反向生成：

```csharp
db.DbFirst.IsCreateAttribute().CreateClassFile("./Models", "App.Models");
```

## 七、AOP

```csharp
db.Aop.OnLogExecuting = (sql, p) => Console.WriteLine($"SQL: {sql}");
db.Aop.OnLogExecuted  = (sql, p) => Console.WriteLine($"Time: {db.Ado.SqlExecutionTime}");
db.Aop.OnError = ex => Log.Error(ex.Message, ex);
db.Aop.OnExecutingChangeSql = (sql, p) => (sql, p);                  // 改写 SQL
db.Aop.DataExecuting = (val, info) => { /* 插入/更新前数据拦截 */ };
db.Aop.OnDiffLogEvent = info => { /* 差异日志（审计） */ };
```

`OnDiffLogEvent` 打开后 `Insertable / Updateable / Deleteable` 调用 `.EnableDiffLogEvent()` 自动产生新旧值差异，方便审计。

## 八、原生 SQL

```csharp
var list = db.Ado.SqlQuery<User>("SELECT * FROM user WHERE id=@id", new { id = 1 });
int rows = db.Ado.ExecuteCommand("UPDATE user SET name=@n WHERE id=@id",
    new { n="b", id=1 });
DataTable dt = db.Ado.GetDataTable("SELECT * FROM user");
object o = db.Ado.GetScalar("SELECT count(*) FROM user");
```

## 九、仓储模式（SimpleClient）

```csharp
var rep = db.GetSimpleClient<User>();
rep.Insert(u);
rep.Update(u);
rep.DeleteById(1);
var u = rep.GetById(1);
var ls = rep.GetList(x => x.Vip);
var page = rep.GetPageList(x => x.Age > 18,
    new PageModel{ PageIndex = 1, PageSize = 10 });

// 自定义仓储
public class UserRepo : SimpleClient<User> {
    public UserRepo(ISqlSugarClient db) : base(db) { }
    public List<User> Vips() => Context.Queryable<User>().Where(u => u.Vip).ToList();
}
```

## 十、雪花 ID

```csharp
var config = new ConnectionConfig {
    ...
    ConfigureExternalServices = new ConfigureExternalServices {
        SnowFlakeSingle = SnowFlakeSingle.Instance
    }
};

[SugarColumn(IsPrimaryKey = true)]
public long Id { get; set; }

// 插入时若 Id=0 自动填充雪花 ID
db.Insertable(new User{ Name = "a" }).ExecuteCommand();
```

## 十一、读写分离

```csharp
var db = new SqlSugarClient(new ConnectionConfig {
    ConnectionString = master,
    DbType = DbType.SqlServer,
    IsAutoCloseConnection = true,
    SlaveConnectionConfigs = new List<SlaveConnectionConfig>{
        new(){ HitRate = 10, ConnectionString = slave1 },
        new(){ HitRate = 10, ConnectionString = slave2 },
    }
});
// 写自动主库，读按 HitRate 分发到从库
```

## 十二、分库分表

按租户 / 时间 / 哈希分：

```csharp
[SugarTable("log_{year}{month}{day}")]
[SplitTable(SplitType.Month)]
public class Log {
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }
    public DateTime CreateTime { get; set; }
}

db.CodeFirst.SplitTables().InitTables<Log>();   // 建本月表
db.Insertable(new Log()).SplitTable().ExecuteCommand();
var list = db.Queryable<Log>().SplitTable(t => t.InLast(7, SplitType.Day)).ToList();
```

## 十三、多租户

```csharp
var tenantDb = new SqlSugarClient(new List<ConnectionConfig>{
    new(){ ConfigId = "A", ConnectionString = connA, DbType = DbType.MySql },
    new(){ ConfigId = "B", ConnectionString = connB, DbType = DbType.PostgreSQL }
});

tenantDb.AsTenant().ChangeDatabase("A");
var u = tenantDb.Queryable<User>().ToList();
```

## 十四、性能

- 批量插入 `PageSize` 调到 500~1000；
- `BulkCopy` 大数据（SqlServer/MySQL/PostgreSQL）：`db.Fastest<User>().BulkCopy(list)`；
- 缓存：`UseCache(60)` 短期内存缓存；
- 查询前预热（首次表达式翻译稍慢）；
- SQL 日志生产可关闭，开诊断时再开；
- 避免 N+1：`Includes()` 或子查询。

## 十五、与 EF Core 对比要点

| 项 | EF Core | SqlSugar |
|---|---|---|
| 出身 / 中文文档 | 微软 / 一般 | 国产 / 极佳 |
| 学习曲线 | 中 | 低 |
| 迁移工具 | 强（迁移历史） | 弱（CodeFirst 直接建/比对） |
| 多库切换 | 各 Provider | 一份代码切换 |
| SQL 控制 | LINQ 翻译，复杂场景受限 | 链式 + 拼 SQL 自由度高 |
| 性能 | 现代版本接近 | 普遍略好 |
| 复杂报表 | 投影/原生 SQL | 拼 SQL 更顺手 |
| 国产数据库 | 部分支持 | 支持广 |

## 十六、常见坑

- `SqlSugarClient` 单实例非线程安全，多线程用 `SqlSugarScope`；
- 表名/列名带保留字时 `[]` / `\`` 要在配置开启；
- 实体属性必须有 getter/setter；
- `IsIdentity` 的列不要手动赋值再插入；
- 关联查询要正确写 ON 条件；
- 大批量插入要禁用日志和 AOP（性能）；
- 默认 `IsAutoCloseConnection = true`：每次执行后关连接，对短查询友好但事务期间内部自动开关；
- 数据库时间字段时区处理与 DateTimeKind 一致。

## 十七、检查清单

- 生产用 `SqlSugarScope`；
- 实体加 `[SugarTable]` `[SugarColumn]`；
- 复杂条件 `WhereIF` 组合；
- 批量分页 `PageSize`；
- AOP 注入日志、审计、改写 SQL；
- 多库 / 分表早期评估；
- 单元测试用 SQLite 切换 DbType；
- 重要项目同时熟悉 EF Core，方便混用。
