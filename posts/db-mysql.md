---
title: MySQL
date: 2026-06-11
tags: [数据库, MySQL, InnoDB]
summary: 架构、InnoDB、索引、事务/锁/MVCC、SQL 语法、主从复制、慢查询排查与运维。
---

# MySQL

世界使用最广的开源关系数据库。当前主流版本 5.7 / 8.x。分支 MariaDB。

## 一、架构

```
Connectors / Clients
        ↓
Connection Pool / Auth / Threads
        ↓
SQL Layer:
    Parser → Optimizer → Executor → Query Cache(8.0 已移除)
        ↓
Storage Engine API
        ↓
[ InnoDB ] [ MyISAM ] [ Memory ] [ Archive ] [ NDB ] ...
        ↓
        File System
```

存储引擎可插拔。**InnoDB 是默认**：支持事务、外键、行锁、MVCC、崩溃恢复。

| 引擎 | 事务 | 锁 | 用途 |
|---|---|---|---|
| InnoDB | ✓ | 行锁 | 几乎所有场景 |
| MyISAM | ✗ | 表锁 | 只读/历史 |
| Memory | ✗ | 表锁 | 临时缓存 |
| Archive | ✗ | 行锁 | 高压缩归档 |
| NDB | ✓ | 行锁 | 集群 |

## 二、字符集

务必 `utf8mb4`（`utf8` 是 3 字节阉割版，不支持 4 字节字符如 emoji）。

```sql
CREATE DATABASE app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
```

排序规则常用：`utf8mb4_0900_ai_ci`（8.0 默认）/ `utf8mb4_general_ci` / `utf8mb4_unicode_ci` / `utf8mb4_bin`。

## 三、表与类型

```sql
CREATE TABLE user(
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    age TINYINT UNSIGNED,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_email(email),
    KEY idx_name(user_name),
    KEY idx_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;
```

| 类型 | 说明 |
|---|---|
| `TINYINT(1B) / SMALLINT(2B) / INT(4B) / BIGINT(8B)` | 整数，`UNSIGNED` 翻倍 |
| `DECIMAL(p,s)` | 金额 |
| `FLOAT / DOUBLE` | 浮点 |
| `CHAR(n) / VARCHAR(n)` | 字符串 |
| `TEXT / MEDIUMTEXT / LONGTEXT` | 大文本 |
| `BLOB / MEDIUMBLOB / LONGBLOB` | 二进制 |
| `DATETIME(8B) / TIMESTAMP(4B)` | 时间，TIMESTAMP 受时区影响、2038 上限 |
| `DATE / TIME / YEAR` | 单独 |
| `JSON` | 5.7+ 原生 |
| `ENUM / SET` | 枚举（少用） |

## 四、CRUD 与高级 SQL

```sql
-- 分页
SELECT * FROM user ORDER BY id LIMIT 10 OFFSET 20;
-- 大 OFFSET 慢，改延迟关联：
SELECT u.* FROM user u
JOIN (SELECT id FROM user ORDER BY id LIMIT 10 OFFSET 1000000) t
  ON u.id = t.id;

-- UPSERT
INSERT INTO user(id, name) VALUES (1, 'a')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 替代写法（8.0 新语法）
INSERT INTO user(id, name) VALUES (1, 'a') AS new
ON DUPLICATE KEY UPDATE name = new.name;

-- REPLACE：先 delete 再 insert，触发自增、外键
REPLACE INTO user(id, name) VALUES (1, 'a');

-- 批量
INSERT INTO user(name) VALUES('a'),('b'),('c');

-- CTE / 递归（8.0+）
WITH RECURSIVE cte AS (
  SELECT id, manager_id, 0 lvl FROM emp WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.manager_id, c.lvl+1 FROM emp e JOIN cte c ON e.manager_id=c.id
)
SELECT * FROM cte;

-- 窗口函数（8.0+）
SELECT name, score,
  RANK() OVER (PARTITION BY class ORDER BY score DESC) AS rnk
FROM stu;

-- JSON
SELECT JSON_EXTRACT(profile, '$.city'), profile->>'$.city'
FROM user
WHERE profile->>'$.vip' = 'true';

CREATE INDEX idx_city ON user( (CAST(profile->>'$.city' AS CHAR(50))) );
```

## 五、索引

类型：B+ 树（默认）、Hash（Memory）、全文（FULLTEXT）、空间（SPATIAL）。

```sql
CREATE INDEX idx_name ON user(name);
CREATE UNIQUE INDEX uk_email ON user(email);
CREATE INDEX idx_multi ON user(dept_id, age);
ALTER TABLE user ADD FULLTEXT INDEX ft_name(name);
```

InnoDB 聚集索引 = 主键，叶子存整行；二级索引叶子存主键 → 通过主键回表。

要点：
- 主键尽量短、单调递增（用 `BIGINT AUTO_INCREMENT`，不要 UUID 字符串）；
- 最左前缀：`(a,b,c)` 索引可被 `(a)`、`(a,b)`、`(a,b,c)` 利用；
- 覆盖索引：查询字段都在索引里，不回表；
- 索引失效场景：函数包列（`WHERE YEAR(d)=`）、隐式转换、`LIKE '%xx'`、`OR` 跨列；
- 不要给低基数列（性别）建普通索引。

## 六、事务与隔离

InnoDB 默认隔离：**REPEATABLE READ**（MySQL 特例，行为接近 Read Committed + 间隙锁）。

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE id = 1;
UPDATE account SET balance = balance + 100 WHERE id = 2;
COMMIT;          -- 或 ROLLBACK;
```

自动提交：`SET autocommit=0;` 改手动。

### MVCC

InnoDB 通过 undo log + 隐藏列（`DB_TRX_ID`、`DB_ROLL_PTR`）实现快照读。普通 `SELECT` 不加锁，看的是事务开始时的快照。

加锁读：
- `SELECT ... LOCK IN SHARE MODE` / `FOR SHARE`（S 锁）
- `SELECT ... FOR UPDATE`（X 锁）

### 锁

| 锁 | 含义 |
|---|---|
| Record Lock | 单行 |
| Gap Lock | 区间（防止幻读，Read Committed 关闭） |
| Next-Key Lock | Record + Gap |
| Insert Intention | 插入意向 |
| 表级 AUTO-INC | 自增列 |

行锁基于**索引**实现，无索引会退化成表锁（实际上锁所有行）。

死锁：循环等待，InnoDB 自动检测并回滚代价小的一方。`SHOW ENGINE INNODB STATUS\G` 查最近死锁。

## 七、主从复制

```
Master → binlog → Slave I/O thread → relay log → SQL thread → 本地应用
```

binlog 格式：
- **Statement**：记 SQL，小但有不确定函数问题；
- **Row**（推荐）：记行变更；
- **Mixed**：默认混合。

GTID（全局事务 ID）：5.6+，主从切换更可靠。

半同步复制：`semisync_master/slave` 插件，主提交需至少一个 slave 收到 binlog。

组复制 / InnoDB Cluster：8.0 推荐高可用方案；MGR（MySQL Group Replication）+ Router + Shell。

## 八、配置要点（my.cnf / my.ini）

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_0900_ai_ci
default-storage-engine = InnoDB

innodb_buffer_pool_size = 8G          # 物理内存 50-70%
innodb_log_file_size = 1G
innodb_flush_log_at_trx_commit = 1     # 1=ACID，2=每秒刷盘，0=不可靠但快
innodb_flush_method = O_DIRECT
sync_binlog = 1
binlog_format = ROW
binlog_expire_logs_seconds = 604800

max_connections = 500
wait_timeout = 28800

slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1
log_queries_not_using_indexes = 1
```

`innodb_buffer_pool_size` 是最重要的参数，命中率 99%+ 是目标。

## 九、慢查询排查

```sql
EXPLAIN SELECT ...;
EXPLAIN ANALYZE SELECT ...;   -- 8.0.18+
EXPLAIN FORMAT=JSON SELECT ...;
```

`EXPLAIN` 关键列：

| 列 | 含义 |
|---|---|
| `type` | `const > eq_ref > ref > range > index > ALL`（越靠右越糟） |
| `key` | 实际用的索引 |
| `key_len` | 用了几个字节的索引 |
| `rows` | 估算行数 |
| `Extra` | `Using index`（覆盖）、`Using where`、`Using filesort`、`Using temporary` |

工具：`mysqldumpslow`、`pt-query-digest`、Performance Schema、`sys` schema。

## 十、运维

```sql
SHOW PROCESSLIST;                  -- 当前会话
SHOW ENGINE INNODB STATUS\G        -- 引擎状态
SHOW VARIABLES LIKE '...';
SHOW STATUS LIKE '...';
KILL QUERY <id>;  KILL <id>;
```

备份：
- 逻辑：`mysqldump --single-transaction --routines --events`；
- 物理：`Percona XtraBackup` 在线热备；
- 二进制日志增量：`mysqlbinlog`。

监控：Percona PMM、Prometheus + mysqld_exporter、Zabbix。

## 十一、常用函数

```sql
NOW(); CURDATE(); UNIX_TIMESTAMP();
DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s');
DATE_ADD(NOW(), INTERVAL 7 DAY);
DATEDIFF(d1, d2); TIMESTAMPDIFF(SECOND, t1, t2);

CONCAT(a, b); CONCAT_WS('-', a, b);
LEFT/RIGHT/SUBSTRING;  LOWER/UPPER; TRIM; REPLACE;
LENGTH(s); CHAR_LENGTH(s);
GROUP_CONCAT(name SEPARATOR ',');

IFNULL(x, 0); NULLIF(a, b); COALESCE(a, b, c);
CASE WHEN ... THEN ... ELSE ... END;
```

## 十二、常见坑

- `utf8` ≠ `utf8mb4`，新建库永远 `utf8mb4`；
- `LIMIT m, n` 大 offset 慢 → 延迟关联；
- 隐式类型转换：`WHERE phone = 13800000000`（phone 是字符串）→ 全表扫描；
- 行锁需走索引；
- `COUNT(*)` 不要变 `COUNT(列)`，前者 InnoDB 已优化；
- `INSERT...SELECT` 在 RR 隔离会加间隙锁，注意阻塞；
- 字段加索引前评估写入压力；
- 用 `pt-osc` / `gh-ost` 做大表在线 DDL；
- 时区：服务器 `time_zone='+00:00'`，应用统一 UTC。

## 十三、检查清单

- 引擎统一 InnoDB；
- 字符集 utf8mb4；
- 主键 BIGINT 自增；
- 慢日志开启 + 周期分析；
- buffer_pool 设到内存 50-70%；
- 关键表统计 + 定期 ANALYZE；
- 备份与恢复演练；
- 主从延迟监控（`Seconds_Behind_Master`）；
- 升级 5.7 → 8.0 前测试 SQL 兼容性。
