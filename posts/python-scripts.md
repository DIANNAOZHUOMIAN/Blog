---
title: Python 脚本应用与爬虫
date: 2026-06-11
tags: [Python, 脚本, 爬虫, 自动化]
summary: 命令行参数、定时调度、文件处理、Excel/CSV、子进程、日志、HTTP/爬虫（requests/httpx/BeautifulSoup/Playwright）、自动化办公。
---

# Python 脚本应用与爬虫

Python 写脚本快、库多，是运维 / 数据 / 自动化最常用的胶水语言。

## 一、命令行参数

### argparse

```python
import argparse

ap = argparse.ArgumentParser(description="批量重命名")
ap.add_argument("dir", help="目录")
ap.add_argument("-p", "--prefix", default="", help="前缀")
ap.add_argument("-n", "--dry-run", action="store_true", help="只演示")
ap.add_argument("-v", "--verbose", action="count", default=0)
ap.add_argument("--mode", choices=["rename", "copy"], default="rename")
args = ap.parse_args()

print(args.dir, args.prefix, args.dry_run)
```

### typer（推荐，更现代）

```python
import typer
app = typer.Typer()

@app.command()
def hello(name: str, count: int = 1, polite: bool = False):
    for _ in range(count):
        print(f"{'Dear ' if polite else ''}{name}")

if __name__ == "__main__": app()
```

`typer` 基于类型注解自动生成参数与帮助。`click` 同作者老版本。

## 二、日志

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("app")
log.info("started"); log.warning("..."); log.error("...")

# 滚动
from logging.handlers import RotatingFileHandler
RotatingFileHandler("app.log", maxBytes=10*1024*1024, backupCount=5)
```

更易用：`loguru`：

```python
from loguru import logger
logger.add("app_{time}.log", rotation="10 MB", retention="7 days", level="INFO")
logger.info("started")
```

## 三、文件批处理

### 目录遍历 / 批量重命名

```python
import pathlib

root = pathlib.Path("photos")
for p in root.rglob("*.JPG"):
    new = p.with_suffix(".jpg")
    print(p, "->", new)
    p.rename(new)
```

### 按规则整理

```python
import shutil, re

for p in root.glob("*.pdf"):
    m = re.match(r"(\d{4})-(\d{2})", p.stem)
    if m:
        target = root / m.group(1) / m.group(2)
        target.mkdir(parents=True, exist_ok=True)
        shutil.move(p, target / p.name)
```

### 大文件读取

```python
with open("big.log", "r", encoding="utf-8") as f:
    for line in f:                     # 流式
        process(line)
```

## 四、CSV / Excel

### CSV

```python
import csv

with open("a.csv", "r", encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f):
        print(row["name"])

with open("b.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["name", "age"])
    w.writeheader()
    w.writerow({"name": "a", "age": 1})
```

### Excel：openpyxl / pandas

```python
import openpyxl
wb = openpyxl.load_workbook("a.xlsx")
ws = wb["Sheet1"]
for row in ws.iter_rows(min_row=2, values_only=True):
    print(row)
ws["A1"] = "Hello"
wb.save("b.xlsx")

# pandas（推荐数据分析）
import pandas as pd
df = pd.read_excel("a.xlsx")
df = df[df["score"] > 60].groupby("class")["score"].mean()
df.to_excel("out.xlsx", index=False)
df.to_csv("out.csv", index=False)
```

### Word / PDF

- `python-docx` 读写 .docx；
- `pypdf` / `pdfplumber` 读 PDF；
- `reportlab` / `weasyprint` 生成 PDF。

## 五、子进程 / Shell

```python
import subprocess

# 简单执行
subprocess.run(["git", "pull"], cwd="/repo", check=True)

# 拿输出
out = subprocess.check_output(["ls", "-la"], text=True)
print(out)

# 进阶
proc = subprocess.run(["python", "x.py"],
    capture_output=True, text=True, timeout=10)
print(proc.stdout, proc.returncode)

# 管道
p1 = subprocess.Popen(["ls"], stdout=subprocess.PIPE)
p2 = subprocess.Popen(["grep", ".py"], stdin=p1.stdout, stdout=subprocess.PIPE)
print(p2.communicate()[0])
```

不要 `shell=True` 接受用户输入（命令注入风险）。

## 六、定时调度

```python
# 简单
import schedule, time

def job(): print("run")

schedule.every().day.at("09:00").do(job)
schedule.every(5).minutes.do(job)

while True:
    schedule.run_pending()
    time.sleep(1)
```

更复杂：`APScheduler`（支持 cron 表达式 + 持久化）：

```python
from apscheduler.schedulers.blocking import BlockingScheduler
sch = BlockingScheduler()
sch.add_job(job, "cron", hour=9, minute=0)
sch.add_job(job, "interval", minutes=5)
sch.start()
```

生产建议：服务器 cron / systemd timer 调用 Python 脚本，简单可靠。

## 七、HTTP / 爬虫

### requests（同步）

```python
import requests

r = requests.get("https://api.x", params={"q": "py"},
                  headers={"User-Agent": "..."}, timeout=10)
print(r.status_code, r.json())

# 会话
s = requests.Session()
s.headers.update({"Authorization": "Bearer ..."})
s.post(url, json={"a": 1})

# 文件下载
with s.get(url, stream=True) as r:
    with open("file.zip", "wb") as f:
        for chunk in r.iter_content(8192): f.write(chunk)
```

### httpx（同步 + 异步）

```python
import httpx, asyncio

async def main():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get("https://api.x")
        return r.json()

asyncio.run(main())
```

`httpx` 支持 HTTP/2、原生异步、API 与 requests 兼容。

### HTML 解析

```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(r.text, "lxml")
for a in soup.select("a.title"):
    print(a["href"], a.get_text(strip=True))

# 选择器：CSS（select）、find_all、XPath（lxml）
soup.find_all("div", class_="post")
```

### 动态页面

JS 渲染的页面要用浏览器：

```python
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://x.com")
        await page.wait_for_selector(".item")
        items = await page.eval_on_selector_all(".item",
            "els => els.map(e => e.innerText)")
        await browser.close()
        return items
```

`Playwright` 现代选择，比 `selenium` 快稳。

### 反爬要点

- 合理 UA / Referer / Cookie；
- 控制频率 + 随机延时；
- 代理池（住宅 IP）；
- 验证码：图像 OCR / 打码平台 / 走 Playwright 加载；
- robots.txt 与法律合规；
- 多线程 / 多进程 / 异步并发抓取（注意被封）。

### 简单爬虫骨架

```python
import asyncio, httpx
from bs4 import BeautifulSoup

URLS = [...]   # 待抓取
sem = asyncio.Semaphore(8)   # 并发限制

async def fetch(c, url):
    async with sem:
        r = await c.get(url, timeout=10)
        return parse(r.text)

def parse(html):
    soup = BeautifulSoup(html, "lxml")
    return {"title": soup.title.string}

async def main():
    async with httpx.AsyncClient(headers={"User-Agent":"..."}) as c:
        results = await asyncio.gather(*[fetch(c, u) for u in URLS],
                                        return_exceptions=True)
    return results

print(asyncio.run(main()))
```

大型项目用 `Scrapy` 框架（异步、中间件、管道、增量）。

## 八、自动化办公

### 自动发邮件

```python
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg["Subject"] = "report"
msg["From"] = "me@x.com"
msg["To"] = "you@y.com"
msg.set_content("hi")
msg.add_attachment(open("a.pdf","rb").read(),
    maintype="application", subtype="pdf", filename="a.pdf")

with smtplib.SMTP_SSL("smtp.qq.com", 465) as s:
    s.login("me@x.com", "pwd")
    s.send_message(msg)
```

### 操作 Excel + 邮件汇报

```python
import pandas as pd
df = pd.read_excel("sales.xlsx")
summary = df.groupby("region")["amount"].sum().reset_index()
summary.to_excel("summary.xlsx", index=False)
# 然后 SMTP 发出
```

### 图形界面自动化

`pyautogui`：键盘鼠标模拟、屏幕截图、找图；
`pywinauto`：Windows 控件级；
`pynput`：键鼠监听。

```python
import pyautogui as pg
pg.click(100, 200); pg.write("hello"); pg.press("enter")
pos = pg.locateOnScreen("button.png")
```

### 微信 / 钉钉 / 企微通知

通过 webhook 发：

```python
import requests
requests.post(WEBHOOK, json={
    "msgtype": "text",
    "text": {"content": "build success"}
})
```

## 九、常用一行脚本场景

```python
# JSON 美化
python -m json.tool a.json

# HTTP 简易服务
python -m http.server 8000

# Base64
import base64; base64.b64encode(b"hi"); base64.b64decode(s)

# 计算文件 hash
import hashlib
h = hashlib.sha256()
with open("a.bin","rb") as f:
    for c in iter(lambda: f.read(8192), b""): h.update(c)
print(h.hexdigest())

# 压缩
import zipfile
with zipfile.ZipFile("a.zip","w") as z: z.write("a.txt")
```

## 十、并发抓取 / 处理

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

# IO 密集：线程
with ThreadPoolExecutor(max_workers=16) as ex:
    results = list(ex.map(fetch, urls))

# CPU 密集：进程
with ProcessPoolExecutor() as ex:
    results = list(ex.map(heavy, data))
```

异步：`asyncio.gather` + 信号量限流（前面示例）。

## 十一、配置与密钥

- `python-dotenv` 加载 `.env`：

```python
from dotenv import load_dotenv
import os
load_dotenv()
api_key = os.getenv("API_KEY")
```

- 永远不要把密钥提交到 git；用 `.env` + `.gitignore`，或 OS 密钥环 `keyring`。

## 十二、打包与分发

- 单脚本：直接 `python xxx.py`；
- 项目：`pyproject.toml` + `pip install .`；
- 打包成 exe：`PyInstaller` / `Nuitka` / `briefcase`；
- 内部分发：私有 PyPI（`devpi`）/ Git 安装 `pip install git+https://...`。

```bash
pyinstaller --onefile --name myapp myapp.py
```

## 十三、错误处理与重试

```python
import time

def with_retry(times=3, delay=1):
    def deco(f):
        def w(*a, **kw):
            for i in range(times):
                try: return f(*a, **kw)
                except Exception as e:
                    if i == times-1: raise
                    time.sleep(delay * (2 ** i))   # 指数退避
        return w
    return deco

@with_retry(3)
def fetch(url): ...
```

或用 `tenacity` 库：

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(5),
       wait=wait_exponential(multiplier=1, max=10))
def fetch(url): ...
```

## 十四、测试与调试

- `pytest` 跑测试；
- `pdb` 内置调试：`breakpoint()`；
- `rich.traceback` 美化错误；
- `ipython` 交互式 REPL；
- `jupyter notebook` 探索数据。

## 十五、检查清单

- 脚本入口 `if __name__ == "__main__":`；
- 配置走 `.env` / `argparse` / `pydantic-settings`；
- 异常 + 日志 + 重试；
- 大文件流式；
- 抓取限流 + 守规矩；
- 长跑脚本写好心跳和优雅退出（捕 SIGINT/SIGTERM）；
- 依赖固定版本 `requirements.txt` 或 `pyproject.toml`；
- 定时任务用 systemd / cron / APScheduler；
- 输出 / 文档 / 通知三件套（数据 → 表格 → 邮件/IM）。
