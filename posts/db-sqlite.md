---
title: SQLite
date: 2026-06-11
tags: [数据库, SQLite, 嵌入式]
summary: 单文件嵌入式数据库的架构、类型亲和性、WAL、事务、限制与最佳实践。
---

# SQLite

进程内嵌入式数据库，单个 `.db` 文件，无服务器、零配置、跨平台。世界部署最广的数据库（手机、浏览器、IoT、桌面应用都在用）。

## 一、核心特点

- **库而非服务**：链接到应用进程，无独立服务；
- **单文件**：所有表、索引、视图都在一个文件里；
- **跨平台**：C 编写，几乎所有平台都能跑；
- **公有领域**：完全免费；
- **小**：核心库 < 1MB；
- **稳定**：通过 100% 分支覆盖测试。

适合：移动 App 本地存储、桌面应用、原型/测试、配置/缓存、小型只读发布。

不适合：高并发写入、客户端-服务器架构、超大数据。

## 二、安装与连接

无需安装，库即数据库。

CLI：

```bash
sqlite3 app.db
sqlite> .tables
sqlite> .schema user
sqlite> .mode column
sqlite> .headers on
sqlite> .quit
```

.NET：

```bash
dotnet add package Microsoft.Data.Sqlite
```

```csharp
using Microsoft.Data.Sqlite;

using var conn = new SqliteConnection("Data Source=app.db");
conn.Open();
var cmd = conn.CreateCommand();
cmd.CommandText = "SELECT name FROM user WHERE id = $id";
cmd.Parameters.AddWithValue("$id", 1);
using var r = cmd.ExecuteReader();
while (r.Read()) Console.WriteLine(r.GetString(0));
```

连接字符串：`Data Source=app.db;Mode=ReadWriteCreate;Cache=Shared;Pooling=True`。

## 三、类型亲和性（弱类型）

SQLite 列只是"建议类型"，实际值可以是任何类型。存储类：

| 存储类 | 说明 |
|---|---|
| NULL | 空 |
| INTEGER | 1/2/3/4/6/8 字节整数 |
| REAL | 8 字节浮点 |
| TEXT | 字符串（UTF-8/UTF-16） |
| BLOB | 原始二进制 |

类型亲和性（声明类型如何映射）：

| 声明 | 亲和性 |
|---|---|
| INT, INTEGER, BIGINT, ... | INTEGER |
| TEXT, CLOB, VARCHAR, ... | TEXT |
| REAL, DOUBLE, FLOAT | REAL |
| BLOB / 无类型 | BLOB |
| NUMERIC, DECIMAL, DATE, ... | NUMERIC |

```sql
CREATE TABLE t(x INTEGER, y TEXT);
INSERT INTO t VALUES('hello', 123);   -- 不报错！INTEGER 列存了字符串
```

强类型表（3.37+）：`CREATE TABLE t(...) STRICT;` 拒绝类型不匹配。

主键：`INTEGER PRIMARY KEY` 是 rowid 别名，自动增长。`AUTOINCREMENT` 多一个 `sqlite_sequence` 跟踪，一般不需要。

## 四、CRUD 与 SQL

支持大多数 SQL92，外加 CTE、窗口函数（3.25+）、UPSERT、JSON（3.38+）。

```sql
CREATE TABLE user(
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

-- UPSERT (3.24+)
INSERT INTO user(id, name) VALUES(1, 'a')
ON CONFLICT(id) DO UPDATE SET name = excluded.name;

-- 分页
SELECT * FROM user ORDER BY id LIMIT 10 OFFSET 20;

-- 窗口
SELECT name, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM user;

-- CTE 递归
WITH RECURSIVE seq(x) AS (
    SELECT 1 UNION ALL SELECT x+1 FROM seq WHERE x < 10
) SELECT x FROM seq;

-- JSON (3.38+)
SELECT json_extract(profile, '$.city') FROM user;
SELECT * FROM user WHERE profile->>'vip' = 'true';
```

时间没有专门类型，存 TEXT (ISO 8601) 或 INTEGER (Unix 秒)：

```sql
SELECT datetime('now'), date('now'), time('now');
SELECT datetime('now', '+7 days', 'localtime');
SELECT strftime('%Y-%m-%d %H:%M:%S', 'now');
SELECT unixepoch();    -- 3.38+
```

## 五、PRAGMA

调整运行参数：

```sql
PRAGMA journal_mode = WAL;          -- 切换到 WAL，并发更好
PRAGMA synchronous = NORMAL;        -- 平衡耐久性与速度
PRAGMA foreign_keys = ON;           -- 启用外键（默认关）
PRAGMA cache_size = -64000;         -- 缓存 64MB（负数=KB）
PRAGMA mmap_size = 268435456;       -- 内存映射 256MB
PRAGMA page_size = 4096;            -- 创建库前设
PRAGMA busy_timeout = 5000;         -- 锁等待超时 ms

PRAGMA integrity_check;             -- 完整性
PRAGMA quick_check;
PRAGMA optimize;                    -- 自动维护
PRAGMA wal_checkpoint(TRUNCATE);
VACUUM;                             -- 整理文件
```

## 六、WAL（Write-Ahead Logging）

3.7+ 引入 WAL 模式，写并发显著提升：

```text
默认 rollback journal：
    写时：先 copy 原页到 -journal，写新页 → 多个读者阻塞写

WAL：
    写时：追加新页到 -wal 文件 → 读者照样从主库读旧版本
    检查点（checkpoint）：把 -wal 内容回写主库
```

优点：
- 读写不互相阻塞；
- 多读者并行；
- 写入快（顺序追加）；
- crash 安全。

代价：
- 检查点期间写者短暂等待；
- 需读 + 写 + ckpt 三种锁；
- 文件多两个（`-wal`、`-shm`）；
- 不支持网络文件系统（NFS、SMB）。

启用：`PRAGMA journal_mode = WAL;`（持久，下次打开仍生效）。

## 七、事务

```sql
BEGIN;
INSERT ...;
UPDATE ...;
COMMIT;          -- 或 ROLLBACK;

SAVEPOINT sp;    -- 嵌套
RELEASE sp;
ROLLBACK TO sp;
```

事务类型：`DEFERRED`（默认，惰性）、`IMMEDIATE`（立即获取写锁，避免后续升级失败）、`EXCLUSIVE`（独占）。

每次写都隐式 `BEGIN/COMMIT`，包大量写在一个事务里能从每秒几百 TPS 提升到几万。

```csharp
using var tx = conn.BeginTransaction();
foreach (var item in items) {
    cmd.Parameters["$x"].Value = item;
    cmd.ExecuteNonQuery();
}
tx.Commit();
```

## 八、并发模型

- **数据库级锁**：UNLOCKED / SHARED / RESERVED / PENDING / EXCLUSIVE；
- 默认模式下：多读 OR 单写；
- WAL 模式：多读 + 单写并行；
- 没有行级锁，因此**不适合高并发写**；
- `busy_timeout` 自动重试等待。

进程内多线程：`SqliteConnection` 每线程独立；或开启 `Threading mode=Multi-thread/Serialized`。

## 九、索引

```sql
CREATE INDEX idx_name ON user(name);
CREATE UNIQUE INDEX uk_email ON user(email);
CREATE INDEX idx_partial ON user(name) WHERE deleted = 0;   -- 部分索引
CREATE INDEX idx_expr ON user(LOWER(email));                -- 表达式索引

ANALYZE;       -- 收集统计
EXPLAIN QUERY PLAN SELECT ...;
```

`WITHOUT ROWID` 表：去掉 rowid，主键即聚簇，节省空间。

## 十、限制

- 单库 281 TB 上限（实际远到不了）；
- 单行 1GB；
- 不支持 `RIGHT JOIN` / `FULL JOIN`（3.39 之前），3.39+ 支持；
- 不支持 ALTER TABLE 删列（早期版本），3.35+ 支持 `DROP COLUMN`；
- 不支持完整权限系统；
- 多写并发受限；
- 不适合大量小客户端各自打开同一文件；
- 没有内置网络协议（要用 Litestream / rqlite / sqld 之类工具复制）。

## 十一、扩展生态

- **Litestream**：实时把 SQLite 流式备份到 S3；
- **LiteFS**：分布式文件系统包装，多节点读复制；
- **Cloudflare D1**：基于 SQLite 的边缘数据库；
- **sqlite-vss / sqlite-vec**：向量搜索；
- **JSON / FTS5 / R*Tree / Geopoly**：内置扩展。

## 十二、备份与恢复

```bash
# 简单复制（必须无人写入或用 .backup）
cp app.db backup.db

# CLI 在线备份
sqlite3 app.db ".backup 'backup.db'"

# 导出 SQL
sqlite3 app.db .dump > dump.sql

# 导入
sqlite3 new.db < dump.sql

# .NET API
src.BackupDatabase(dst);
```

## 十三、性能要点

1. 批量写包事务（10x~100x 提升）；
2. WAL 模式 + `synchronous=NORMAL`；
3. `PRAGMA mmap_size` 大点；
4. 主键用 `INTEGER PRIMARY KEY`；
5. 索引选择最左前缀；
6. 短连接 = 反模式，长连接复用；
7. 避免 `SELECT *`；
8. 大批写关 `PRAGMA temp_store = MEMORY`、`PRAGMA cache_size`；
9. 索引大查询前 `ANALYZE`。

## 十四、常见坑

- 文件锁：Windows 反病毒扫描会持锁；
- 跨进程访问 NFS 文件 → 损坏风险；
- 默认 `foreign_keys = OFF`；
- 类型亲和性导致存进字符串看起来像数字；
- 多连接同一库时打开/关闭文件次数多，性能下降，复用连接；
- `DateTime` 存 TEXT 易解析错误，统一 ISO 8601；
- 时区：自己管理。

## 十五、检查清单

- 启用 WAL + `synchronous=NORMAL`；
- 启用 `foreign_keys`；
- 主键 INTEGER；
- 大批写入用事务；
- 定期 `PRAGMA optimize` + `VACUUM`；
- 备份用 `.backup` 或 Litestream；
- 移动端：单文件 + 加密（SEE/SQLCipher）。
