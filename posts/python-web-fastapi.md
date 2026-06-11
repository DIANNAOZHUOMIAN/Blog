---
title: Python Web：FastAPI
date: 2026-06-11
tags: [Python, Web, FastAPI, 异步]
summary: 异步 ASGI、类型注解驱动、Pydantic、依赖注入、OpenAPI 自动文档、SQLAlchemy/Tortoise、部署与最佳实践。
---

# FastAPI

现代高性能 Python Web 框架，基于 ASGI（Starlette + Pydantic）。特点：

- **异步原生**：`async def` 视图，高并发；
- **类型注解驱动**：参数类型自动解析、校验、文档生成；
- **OpenAPI / Swagger** 自动生成；
- **依赖注入**内置；
- 性能接近 Node / Go。

## 一、最小应用

```python
from fastapi import FastAPI

app = FastAPI(title="My API", version="1.0")

@app.get("/")
async def root(): return {"hello": "world"}
```

运行：

```bash
pip install fastapi uvicorn[standard]
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

文档：
- Swagger UI：`/docs`
- ReDoc：`/redoc`
- OpenAPI JSON：`/openapi.json`

## 二、路径参数 / 查询参数

```python
@app.get("/users/{uid}")
async def get_user(uid: int):              # 路径参数 + 类型校验
    return {"id": uid}

@app.get("/items")
async def list_items(q: str | None = None,
                      page: int = 1,
                      size: int = Query(10, ge=1, le=100)):
    return {"q": q, "page": page, "size": size}
```

类型注解 + `Query / Path / Body / Cookie / Header` 提供额外约束（`ge / le / regex / min_length / max_length`）。

非法参数 → 自动返回 422 + 错误详情。

## 三、请求体 / Pydantic 模型

```python
from pydantic import BaseModel, Field, EmailStr

class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    age: int = Field(ge=0, le=150)
    tags: list[str] = []

class UserOut(BaseModel):
    id: int
    name: str
    email: str

@app.post("/users", response_model=UserOut, status_code=201)
async def create_user(payload: UserCreate):
    user = User(**payload.model_dump())
    return user
```

`response_model` 自动按模型字段裁剪输出（防泄漏内部字段）。

## 四、依赖注入

```python
from fastapi import Depends

async def common_params(q: str | None = None, limit: int = 10):
    return {"q": q, "limit": limit}

@app.get("/a")
async def a(p: dict = Depends(common_params)): return p

@app.get("/b")
async def b(p: dict = Depends(common_params)): return p

# 类作为依赖
class Paging:
    def __init__(self, page: int = 1, size: int = 10):
        self.page = page; self.size = size

@app.get("/c")
async def c(pg: Paging = Depends()): return {"page": pg.page}

# 嵌套
async def db_session() -> AsyncSession: ...
async def current_user(s = Depends(db_session)) -> User: ...

@app.get("/me")
async def me(u: User = Depends(current_user)): return u
```

特点：
- 自动解析依赖链；
- 同请求内 `use_cache=True` 复用；
- 支持 yield（释放资源）；
- 全局依赖：`FastAPI(dependencies=[Depends(verify_token)])`。

## 五、上下文资源（yield 依赖）

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

Session = async_sessionmaker(...)

async def db() -> AsyncSession:
    async with Session() as s:
        yield s
        # 退出时自动关闭

@app.get("/users")
async def users(s: AsyncSession = Depends(db)):
    r = await s.execute(select(User))
    return r.scalars().all()
```

## 六、认证 / 安全

OAuth2 密码模式：

```python
from fastapi.security import OAuth2PasswordBearer
oauth2 = OAuth2PasswordBearer(tokenUrl="/token")

@app.get("/me")
async def me(token: str = Depends(oauth2)):
    user = decode_jwt(token)
    return user
```

`/docs` 会自动出现 "Authorize" 按钮。

JWT 用 `python-jose` 或 `authlib`；密码哈希用 `passlib[bcrypt]`。

## 七、异常处理

```python
from fastapi import HTTPException
from fastapi.responses import JSONResponse

@app.get("/err")
async def err(): raise HTTPException(status_code=404, detail="not found")

class BizError(Exception):
    def __init__(self, msg, code=400): self.msg = msg; self.code = code

@app.exception_handler(BizError)
async def biz_handler(req, exc: BizError):
    return JSONResponse({"error": exc.msg}, status_code=exc.code)
```

## 八、Background Tasks / Lifespan

```python
from fastapi import BackgroundTasks

@app.post("/send")
async def send(bg: BackgroundTasks):
    bg.add_task(send_email, "...", "...")     # 响应后异步执行
    return {"ok": True}

# 应用启动/关闭钩子（推荐 lifespan）
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.redis = await aioredis.from_url("redis://...")
    yield
    # shutdown
    await app.state.redis.close()

app = FastAPI(lifespan=lifespan)
```

## 九、文件上传 / 下载

```python
from fastapi import UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    return {"name": file.filename, "size": len(content)}

@app.get("/download")
async def download(): return FileResponse("data.bin", filename="x.bin")

@app.get("/stream")
async def stream():
    async def gen():
        for i in range(10): yield f"data: {i}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

## 十、WebSocket

```python
from fastapi import WebSocket

@app.websocket("/ws")
async def ws(socket: WebSocket):
    await socket.accept()
    try:
        while True:
            msg = await socket.receive_text()
            await socket.send_text(f"echo: {msg}")
    except WebSocketDisconnect:
        pass
```

## 十一、中间件 / CORS

```python
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://x.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware)

@app.middleware("http")
async def add_header(req, call_next):
    resp = await call_next(req)
    resp.headers["X-App"] = "myapi"
    return resp
```

## 十二、路由组织（APIRouter）

```python
# routers/user.py
from fastapi import APIRouter
router = APIRouter(prefix="/users", tags=["user"])

@router.get("/{uid}")
async def get(uid: int): ...

# main.py
from routers.user import router as user_router
app.include_router(user_router)
```

## 十三、ORM 集成

### SQLAlchemy 2.x（异步）

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase): ...

class User(Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))

engine = create_async_engine("postgresql+asyncpg://...")
Session = async_sessionmaker(engine, expire_on_commit=False)

async def list_users(s: AsyncSession) -> list[User]:
    r = await s.execute(select(User).where(User.age > 18))
    return list(r.scalars())
```

### Tortoise ORM / SQLModel / Pony

- **SQLModel**：FastAPI 作者出品，结合 Pydantic + SQLAlchemy；
- **Tortoise ORM**：Django ORM 风格的异步实现；
- **Pony / Peewee**：轻量同步。

## 十四、测试

```python
from fastapi.testclient import TestClient

client = TestClient(app)

def test_root():
    r = client.get("/")
    assert r.status_code == 200

# 异步测试
import pytest, httpx

@pytest.mark.asyncio
async def test_create():
    async with httpx.AsyncClient(app=app, base_url="http://test") as c:
        r = await c.post("/users", json={...})
```

## 十五、配置（pydantic-settings）

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_url: str
    debug: bool = False
    class Config:
        env_file = ".env"

settings = Settings()
```

环境变量自动注入。

## 十六、部署

```bash
# 单进程（开发）
uvicorn main:app --reload

# 生产：多 worker
uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000

# 或 Gunicorn 管理 Uvicorn worker
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
```

每 worker 一个事件循环；CPU 数 × 1~2 作为 worker 数起点。

容器化：

```dockerfile
FROM python:3.12-slim
RUN pip install fastapi uvicorn[standard] sqlalchemy
COPY . /app
WORKDIR /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

前置 Nginx / Caddy 做 TLS + 静态资源。

## 十七、性能要点

- 真异步：所有 IO 用 `async` 库（`aiohttp` / `httpx.AsyncClient` / `asyncpg` / `aioredis`）；
- 阻塞 IO 不要直接调用（会卡死事件循环），用 `await run_in_threadpool(blocking_io)`；
- CPU 密集 → 子进程 / Celery / Dramatiq；
- 启用 `orjson`：`FastAPI(default_response_class=ORJSONResponse)`；
- 缓存 + 限流；
- Pydantic v2 比 v1 快 10x，已是默认。

## 十八、Flask vs FastAPI 速选

| 项 | Flask | FastAPI |
|---|---|---|
| 接口 | WSGI 同步 | ASGI 异步 |
| 类型注解 | 可选 | 核心驱动 |
| 自动文档 | 需扩展 | 内置 OpenAPI |
| 性能 | 中 | 高 |
| 学习曲线 | 平 | 略陡（类型 + 异步） |
| 生态成熟度 | 老牌齐全 | 新但快速成熟 |
| 适合 | 中小同步、教学 | 高性能 API、微服务 |

## 十九、检查清单

- 用 Pydantic 模型校验所有输入输出；
- 数据库走异步驱动；
- 异常用 `HTTPException` + 自定义 handler；
- 使用 `Depends` 隔离 DB / 用户 / 配置；
- 路由按业务拆 `APIRouter`；
- 启动用 lifespan 准备连接池；
- 多 worker + 反代部署；
- `/docs` 上线时配 auth 或关闭。
