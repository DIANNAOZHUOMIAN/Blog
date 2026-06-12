---
title: PostgreSQL
date: 2026-06-11
tags: [数据库, PostgreSQL, SQL]
summary: 架构、类型系统、索引、MVCC、隔离级别、JSON/数组、扩展生态与运维。
---

# PostgreSQL

世界最强大的开源关系数据库。标准 SQL 兼容度高，类型与功能丰富，扩展生态发达。

## 一、架构概览

```
Client
   ↓ libpq (5432)
Postmaster (主进程)
   ↓ fork
Backend (每连接一个进程)
   ↓
Shared Buffers / WAL / Catalog
Background workers:
   Autovacuum / Checkpointer / WAL Writer / Stats Collector / Logger
```

进程模型（不是线程），连接较重，需要 PgBouncer 之类的连接池。

## 二、数据类型

非常丰富：

| 类型 | 说明 |
|---|---|
| `smallint / int / bigint` | 整数 |
| `numeric(p,s)` / `decimal` | 任意精度 |
| `real / double precision` | 浮点 |
| `serial / bigserial` | 自增（语法糖） |
| `text` / `varchar(n)` / `char(n)` | 字符串（推荐 text） |
| `bytea` | 二进制 |
| `boolean` | 真值 |
| `date / time / timestamp / timestamptz / interval` | 时间 |
| `uuid` | GUID |
| `json / jsonb` | JSON（jsonb 推荐） |
| `array` | 任意类型数组 |
| `range / multirange` | 区间 |
| `inet / cidr / macaddr` | 网络 |
| `point / line / polygon / box` | 几何 |
| `hstore` | 键值（扩展） |
| `tsvector / tsquery` | 全文搜索 |
| `enum` / 复合 / 域类型 | 用户定义 |

`timestamptz` 强制带时区，**永远首选**。

## 三、建表

```sql
CREATE TABLE "user"(
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    age SMALLINT CHECK (age >= 0),
    profile JSONB,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11+ 推荐用 GENERATED ALWAYS AS IDENTITY 替代 serial
CREATE TABLE t(
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ...
);
```

## 四、CRUD 与高级 SQL

```sql
-- 分页
SELECT * FROM "user" ORDER BY id LIMIT 10 OFFSET 20;

-- 键集分页（大 offset 慢，推荐）
SELECT * FROM "user" WHERE id > $1 ORDER BY id LIMIT 10;

-- UPSERT
INSERT INTO "user"(id, name) VALUES(1, 'a')
ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name;

-- RETURNING 取插入/更新值
INSERT INTO "user"(name) VALUES('a') RETURNING id, created_at;
UPDATE "user" SET name='b' WHERE id=1 RETURNING *;

-- CTE / 递归
WITH RECURSIVE cte AS (
    SELECT id, manager_id, 0 lvl FROM emp WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.manager_id, c.lvl+1 FROM emp e JOIN cte c ON e.manager_id=c.id
)
SELECT * FROM cte;

-- 窗口
SELECT name, RANK() OVER (PARTITION BY city ORDER BY score DESC)
FROM stu;

-- LATERAL JOIN（每行计算）
SELECT u.id, recent.title
FROM "user" u
JOIN LATERAL (
    SELECT title FROM post p WHERE p.user_id=u.id ORDER BY p.created_at DESC LIMIT 3
) recent ON true;

-- FILTER 聚合
SELECT
    COUNT(*) FILTER (WHERE vip),
    AVG(score) FILTER (WHERE age >= 18)
FROM "user";

-- GROUPING SETS / ROLLUP / CUBE
SELECT dept, position, SUM(salary)
FROM emp
GROUP BY ROLLUP(dept, position);
```

## 五、JSON / JSONB

`json` 保留原文；`jsonb` 解析为二进制，更快、可索引。

```sql
-- 读
SELECT profile->'city' FROM "user";          -- jsonb
SELECT profile->>'city' FROM "user";          -- text
SELECT profile#>>'{addr,city}' FROM "user";   -- 路径
SELECT profile->'tags'->>0 FROM "user";       -- 数组下标

-- 谓词
SELECT * FROM "user" WHERE profile->>'vip' = 'true';
SELECT * FROM "user" WHERE profile @> '{"vip":true}';        -- 包含
SELECT * FROM "user" WHERE profile ? 'phone';                 -- 含键
SELECT * FROM "user" WHERE profile ?| array['a','b'];

-- 写
UPDATE "user" SET profile = profile || '{"vip":true}'::jsonb;
UPDATE "user" SET profile = jsonb_set(profile, '{addr,city}', '"SH"', true);

-- 索引（GIN）
CREATE INDEX idx_profile ON "user" USING GIN (profile);
CREATE INDEX idx_profile_city ON "user" ((profile->>'city'));
```

## 六、数组

```sql
SELECT tags[1] FROM "user";                  -- 1 based
SELECT * FROM "user" WHERE 'admin' = ANY(tags);
SELECT * FROM "user" WHERE tags && ARRAY['a','b'];   -- 有交集
SELECT array_length(tags, 1) FROM "user";
SELECT unnest(tags) FROM "user";              -- 展开成行
UPDATE "user" SET tags = array_append(tags, 'new') WHERE id=1;
```

## 七、索引

类型：
- **B-tree**（默认）：等值/范围；
- **Hash**：等值（10+ 才崩溃安全）；
- **GIN**（Generalized Inverted Index）：jsonb / 数组 / 全文；
- **GiST**：几何、范围、模糊匹配；
- **SP-GiST**：空间分区；
- **BRIN**（Block Range INdex）：大表按物理顺序排列的近似索引（时序）；
- **Bloom**（扩展）：多列等值。

```sql
CREATE INDEX idx_name ON "user"(name);
CREATE INDEX idx_email_lower ON "user" (LOWER(email));      -- 表达式索引
CREATE INDEX idx_active ON "user"(name) WHERE deleted = false;  -- 部分索引
CREATE INDEX idx_brin ON log USING BRIN (created_at);
CREATE INDEX idx_gin ON "user" USING GIN (profile jsonb_path_ops);
CREATE INDEX CONCURRENTLY idx_xxx ON ... ;  -- 在线建索引，不锁表
```

## 八、事务与隔离

```sql
BEGIN;
UPDATE ...;
COMMIT;       -- 或 ROLLBACK;

SAVEPOINT sp;  ROLLBACK TO sp;  RELEASE sp;

-- 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;       -- 默认
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;          -- SSI 实现，可串行化但用 MVCC

-- 行锁
SELECT ... FOR UPDATE [NOWAIT|SKIP LOCKED];
SELECT ... FOR SHARE;
```

PostgreSQL 用 MVCC：UPDATE 不是原地改而是写新行，旧行成为"死元组"，由 VACUUM 清理。

`SERIALIZABLE` 用 SSI（Serializable Snapshot Isolation），冲突时回滚一个事务（`could not serialize access`），应用要重试。

## 九、Vacuum / Bloat

死元组堆积 → 文件膨胀 → 性能下降。

- **autovacuum**：自动后台清理（默认开启），按阈值触发；
- **VACUUM**：回收空间但不归还 OS；
- **VACUUM FULL**：重写表，独占锁，回收磁盘空间；
- **ANALYZE**：更新统计信息；
- **pg_repack** / **pg_squeeze**：在线整理，不锁表。

监控：`pg_stat_user_tables.n_dead_tup`、`pg_stat_activity`、`pgstattuple`。

## 十、执行计划

```sql
EXPLAIN SELECT ...;
EXPLAIN ANALYZE SELECT ...;        -- 实际执行
EXPLAIN (ANALYZE, BUFFERS, COSTS) ...;
```

算子：`Seq Scan` / `Index Scan` / `Index Only Scan` / `Bitmap Heap Scan` / `Hash Join` / `Merge Join` / `Nested Loop` / `Sort` / `Aggregate`。

工具：[explain.dalibo.com](https://explain.dalibo.com)、`pg_stat_statements` 扩展看慢查询统计。

## 十一、配置（postgresql.conf）

```ini
# 内存
shared_buffers = 25% RAM
effective_cache_size = 50-75% RAM
work_mem = 16MB                    # 排序/Hash 单次
maintenance_work_mem = 1GB         # VACUUM/CREATE INDEX

# 连接
max_connections = 200              # 不要太大，配合 PgBouncer

# WAL
wal_level = replica
max_wal_size = 4GB
checkpoint_completion_target = 0.9

# 复制
hot_standby = on
synchronous_commit = on

# 日志
log_min_duration_statement = 1000  # 慢查询 ms
log_lock_waits = on
log_temp_files = 0

# 自动 vacuum
autovacuum = on
autovacuum_max_workers = 4
```

## 十二、复制与高可用

- **流复制**：主→备，物理日志 WAL；同步/异步可选；
- **逻辑复制**：基于发布/订阅，按表复制，支持跨版本、跨架构；
- **HA 工具**：`Patroni`（最流行）+ `etcd` / `Consul`、`repmgr`、`pg_auto_failover`；
- **代理**：`PgBouncer`（连接池）、`HAProxy`、`pgpool-II`。

```sql
-- 逻辑复制
CREATE PUBLICATION pub FOR TABLE t1, t2;
-- 订阅端
CREATE SUBSCRIPTION sub
  CONNECTION 'host=master dbname=db user=rep password=...'
  PUBLICATION pub;
```

## 十三、分区表

10+ 原生：

```sql
CREATE TABLE log (
    id BIGSERIAL,
    ts TIMESTAMPTZ NOT NULL,
    msg TEXT
) PARTITION BY RANGE (ts);

CREATE TABLE log_2026_06 PARTITION OF log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

类型：`RANGE` / `LIST` / `HASH`。分区裁剪让大表查询只扫相关分区。

## 十四、扩展生态

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS uuid-ossp;
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- 模糊匹配
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS postgis;        -- 地理
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS timescaledb;    -- 时序
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector，向量检索
```

`pg_trgm` 配 GIN 实现 `LIKE '%xx%'` 的模糊查询索引：

```sql
CREATE INDEX idx_name_trgm ON "user" USING GIN (name gin_trgm_ops);
SELECT * FROM "user" WHERE name ILIKE '%ali%';
```

## 十五、备份与恢复

```bash
# 逻辑
pg_dump -Fc db > db.dump            # 自定义格式
pg_restore -d db_new db.dump
pg_dumpall > all.sql                # 含角色

# 物理（基础备份）
pg_basebackup -D /backup -Ft -z -P -X stream

# PITR（基于 WAL 时点恢复）
# 备份 + 持续归档 wal → 恢复时回放
```

## 十六、安全

- 角色 / 权限 / `GRANT` `REVOKE`；
- 行级安全 `CREATE POLICY`；
- `pg_hba.conf` 认证方式（trust/md5/scram-sha-256/cert/peer）；
- TLS；
- 列加密 `pgcrypto`；
- 审计扩展 `pgaudit`。

## 十七、与其他对比

| 项 | PostgreSQL | MySQL |
|---|---|---|
| SQL 标准兼容 | 高 | 中 |
| 复杂查询/分析 | 强 | 一般 |
| JSON | jsonb 一流 | JSON 路径较弱 |
| 复制 | 物理+逻辑 | binlog 物理 |
| 扩展性 | 极强 | 有限 |
| 默认锁 | 行锁+MVCC | 行锁+MVCC |
| 默认隔离 | Read Committed | Repeatable Read |
| 连接成本 | 高（进程） | 低（线程） |

## 十八、检查清单

- 用 `timestamptz` / `text` / `jsonb`；
- 主键 `BIGINT GENERATED ALWAYS AS IDENTITY`；
- `CREATE INDEX CONCURRENTLY` 避免锁表；
- 启用 `pg_stat_statements`，定期看慢查询；
- 应用前面挂 PgBouncer；
- 时序大表分区 + BRIN；
- 模糊匹配用 `pg_trgm` + GIN；
- 复杂运算优先 SQL（窗口、CTE、LATERAL），少打多回；
- 监控 dead_tup、bloat、连接数、复制延迟。
