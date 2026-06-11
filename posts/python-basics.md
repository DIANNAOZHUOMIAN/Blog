---
title: Python 基础语法
date: 2026-06-11
tags: [Python, 基础语法]
summary: 类型、数据结构、控制流、函数、异常、模块、虚拟环境与代码风格速查。
---

# Python 基础语法

Python 动态强类型、缩进决定作用域。本文是上手速查。

## 一、第一个程序

```python
# hello.py
print("hello world")

if __name__ == "__main__":
    main()
```

运行：`python hello.py`。

注释：`#` 单行；`"""..."""` 文档字符串（docstring，可作模块/函数/类的说明）。

## 二、变量与基本类型

```python
x = 1            # int，任意精度
pi = 3.14        # float (64bit)
c = 1 + 2j       # complex
b = True         # bool（True / False，首字母大写）
s = "hi"
n = None         # 空
```

强类型不会自动转换：`"1" + 1` 报错；要显式 `int(s)` / `str(n)` / `float(s)`。

类型查看：`type(x)`、`isinstance(x, int)`。

类型注解（3.5+，可选）：

```python
x: int = 1
name: str = "a"
items: list[int] = []
opt: int | None = None     # 3.10+ 联合
```

`mypy` / `pyright` 静态检查。

## 三、字符串

```python
s = "hello"
s[0]; s[-1]; s[1:4]; s[::-1]
len(s)
s.upper(); s.lower(); s.title()
s.strip(); s.lstrip(); s.rstrip()
s.startswith("he"); s.endswith("lo"); s.find("l")
s.replace("l", "L")
"a,b,c".split(",")
"-".join(["a", "b", "c"])
"hello".count("l")

# 格式化
f"{name=}, {age:03d}"          # 调试格式 + 补 0
f"{val:.2f}"                   # 浮点 2 位
f"{n:>10}"                     # 右对齐宽 10
"%s is %d" % ("a", 1)          # 老式
"{name} {age}".format(name="a", age=1)
```

字符串不可变；多行用 `"""..."""`。

## 四、数字与运算

```python
17 // 5         # 3，整除
17 % 5          # 2，取模
2 ** 10         # 1024
divmod(17, 5)   # (3, 2)
abs(-1); round(3.14, 1); pow(2, 10)
max(1,2,3); min(...); sum([1,2,3])

# 进制
0b101; 0o17; 0xff
bin(255); oct(255); hex(255); int("ff", 16)
```

`int` 任意精度，`float` 双精度。`decimal.Decimal` 高精度金额。

## 五、容器

### list

```python
lst = [1, 2, 3]
lst.append(4); lst.extend([5, 6]); lst.insert(0, 0)
lst.pop(); lst.remove(2)
lst.index(3); lst.count(3)
lst.sort(); lst.sort(reverse=True, key=lambda x: x.score)
lst.reverse()
sorted(lst)                          # 不改原 list
lst[1:3] = [9, 9]                     # 切片赋值
```

### tuple

```python
t = (1, 2, 3)        # 不可变
single = (1,)        # 单元素必须带逗号
a, b, c = t          # 解包
```

### dict

```python
d = {"a": 1, "b": 2}
d["c"] = 3
d.get("x", 0)                  # 不存在返回默认
d.setdefault("k", []).append(1)
d.update({"d": 4})
"a" in d
for k, v in d.items(): ...
list(d.keys()); list(d.values())
{**d1, **d2}                   # 合并（3.9+ 可 d1 | d2）
```

3.7+ 字典保持插入顺序。

### set

```python
s = {1, 2, 3}
s.add(4); s.discard(1)
a & b; a | b; a - b; a ^ b
frozenset([1, 2])              # 不可变
```

## 六、推导式

```python
[x*x for x in range(10)]
[x for x in lst if x > 0]
{x:y for x, y in pairs}
{x for x in lst}
(x*x for x in lst)             # 生成器，惰性，无方括号
```

嵌套：`[[i*j for j in range(3)] for i in range(3)]`。

## 七、控制流

```python
if x > 0:
    ...
elif x == 0:
    ...
else:
    ...

# 三元
y = "pos" if x > 0 else "non-pos"

# for
for i in range(10): ...
for i in range(0, 10, 2): ...
for k, v in d.items(): ...
for i, x in enumerate(lst): ...
for a, b in zip(la, lb): ...

# else 子句（循环正常结束才执行）
for x in lst:
    if x == target: break
else:
    print("not found")

# while
while cond:
    ...

# match（3.10+）
match cmd:
    case "q": quit()
    case ("move", x, y): ...
    case {"type": "user", "name": str(n)}: ...
    case [first, *rest]: ...
    case _: ...
```

`break` / `continue` / `pass`（空语句占位）。

## 八、函数

```python
def greet(name, greeting="hi", *args, **kwargs) -> str:
    """问候"""
    return f"{greeting}, {name}"

greet("Bob")                  # 位置
greet("Bob", greeting="hello")  # 关键字
greet("Bob", "hey", 1, 2, key="v")

# 仅位置参数 / 仅关键字参数（3.8+）
def f(pos_only, /, normal, *, kw_only): ...
```

参数顺序：位置 → `*args` → 关键字默认 → `**kwargs`。

陷阱：默认值可变对象：

```python
def f(x=[]):    # 共享同一 list，跨调用累积！
    x.append(1); return x
```

改为：

```python
def f(x=None):
    if x is None: x = []
```

### lambda

```python
square = lambda x: x * x
sorted(users, key=lambda u: u.age)
```

匿名函数体只能一表达式。

### 闭包 + nonlocal

```python
def counter():
    n = 0
    def inc():
        nonlocal n
        n += 1
        return n
    return inc
```

## 九、装饰器

```python
import functools, time

def timing(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        t = time.time()
        r = f(*args, **kwargs)
        print(f"{f.__name__}: {time.time()-t:.3f}s")
        return r
    return wrapper

@timing
def work(): ...

# 带参数装饰器
def retry(times):
    def deco(f):
        @functools.wraps(f)
        def w(*a, **kw):
            for _ in range(times):
                try: return f(*a, **kw)
                except Exception: continue
            raise
        return w
    return deco

@retry(3)
def fragile(): ...
```

内置：`@staticmethod` / `@classmethod` / `@property` / `@dataclass` / `@cache` / `@lru_cache`。

## 十、异常

```python
try:
    risky()
except (ValueError, KeyError) as e:
    log(e)
except Exception:
    raise                      # 重新抛
else:
    success()                  # try 块无异常时执行
finally:
    cleanup()

# 自定义
class MyError(Exception): ...

raise MyError("desc")
raise ValueError("bad") from original_exc
```

异常链：`raise ... from e`。`assert cond, msg` 简单断言（生产环境可能被 `-O` 关掉）。

## 十一、模块与包

```python
# math 模块
import math
math.pi; math.sqrt(2); math.log(10, 2)

from datetime import datetime, timedelta
import json as J

# 自定义模块
# pkg/mod.py
def f(): return 1

# main.py
from pkg.mod import f
```

包 = 含 `__init__.py` 的目录（3.3+ 命名空间包可省）。

模块搜索路径：`sys.path`。

`if __name__ == "__main__":` 作为脚本入口判断（导入时不会执行）。

## 十二、文件 IO

```python
with open("a.txt", "r", encoding="utf-8") as f:
    text = f.read()
    for line in f: ...

with open("a.txt", "w", encoding="utf-8") as f:
    f.write("hi")

# 二进制
with open("a.bin", "rb") as f:
    data = f.read()

import pathlib
p = pathlib.Path("dir/a.txt")
p.exists(); p.is_file(); p.is_dir()
p.suffix; p.stem; p.parent; p.name
p.read_text(encoding="utf-8")
p.write_text("hi")
for f in pathlib.Path(".").glob("**/*.py"): ...
```

`pathlib` 优于 `os.path`，现代代码推荐。

## 十三、时间

```python
import time, datetime as dt

time.time()                      # Unix 秒
time.sleep(0.5)
time.perf_counter()              # 高精度计时

dt.datetime.now()
dt.datetime.utcnow()
dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
dt.datetime.strptime("2026-06-11", "%Y-%m-%d")
dt.datetime.now() + dt.timedelta(days=1, hours=2)
```

时区：3.9+ 用 `zoneinfo.ZoneInfo("Asia/Shanghai")` 或 `pytz`。

## 十四、JSON / 数据交换

```python
import json
s = json.dumps({"a": 1}, ensure_ascii=False, indent=2)
d = json.loads('{"a":1}')

with open("a.json", "r", encoding="utf-8") as f:
    obj = json.load(f)
```

## 十五、虚拟环境与包

```bash
python -m venv .venv
source .venv/bin/activate          # Linux/Mac
.venv\Scripts\activate              # Windows

pip install requests
pip freeze > requirements.txt
pip install -r requirements.txt
pip uninstall pkg
```

现代工具：
- **uv**（Astral）：极快，统一安装/虚拟环境/工具；
- **poetry**：依赖管理 + 打包；
- **pipx**：安装 CLI 工具到隔离环境；
- **rye / hatch**：项目管理。

## 十六、常用内置函数

```python
print(); input(); len(); range(); enumerate(); zip()
list(); tuple(); set(); dict()
abs(); round(); min(); max(); sum(); pow()
sorted(); reversed(); filter(); map()
any(); all()
isinstance(); type(); id(); hash()
getattr(); setattr(); hasattr(); delattr()
dir(); vars(); locals(); globals()
open(); int(); float(); str(); bool()
repr(); ord(); chr()
```

## 十七、风格与工具

- **PEP 8**：4 空格缩进、行长 ≤ 88（black 默认）/ 100；
- 命名：`snake_case` 函数/变量、`PascalCase` 类、`UPPER` 常量；
- 格式化：`black` / `ruff format`；
- Lint：`ruff`（替代 flake8/pylint，极快）；
- 类型：`mypy` / `pyright`；
- 测试：`pytest`；
- 文档：`mkdocs` + `mkdocstrings`。

## 十八、常见坑

1. 默认参数可变；
2. 浮点精度：`0.1 + 0.2 != 0.3`，金额用 `Decimal`；
3. 整数除法：`/` 浮点，`//` 整除；
4. `is` vs `==`：身份 vs 相等；
5. 字符串与字节：`"a"` vs `b"a"`，编码转换：`s.encode("utf-8")` / `b.decode()`；
6. 缩进：tab 与空格不能混；
7. 循环变量泄漏到外层；
8. 列表浅拷贝：`b = a[:]` 或 `import copy; copy.deepcopy(a)`；
9. 全局解释器锁 GIL：多线程对 CPU 密集无加速，用进程或 `numpy`/`asyncio`；
10. 大对象作为默认参数 / 闭包变量时注意生命周期。

## 十九、最小项目模板

```
myapp/
├── pyproject.toml
├── README.md
├── src/
│   └── myapp/
│       ├── __init__.py
│       └── main.py
└── tests/
    └── test_main.py
```

`pyproject.toml` 示例：

```toml
[project]
name = "myapp"
version = "0.1.0"
dependencies = ["requests>=2.31"]

[project.optional-dependencies]
dev = ["pytest", "ruff", "mypy"]
```
