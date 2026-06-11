---
title: Python 面向对象与进阶
date: 2026-06-11
tags: [Python, OOP, 进阶, 并发]
summary: 类、继承、魔术方法、属性、dataclass、迭代器/生成器、装饰器、上下文管理器、协程、多线程/多进程/异步、GIL。
---

# Python 面向对象与进阶

## 一、类基础

```python
class Animal:
    species = "?"                  # 类属性（所有实例共享）

    def __init__(self, name):
        self.name = name           # 实例属性

    def speak(self):
        raise NotImplementedError

    def __repr__(self):
        return f"{type(self).__name__}({self.name!r})"

class Dog(Animal):
    species = "dog"
    def speak(self):
        return "woof"

d = Dog("rex")
print(d.species, d.speak(), d)
```

约定：`_x` 内部使用、`__x` 触发名称改写（避免子类覆盖）、`__x__` 魔术方法。

## 二、方法类型

```python
class C:
    def method(self): ...           # 实例方法
    @classmethod
    def cmethod(cls): ...           # 类方法
    @staticmethod
    def smethod(): ...              # 静态方法
```

`@classmethod` 常用于"备用构造":

```python
class Date:
    def __init__(self, y, m, d): ...
    @classmethod
    def today(cls): return cls(*today_ymd())
    @classmethod
    def from_iso(cls, s): return cls(*map(int, s.split("-")))
```

## 三、属性 / property

```python
class Temp:
    def __init__(self, c): self._c = c
    @property
    def f(self): return self._c * 9/5 + 32
    @f.setter
    def f(self, value): self._c = (value - 32) * 5/9
    @f.deleter
    def f(self): self._c = 0
```

强制只读、计算属性、附加校验。

## 四、继承与 MRO

```python
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass

D.__mro__   # (D, B, C, A, object)
super().__init__(...)   # 调用 MRO 中下一个类
```

`super()` 自动按 MRO 找下一个。

多重继承用 mixin 模式：

```python
class JSONMixin:
    def to_json(self): import json; return json.dumps(vars(self))
class User(JSONMixin, BaseModel): ...
```

## 五、抽象基类与协议

```python
from abc import ABC, abstractmethod
class Repo(ABC):
    @abstractmethod
    def get(self, id): ...

# 鸭子类型 + Protocol（3.8+）
from typing import Protocol
class Closeable(Protocol):
    def close(self) -> None: ...
def shutdown(x: Closeable): x.close()   # 结构化类型
```

## 六、dataclass

```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: int
    y: int = 0
    tags: list[str] = field(default_factory=list)

p = Point(1, 2)
print(p, p.x)         # 自动 __init__ __repr__ __eq__

@dataclass(frozen=True, slots=True)
class Vec:
    x: float; y: float                  # 不可变 + __slots__
```

`field(default_factory=...)` 避免可变默认值陷阱。

## 七、魔术方法

| 方法 | 触发 |
|---|---|
| `__init__` | 构造 |
| `__new__` | 分配（单例可用） |
| `__del__` | 析构 |
| `__repr__` / `__str__` | `repr(x)` / `str(x)` |
| `__eq__` / `__hash__` | `==` / `hash(x)`，可哈希要求 |
| `__lt__` / `__le__` ... | `<` 比较，`functools.total_ordering` |
| `__len__` | `len(x)` |
| `__getitem__` / `__setitem__` / `__delitem__` | `x[k]` |
| `__iter__` / `__next__` | 迭代 |
| `__contains__` | `in` |
| `__call__` | 实例可调用 |
| `__enter__` / `__exit__` | with 上下文管理 |
| `__add__` / `__sub__` ... | 算术 |
| `__getattr__` / `__setattr__` | 属性拦截 |

## 八、迭代器与生成器

```python
# 自定义迭代器
class Range:
    def __init__(self, n): self.n = n; self.i = 0
    def __iter__(self): return self
    def __next__(self):
        if self.i >= self.n: raise StopIteration
        v = self.i; self.i += 1; return v

# 生成器（推荐）
def gen(n):
    for i in range(n):
        yield i

for x in gen(5): ...

# 生成器表达式
g = (x*x for x in range(10))

# yield from
def chain(a, b):
    yield from a
    yield from b
```

生成器懒计算，省内存；典型用于流式处理大数据。

## 九、上下文管理器

```python
with open("a.txt") as f: ...

class Timer:
    def __enter__(self):
        import time; self.t = time.time(); return self
    def __exit__(self, exc_type, exc, tb):
        print(time.time() - self.t)
        return False                # True 表示吞掉异常

with Timer(): work()

# contextlib 简化
from contextlib import contextmanager
@contextmanager
def timer():
    import time
    t = time.time()
    try: yield
    finally: print(time.time() - t)

with timer(): work()
```

异步：`async with`，对应 `__aenter__/__aexit__` 或 `@asynccontextmanager`。

## 十、装饰器进阶

```python
import functools, time

def cache(f):
    store = {}
    @functools.wraps(f)
    def w(*a):
        if a not in store: store[a] = f(*a)
        return store[a]
    return w

# 类装饰器
def singleton(cls):
    instances = {}
    @functools.wraps(cls)
    def get(*a, **kw):
        if cls not in instances: instances[cls] = cls(*a, **kw)
        return instances[cls]
    return get

@singleton
class Config: ...

# 内置
functools.lru_cache(maxsize=128)
functools.cache                    # 3.9+，无大小限制
functools.partial(f, x=1)
```

## 十一、多线程

GIL（全局解释器锁）：CPython 中**同一时刻只有一个线程执行字节码**。多线程对 IO 密集任务仍有效（IO 时线程释放 GIL），CPU 密集无加速。

```python
import threading

def work(n): ...

t = threading.Thread(target=work, args=(10,))
t.start(); t.join()

# 锁
lock = threading.Lock()
with lock: ...

# 线程池
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(fetch, urls))
    fut = ex.submit(fetch, url)
    fut.result()
```

## 十二、多进程

绕过 GIL：

```python
from concurrent.futures import ProcessPoolExecutor
with ProcessPoolExecutor() as ex:
    results = list(ex.map(heavy, data))
```

或 `multiprocessing`：

```python
from multiprocessing import Process, Queue, Pool, Manager
```

进程间通信：Queue / Pipe / 共享内存 (`shared_memory`)。

注意：Windows 用 spawn，子进程不会继承文件描述符；要在 `if __name__ == "__main__":` 守护。

## 十三、异步 asyncio

```python
import asyncio, aiohttp

async def fetch(session, url):
    async with session.get(url) as r:
        return await r.text()

async def main():
    async with aiohttp.ClientSession() as s:
        results = await asyncio.gather(*[fetch(s, u) for u in urls])

asyncio.run(main())
```

要点：
- `async def` 定义协程；调用返回协程对象，要 `await` 或调度；
- `await` 只能在 `async` 函数里；
- 多任务用 `asyncio.gather` / `asyncio.create_task`；
- 超时：`asyncio.wait_for(coro, 5)`；
- 取消：`task.cancel()` → `CancelledError`；
- IO 密集场景比线程更省内存（单线程几千并发）；
- CPU 密集仍用进程。

## 十四、并发模型选择

| 场景 | 选择 |
|---|---|
| IO 密集 + 并发量小 | 线程 |
| IO 密集 + 高并发 | asyncio |
| CPU 密集 | 多进程 / numpy / Cython / Rust 扩展 |
| 简单后台任务 | 线程池 |
| 跨机分布式 | Celery / Dramatiq / RQ |

## 十五、元类

类的类。多数业务用不到，框架代码常用：

```python
class Meta(type):
    def __new__(mcs, name, bases, dct):
        dct["created"] = True
        return super().__new__(mcs, name, bases, dct)

class A(metaclass=Meta): ...
print(A.created)
```

`__init_subclass__` 更轻量：

```python
class Plugin:
    plugins = []
    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        cls.plugins.append(cls)
```

## 十六、描述符

`__get__` / `__set__` / `__delete__`，`property` 的本质：

```python
class Positive:
    def __set_name__(self, owner, name): self.name = name
    def __get__(self, obj, owner=None): return obj.__dict__[self.name]
    def __set__(self, obj, v):
        if v < 0: raise ValueError
        obj.__dict__[self.name] = v

class P:
    x = Positive(); y = Positive()
```

## 十七、内存与垃圾回收

- 引用计数 + 分代 GC；
- 循环引用由 GC 处理；
- 弱引用：`weakref`；
- 减少分配：`__slots__`（固定属性，省字典）；
- 内存分析：`tracemalloc`、`pympler`、`memray`。

```python
class Point:
    __slots__ = ("x", "y")
    def __init__(self, x, y): self.x, self.y = x, y
```

## 十八、性能优化

1. 算法 > 微优化；
2. C 扩展：`numpy / pandas / pyarrow`；
3. JIT：`numba` / `cython`；
4. PyPy 替代解释器；
5. 并行：`multiprocessing` / `concurrent.futures` / `joblib`；
6. 异步：高并发 IO；
7. 缓存：`functools.cache` / `lru_cache`；
8. 内置数据结构（`set` / `dict`）哈希 O(1)；
9. `__slots__` 大量小对象省内存；
10. profile：`cProfile`、`py-spy`、`line_profiler`。

## 十九、常用库

- `pydantic`：数据校验、模型；
- `attrs`：dataclass 的旗舰版本；
- `typer` / `click`：CLI；
- `rich`：终端美化、进度条、表格；
- `httpx` / `aiohttp`：HTTP；
- `loguru`：易用日志；
- `tenacity`：重试；
- `polars`：现代 DataFrame（比 pandas 快）；
- `pendulum`：友好时间库。

## 二十、最佳实践

- 类型注解 + ruff + mypy；
- `dataclass` / `pydantic` 替代手撕 `__init__`；
- 资源用 `with`；
- 异常具体化，避免裸 `except`；
- 函数小、纯函数、可测试；
- 异步函数前缀 `async def`、命名带 `_async` 或文件分离；
- 不要滥用元类 / 装饰器；可读优先；
- 项目用 `src/` 布局，便于打包测试。
