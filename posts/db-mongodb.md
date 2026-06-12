---
title: MongoDB
date: 2026-06-11
tags: [数据库, MongoDB, NoSQL, 文档]
summary: 文档模型、CRUD、索引、聚合管道、副本集 / 分片、事务、Schema 设计、常用 .NET 客户端。
---

# MongoDB

文档型 NoSQL，BSON 存储，模式自由。4.0+ 支持多文档事务。

## 一、概念映射

| 关系型 | MongoDB |
|---|---|
| Database | Database |
| Table | Collection |
| Row | Document |
| Column | Field |
| Join | `$lookup` / 嵌入 |
| Foreign Key | DBRef / 引用 |
| Index | Index |

文档示例（BSON）：

```js
{
  _id: ObjectId("..."),
  name: "Alice",
  age: 30,
  tags: ["dev", "wpf"],
  addr: { city: "SH", zip: "200000" },
  createdAt: ISODate("2026-06-11T00:00:00Z")
}
```

`_id` 默认 12 字节 ObjectId（时间戳 + 机器 + 进程 + 计数），可改为 UUID 或自增。

## 二、连接

```
mongodb://user:pass@host1:27017,host2:27017/db?replicaSet=rs0&authSource=admin
mongodb+srv://user:pass@cluster.mongodb.net/db
```

.NET 客户端：

```bash
dotnet add package MongoDB.Driver
```

```csharp
var client = new MongoClient("mongodb://localhost:27017");
var db = client.GetDatabase("app");
var users = db.GetCollection<User>("user");

await users.InsertOneAsync(new User{ Name="Alice", Age=30 });
var u = await users.Find(u => u.Name == "Alice").FirstOrDefaultAsync();
```

## 三、CRUD

```js
// 插入
db.user.insertOne({ name: "a", age: 18 })
db.user.insertMany([{...}, {...}])

// 查询
db.user.find({})                       // 全部
db.user.find({ age: { $gt: 18 } })
db.user.find({ "addr.city": "SH" })    // 嵌套字段
db.user.find({ tags: "dev" })          // 数组包含
db.user.find({ tags: { $all: ["dev","wpf"] } })
db.user.find({ name: /^A/i })          // 正则
db.user.find({}, { name: 1, _id: 0 })  // 投影
   .sort({ age: -1 }).skip(20).limit(10)

// 更新
db.user.updateOne({ _id: 1 }, { $set: { age: 31 } })
db.user.updateMany({}, { $inc: { age: 1 } })
db.user.updateOne({ _id: 1 }, { $push: { tags: "go" } })
db.user.updateOne({ _id: 1 }, { $pull: { tags: "old" } })
db.user.updateOne({ _id: 1 }, { $addToSet: { tags: "dev" } })

// 替换 / Upsert
db.user.replaceOne({ _id: 1 }, { name: "x", age: 0 })
db.user.updateOne({ _id: 1 }, { $set: {...} }, { upsert: true })

// 删除
db.user.deleteOne({ _id: 1 })
db.user.deleteMany({ age: { $lt: 0 } })

// 计数 / 是否存在
db.user.countDocuments({})
db.user.estimatedDocumentCount()      // 元数据快速估算
```

### 查询操作符

| 操作符 | 用途 |
|---|---|
| `$eq $ne $gt $gte $lt $lte` | 比较 |
| `$in $nin` | 集合 |
| `$and $or $not $nor` | 逻辑 |
| `$exists` | 字段存在 |
| `$type` | 类型 |
| `$regex` | 正则 |
| `$expr` | 引用其他字段 |
| `$mod $size $all $elemMatch` | 数组 |
| `$text` | 全文（需文本索引） |
| `$geoNear $near` | 地理 |

### 更新操作符

| 操作符 | 用途 |
|---|---|
| `$set $unset` | 设置/删除字段 |
| `$inc $mul` | 算术 |
| `$min $max` | 比较取 |
| `$rename` | 改名 |
| `$push $pull $addToSet $pop` | 数组 |
| `$each $slice $sort $position` | $push 修饰 |
| `$currentDate` | 当前时间 |
| `$bit` | 位运算 |

## 四、索引

```js
db.user.createIndex({ name: 1 })                       // 升序
db.user.createIndex({ name: 1, age: -1 })              // 复合
db.user.createIndex({ email: 1 }, { unique: true })
db.user.createIndex({ profile: 1 }, { sparse: true })   // 稀疏（字段存在才索引）
db.user.createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 })  // TTL
db.user.createIndex({ name: "text", desc: "text" })     // 全文
db.user.createIndex({ loc: "2dsphere" })                // 地理
db.user.createIndex({ "$**": "text" })                  // 通配符

db.user.getIndexes()
db.user.dropIndex("idx_name")

db.user.find({ name: "Alice" }).explain("executionStats")
```

索引设计与 SQL 类似：等值前置，范围在后，最左前缀。

覆盖查询：投影中所有字段都在索引里，无需读文档。

## 五、聚合管道（Aggregation）

```js
db.order.aggregate([
  { $match: { status: "paid" } },
  { $group: {
      _id: "$userId",
      total: { $sum: "$amount" },
      cnt: { $sum: 1 }
  }},
  { $sort: { total: -1 } },
  { $limit: 10 },
  { $lookup: {
      from: "user",
      localField: "_id",
      foreignField: "_id",
      as: "user"
  }},
  { $unwind: "$user" },
  { $project: { name: "$user.name", total: 1, cnt: 1 } }
])
```

常用阶段：

| 阶段 | 作用 |
|---|---|
| `$match` | 过滤 |
| `$project` | 字段选择/计算 |
| `$group` | 分组 |
| `$sort` | 排序 |
| `$limit / $skip` | 分页 |
| `$unwind` | 数组展开 |
| `$lookup` | "左连接" |
| `$facet` | 多管道并行（同时统计多种） |
| `$bucket / $bucketAuto` | 分桶 |
| `$addFields / $set` | 新增字段 |
| `$count` | 计数 |
| `$out / $merge` | 写入新集合 |
| `$graphLookup` | 递归图查询 |

聚合表达式：`$sum / $avg / $min / $max / $push / $addToSet / $first / $last`、算术 / 字符串 / 日期 / 条件 (`$cond`/`$switch`) 大量函数。

## 六、Schema 设计

模式自由不代表无设计，反而要根据访问模式权衡：

### 嵌入（Embedded）

```js
{ _id: 1, name: "Alice",
  orders: [ { id: 1, amount: 100 }, { id: 2, amount: 50 } ]
}
```

适合：1-many、文档大小可控（≤16MB）、一起读写、子项独立访问少。

### 引用（Reference）

```js
// user
{ _id: 1, name: "Alice" }
// order
{ _id: 100, userId: 1, amount: 100 }
```

适合：多对多、子项独立频繁更新、文档可能很大。

实践：
- 一对少 → 嵌入数组；
- 一对多 → 引用 + `$lookup`；
- 一对超多 → 子集模式 / 引用；
- 频繁更新的子项独立存；
- 反范式（冗余）按读多写少权衡。

## 七、副本集（Replica Set）

3 节点起步：1 Primary + 2 Secondary（或加 Arbiter）。

```
Primary  ⇄  Secondary  ⇄  Secondary
   ↓ oplog 复制
```

特点：
- 自动选举主节点（Raft 风格）；
- 客户端写主、读偏好可配置（`primary / secondaryPreferred / nearest`）；
- 写关注（write concern）：`w: 1` / `majority`；
- 读关注（read concern）：`local / available / majority / linearizable`；
- oplog 容量影响新副本同步窗口。

```js
rs.status()
rs.conf()
rs.add("host:port")
rs.stepDown()
```

## 八、分片（Sharding）

水平扩展：

```
mongos (路由) → shard 1 (replica set)
              → shard 2 (replica set)
              → shard 3 (replica set)
config servers (元数据 replica set)
```

```js
sh.enableSharding("app")
sh.shardCollection("app.user", { _id: "hashed" })  // 哈希分片，均匀
sh.shardCollection("app.log", { ts: 1 })            // 范围分片
```

片键（shard key）一旦选定难改（4.4+ 可改），要选高基数 + 写均匀 + 查询常用维度。

## 九、事务

4.0+ 副本集，4.2+ 分片集群支持多文档事务：

```js
const session = client.startSession()
try {
  session.startTransaction()
  db.a.insertOne({...}, { session })
  db.b.updateOne({...}, { $inc:{n:1} }, { session })
  await session.commitTransaction()
} catch {
  await session.abortTransaction()
} finally {
  session.endSession()
}
```

C#：

```csharp
using var session = await client.StartSessionAsync();
session.StartTransaction();
try {
    await coll.InsertOneAsync(session, doc);
    await session.CommitTransactionAsync();
} catch { await session.AbortTransactionAsync(); throw; }
```

事务有 60s 默认超时，开销大，仅必要时使用。多数场景嵌入式设计避免事务。

## 十、变更流（Change Streams）

订阅集合变化（基于 oplog），实现实时同步：

```js
const cs = db.user.watch([{ $match: { operationType: "insert" } }])
for await (const c of cs) console.log(c.fullDocument)
```

类似 CDC，可触发后续处理。

## 十一、备份

- `mongodump` / `mongorestore`：BSON 导出导入；
- 文件系统快照 + WT 检查点；
- `mongodump --oplog` + `restore --oplogReplay`：一致性时点；
- 商业方案：Ops Manager / Cloud Manager / Atlas Backup。

## 十二、性能要点

1. **索引覆盖**：减少回读；
2. **避免大文档**：靠近 16MB 时拆分；
3. **避免无界数组**（持续 `$push`）→ 单独集合；
4. **批量操作**：`insertMany`、`bulkWrite`；
5. **投影**：只取需要字段；
6. **读偏好**：可走副本分散读；
7. **Sharding 后查询带 shard key**；
8. **WT 引擎**：`storage.wiredTiger.engineConfig.cacheSizeGB` 设到 50% RAM；
9. **`explain("executionStats")`** 看是否走索引、扫描行数；
10. **`mongostat / mongotop`** 实时监控。

## 十三、安全

- 启用认证：`security.authorization: enabled`；
- 角色：`read / readWrite / dbAdmin / userAdmin / clusterAdmin` 等，可自定义；
- TLS；
- IP 白名单；
- 字段级加密（CSE / Queryable Encryption）。

## 十四、.NET 实战要点

```csharp
public class User {
    [BsonId] [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    [BsonElement("name")] public string Name { get; set; } = "";
    public int Age { get; set; }
    [BsonIgnoreIfNull] public string[]? Tags { get; set; }
    [BsonRepresentation(BsonType.DateTime)]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

var filter = Builders<User>.Filter.Gte(u => u.Age, 18);
var update = Builders<User>.Update.Set(u => u.Age, 30)
                                  .Push(u => u.Tags, "vip");

await users.UpdateOneAsync(filter, update);

// LINQ
var q = await users.AsQueryable()
                   .Where(u => u.Age > 18)
                   .OrderBy(u => u.Name)
                   .ToListAsync();

// 事务（必须连副本集）
using var s = await client.StartSessionAsync();
s.StartTransaction();
...
await s.CommitTransactionAsync();
```

## 十五、常见坑

- 副本集才有事务；
- 索引大小要看内存能否装下（影响性能）；
- 无 schema 不等于不用约束，否则数据脏；
- `$lookup` 性能不如关系库 JOIN，避免热点；
- 大量小写入压 oplog；
- `_id` 默认 ObjectId 类型，C# 用 `string` 要标注 `BsonRepresentation`；
- 时间统一 UTC，BSON 不带时区；
- 分片片键选错代价巨大。

## 十六、检查清单

- 写入前规划访问模式，决定嵌入/引用；
- 每个查询确认走索引；
- 副本集 3 节点起步；
- 大集合分片，片键选好；
- 写关注 `majority` 保证持久；
- 启用认证 + TLS；
- 定期 `mongodump` 或快照备份；
- 监控 oplog 窗口、副本延迟、连接数、慢查询。
