---
title: SQL Server 详解
date: 2026-06-11
tags: [数据库, SQL Server, T-SQL]
summary: 架构、T-SQL、索引、事务隔离、锁、执行计划、性能调优与运维要点。
---

# SQL Server

微软出品的企业级关系数据库，与 .NET 深度集成。

## 一、版本与组件

| 版本 | 用途 |
|---|---|
| Express | 免费、≤10GB、≤1CPU/1.4GB RAM |
| Web | 托管厂商 |
| Standard | 中小企业 |
| Enterprise | 全功能、不限容量 |
| Developer | Enterprise 等价，仅限开发测试 |
| LocalDB | 进程内嵌入式（开发用） |
| Azure SQL | 云托管 |

组件：数据库引擎、SSMS（管理）、Azure Data Studio、SSIS（ETL）、SSAS（OLAP）、SSRS（报表）、SQL Agent（作业）。

默认端口 1433；浏览服务 1434。

## 二、连接

```csharp
"Server=.\\SQLEXPRESS;Database=db;Integrated Security=True;TrustServerCertificate=True"
"Server=192.168.1.10,1433;Database=db;User Id=sa;Password=...;TrustServerCertificate=True;Encrypt=True"
```

.NET 8+ 默认要求 `Encrypt=True`，自签证书需 `TrustServerCertificate=True`。

## 三、T-SQL 核心

### 1. 表与约束

```sql
CREATE TABLE [User](
    Id INT IDENTITY(1,1) PRIMARY KEY,
    UserName NVARCHAR(50) NOT NULL UNIQUE,
    Email NVARCHAR(100) NOT NULL,
    Age INT CHECK (Age >= 0),
    DeptId INT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_User_Dept FOREIGN KEY (DeptId) REFERENCES Dept(Id)
);
```

主键自增：`IDENTITY(seed,inc)`；`SEQUENCE` 共享序列对象。

### 2. 数据类型

| 类型 | 用途 |
|---|---|
| `INT / BIGINT / TINYINT` | 整数 |
| `DECIMAL(p,s)` / `NUMERIC` | 精确小数（金额） |
| `FLOAT / REAL` | 近似浮点 |
| `BIT` | 0/1 |
| `CHAR / VARCHAR / TEXT` | ASCII |
| `NCHAR / NVARCHAR / NTEXT` | Unicode（推荐） |
| `DATE / TIME / DATETIME2 / DATETIMEOFFSET` | 时间 |
| `UNIQUEIDENTIFIER` | GUID |
| `VARBINARY(MAX)` | 二进制 |
| `XML / JSON（字符串）` | 半结构化 |

`VARCHAR(MAX)` 可达 2GB。优先 `NVARCHAR`，全 Unicode。

### 3. CRUD

```sql
-- 分页（OFFSET FETCH，2012+）
SELECT * FROM [User] ORDER BY Id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;

-- TOP
SELECT TOP 10 * FROM [User] ORDER BY CreatedAt DESC;

-- UPSERT (MERGE)
MERGE [User] T
USING (SELECT 1 AS Id, 'A' AS Name) S ON T.Id = S.Id
WHEN MATCHED THEN UPDATE SET T.Name = S.Name
WHEN NOT MATCHED THEN INSERT(Id, Name) VALUES (S.Id, S.Name);

-- 输出
INSERT INTO [User](Name) OUTPUT INSERTED.Id VALUES('A');

-- CTE / 递归
WITH cte AS (
    SELECT Id, Manager, 0 AS Lvl FROM Emp WHERE Manager IS NULL
    UNION ALL
    SELECT e.Id, e.Manager, c.Lvl+1 FROM Emp e JOIN cte c ON e.Manager = c.Id
)
SELECT * FROM cte;
```

### 4. 窗口函数

```sql
SELECT Name, Score,
       RANK()       OVER(PARTITION BY Class ORDER BY Score DESC) AS Rnk,
       ROW_NUMBER() OVER(PARTITION BY Class ORDER BY Score DESC) AS Rn,
       SUM(Score)   OVER(PARTITION BY Class)                     AS ClassSum,
       LAG(Score)   OVER(PARTITION BY Class ORDER BY Date)       AS PrevScore
FROM Stu;
```

### 5. 字符串 / 时间

```sql
LEN(s); LEFT(s, n); RIGHT(s, n); SUBSTRING(s, start, len);
CONCAT(a, b); CONCAT_WS(',', a, b, c);
REPLACE(s, 'a', 'b'); STUFF(s, start, len, 'x');
FORMAT(GETDATE(), 'yyyy-MM-dd HH:mm:ss');
TRIM(s);  STRING_AGG(Name, ',') WITHIN GROUP (ORDER BY Id);

GETDATE();  SYSUTCDATETIME();  SYSDATETIMEOFFSET();
DATEADD(day, 7, GETDATE()); DATEDIFF(day, a, b);
YEAR(d); MONTH(d); DAY(d); DATEPART(weekday, d);
```

### 6. JSON

```sql
SELECT JSON_VALUE(profile, '$.city')
FROM [User]
WHERE JSON_VALUE(profile, '$.vip') = 'true';

SELECT * FROM OPENJSON(@json) WITH (
    Id INT '$.id', Name NVARCHAR(50) '$.name'
);
```

## 四、索引

```sql
CREATE INDEX IX_User_Email ON [User](Email);
CREATE UNIQUE INDEX UX_User_Name ON [User](UserName);
CREATE INDEX IX_User_Cover ON [User](DeptId) INCLUDE (Name, Email);
CREATE INDEX IX_User_Active ON [User](Email) WHERE IsDeleted = 0;  -- 筛选索引
```

类型：
- **聚集索引**：决定数据物理顺序，每表 1 个，默认主键；
- **非聚集索引**：B+ 树独立结构，叶子存键 + 行定位符；
- **覆盖索引**：把查询要的列都放进索引（`INCLUDE`），避免回表；
- **唯一索引**：约束；
- **筛选索引**：只索引满足条件的行；
- **列存储索引**：分析型查询，列式存储；
- **全文索引**：CONTAINS / FREETEXT 查询。

要点：
- 主键 + 外键自动建索引；
- 高基数列才建索引；
- 写多读少要权衡，索引会拖累 INSERT/UPDATE；
- 定期 `ALTER INDEX REBUILD` 或 `REORGANIZE` 解决碎片。

## 五、事务与隔离级别

```sql
BEGIN TRAN;
UPDATE Account SET Balance -= 100 WHERE Id = 1;
UPDATE Account SET Balance += 100 WHERE Id = 2;
COMMIT TRAN;
-- 或 ROLLBACK TRAN;

SAVE TRAN sp;          -- 部分回滚
ROLLBACK TRAN sp;
```

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 加锁 |
|---|---|---|---|---|
| Read Uncommitted | ✓ | ✓ | ✓ | 不加共享 |
| Read Committed（默认） | ✗ | ✓ | ✓ | 读完释放 |
| Repeatable Read | ✗ | ✗ | ✓ | 保留共享锁 |
| Serializable | ✗ | ✗ | ✗ | 范围锁 |
| Snapshot | ✗ | ✗ | ✗ | MVCC，行版本 |

启用 Snapshot：`ALTER DATABASE db SET ALLOW_SNAPSHOT_ISOLATION ON; SET TRANSACTION ISOLATION LEVEL SNAPSHOT;`。

`READ_COMMITTED_SNAPSHOT` 选项让 Read Committed 也走 MVCC（推荐生产开启）。

## 六、锁

类型：共享 `S`、排他 `X`、更新 `U`、意向 `IS/IX`、模式（行/页/表/数据库）。

死锁：循环等待。SQL Server 会自动检测，牺牲一个会话回滚（错误 1205）。

排查：
- `sp_lock` / `sys.dm_tran_locks`；
- 启用死锁跟踪：`DBCC TRACEON(1222, -1)`；
- 扩展事件（Extended Events）；
- 用 `SET DEADLOCK_PRIORITY LOW` 让本会话先回滚。

## 七、执行计划

```sql
SET STATISTICS IO, TIME ON;
SET SHOWPLAN_XML ON;
-- 或 SSMS 按 Ctrl+M（包含实际计划）
SELECT ...
```

关键算子：
- `Index Seek`：好；
- `Index Scan` / `Table Scan`：可能漏索引；
- `Key Lookup`：回表，可用覆盖索引消除；
- `Hash Match` / `Merge Join` / `Nested Loops`；
- `Sort` / `Stream Aggregate`。

提示：`OPTION(RECOMPILE)`、`WITH(NOLOCK)`、`OPTION(MAXDOP 4)`，慎用。

参数嗅探问题：用 `OPTIMIZE FOR UNKNOWN` 或局部变量重赋。

## 八、存储过程与函数

```sql
CREATE OR ALTER PROCEDURE usp_GetUser
    @Id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [User] WHERE Id = @Id;
END;

EXEC usp_GetUser @Id = 1;
```

函数：标量函数 / 表值函数 / 内联表值函数。

触发器：DML 触发器（AFTER/INSTEAD OF）、DDL 触发器。慎用，调试难。

## 九、高可用

| 方案 | 特点 |
|---|---|
| **Always On Availability Group** | 主流，多副本同步/异步，可读副本 |
| **Failover Cluster Instance** | 共享存储，单实例切换 |
| **Database Mirroring** | 老方案，已弃用 |
| **Log Shipping** | 简单异步备库 |
| **Replication** | 事务/合并/快照 |

## 十、备份与还原

```sql
BACKUP DATABASE db TO DISK = 'D:\bak\db.bak' WITH COMPRESSION, CHECKSUM;
BACKUP LOG db TO DISK = 'D:\bak\db.trn';

RESTORE DATABASE db FROM DISK = 'D:\bak\db.bak' WITH NORECOVERY;
RESTORE LOG db FROM DISK = 'D:\bak\db.trn' WITH RECOVERY;
```

恢复模式：`SIMPLE` / `FULL` / `BULK_LOGGED`。生产 OLTP 用 `FULL` + 定期日志备份。

## 十一、性能调优要点

1. **统计信息**：`UPDATE STATISTICS`，过时统计导致选错计划；
2. **索引碎片**：`sys.dm_db_index_physical_stats`；
3. **TempDB**：拆多个数据文件，避免 GAM/PFS 争用；
4. **MAXDOP / Cost Threshold for Parallelism**：根据 CPU 调整；
5. **慢查询**：`sys.dm_exec_query_stats`、查询存储（Query Store）；
6. **死锁 / 阻塞**：扩展事件；
7. **DMV 监控**：`dm_exec_requests`、`dm_os_wait_stats`；
8. **避免函数包列**：`WHERE YEAR(d)=2026` → 走不了索引，改 `d>= '2026-01-01' AND d<'2027-01-01'`；
9. **`SET NOCOUNT ON`** 减少网络流量；
10. **大表批量删除**：分批 `TOP(10000)` + 等待。

## 十二、安全

- 登录类型：SQL Server 登录 / Windows 集成认证；
- 用户 / 角色 / 架构（schema）；
- 行级安全 (RLS)、列级权限、数据脱敏；
- 透明数据加密 (TDE)、Always Encrypted；
- 审计：SQL Audit + Extended Events。

## 十三、常见错误码

| 码 | 含义 |
|---|---|
| 18456 | 登录失败 |
| 2627 | 唯一约束冲突 |
| 547  | 外键约束冲突 |
| 1205 | 死锁牺牲 |
| 9001 | 日志文件不可用 |
| 8152 | 字符串/二进制数据被截断 |
| 8645 | 等待内存授予超时 |

## 十四、检查清单

- 开 `READ_COMMITTED_SNAPSHOT`；
- 所有大表必须有聚集索引（通常是主键）；
- 监控 Wait Stats、PLE、Query Store；
- 备份 + 还原演练；
- 升级 SQL Server / 客户端时验证 `Encrypt` 参数；
- 日期列用 `DATETIME2` / `DATETIMEOFFSET`，不用 `DATETIME`；
- 主键考虑 `BIGINT IDENTITY` 或顺序 GUID（`NEWSEQUENTIALID()`）。
