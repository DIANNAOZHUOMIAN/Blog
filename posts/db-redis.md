---
title: Redis 详解
date: 2026-06-11
tags: [数据库, Redis, 缓存, NoSQL]
summary: 数据结构、持久化、复制/哨兵/集群、缓存三问题、分布式锁、消息队列与最佳实践。
---

# Redis

内存键值数据库，单线程网络模型（6.0+ 多线程 IO），延迟微秒级。最常用作缓存，但本身能做的远不止。

## 一、数据结构

| 类型 | 命令前缀 | 编码 | 用途 |
|---|---|---|---|
| **String** | SET / GET / INCR | int / embstr / raw | KV、计数器、JSON、二进制 |
| **List** | LPUSH / RPOP | ziplist / quicklist | 队列、栈、消息 |
| **Hash** | HSET / HGET | ziplist / hashtable | 对象字段 |
| **Set** | SADD / SISMEMBER | intset / hashtable | 去重、集合运算 |
| **ZSet（有序集合）** | ZADD / ZRANGE | ziplist / skiplist+hash | 排行榜、延时队列 |
| **Bitmap** | SETBIT / BITCOUNT | string | 签到、布隆 |
| **HyperLogLog** | PFADD / PFCOUNT | string | 基数估算 |
| **Stream** | XADD / XREAD | radix tree | 消息队列（消费组） |
| **Geo** | GEOADD / GEORADIUS | zset | 地理坐标 |
| **Bitfield** | BITFIELD | string | 位域 |

底层多种编码，小数据用紧凑结构（ziplist/intset），变大切换。

### 常用命令

```redis
# 通用
KEYS pattern               # 慎用，O(N)
SCAN 0 MATCH "user:*" COUNT 100
TYPE key
EXISTS key
DEL key
EXPIRE key 60
TTL key
PERSIST key
RENAME k1 k2

# String
SET k v EX 60 NX           # 60s 过期，仅当不存在
GET k
INCR counter
INCRBY counter 10
GETSET k v
MSET k1 v1 k2 v2
MGET k1 k2
APPEND k v
STRLEN k

# Hash
HSET user:1 name a age 18
HGETALL user:1
HGET user:1 name
HINCRBY user:1 age 1
HDEL user:1 name

# List
LPUSH q "a"  "b"
RPOP q
LRANGE q 0 -1
LLEN q
BLPOP q 5                  # 阻塞弹出 5s

# Set
SADD s a b c
SISMEMBER s a
SINTER s1 s2               # 交
SUNION s1 s2               # 并
SDIFF  s1 s2               # 差

# ZSet
ZADD rank 100 alice 90 bob
ZRANGE rank 0 -1 WITHSCORES
ZREVRANGE rank 0 9 WITHSCORES   # Top 10
ZSCORE rank alice
ZINCRBY rank 5 alice
ZRANGEBYSCORE rank 80 100
ZRANGEBYLEX rank '[a' '[z'

# Pub/Sub
SUBSCRIBE chan
PUBLISH chan "hi"

# Stream
XADD mystream * key1 val1
XREAD COUNT 10 STREAMS mystream 0
XGROUP CREATE mystream g1 $
XREADGROUP GROUP g1 c1 COUNT 1 STREAMS mystream >
XACK mystream g1 <id>
```

## 二、持久化

| 方式 | 文件 | 特点 |
|---|---|---|
| **RDB** | dump.rdb | 周期快照，紧凑，启动快；数据可能丢失 |
| **AOF** | appendonly.aof | 命令日志，最多丢 1 秒（fsync everysec）；恢复慢 |
| **RDB+AOF** | 两个文件 | 推荐 |
| **混合持久化** | AOF 头是 RDB | 4.0+ 默认，启动快又准 |

```ini
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes
```

## 三、复制（主从）

```
Master ─── async ───▶ Replica1
                ───▶ Replica2
```

```redis
REPLICAOF host port
INFO replication
```

特点：异步复制（可能丢数据），读写分离，备份。

`min-replicas-to-write 1` `min-replicas-max-lag 10`：写需至少一个副本同步。

## 四、哨兵 Sentinel

监控 + 自动故障转移：

- 3 个以上 sentinel 节点；
- 监控 master + replicas 健康；
- master 不可用时投票选新 master；
- 客户端通过 sentinel 获取最新 master 地址。

```ini
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
```

## 五、集群 Cluster

分片 + 高可用：

- 16384 个 slot，键按 `CRC16(key) % 16384` 分配；
- 多 master，每个 master 负责一部分 slot，各自带 replica；
- 客户端直连，节点返回 MOVED / ASK 重定向；
- 不支持跨槽事务，要用 `{tag}` 强制相同槽（hash tag）：`SET {user:1}:name a`。

```redis
CLUSTER NODES
CLUSTER SLOTS
CLUSTER KEYSLOT key
CLUSTER COUNTKEYSINSLOT 0
```

部署最小：3 master + 3 replica。

## 六、过期与淘汰

每个 key 可设 TTL：`EXPIRE / EXPIREAT / PEXPIRE`。

过期清理：惰性删除（访问时检查） + 定期采样删除。

内存满后按 `maxmemory-policy` 淘汰：

| 策略 | 说明 |
|---|---|
| `noeviction` | 拒绝写，默认 |
| `allkeys-lru` | 所有 key LRU |
| `allkeys-lfu` | 所有 key LFU（4.0+） |
| `allkeys-random` | 随机 |
| `volatile-lru` | 带 TTL 的 LRU |
| `volatile-lfu` | 带 TTL 的 LFU |
| `volatile-ttl` | 优先删 TTL 近的 |
| `volatile-random` | 带 TTL 的随机 |

```ini
maxmemory 4gb
maxmemory-policy allkeys-lru
```

## 七、事务

```redis
MULTI
SET a 1
INCR b
EXEC
```

特点：
- 命令打包发送，按序原子执行（不会被打断）；
- **不是 ACID 中的回滚**：中间命令出错不回滚，应用层自己处理；
- `WATCH key` 实现乐观锁，被改了则 EXEC 返回 nil。

```redis
WATCH balance
val = GET balance
if val < 100: UNWATCH
else:
    MULTI
    DECRBY balance 100
    EXEC
```

## 八、Lua 脚本

原子执行，避免来回：

```redis
EVAL "if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      else return 0 end" 1 lock_key uuid
```

`EVALSHA` + `SCRIPT LOAD` 缓存脚本哈希。

## 九、Pipeline（管道）

多个命令打包一次性发送，减少 RTT：

```csharp
// StackExchange.Redis
var batch = db.CreateBatch();
var t1 = batch.StringSetAsync("a", 1);
var t2 = batch.StringIncrementAsync("c");
batch.Execute();
await Task.WhenAll(t1, t2);
```

与事务区别：pipeline 不保证原子，是性能优化。

## 十、缓存三大问题

### 1. 缓存穿透

查询根本不存在的 key，每次都打 DB。

**对策**：
- 缓存空值（短 TTL）：`SET miss:id "" EX 60`；
- 布隆过滤器：所有合法 key 提前注册到 Bloom，无则直接拒绝；
- 参数校验：非法 ID 直接拦截。

### 2. 缓存击穿

某个**热点 key** 突然失效，并发瞬间打到 DB。

**对策**：
- 互斥锁重建：`SET lock:k "1" EX 5 NX`，拿到锁的线程查 DB 回填，其他线程短暂等待重试；
- 永不过期 + 后台异步刷新；
- 二级缓存（本地 Caffeine + Redis）。

### 3. 缓存雪崩

大量 key **同时过期** / Redis 整体宕机。

**对策**：
- 过期时间加随机扰动：`ttl = base + rand(0..N)`；
- 分级过期；
- Redis 集群高可用 + 限流降级；
- 应用本地缓存兜底。

## 十一、分布式锁

简单版：

```redis
SET lock:resource <uuid> NX EX 10
```

- `NX` 保证只一个客户端拿到；
- `EX` 防止宕机不释放；
- 释放用 Lua 比对 uuid 防止误删别人锁：

```lua
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else return 0 end
```

更健壮：**Redlock**（多 master 同时获取多数节点的锁），有争议（Martin Kleppmann 文章），多数业务场景单实例 + 续约就足够。

实战推荐 `Redisson`（Java）/`StackExchange.Redis` + `RedLockNet`（.NET）/`redsync`（Go）。

## 十二、消息队列

| 方式 | 特点 |
|---|---|
| List + BLPOP | 简单 FIFO，无确认、无消费组 |
| Pub/Sub | 即时广播，不存储、订阅者下线丢消息 |
| **Stream** | 持久化、消费组、ACK、回溯（5.0+，推荐） |

Stream 示例：

```redis
XADD orders * id 1 amount 100
XGROUP CREATE orders grp1 $ MKSTREAM
XREADGROUP GROUP grp1 worker1 COUNT 1 BLOCK 5000 STREAMS orders >
XACK orders grp1 <id>
XPENDING orders grp1            # 未确认
XCLAIM orders grp1 worker2 ...   # 转移所有权
```

## 十三、性能要点

1. **键命名**：`type:entity:id`，统一前缀；
2. **大 key**：单个 string/hash/zset 别超 10MB，否则阻塞；
3. **慢命令**：`KEYS *`、`SUNION big`、`SORT`、`LRANGE big` 用 `SCAN` 替代；
4. **Pipeline + 批量命令**（MSET、HMSET、ZADD 多值）；
5. **连接池**：长连接，复用；
6. **避免大量短 key**：合并到 hash；
7. **monitor 慎用**（实时全量日志，性能影响大）；
8. **AOF rewrite / RDB save** 在低峰期；
9. **6.0+ 多线程 IO**：`io-threads 4`；
10. **客户端缓存**（6.0+ tracking）。

## 十四、监控

```redis
INFO         # 全量信息
INFO memory
INFO stats
INFO clients
INFO replication
SLOWLOG GET 10
SLOWLOG RESET
CLIENT LIST
CLIENT KILL ID <id>
LATENCY DOCTOR
LATENCY HISTORY event-name
MEMORY USAGE key
MEMORY STATS
```

工具：`redis-cli --bigkeys`、`--hotkeys`、`--latency-history`、`redis-stat`、`RedisInsight`、Prometheus exporter。

## 十五、安全

- `requirepass` 设密码；
- `bind` 绑定内网；
- `protected-mode yes`；
- 关掉 / 重命名危险命令：`rename-command FLUSHALL ""`；
- TLS（6.0+）；
- ACL（6.0+）：多用户、细粒度权限。

```ini
user readonly on >pass ~* +@read
```

## 十六、检查清单

- 缓存设 TTL + 随机扰动；
- 大 key 拆分；
- 持久化按场景选择，主从 + 哨兵 / 集群高可用；
- 分布式锁配 uuid + Lua 释放；
- 监控大 key、慢日志、内存、命中率；
- 客户端连接池，prefer Pipeline；
- 集群慎用跨槽事务，必要时用 hash tag。
