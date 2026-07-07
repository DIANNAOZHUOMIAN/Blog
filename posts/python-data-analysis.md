---
title: Python 数据分析（NumPy / Pandas）
date: 2026-06-14
tags: [Python, NumPy, Pandas, 数据分析]
summary: NumPy 数组与向量化、Pandas DataFrame 读写、筛选、分组聚合、合并与可视化入门。
---

# Python 数据分析（NumPy / Pandas）

数据科学三件套：**NumPy**（数值数组）、**Pandas**（表格数据）、**Matplotlib**（绘图）。

```bash
pip install numpy pandas matplotlib
```

## 一、NumPy：数组与向量化

```python
import numpy as np

a = np.array([1, 2, 3, 4])
np.zeros((2, 3)); np.ones(5); np.full((2, 2), 7)
np.arange(0, 10, 2)            # [0 2 4 6 8]
np.linspace(0, 1, 5)          # 5 等分
np.random.rand(3, 3)          # 均匀分布
np.random.randn(100)          # 标准正态

a.shape; a.dtype; a.ndim; a.size
a.reshape(2, 2)
a.astype(np.float64)
```

向量化：对整个数组运算，比 Python 循环快几十倍：

```python
a = np.array([1, 2, 3, 4])
a * 2                         # [2 4 6 8]
a + a                         # 逐元素
np.sqrt(a); np.exp(a); np.sin(a)
a.sum(); a.mean(); a.std(); a.max(); a.min()
a[a > 2]                      # 布尔索引 -> [3 4]
a[a > 2] = 0                  # 条件赋值

# 二维与轴
m = np.arange(12).reshape(3, 4)
m.sum(axis=0)                 # 按列求和
m.sum(axis=1)                 # 按行求和
m[1, :]; m[:, 2]; m[0:2, 1:3] # 切片
m.T                           # 转置
m @ m.T                       # 矩阵乘法
```

## 二、Pandas 核心结构

```python
import pandas as pd

# Series：带索引的一维
s = pd.Series([10, 20, 30], index=["a", "b", "c"])

# DataFrame：二维表
df = pd.DataFrame({
    "name": ["Alice", "Bob", "Cara"],
    "age": [30, 25, 35],
    "city": ["北京", "上海", "北京"],
})
```

## 三、读写数据

```python
df = pd.read_csv("data.csv")              # 也有 read_excel / read_json / read_sql
df = pd.read_csv("data.csv", encoding="utf-8", parse_dates=["date"])
df.to_csv("out.csv", index=False)
df.to_excel("out.xlsx", index=False)      # 需 openpyxl
```

## 四、查看与选择

```python
df.head(); df.tail(3); df.sample(5)
df.shape; df.columns; df.dtypes; df.info(); df.describe()

df["age"]                     # 单列 -> Series
df[["name", "age"]]           # 多列 -> DataFrame
df.iloc[0]                    # 按位置取行
df.iloc[0:3, 1:3]
df.loc[df["age"] > 28]        # 按标签/条件
df.at[0, "name"]              # 单元格
```

## 五、筛选与新列

```python
df[df["age"] > 28]
df[(df["age"] > 28) & (df["city"] == "北京")]
df[df["city"].isin(["北京", "深圳"])]
df[df["name"].str.startswith("A")]

df["age_next"] = df["age"] + 1            # 新列
df["level"] = df["age"].apply(lambda a: "老" if a > 30 else "青")
df["tag"] = np.where(df["age"] > 30, "A", "B")
```

## 六、缺失值与清洗

```python
df.isna().sum()               # 每列缺失数
df.dropna()                   # 删含缺失的行
df.fillna(0)                  # 填充
df["age"].fillna(df["age"].mean())
df.drop_duplicates()
df.rename(columns={"name": "姓名"})
df["age"] = df["age"].astype(int)
df.sort_values("age", ascending=False)
```

## 七、分组聚合（核心）

```python
df.groupby("city")["age"].mean()
df.groupby("city").agg(
    人数=("name", "count"),
    平均年龄=("age", "mean"),
    最大年龄=("age", "max"),
)
df.groupby(["city", "level"]).size()

# 透视表
df.pivot_table(values="age", index="city", columns="level", aggfunc="mean")

# 值计数
df["city"].value_counts()
```

## 八、合并与连接

```python
pd.concat([df1, df2])                     # 纵向堆叠
pd.concat([df1, df2], axis=1)             # 横向

pd.merge(orders, users, on="user_id", how="left")   # SQL 风格 join
# how: inner / left / right / outer
```

## 九、时间序列

```python
df["date"] = pd.to_datetime(df["date"])
df.set_index("date", inplace=True)
df.resample("M").sum()         # 按月重采样
df["2026-06"]                  # 按时间切片
df["date"].dt.year; df["date"].dt.dayofweek
```

## 十、可视化入门

```python
import matplotlib.pyplot as plt

# pandas 直接画
df["age"].plot(kind="hist")
df.groupby("city")["age"].mean().plot(kind="bar")

# matplotlib
plt.figure(figsize=(8, 4))
plt.plot(x, y, label="趋势")
plt.scatter(x, y)
plt.xlabel("x"); plt.ylabel("y"); plt.title("标题")
plt.legend(); plt.grid(True)
plt.savefig("chart.png", dpi=150)
plt.show()
```

中文乱码：`plt.rcParams["font.sans-serif"] = ["SimHei"]`、`plt.rcParams["axes.unicode_minus"] = False`。

## 十一、透视表与交叉表

```python
# 透视表：行=地区，列=年份，值=销售额求和
df.pivot_table(index="region", columns="year",
               values="sales", aggfunc="sum",
               fill_value=0, margins=True)   # margins 加总计行/列

# 交叉表：统计两个分类的频次
pd.crosstab(df["sex"], df["survived"], normalize="index")  # 行内占比

# melt：宽表转长表（透视的逆操作）
df.melt(id_vars="name", var_name="year", value_name="sales")
```

## 十二、窗口与滚动计算

```python
s = df["price"]
s.rolling(7).mean()              # 7 期滚动均值（前 6 个为 NaN）
s.rolling(7, min_periods=1).sum()
s.expanding().max()              # 累计最大
s.ewm(span=12).mean()            # 指数加权（EMA）

s.shift(1)                       # 整体后移一期（昨日值）
s.diff()                         # 一阶差分
s.pct_change()                   # 环比变化率

# 分组内窗口：每支股票各自算均线
df["ma5"] = df.groupby("code")["price"].transform(
    lambda x: x.rolling(5).mean())
```

## 十三、分类类型与内存优化

```python
df.info(memory_usage="deep")             # 看真实内存

# 低基数字符串列改 category：内存约降一个数量级
df["city"] = df["city"].astype("category")

# 数值向下转型
df["cnt"] = pd.to_numeric(df["cnt"], downcast="integer")

# 大文件分块读取
for chunk in pd.read_csv("big.csv", chunksize=100_000):
    process(chunk)

# 只读需要的列
pd.read_csv("big.csv", usecols=["date", "price"])
```

顺带一提：对超大数据集可试 **Polars**（`pl.read_csv`，Rust 内核、懒执行、多核），API 与 Pandas 相近，常有数倍到数十倍差距。

## 十四、性能提示

1. **避免 `iterrows` 循环**，优先向量化或 `apply`；
2. 大文件用 `read_csv(..., chunksize=...)` 分块，或换 **Polars**（更快的 DataFrame）；
3. `df.query("age > 28 and city == '北京'")` 可读性更好；
4. 类别列转 `category` 类型省内存；
5. 超大数据考虑 **Polars / DuckDB / Dask**。
