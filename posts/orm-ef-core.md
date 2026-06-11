---
title: EF Core 深入
date: 2026-06-11
tags: [ORM, EF Core, .NET]
summary: DbContext、Fluent API、迁移、查询追踪、Include、批量、原生 SQL、并发、性能与陷阱。
---

# Entity Framework Core

微软官方 ORM，跨平台、当前主流版本 EF Core 8 / 9。

## 一、定位

- 把数据库表 ↔ C# 实体；
- LINQ 翻译成 SQL；
- 内置迁移、追踪、并发、关联、值转换；
- 支持 SQL Server / PostgreSQL / MySQL / SQLite / Oracle / Cosmos 等。

## 二、安装

```bash
dotnet add package Microsoft.EntityFrameworkCore
dotnet add package Microsoft.EntityFrameworkCore.SqlServer   # 任选一种 Provider
dotnet add package Microsoft.EntityFrameworkCore.Design      # 迁移工具
dotnet tool install --global dotnet-ef
```

## 三、DbContext 与 DbSet

```csharp
public class AppDb : DbContext {
    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnConfiguring(DbContextOptionsBuilder o) {
        o.UseSqlServer("Server=.;Database=app;Trusted_Connection=True;Encrypt=False");
        // 或注入：DI 注册见下
    }

    protected override void OnModelCreating(ModelBuilder b) {
        b.Entity<User>(e => {
            e.ToTable("user");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(50).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
        });
        b.Entity<Order>().HasOne(x => x.User).WithMany(x => x.Orders)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
```

DI：

```csharp
builder.Services.AddDbContext<AppDb>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Db")));

// 高并发使用 Pool
builder.Services.AddDbContextPool<AppDb>(opt => opt.UseSqlServer(...));
```

`DbContext` 是**短生命周期 + 非线程安全**，按请求/工作单元创建。

## 四、模型配置：数据注解 vs Fluent API

### 数据注解

```csharp
[Table("user")]
public class User {
    [Key] public int Id { get; set; }
    [Required] [MaxLength(50)] public string Name { get; set; } = "";
    [Column("email_addr")] public string Email { get; set; } = "";
    [NotMapped] public string Tmp { get; set; } = "";
    [Timestamp] public byte[] RowVersion { get; set; } = [];
}
```

简洁但表达力有限。

### Fluent API

灵活全面，复杂关系、多列索引、值转换都靠它。建议**统一用 Fluent API**，注解只标基础。

```csharp
b.Entity<User>(e => {
    e.HasIndex(x => new { x.City, x.Age });
    e.Property(x => x.Status).HasConversion<string>();      // 枚举 → 字符串
    e.Property(x => x.Tags).HasConversion(
        v => string.Join(',', v),
        v => v.Split(',', StringSplitOptions.None));
    e.OwnsOne(x => x.Address);                              // 值对象同表
});
```

## 五、迁移

```bash
dotnet ef migrations add Init
dotnet ef migrations add AddUserVip
dotnet ef database update
dotnet ef database update <MigrationName>     # 回退到某版本
dotnet ef migrations remove                    # 撤销最近一次未应用
dotnet ef migrations script                    # 生成 SQL 脚本
dotnet ef dbcontext scaffold "ConnStr" Microsoft.EntityFrameworkCore.SqlServer  # DB First
```

迁移文件：`Migrations/20260611_Init.cs`。生产环境通常生成 SQL 脚本手动审计执行。

## 六、CRUD

```csharp
using var db = new AppDb();

// 查询
var list = await db.Users
    .Where(u => u.Age > 18)
    .OrderBy(u => u.Id)
    .Select(u => new { u.Id, u.Name })
    .Skip(20).Take(10)
    .AsNoTracking()
    .ToListAsync();

var u = await db.Users.FindAsync(1);                  // 主键缓存
var u2 = await db.Users.FirstOrDefaultAsync(x => x.Id == 1);
var u3 = await db.Users.SingleOrDefaultAsync(x => x.Email == "a");

bool ok = await db.Users.AnyAsync(x => x.Vip);
int cnt = await db.Users.CountAsync(x => x.Vip);

// 关联
var withOrders = await db.Users
    .Include(u => u.Orders).ThenInclude(o => o.Items)
    .FirstOrDefaultAsync(u => u.Id == 1);

// 投影到 DTO
var dto = await db.Users
    .Where(u => u.Vip)
    .Select(u => new UserDto { Id = u.Id, Name = u.Name,
                                OrderCount = u.Orders.Count })
    .ToListAsync();

// 新增
db.Users.Add(new User{ Name = "a" });
await db.SaveChangesAsync();

// 更新（追踪 → SaveChanges）
u.Name = "b";
await db.SaveChangesAsync();

// 已知主键的离线更新
db.Users.Update(new User{ Id = 1, Name = "b" });   // 整体替换所有字段

// 删除
db.Users.Remove(u);
await db.SaveChangesAsync();
```

## 七、追踪

`DbContext` 默认追踪所有查询结果，修改属性后 `SaveChanges` 自动生成 UPDATE。

- `AsNoTracking()`：只读不追踪，吞吐高；
- `AsNoTrackingWithIdentityResolution()`：不追踪但去重；
- `AsTracking()` / `ChangeTracker.LazyLoadingEnabled`。

查看变更：

```csharp
foreach (var e in db.ChangeTracker.Entries()) {
    Console.WriteLine($"{e.Entity.GetType().Name} - {e.State}");
}
```

## 八、关联

| 类型 | 配置 |
|---|---|
| 一对多 | `HasMany().WithOne().HasForeignKey()` |
| 一对一 | `HasOne().WithOne().HasForeignKey<T>()` |
| 多对多 | EF Core 5+ 自动建中间表，可显式配置 |
| 自引用 | 同一实体自己关联自己 |
| TPH/TPT/TPC | 继承映射 |

```csharp
// 多对多
b.Entity<User>().HasMany(u => u.Roles).WithMany(r => r.Users)
    .UsingEntity<UserRole>(
        j => j.HasOne<Role>().WithMany().HasForeignKey(x => x.RoleId),
        j => j.HasOne<User>().WithMany().HasForeignKey(x => x.UserId),
        j => j.HasKey(x => new { x.UserId, x.RoleId }));
```

## 九、Include 与 N+1

`Include` 触发 JOIN 加载导航；不写 Include 时访问导航属性 → 懒加载（需开启 + Proxy）→ 每次单独查询 → N+1。

```csharp
// 1) Eager
var users = await db.Users.Include(u => u.Orders).ToListAsync();

// 2) Lazy
b.Services.AddDbContext<AppDb>(o => o.UseLazyLoadingProxies()...);
public virtual ICollection<Order> Orders { get; set; } = new List<Order>();  // virtual

// 3) Explicit
await db.Entry(user).Collection(u => u.Orders).LoadAsync();
```

### Split Query

多层 Include 会生成笛卡尔积巨大结果集，可拆成多条 SQL：

```csharp
db.Users.AsSplitQuery().Include(u => u.Orders).ThenInclude(o => o.Items);
// 或全局：opt.UseSqlServer(conn, b => b.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery))
```

## 十、批量

```csharp
// EF Core 7+ 新批量 API
await db.Users.Where(u => u.Age < 0).ExecuteDeleteAsync();
await db.Users.Where(u => u.City == "SH")
    .ExecuteUpdateAsync(s => s
        .SetProperty(u => u.Vip, true)
        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));

// 批量插入：EF Core 默认逐行；高效插入用 SqlBulkCopy / EFCore.BulkExtensions
await db.BulkInsertAsync(list);
await db.BulkUpdateAsync(list);
await db.BulkMergeAsync(list);
```

## 十一、原生 SQL

```csharp
// 查询
var users = await db.Users
    .FromSqlInterpolated($"SELECT * FROM [user] WHERE Id = {id}")
    .AsNoTracking().ToListAsync();

// 非映射类型
var sums = await db.Database
    .SqlQuery<DailySum>($"SELECT date, sum(amount) AS Total FROM orders GROUP BY date")
    .ToListAsync();

// 执行命令
await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM orders WHERE id = {id}");
```

`Interpolated` 自动参数化，**不会 SQL 注入**。

## 十二、事务

```csharp
using var tx = await db.Database.BeginTransactionAsync();
try {
    db.Users.Add(...);
    await db.SaveChangesAsync();
    await db.Database.ExecuteSqlAsync($"...");
    await tx.CommitAsync();
} catch {
    await tx.RollbackAsync();
    throw;
}
```

`SaveChanges` 内部已包事务，多次 `SaveChanges` 想原子需手动事务。

`TransactionScope`：跨多个 DbContext / 跨库（需要 DTC，Linux 不支持）。

## 十三、并发控制

### 乐观并发

```csharp
public class User {
    [Timestamp] public byte[] RowVersion { get; set; } = [];   // SQL Server
}

// 或 Concurrency Token
b.Entity<User>().Property(x => x.Version).IsConcurrencyToken();
```

`SaveChanges` 时 EF 把 `WHERE Id=@p AND RowVersion=@old` 一起写入。冲突抛 `DbUpdateConcurrencyException`，业务层重试或合并。

### 悲观并发

数据库锁，原生 SQL `SELECT ... FOR UPDATE`。

## 十四、全局过滤 / 软删除

```csharp
b.Entity<User>().HasQueryFilter(u => !u.IsDeleted);
// 临时禁用：db.Users.IgnoreQueryFilters()
```

`SaveChangesInterceptor` 在保存前注入：

```csharp
public class AuditInterceptor : SaveChangesInterceptor {
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData e, InterceptionResult<int> r, CancellationToken ct = default) {
        foreach (var x in e.Context!.ChangeTracker.Entries<IAudit>()) {
            if (x.State == EntityState.Added) x.Entity.CreatedAt = DateTime.UtcNow;
            if (x.State == EntityState.Modified) x.Entity.UpdatedAt = DateTime.UtcNow;
        }
        return base.SavingChangesAsync(e, r, ct);
    }
}

builder.Services.AddDbContext<AppDb>(o => o
    .UseSqlServer(conn)
    .AddInterceptors(new AuditInterceptor()));
```

## 十五、值转换 / 拥有实体 / JSON 列

```csharp
// 枚举存字符串
b.Entity<User>().Property(x => x.Status).HasConversion<string>();

// 多值存 JSON
b.Entity<User>().Property(x => x.Tags)
    .HasConversion(
        v => JsonSerializer.Serialize(v, default(JsonSerializerOptions)),
        v => JsonSerializer.Deserialize<List<string>>(v, default(JsonSerializerOptions))!);

// OwnsOne：值对象同表
b.Entity<User>().OwnsOne(u => u.Address, a => {
    a.Property(p => p.City).HasColumnName("city");
});

// JSON 列（EF Core 7+，SQL Server/PostgreSQL/SQLite 部分支持）
b.Entity<User>().OwnsOne(u => u.Profile, p => p.ToJson());
```

## 十六、性能要点

1. `AsNoTracking()` 只读查询；
2. 投影到 DTO，少拉字段；
3. 分页必须做（永远不 `ToList()` 全表）；
4. `AsSplitQuery()` 解多 Include 笛卡尔；
5. 批量用 `ExecuteUpdate/Delete` 或 BulkExtensions；
6. `AddDbContextPool` 复用 Context；
7. 编译查询 `EF.CompileAsyncQuery`；
8. 索引在数据库侧建好；
9. 启用 `EnableSensitiveDataLogging` + Logging 看实际 SQL；
10. 高频实体考虑 `IDbContextFactory<T>` 自己控制生命周期；
11. EF Core 8+ 的复杂查询编译性能已大幅提升。

```csharp
o.EnableSensitiveDataLogging();
o.LogTo(Console.WriteLine, LogLevel.Information);
```

## 十七、常见坑

- N+1 → Include 或投影；
- DbContext 跨线程同时使用 → 异常；
- 一个 Context 修改大量实体 → 内存膨胀，分批 `SaveChanges`；
- `Update()` 整体替换会把 null 也写入；用 `EntityEntry` 局部更新；
- 自动迁移在生产太危险，预演 + 脚本审核；
- LINQ 表达式不可翻译会抛运行时异常（C# 方法调用、复杂 lambda）；
- `DateTime` Kind 不一致；
- `Decimal` 精度默认 18,2，金额要在 Fluent 配；
- 并发冲突要处理 `DbUpdateConcurrencyException`；
- 长事务、跨上下文事务需 TransactionScope（Linux 没 DTC）。

## 十八、检查清单

- 使用 Fluent API 统一配置；
- 所有只读查询 `AsNoTracking()`；
- 分页 + 投影 + 索引；
- 迁移生成 SQL 审核执行；
- `ExecuteUpdate/Delete` 替代手动 select-loop-save；
- 日志看实际 SQL；
- 并发列 + 乐观锁；
- 批量插入用 BulkExtensions；
- 拒绝在 LINQ 里调自定义 C# 方法；
- 单测用 SQLite InMemory 或 Test Server。
