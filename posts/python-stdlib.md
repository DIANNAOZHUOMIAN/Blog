---
title: Python 常用标准库
date: 2026-06-14
tags: [Python, 标准库]
summary: pathlib、os/sys、datetime、collections、itertools、functools、re、json、logging、argparse 速查。
---

# Python 常用标准库

"内置电池"是 Python 的杀手锏。本文整理日常最常用的标准库。

## 一、pathlib：路径操作（首选）

```python
from pathlib import Path

p = Path("data") / "sub" / "file.txt"   # / 拼路径
p.exists(); p.is_file(); p.is_dir()
p.name; p.stem; p.suffix; p.parent
p.absolute(); p.resolve()
p.read_text(encoding="utf-8")
p.write_text("hi", encoding="utf-8")
p.mkdir(parents=True, exist_ok=True)
for f in Path(".").glob("**/*.py"): ...  # 递归匹配
p.rename(p.with_suffix(".bak"))
p.unlink(missing_ok=True)                # 删除
```

`pathlib` 比老式 `os.path` 更直观，现代代码优先。

## 二、os / sys / subprocess

```python
import os, sys

os.getcwd(); os.chdir("/tmp")
os.environ.get("PATH")
os.environ["KEY"] = "val"
os.cpu_count()
os.listdir(".")
sys.argv          # 命令行参数
sys.exit(1)
sys.platform      # 'win32' / 'linux' / 'darwin'

import subprocess
r = subprocess.run(["git", "status"], capture_output=True, text=True)
print(r.stdout, r.returncode)
```

## 三、datetime / time

```python
from datetime import datetime, date, timedelta, timezone

now = datetime.now()
utc = datetime.now(timezone.utc)
now.strftime("%Y-%m-%d %H:%M:%S")
datetime.strptime("2026-06-14", "%Y-%m-%d")
now + timedelta(days=7, hours=3)
(d2 - d1).days
date.today()

import time
time.time()              # Unix 秒
time.perf_counter()      # 高精度计时
time.sleep(0.5)

# 时区（3.9+）
from zoneinfo import ZoneInfo
datetime.now(ZoneInfo("Asia/Shanghai"))
```

## 四、collections

```python
from collections import defaultdict, Counter, deque, namedtuple, OrderedDict

# defaultdict：键不存在自动建默认值
d = defaultdict(list)
d["a"].append(1)         # 无需先判断

# Counter：计数神器
c = Counter("hello")     # {'l':2, 'h':1, 'e':1, 'o':1}
c.most_common(2)         # [('l',2), ('h',1)]
Counter(words).most_common(10)

# deque：双端队列（O(1) 两端操作）
q = deque([1, 2, 3], maxlen=5)
q.appendleft(0); q.popleft()

# namedtuple：轻量记录
Point = namedtuple("Point", ["x", "y"])
p = Point(1, 2); p.x
```

## 五、itertools

```python
import itertools as it

it.chain([1, 2], [3, 4])           # 1 2 3 4
it.count(10, 2)                    # 10 12 14 ...（无限）
it.cycle("AB")                     # A B A B ...
it.repeat(0, 3)                    # 0 0 0
it.product([1, 2], [3, 4])         # 笛卡尔积
it.permutations([1, 2, 3], 2)      # 排列
it.combinations([1, 2, 3], 2)      # 组合
it.groupby(sorted(data, key=k), key=k)
it.accumulate([1, 2, 3, 4])        # 1 3 6 10
list(it.islice(gen, 5))            # 取前 5 个
it.takewhile(lambda x: x < 5, nums)
```

## 六、functools

```python
from functools import reduce, lru_cache, cache, partial, wraps

reduce(lambda a, b: a + b, [1, 2, 3, 4])    # 10

@cache                              # 3.9+，无限缓存
def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)

@lru_cache(maxsize=128)
def slow(x): ...

add5 = partial(lambda a, b: a + b, 5)       # 固定部分参数
add5(10)                                     # 15

def deco(f):                        # 写装饰器保留元信息
    @wraps(f)
    def w(*a, **kw): return f(*a, **kw)
    return w
```

## 七、re：正则

```python
import re

re.match(r"\d+", "123abc")          # 从开头匹配
re.search(r"\d+", "abc123")         # 任意位置
re.findall(r"\d+", "a1b22c333")     # ['1','22','333']
re.finditer(r"\d+", text)           # 迭代 Match
re.sub(r"\s+", " ", text)           # 替换
re.split(r"[,;]", "a,b;c")          # 切分

m = re.search(r"(\d{4})-(\d{2})", "2026-06")
m.group(0); m.group(1); m.groups()  # '2026-06', '2026', ('2026','06')

# 命名组 + 预编译
pat = re.compile(r"(?P<year>\d{4})")
pat.search("2026").group("year")
```

## 八、json

```python
import json

s = json.dumps({"a": 1, "中": "文"}, ensure_ascii=False, indent=2)
d = json.loads('{"a": 1}')

with open("data.json", encoding="utf-8") as f:
    obj = json.load(f)
with open("out.json", "w", encoding="utf-8") as f:
    json.dump(obj, f, ensure_ascii=False, indent=2)
```

## 九、logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)
log.debug("细节"); log.info("信息"); log.warning("警告")
log.error("错误"); log.exception("带堆栈")   # 在 except 块里
```

比 `print` 调试更专业：分级、可配置输出位置与格式。

## 十、argparse：命令行

```python
import argparse

parser = argparse.ArgumentParser(description="示例工具")
parser.add_argument("path", help="输入文件")
parser.add_argument("-v", "--verbose", action="store_true")
parser.add_argument("-n", "--count", type=int, default=1)
args = parser.parse_args()

if args.verbose: print(f"处理 {args.path} x{args.count}")
```

## 十一、dataclasses：少写样板类

```python
from dataclasses import dataclass, field, asdict

@dataclass
class User:
    name: str
    age: int = 0
    tags: list[str] = field(default_factory=list)   # 可变默认值必须用 factory

u = User("Tom", 18)
asdict(u)                       # → {'name': 'Tom', 'age': 18, 'tags': []}

@dataclass(frozen=True, slots=True)   # 不可变 + 省内存，可作 dict 键
class Point:
    x: float
    y: float
```

自动生成 `__init__` / `__repr__` / `__eq__`；`order=True` 再送比较运算符。

## 十二、enum：枚举

```python
from enum import Enum, IntEnum, Flag, auto

class Status(Enum):
    PENDING = auto()
    DONE = auto()

Status.DONE.name, Status.DONE.value     # 'DONE', 2
Status["DONE"], Status(2)               # 按名 / 按值取

class Perm(Flag):                       # 可位运算的标志
    READ = auto(); WRITE = auto(); EXEC = auto()

p = Perm.READ | Perm.WRITE
Perm.READ in p                          # True
```

## 十三、typing 常用写法

```python
from typing import Optional, Literal, TypedDict, Protocol, TypeVar

def find(name: str) -> Optional[int]: ...        # int 或 None（3.10+ 可写 int | None）
def mode(m: Literal["r", "w"]) -> None: ...      # 只允许这几个值

class Row(TypedDict):                            # 给 dict 定结构
    id: int
    name: str

class Closable(Protocol):                        # 结构化鸭子类型
    def close(self) -> None: ...

T = TypeVar("T")
def first(xs: list[T]) -> T: return xs[0]        # 泛型函数
```

## 十四、contextlib：上下文工具

```python
from contextlib import contextmanager, suppress, closing, ExitStack

@contextmanager
def timer(label):                     # 用生成器写 with 资源
    t0 = time.perf_counter()
    try:
        yield
    finally:
        print(label, time.perf_counter() - t0)

with suppress(FileNotFoundError):     # 明确地忽略某类异常
    Path("tmp.txt").unlink()

with ExitStack() as stack:            # 动态数量的资源统一关闭
    files = [stack.enter_context(open(p)) for p in paths]
```

## 十五、其他常用

```python
import random
random.random(); random.randint(1, 6); random.choice(lst)
random.shuffle(lst); random.sample(lst, 3)

import math
math.sqrt(2); math.pi; math.ceil(1.2); math.gcd(12, 8)

import uuid
uuid.uuid4()

import hashlib
hashlib.sha256(b"data").hexdigest()

import csv
with open("a.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f): print(row)
```
