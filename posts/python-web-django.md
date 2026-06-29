---
title: Python Web：Django
date: 2026-06-14
tags: [Python, Django, Web]
summary: Django 项目结构、模型与 ORM、迁移、视图、URL、模板、表单、admin 与 DRF 接口。
---

# Python Web：Django

Django 是"全家桶"式 Web 框架：自带 ORM、后台管理、模板、认证、表单。相比 Flask/FastAPI 的轻量，它适合内容型/业务型大项目，约定优先、开箱即用。

```bash
pip install django
django-admin startproject mysite
cd mysite
python manage.py startapp blog       # 创建应用
```

## 一、项目结构

```
mysite/
├── manage.py
├── mysite/              # 项目配置
│   ├── settings.py      # 配置（数据库、应用、中间件）
│   ├── urls.py          # 根路由
│   └── wsgi.py / asgi.py
└── blog/                # 应用
    ├── models.py        # 数据模型
    ├── views.py         # 视图
    ├── urls.py          # 应用路由
    ├── admin.py         # 后台注册
    └── migrations/      # 迁移文件
```

在 `settings.py` 的 `INSTALLED_APPS` 注册应用 `"blog"`。

## 二、模型（ORM）

```python
# blog/models.py
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    created = models.DateTimeField(auto_now_add=True)
    published = models.BooleanField(default=False)
    author = models.ForeignKey("auth.User", on_delete=models.CASCADE,
                               related_name="posts")

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.title
```

## 三、迁移

模型改动后，生成并应用迁移（无需手写 SQL）：

```bash
python manage.py makemigrations      # 生成迁移文件
python manage.py migrate             # 应用到数据库
python manage.py createsuperuser     # 创建管理员
```

## 四、ORM 查询

```python
Post.objects.all()
Post.objects.filter(published=True)
Post.objects.filter(title__icontains="rust")     # 字段查找
Post.objects.filter(created__year=2026)
Post.objects.exclude(published=False)
Post.objects.get(pk=1)               # 单条（不存在抛异常）
Post.objects.order_by("-created")[:10]
Post.objects.count()

# 创建 / 更新 / 删除
p = Post.objects.create(title="Hi", body="...")
p.title = "New"; p.save()
Post.objects.filter(published=False).delete()

# 关联与聚合
post.author.username                 # 外键
user.posts.all()                     # 反向（related_name）
from django.db.models import Count, Avg
Post.objects.values("author").annotate(n=Count("id"))

# 避免 N+1
Post.objects.select_related("author")        # 外键 JOIN
Post.objects.prefetch_related("tags")        # 多对多预取
```

## 五、视图与路由

```python
# blog/views.py
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from .models import Post

def post_list(request):
    posts = Post.objects.filter(published=True)
    return render(request, "blog/list.html", {"posts": posts})

def post_detail(request, pk):
    post = get_object_or_404(Post, pk=pk)
    return render(request, "blog/detail.html", {"post": post})

def api_posts(request):
    data = list(Post.objects.values("id", "title"))
    return JsonResponse(data, safe=False)
```

```python
# blog/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("", views.post_list, name="post_list"),
    path("<int:pk>/", views.post_detail, name="post_detail"),
    path("api/posts/", views.api_posts),
]
```

```python
# mysite/urls.py
from django.urls import path, include
urlpatterns = [
    path("admin/", admin.site.urls),
    path("blog/", include("blog.urls")),
]
```

## 六、模板

```django
{# templates/blog/list.html #}
{% extends "base.html" %}
{% block content %}
  <h1>文章</h1>
  {% for post in posts %}
    <article>
      <a href="{% url 'post_detail' post.pk %}">{{ post.title }}</a>
      <time>{{ post.created|date:"Y-m-d" }}</time>
    </article>
  {% empty %}
    <p>暂无文章</p>
  {% endfor %}
{% endblock %}
```

## 七、表单

```python
from django import forms

class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ["title", "body", "published"]

def create_post(request):
    if request.method == "POST":
        form = PostForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect("post_list")
    else:
        form = PostForm()
    return render(request, "blog/form.html", {"form": form})
```

## 八、Admin 后台

```python
# blog/admin.py
from django.contrib import admin
from .models import Post

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "published", "created")
    list_filter = ("published", "created")
    search_fields = ("title", "body")
```

访问 `/admin/`，自动获得完整 CRUD 管理界面——这是 Django 最大卖点之一。

## 九、REST API：DRF

写 JSON 接口用 Django REST Framework：

```bash
pip install djangorestframework
```

```python
# serializers.py
from rest_framework import serializers
from .models import Post

class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = ["id", "title", "body", "created"]

# views.py
from rest_framework import viewsets
class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer

# urls.py
from rest_framework.routers import DefaultRouter
router = DefaultRouter()
router.register("posts", PostViewSet)
urlpatterns += router.urls            # 自动生成增删改查接口
```

## 十、运行与选型

```bash
python manage.py runserver           # 开发服务器
# 生产：gunicorn mysite.wsgi  + nginx；异步用 uvicorn mysite.asgi
```

| 框架 | 定位 |
|---|---|
| **Django** | 全家桶，内容/业务大项目，自带 ORM/admin |
| **FastAPI** | 现代异步 API，类型驱动、自动文档 |
| **Flask** | 轻量微框架，灵活、自由组合 |

详见《Python Web：FastAPI》《Python Web：Flask》。
