---
title: Python Web：Flask
date: 2026-06-11
tags: [Python, Web, Flask]
summary: Flask 路由、请求/响应、模板、表单、数据库、Blueprint、错误处理、部署与扩展生态。
---

# Flask

轻量级 Python Web 微框架。WSGI 同步，简单灵活，适合中小项目、原型与教学。当前主流版本 2.x / 3.x。

## 一、最小应用

```python
from flask import Flask
app = Flask(__name__)

@app.route("/")
def index():
    return "hello"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```

```bash
flask --app app run --debug
```

## 二、路由

```python
@app.get("/users/<int:uid>")
def user(uid):
    return {"id": uid}

@app.post("/users")
def create_user():
    data = request.get_json()
    return data, 201

# 多方法
@app.route("/items", methods=["GET", "POST"])
def items():
    if request.method == "POST": ...

# 转换器：int / float / path / uuid / string / 自定义
@app.get("/file/<path:filename>")
def file(filename): ...
```

`url_for("user", uid=1)` 反向解析 URL。

## 三、请求与响应

```python
from flask import request, jsonify, make_response, redirect

@app.get("/q")
def q():
    name = request.args.get("name", "")           # ?name=...
    page = request.args.get("page", 1, type=int)
    data = request.get_json(silent=True)
    f = request.files.get("upload")
    f.save("uploads/" + f.filename)
    headers = request.headers
    ip = request.remote_addr

    resp = make_response(jsonify(ok=True))
    resp.status_code = 201
    resp.set_cookie("sid", "abc", max_age=3600, httponly=True, samesite="Lax")
    return resp

@app.get("/go")
def go(): return redirect("/")
```

Flask 自动把 `dict` 转 JSON 响应，返回 `(body, status)` / `(body, status, headers)` 元组也可。

## 四、模板（Jinja2）

```python
@app.get("/page")
def page():
    return render_template("page.html", title="Hi", users=users)
```

`templates/page.html`：

```html
<!DOCTYPE html>
<title>{{ title }}</title>
<ul>
{% for u in users %}
  <li>{{ u.name }} - {{ u.age }}</li>
{% endfor %}
</ul>
{% if vip %}<p>VIP</p>{% endif %}
{% include "footer.html" %}
```

继承：

```html
{# base.html #}
<html><body>{% block content %}{% endblock %}</body></html>

{# child.html #}
{% extends "base.html" %}
{% block content %}<h1>hi</h1>{% endblock %}
```

过滤器 / 测试：`{{ name|upper }}`、`{{ items|length }}`、`{% if x is defined %}`。

`url_for("static", filename="css/app.css")` 生成静态资源 URL。

## 五、Blueprint（蓝图）

模块化拆分：

```python
# user/views.py
from flask import Blueprint
bp = Blueprint("user", __name__, url_prefix="/user")

@bp.get("/<int:uid>")
def get(uid): ...

# app.py
from user.views import bp as user_bp
app.register_blueprint(user_bp)
```

每个模块独立路由、模板、静态文件。

## 六、表单与上传

WTForms 提供表单类：

```python
from flask_wtf import FlaskForm
from wtforms import StringField, IntegerField
from wtforms.validators import DataRequired, Length

class LoginForm(FlaskForm):
    username = StringField("用户名", [DataRequired(), Length(3, 20)])
    age = IntegerField("年龄")

@app.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        return f"hi {form.username.data}"
    return render_template("login.html", form=form)
```

上传：`enctype="multipart/form-data"` + `request.files`。

## 七、数据库（SQLAlchemy）

```python
from flask_sqlalchemy import SQLAlchemy

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), unique=True)

with app.app_context():
    db.create_all()

# CRUD
u = User(name="Alice", email="a@x.com")
db.session.add(u); db.session.commit()

users = User.query.filter(User.name.like("A%")).order_by(User.id).limit(10).all()
u = db.session.get(User, 1)
db.session.delete(u); db.session.commit()
```

迁移：`Flask-Migrate`（基于 Alembic）。

## 八、错误处理

```python
@app.errorhandler(404)
def not_found(e): return {"error": "not found"}, 404

@app.errorhandler(Exception)
def all_errors(e):
    app.logger.exception(e)
    return {"error": "internal"}, 500

# 业务异常
class BizError(Exception):
    def __init__(self, msg, code=400): self.msg = msg; self.code = code

@app.errorhandler(BizError)
def biz(e): return {"error": e.msg}, e.code

# 自己 abort
from flask import abort
@app.get("/forbidden")
def f(): abort(403)
```

## 九、会话与认证

### Cookie 会话

```python
from flask import session
app.config["SECRET_KEY"] = "..."

@app.route("/login", methods=["POST"])
def login():
    session["user_id"] = 1
    return "ok"

@app.route("/me")
def me(): return str(session.get("user_id"))
```

Flask session 默认放进签名 Cookie（客户端可见但不可篡改）。

### Flask-Login

```python
from flask_login import LoginManager, UserMixin, login_required, current_user

login_mgr = LoginManager(app)
@login_mgr.user_loader
def load_user(uid): return User.query.get(int(uid))

@app.get("/dashboard")
@login_required
def dashboard(): return f"hi {current_user.name}"
```

JWT 走 `Flask-JWT-Extended`。

## 十、扩展生态

| 扩展 | 用途 |
|---|---|
| Flask-SQLAlchemy | ORM 集成 |
| Flask-Migrate | 数据库迁移 |
| Flask-Login | 用户会话 |
| Flask-JWT-Extended | JWT 认证 |
| Flask-WTF | 表单 + CSRF |
| Flask-CORS | 跨域 |
| Flask-Limiter | 限流 |
| Flask-Caching | 缓存 |
| Flask-SocketIO | WebSocket |
| Flask-Mail | 邮件 |
| Flask-RESTX / Flask-Smorest | OpenAPI 文档 |
| Flask-Admin | 后台 |

## 十一、配置

```python
app.config.update(
    DEBUG=False,
    SECRET_KEY="...",
    SQLALCHEMY_DATABASE_URI="...",
)
app.config.from_pyfile("config.py")
app.config.from_envvar("APP_CFG")            # 环境变量指定文件
```

工厂模式（推荐结构）：

```python
def create_app(config=None):
    app = Flask(__name__)
    app.config.from_object("config.Default")
    if config: app.config.from_object(config)
    db.init_app(app)
    app.register_blueprint(user_bp)
    return app
```

## 十二、中间件 / 钩子

```python
@app.before_request
def before(): app.logger.info(f"{request.method} {request.path}")

@app.after_request
def after(resp):
    resp.headers["X-App"] = "myapp"
    return resp

@app.teardown_request
def teardown(exc): ...

# WSGI 中间件
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
```

## 十三、CLI 命令

```python
@app.cli.command("init-db")
def init_db():
    with app.app_context():
        db.create_all()
    print("done")
```

```bash
flask --app app init-db
```

## 十四、部署

开发：`flask run --debug`。

生产**不要用** `app.run`，用 WSGI 服务器：

```bash
# Gunicorn (Linux)
gunicorn -w 4 -b 0.0.0.0:8000 "myapp:create_app()"

# Waitress (Windows)
waitress-serve --port=8000 myapp:app

# uWSGI
uwsgi --http :8000 --module myapp:app --processes 4 --threads 2
```

前置 Nginx 做静态资源 + 反代：

```nginx
location /static/ { alias /app/static/; expires 7d; }
location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }
```

Docker：

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "myapp:app"]
```

## 十五、异步 / 协议升级

Flask 2.x 支持 `async def` 视图，但底层仍是 WSGI（同步）：

```python
@app.get("/x")
async def x():
    await asyncio.sleep(0.1)
    return "ok"
```

高并发推荐 **FastAPI**（ASGI 异步原生）或用 **Quart**（API 兼容 Flask 的 ASGI 框架）。

## 十六、测试

```python
def test_index():
    client = app.test_client()
    r = client.get("/")
    assert r.status_code == 200
    assert b"hello" in r.data

def test_create_user():
    r = client.post("/users", json={"name":"a"})
    assert r.json["name"] == "a"
```

测试客户端不走真实网络，直接调用应用对象。

## 十七、性能要点

- 静态资源交给 Nginx / CDN；
- 数据库查询要 `Index` + 分页；
- 缓存：`Flask-Caching` + Redis；
- 日志 `RotatingFileHandler`；
- 多进程 / 多线程：Gunicorn workers；
- 高并发 IO → FastAPI；
- 计算密集 → Celery 后台。

## 十八、常见坑

- `debug=True` 不能上生产（任意代码执行漏洞）；
- 默认单线程，开发 server 不要承载真实流量；
- 应用上下文 / 请求上下文：异步任务里用 `with app.app_context()`；
- session 默认走 Cookie，敏感数据别放；
- CORS 配置错会让浏览器跨域报错；
- 静态文件路径要相对 `app.static_folder`；
- 工厂模式 + 蓝图 + 配置类是生产标配。
