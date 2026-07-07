---
title: Python 异步编程
date: 2026-06-14
tags: [Python, asyncio, 异步]
summary: async/await、事件循环、任务并发、超时、异步队列与 aiohttp / httpx 实战。
---

# Python 异步编程

`asyncio` 是单线程协程模型：靠事件循环在 IO 等待时切换任务，用极小开销支撑海量并发连接。适合 IO 密集（网络、爬虫、网关）。

## 一、协程与 await

```python
import asyncio

async def fetch(name, delay):
    print(f"{name} 开始")
    await asyncio.sleep(delay)     # 模拟 IO 等待（非阻塞）
    print(f"{name} 完成")
    return name

async def main():
    result = await fetch("A", 1)   # await 等待协程结果
    print(result)

asyncio.run(main())                # 入口：创建事件循环并运行
```

`async def` 定义协程；调用它**不会执行**，返回协程对象，必须 `await` 或交给事件循环。

## 二、并发执行

```python
async def main():
    # gather：并发运行并收集结果（保持顺序）
    results = await asyncio.gather(
        fetch("A", 2),
        fetch("B", 1),
        fetch("C", 3),
    )
    # 总耗时约 3 秒（并发），而非 6 秒（串行）

    # create_task：立即调度为后台任务
    task = asyncio.create_task(fetch("D", 1))
    # ...做别的...
    await task

    # TaskGroup（3.11+，推荐，自动管理异常与取消）
    async with asyncio.TaskGroup() as tg:
        t1 = tg.create_task(fetch("E", 1))
        t2 = tg.create_task(fetch("F", 2))
    print(t1.result(), t2.result())
```

`gather` 与串行 `await` 的区别就是并发的核心：多个 IO 等待重叠进行。

## 三、超时与取消

```python
# 超时（3.11+）
async def main():
    try:
        async with asyncio.timeout(2):
            await fetch("slow", 5)
    except TimeoutError:
        print("超时")

# 旧写法
try:
    await asyncio.wait_for(fetch("slow", 5), timeout=2)
except asyncio.TimeoutError:
    print("超时")

# 取消任务
task = asyncio.create_task(fetch("X", 10))
task.cancel()
```

## 四、限制并发数

海量任务别一次全开，用信号量限流：

```python
async def main(urls):
    sem = asyncio.Semaphore(10)        # 最多 10 个并发

    async def guarded(url):
        async with sem:
            return await fetch_url(url)

    return await asyncio.gather(*(guarded(u) for u in urls))
```

## 五、异步队列：生产者-消费者

```python
async def producer(q):
    for i in range(20):
        await q.put(i)
    await q.put(None)

async def consumer(q):
    while (item := await q.get()) is not None:
        print("消费", item)
        q.task_done()

async def main():
    q = asyncio.Queue(maxsize=5)
    await asyncio.gather(producer(q), consumer(q))
```

## 六、异步 HTTP 客户端

```python
# httpx（同步/异步统一 API，推荐）
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://example.com")
        print(resp.status_code, resp.text)

        # 并发请求
        import asyncio
        urls = ["https://example.com"] * 5
        results = await asyncio.gather(*(client.get(u) for u in urls))
```

```python
# aiohttp（老牌）
import aiohttp

async def fetch(session, url):
    async with session.get(url) as resp:
        return await resp.text()

async def main():
    async with aiohttp.ClientSession() as session:
        html = await fetch(session, "https://example.com")
```

## 七、把阻塞代码接入异步

同步阻塞调用（如老库、CPU 计算）会卡住事件循环，丢到线程池：

```python
async def main():
    loop = asyncio.get_running_loop()
    # 把阻塞函数丢到默认线程池
    result = await loop.run_in_executor(None, blocking_func, arg)
    # 3.9+ 简洁写法
    result = await asyncio.to_thread(blocking_func, arg)
```

## 八、异步迭代与上下文

```python
# 异步生成器
async def gen():
    for i in range(3):
        await asyncio.sleep(0.1)
        yield i

async def main():
    async for x in gen():          # 异步迭代
        print(x)

# 异步上下文管理器
class Conn:
    async def __aenter__(self): ...; return self
    async def __aexit__(self, *exc): ...

async with Conn() as c: ...
```

## 九、TaskGroup：结构化并发（3.11+）

比 `gather` 更安全：任何子任务失败，其余自动取消，异常打包成 `ExceptionGroup`。

```python
async def main():
    async with asyncio.TaskGroup() as tg:      # 出块前保证全部结束
        t1 = tg.create_task(fetch("a"))
        t2 = tg.create_task(fetch("b"))
    print(t1.result(), t2.result())

try:
    asyncio.run(main())
except* ValueError as eg:          # except*：按类型解包 ExceptionGroup
    for e in eg.exceptions:
        print("失败:", e)
```

## 十、异步同步原语

与 threading 同名但**只在事件循环内**生效、无需考虑线程安全开销。

```python
lock = asyncio.Lock()
async with lock:                   # 保护共享状态
    ...

event = asyncio.Event()            # await event.wait() / event.set()
sem = asyncio.Semaphore(10)        # 限流（见第四节）
cond = asyncio.Condition()         # 条件变量

# 一次性传值用 Future 更直接
fut = asyncio.get_running_loop().create_future()
fut.set_result(42)
```

## 十一、调试与诊断

```python
# 开发期打开 debug 模式：报告未 await 的协程、慢回调
asyncio.run(main(), debug=True)

# 看当前所有任务卡在哪
for t in asyncio.all_tasks():
    t.print_stack(limit=3)

# 慢回调阈值（默认 0.1s，超过打警告）
loop.slow_callback_duration = 0.05
```

- 事件循环里出现 `Executing <Task ...> took 0.5s` 说明有同步阻塞混进来了；
- Linux 生产环境可换 **uvloop**：`asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())`，吞吐提升 2-4 倍；
- 压测协程数量不是越多越好，配合 Semaphore 找到下游能承受的并发度。

## 十二、常见坑

1. **调用协程不 `await`**：协程不执行，且 "coroutine was never awaited" 警告；
2. **在协程里用 `time.sleep()`**：阻塞整个事件循环，要用 `await asyncio.sleep()`；
3. **混用阻塞库**（requests、普通 DB 驱动）：阻塞循环，用异步库或 `to_thread`；
4. **CPU 密集放进 asyncio**：单线程无法并行，用多进程；
5. **在非 async 函数里 `await`**：语法错误，`await` 只能在 `async def` 内；
6. **事件循环已运行还调 `asyncio.run`**：报错，嵌套场景用现有循环。

选型：海量 IO 并发用 asyncio；要用阻塞库或少量并发用线程；CPU 密集用进程（见《Python 并发与并行》）。
