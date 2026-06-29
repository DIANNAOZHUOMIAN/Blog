---
title: Python 并发与并行
date: 2026-06-14
tags: [Python, 并发, 多线程, 多进程]
summary: GIL、threading、multiprocessing、concurrent.futures 线程池/进程池与选型。
---

# Python 并发与并行

Python 并发的关键前提是 **GIL（全局解释器锁）**：同一时刻只有一个线程执行 Python 字节码。

## 一、GIL 与选型

| 任务类型 | 例子 | 方案 |
|---|---|---|
| **IO 密集** | 网络请求、读写文件、数据库 | 多线程 / asyncio（GIL 在 IO 等待时释放） |
| **CPU 密集** | 数值计算、图像处理、加密 | 多进程（绕过 GIL）/ numpy / C 扩展 |

一句话：IO 密集用线程或协程，CPU 密集用进程。

## 二、concurrent.futures（推荐入口）

统一的高层接口，线程池与进程池只差一个类名。

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed

# IO 密集：线程池
def fetch(url):
    import urllib.request
    return urllib.request.urlopen(url).read()

with ThreadPoolExecutor(max_workers=8) as ex:
    # map：保持顺序
    for result in ex.map(fetch, urls):
        process(result)

    # submit + as_completed：谁先好处理谁
    futures = {ex.submit(fetch, u): u for u in urls}
    for fut in as_completed(futures):
        url = futures[fut]
        try:
            data = fut.result()
        except Exception as e:
            print(f"{url} 失败: {e}")
```

CPU 密集只需把 `ThreadPoolExecutor` 换成 `ProcessPoolExecutor`：

```python
def heavy(n):
    return sum(i * i for i in range(n))

with ProcessPoolExecutor() as ex:        # 默认 worker = CPU 核数
    results = list(ex.map(heavy, [10**6] * 8))
```

## 三、threading 细节

```python
import threading

def worker(name):
    print(f"线程 {name}")

t = threading.Thread(target=worker, args=("A",))
t.start()
t.join()

# 锁：保护共享数据
lock = threading.Lock()
counter = 0
def inc():
    global counter
    with lock:                  # 自动加锁/解锁
        counter += 1

# 其他原语
event = threading.Event()       # 线程间信号
event.set(); event.wait()
sem = threading.Semaphore(3)    # 限制并发数
local = threading.local()       # 线程局部存储
```

## 四、multiprocessing 细节

进程不共享内存，靠序列化传数据，需放在 `if __name__ == "__main__":` 下（Windows 必须）。

```python
from multiprocessing import Process, Pool, Queue, Value, Manager

def work(x): return x * x

if __name__ == "__main__":
    # 进程池
    with Pool(4) as p:
        print(p.map(work, range(10)))

    # 进程间通信
    q = Queue()
    q.put("msg"); q.get()

    # 共享值 / 共享结构
    num = Value("i", 0)         # 共享整数
    with Manager() as m:
        shared = m.list()       # 跨进程列表
        shared.append(1)
```

## 五、生产者-消费者

```python
import threading, queue

q = queue.Queue(maxsize=10)     # 线程安全队列

def producer():
    for i in range(20):
        q.put(i)
    q.put(None)                 # 结束信号

def consumer():
    while (item := q.get()) is not None:
        print("消费", item)
        q.task_done()

threading.Thread(target=producer).start()
threading.Thread(target=consumer).start()
```

## 六、CPU 密集的更优解

多进程有启动与序列化开销。CPU 密集还可以：

```python
# 1) numpy 向量化（底层 C，不受 GIL 限制）
import numpy as np
result = np.sqrt(np.arange(10_000_000))

# 2) Python 3.13+ 的自由线程构建（实验性，无 GIL）
# 3) Cython / numba / Rust 扩展（PyO3）
```

## 七、对比 asyncio

`asyncio` 是**单线程协程**，靠事件循环在 IO 等待时切换，适合海量并发连接（上万），开销比线程小。三者对比：

| 方案 | 并发量 | 适合 | 开销 |
|---|---|---|---|
| 多线程 | 几十~几百 | IO 密集、阻塞库 | 中（线程栈） |
| asyncio | 上万 | IO 密集、异步库 | 低 |
| 多进程 | = 核数 | CPU 密集 | 高（独立进程） |

详见《Python 异步编程》。

## 八、常见坑

1. **用多线程跑 CPU 密集**：GIL 下没有加速，要用进程；
2. **multiprocessing 不放在 `__main__` 下**：Windows 会无限递归创建进程；
3. **共享可变状态不加锁**：竞态条件、数据错乱；
4. **进程间传不可序列化对象**：报 pickling 错误；
5. **线程池里抛异常被吞**：必须 `future.result()` 才会重新抛出。
