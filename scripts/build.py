#!/usr/bin/env python3
"""博客构建脚本"""

import os
import shutil
import re
import time
from pathlib import Path

try:
    import markdown
    import yaml
except ImportError:
    os.system("pip install markdown PyYAML --break-system-packages -q")
    import markdown
    import yaml

ROOT    = Path(__file__).parent.parent
POSTS   = ROOT / "posts"
STATIC  = ROOT / "static"
DIST    = ROOT / "dist"

VERSION = time.strftime("%Y%m%d%H%M")

CATEGORIES = [
    ("csharp-",  "C#"),
    ("db-",      "数据库"),
    ("comm-",    "通信"),
    ("orm-",     "ORM"),
    ("python-",  "Python"),
    ("design-",  "设计模式"),
]

def categorize(filename):
    for prefix, name in CATEGORIES:
        if filename.startswith(prefix):
            return name
    return "其他"

def slugify(text):
    text = re.sub(r'[^\w一-鿿\-]', '-', text.lower())
    return re.sub(r'-+', '-', text).strip('-')

def parse_frontmatter(text):
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
                return meta, parts[2].strip()
            except yaml.YAMLError:
                pass
    return {}, text

def parse_posts():
    posts = []
    for md_file in POSTS.glob("*.md"):
        raw = md_file.read_text(encoding="utf-8")
        meta, content = parse_frontmatter(raw)
        date_raw = meta.get("date", "")
        if hasattr(date_raw, "strftime"):
            date_str = date_raw.strftime("%Y-%m-%d")
        else:
            date_str = str(date_raw)[:10] if date_raw else ""
        title = meta.get("title", md_file.stem)
        category = categorize(md_file.name)
        posts.append({
            "title":    title,
            "date":     date_str,
            "category": category,
            "summary":  meta.get("summary", ""),
            "slug":     slugify(title),
            "content":  content,
            "filename": md_file.name,
        })
    posts.sort(key=lambda p: (p["date"], p["filename"]), reverse=True)
    return posts

def group_by_category(posts):
    order = [name for _, name in CATEGORIES] + ["其他"]
    groups = {name: [] for name in order}
    for p in posts:
        groups[p["category"]].append(p)
    return [(name, groups[name]) for name in order if groups[name]]


def head(title, root=""):
    return (
        '<!DOCTYPE html>\n'
        '<html lang="zh-CN">\n'
        '<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        f'<title>{title}</title>\n'
        f'<link rel="stylesheet" href="{root}static/style.css?v={VERSION}">\n'
        f'<link rel="alternate" type="application/rss+xml" title="RSS" href="{root}rss.xml">\n'
        '</head>\n'
        '<body data-theme="paper">\n'
        '<header class="site-header">\n'
        '  <div class="header-left">\n'
        '    <button id="sidebar-toggle" type="button" aria-label="目录">☰</button>\n'
        f'    <a href="{root}index.html" class="site-logo">—</a>\n'
        '  </div>\n'
        '  <nav class="header-nav">\n'
        f'    <a href="{root}index.html">文章</a>\n'
        f'    <a href="{root}tags.html">目录</a>\n'
        '  </nav>\n'
        '  <button id="theme-toggle" type="button" aria-label="切换主题">'
        '<span class="theme-dot"></span><span class="theme-name">纸</span></button>\n'
        '</header>\n'
    )


def foot(root=""):
    return (
        '<footer class="site-footer">\n'
        '  <span>以文字为容器</span>\n'
        f'  <a href="{root}rss.xml">RSS</a>\n'
        '</footer>\n'
        f'<script src="{root}static/theme.js?v={VERSION}"></script>\n'
        '<script src="https://cdn.jsdelivr.net/npm/oh-my-live2d/dist/index.min.js"></script>\n'
        f'<script src="{root}static/pet.js?v={VERSION}"></script>\n'
        '</body>\n'
        '</html>'
    )


def render_sidebar(groups, root="", current_slug=None):
    out = ['<aside class="sidebar" id="sidebar">', '<nav class="cat-nav">']
    for cat_name, cat_posts in groups:
        is_open = any(p["slug"] == current_slug for p in cat_posts)
        open_attr = " open" if is_open else ""
        out.append(f'<details class="cat"{open_attr}>')
        out.append(f'  <summary><span class="cat-title">{cat_name}</span></summary>')
        out.append('  <ul class="cat-posts">')
        for p in cat_posts:
            cls = "active" if p["slug"] == current_slug else ""
            slug = p["slug"]
            title = p["title"]
            out.append(
                f'    <li class="{cls}"><a href="{root}posts/{slug}.html" '
                f'title="{title}">{title}</a></li>'
            )
        out.append('  </ul>')
        out.append('</details>')
    out.append('</nav>')
    out.append('</aside>')
    return "\n".join(out)


def render_md(content):
    md = markdown.Markdown(extensions=["fenced_code", "tables", "toc", "nl2br"])
    return md.convert(content)


def build_index(posts, groups):
    cards = []
    for p in posts:
        c = (
            '<article class="post-card">\n'
            '  <div class="post-meta">\n'
            f'    <time>{p["date"]}</time>\n'
            f'    <span class="cat-badge">{p["category"]}</span>\n'
            '  </div>\n'
            f'  <h2><a href="posts/{p["slug"]}.html">{p["title"]}</a></h2>\n'
        )
        if p["summary"]:
            c += f'  <p class="summary">{p["summary"]}</p>\n'
        c += '</article>'
        cards.append(c)
    items = "\n".join(cards)
    return (
        head("博客", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + f'<main><div class="post-list">{items}</div></main>'
        + foot(root="")
    )


def build_post(post, groups):
    body = render_md(post["content"])
    article = (
        '<article class="post-full">\n'
        '  <header class="post-header">\n'
        '    <div class="post-meta">\n'
        f'      <time>{post["date"]}</time>\n'
        f'      <span class="cat-badge">{post["category"]}</span>\n'
        '    </div>\n'
        f'    <h1>{post["title"]}</h1>\n'
        '  </header>\n'
        f'  <div class="post-body">{body}</div>\n'
        '  <a href="../index.html" class="back-link">← 返回</a>\n'
        '</article>'
    )
    return (
        head(post["title"], root="../")
        + render_sidebar(groups, root="../", current_slug=post["slug"])
        + f'<main>{article}</main>'
        + foot(root="../")
    )


def build_tags(posts, groups):
    sections = []
    for cat_name, cat_posts in groups:
        sid = slugify(cat_name)
        items = "".join(
            f'<li><a href="posts/{p["slug"]}.html">{p["title"]}</a>'
            f'<time>{p["date"]}</time></li>'
            for p in cat_posts
        )
        sections.append(
            f'<section class="tag-section" id="{sid}">'
            f'<h2 class="tag-heading">{cat_name}</h2>'
            f'<ul class="tag-post-list">{items}</ul>'
            f'</section>'
        )
    body = "".join(sections)
    return (
        head("目录", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + f'<main><div class="tags-page"><h1 class="page-title">目录</h1>{body}</div></main>'
        + foot(root="")
    )


def build_rss(posts):
    items = []
    for p in posts[:20]:
        items.append(
            '<item>'
            f'<title><![CDATA[{p["title"]}]]></title>'
            f'<link>posts/{p["slug"]}.html</link>'
            f'<pubDate>{p["date"]}</pubDate>'
            f'<description><![CDATA[{p["summary"]}]]></description>'
            '</item>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>'
        '<title>博客</title><link>index.html</link>'
        '<description>个人博客</description>'
        + "".join(items)
        + '</channel></rss>'
    )


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    (DIST / "posts").mkdir()
    (DIST / "static").mkdir()

    for f in STATIC.glob("*"):
        if f.is_file():
            shutil.copy(f, DIST / "static" / f.name)

    posts = parse_posts()
    groups = group_by_category(posts)
    print(f"找到 {len(posts)} 篇文章，分 {len(groups)} 类")

    (DIST / "index.html").write_text(build_index(posts, groups), encoding="utf-8")
    print("✓ index.html")

    for p in posts:
        out = DIST / "posts" / f"{p['slug']}.html"
        out.write_text(build_post(p, groups), encoding="utf-8")
        print(f"✓ posts/{p['slug']}.html")

    (DIST / "tags.html").write_text(build_tags(posts, groups), encoding="utf-8")
    print("✓ tags.html")

    (DIST / "rss.xml").write_text(build_rss(posts), encoding="utf-8")
    print("✓ rss.xml")

    print(f"\n构建完成 → {DIST}")


if __name__ == "__main__":
    main()
