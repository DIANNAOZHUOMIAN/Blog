---
title: ADO.NET 数据库连接
date: 2026-06-23
tags: [数据库, ADO.NET, SQL Server, C#]
summary: 连接字符串与 App.config、ADO.NET 五大对象、参数化查询防 SQL 注入、DataReader vs DataSet、using 释放连接。
---

# ADO.NET 数据库连接

ADO.NET 是 .NET 访问关系型数据库的底层 API。EF Core / SqlSugar 等 ORM 都构建在它之上——理解它有助于看透 ORM 的本质。本文以 SQL Server（`System.Data.SqlClient` / `Microsoft.Data.SqlClient`）为例。

## 一、连接字符串放进 App.config

把连接字符串集中到配置文件，便于切换环境、避免硬编码：

```xml
<connectionStrings>
  <!-- Windows 身份验证 -->
  <add name="connString"
       connectionString="Data Source=.;Initial Catalog=bookdb;Integrated Security=True"
       providerName="System.Data.SqlClient" />
  <!-- SQL Server 身份验证 -->
  <add name="sqlAuth"
       connectionString="Data Source=.;Initial Catalog=bookdb;User ID=sa;Password=123456"
       providerName="System.Data.SqlClient" />
</connectionStrings>
```

代码中读取：

```csharp
string connString = ConfigurationManager
    .ConnectionStrings["connString"].ConnectionString;
```

> `Data Source=.` 中的 `.` 表示本机默认实例。生产环境的密码应加密（DPAPI / 用户机密），切勿明文提交到仓库。

## 二、ADO.NET 五大对象

| 对象 | 职责 |
|---|---|
| `Connection` | 建立/管理数据库连接 |
| `Command` | 执行 SQL / 存储过程 |
| `DataReader` | 只进只读、逐行读取，**快、省内存** |
| `DataAdapter` | 连接 `Command` 与 `DataSet` 的桥梁 |
| `DataSet` | 内存中的数据集（断开式，含多表关系） |

## 三、连接并查询（参数化，防注入）

```csharp
using System.Data.SqlClient;

using var conn = new SqlConnection(connString);
conn.Open();

// ✅ 参数化查询：把用户输入当"数据"而非"代码"
string sql = "SELECT * FROM [user] WHERE user_name=@name AND password=@pwd";
using var cmd = new SqlCommand(sql, conn);
cmd.Parameters.AddWithValue("@name", txtUsername.Text.Trim());
cmd.Parameters.AddWithValue("@pwd", txtPassword.Text.Trim());

using var reader = cmd.ExecuteReader();
while (reader.Read())
{
    Console.WriteLine(reader["user_name"]);
    Console.WriteLine(reader.GetInt32(reader.GetOrdinal("id")));
}
```

`using` 保证 `Connection`/`Command`/`DataReader` 用完即关、归还连接池。

## 四、为什么必须参数化 —— SQL 注入

字符串拼接是高危写法：

```csharp
// ❌ 危险：用户输入直接拼进 SQL
string bad = string.Format(
    "SELECT * FROM [user] WHERE user_name='{0}' AND password='{1}'",
    txtUsername.Text, txtPassword.Text);
```

如果密码框输入 `' OR '1'='1`，SQL 就变成 `... AND password='' OR '1'='1'`——条件恒真，**无密码登录**。参数化后，输入永远被当成纯数据，注入失效。这是安全底线，没有例外。

## 五、Command 的三种执行方法

```csharp
int rows = cmd.ExecuteNonQuery();        // INSERT/UPDATE/DELETE，返回受影响行数
object val = cmd.ExecuteScalar();        // 返回单个值（如 COUNT(*)）
SqlDataReader r = cmd.ExecuteReader();   // 返回结果集
```

增删改示例：

```csharp
using var cmd = new SqlCommand(
    "INSERT INTO stuInfo(stuName, age, birthday) VALUES(@n, @a, GETDATE())", conn);
cmd.Parameters.AddWithValue("@n", "张三");
cmd.Parameters.AddWithValue("@a", 20);
int affected = cmd.ExecuteNonQuery();
```

## 六、DataReader vs DataSet

| | DataReader | DataSet |
|---|---|---|
| 模式 | 连接式（连接需保持） | 断开式（取完即可断开） |
| 方向 | 只进只读 | 可随机访问、可改 |
| 内存 | 一次一行，省 | 全量加载到内存 |
| 适用 | 大结果集、只读遍历 | 需要离线缓存/多表关系 |

```csharp
var ds = new DataSet();
using var adapter = new SqlDataAdapter("SELECT * FROM book", conn);
adapter.Fill(ds, "book");
DataTable table = ds.Tables["book"];   // 离线操作，可绑定到 DataGridView
```

## 七、事务

```csharp
using var tx = conn.BeginTransaction();
try
{
    var cmd = new SqlCommand("UPDATE acct SET bal = bal - 100 WHERE id=1", conn, tx);
    cmd.ExecuteNonQuery();
    // ... 第二笔
    tx.Commit();
}
catch
{
    tx.Rollback();
    throw;
}
```

## 速记

- 连接串入 `App.config`，用 `ConfigurationManager` 读取。
- 五大对象：Connection / Command / DataReader / DataAdapter / DataSet。
- **永远参数化**，杜绝字符串拼接 SQL。
- `using` 释放连接；只读遍历用 `DataReader`，离线缓存用 `DataSet`。
- 上层封装见 [EF Core](ef-core.html) / [SqlSugar](sqlsugar.html)；SQL 语法见 [SQL Server](sql-server.html)。
