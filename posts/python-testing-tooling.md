---
title: Python 测试与工程化
date: 2026-06-14
tags: [Python, pytest, 工程化]
summary: pytest 用法、fixture、参数化、mock、覆盖率，以及 ruff/black/mypy 与 uv/poetry 打包。
---

# Python 测试与工程化

写得对，还要证明它对、维护得住。本文覆盖测试（pytest）与现代工具链。

## 一、pytest 基础

```bash
pip install pytest
```

```python
# test_math.py（文件名 test_ 开头，函数名 test_ 开头）
def add(a, b):
    return a + b

def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0

def test_types():
    assert isinstance(add(1, 2), int)
```

```bash
pytest                 # 运行全部
pytest -v              # 详细
pytest test_math.py::test_add   # 指定用例
pytest -k "add"        # 按名筛选
pytest -x              # 首个失败即停
pytest -q              # 简洁输出
```

`assert` 直接用 Python 表达式，失败时 pytest 自动展示两边的值。

## 二、异常与近似断言

```python
import pytest

def test_raises():
    with pytest.raises(ValueError):
        int("abc")
    with pytest.raises(ZeroDivisionError, match="division"):
        1 / 0

def test_approx():
    assert 0.1 + 0.2 == pytest.approx(0.3)    # 浮点比较
```

## 三、fixture：测试夹具

复用前置/清理逻辑，按需注入：

```python
import pytest

@pytest.fixture
def db():
    conn = connect(":memory:")     # setup
    yield conn                      # 提供给测试
    conn.close()                    # teardown

def test_query(db):                 # 参数名 = fixture 名，自动注入
    db.execute("INSERT ...")
    assert db.query() == [...]

# 作用域：function（默认）/ class / module / session
@pytest.fixture(scope="session")
def app(): ...
```

放进 `conftest.py` 的 fixture 对整个目录可见，无需 import。

## 四、参数化：一份逻辑多组数据

```python
@pytest.mark.parametrize("a, b, expected", [
    (2, 3, 5),
    (0, 0, 0),
    (-1, 1, 0),
])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

## 五、mock：隔离外部依赖

```python
from unittest.mock import patch, MagicMock

def get_user(client, uid):
    return client.fetch(f"/users/{uid}")

def test_get_user():
    client = MagicMock()
    client.fetch.return_value = {"id": 1, "name": "Alice"}
    assert get_user(client, 1)["name"] == "Alice"
    client.fetch.assert_called_once_with("/users/1")

# patch：替换被测模块里的对象
@patch("mymodule.requests.get")
def test_api(mock_get):
    mock_get.return_value.json.return_value = {"ok": True}
    assert call_api()["ok"]
```

第三方更顺手的库：`pytest-mock`（提供 `mocker` fixture）。

## 六、覆盖率

```bash
pip install pytest-cov
pytest --cov=myapp --cov-report=term-missing
pytest --cov=myapp --cov-report=html     # 生成 htmlcov/ 报告
```

## 七、标记与跳过

```python
@pytest.mark.skip(reason="未实现")
def test_todo(): ...

@pytest.mark.skipif(sys.platform == "win32", reason="仅 Linux")
def test_linux_only(): ...

@pytest.mark.slow                  # 自定义标记
def test_heavy(): ...
# pytest -m "not slow" 跳过慢测试
```

## 八、代码质量工具

```bash
pip install ruff mypy

# ruff：极快的 linter + formatter（替代 flake8 + isort + black）
ruff check .          # 检查
ruff check --fix .    # 自动修复
ruff format .         # 格式化

# mypy：静态类型检查
mypy myapp/
```

类型注解配合 mypy 能在运行前抓出大量错误：

```python
def greet(name: str, times: int = 1) -> str:
    return f"hi {name} " * times

from typing import Optional
def find(uid: int) -> Optional[User]: ...
```

## 九、依赖与打包

现代首选 **uv**（Astral，极快，一统虚拟环境/安装/锁定）：

```bash
uv init myproject
uv add requests pytest        # 加依赖（自动写 pyproject.toml + 锁定）
uv run pytest                 # 在项目环境里运行
uv sync                       # 按锁文件还原环境
```

`pyproject.toml` 是标准配置文件：

```toml
[project]
name = "myapp"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["requests>=2.31"]

[project.optional-dependencies]
dev = ["pytest", "ruff", "mypy"]

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
testpaths = ["tests"]
```

其他工具：**poetry**（依赖+打包一体）、**pipx**（隔离安装 CLI 工具）。

## 十、CI 与 pre-commit

```yaml
# .pre-commit-config.yaml（提交前自动跑检查）
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff
      - id: ruff-format
```

```bash
pip install pre-commit && pre-commit install
```

## 十一、工程化清单

1. 目录：`src/` 放包、`tests/` 放测试；
2. 一切配置进 `pyproject.toml`；
3. 提交前 `ruff check` + `ruff format` + `mypy` + `pytest`；
4. 覆盖率盯关键路径，不必苛求 100%；
5. 用 `uv` / `poetry` 锁定依赖，保证可复现；
6. CI（GitHub Actions）跑全套检查。
