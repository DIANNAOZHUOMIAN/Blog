#!/usr/bin/env python3
"""博客构建脚本"""

import os
import sys
import json
import shutil
import re
import time
from pathlib import Path

# Windows 控制台默认 GBK，无法编码 ✓ 等字符，统一切到 UTF-8 防止崩溃
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

try:
    import markdown
    import yaml
    import pygments  # noqa: F401  代码高亮（codehilite 依赖）
except ImportError:
    os.system("pip install markdown PyYAML Pygments --break-system-packages -q")
    import markdown
    import yaml

ROOT    = Path(__file__).parent.parent
POSTS   = ROOT / "posts"
STATIC  = ROOT / "static"
DIST    = ROOT / "dist"

VERSION = time.strftime("%Y%m%d%H%M")

CATEGORIES = [
    ("csharp-",  "C#"),
    ("rust-",    "Rust"),
    ("python-",  "Python"),
    ("db-",      "数据库"),
    ("orm-",     "ORM"),
    ("comm-",    "通信"),
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
        '<meta http-equiv="Cache-Control" content="no-cache, must-revalidate">\n'
        '<meta http-equiv="Pragma" content="no-cache">\n'
        f'<title>{title}</title>\n'
        f'<script>window.SITE_ROOT="{root}";</script>\n'
        f'<link rel="stylesheet" href="{root}static/style.css?v={VERSION}">\n'
        '<link rel="stylesheet" href="https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/waifu.css">\n'
        f'<link rel="alternate" type="application/rss+xml" title="RSS" href="{root}rss.xml">\n'
        f'<script defer src="{root}static/search-index.js?v={VERSION}"></script>\n'
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
        f'    <a href="{root}mindmap.html">导图</a>\n'
        '  </nav>\n'
        '  <div class="search" id="search">\n'
        '    <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">'
        '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>\n'
        '    <input type="search" id="search-input" placeholder="搜索文章…" '
        'autocomplete="off" spellcheck="false" aria-label="搜索文章">\n'
        '    <div class="search-results" id="search-results" role="listbox"></div>\n'
        '  </div>\n'
        '  <button id="theme-toggle" type="button" aria-label="切换主题">'
        '<span class="theme-dot"></span><span class="theme-name">纸</span></button>\n'
        '</header>\n'
    )


def foot(root=""):
    # stevenjoezhang/live2d-widget 通过 autoload.js 内部的 initWidget 读取配置，
    # 无需旧版 fghrsh 的 window.live2d_settings 全局对象。
    live2d = (
        '<script async '
        'src="https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js">'
        '</script>\n'
    )
    return (
        '<footer class="site-footer">\n'
        '  <span>以文字为容器</span>\n'
        '  <a href="#" id="pet-restore" title="唤回看板娘">唤回桌宠</a>\n'
        f'  <a href="{root}rss.xml">RSS</a>\n'
        '</footer>\n'
        f'<script src="{root}static/theme.js?v={VERSION}"></script>\n'
        + live2d
        + '</body>\n'
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
    out.append(
        '<div class="divider" id="divider" aria-hidden="true">'
        '<span class="divider-seal"></span></div>'
    )
    return "\n".join(out)


def render_md(content):
    md = markdown.Markdown(
        extensions=["fenced_code", "codehilite", "tables", "toc", "nl2br"],
        extension_configs={
            "codehilite": {
                "guess_lang": False,   # 没标语言的代码块不猜测，保持纯文本
                "css_class": "codehilite",
            }
        },
    )
    return md.convert(content)


def extract_headings(content):
    """提取正文里的二级标题（跳过代码块），作为思维导图的知识点节点。"""
    heads = []
    in_code = False
    for line in content.split("\n"):
        s = line.strip()
        if s.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^##\s+(.+)$", s)
        if m:
            t = m.group(1).strip()
            t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)   # 链接 → 文本
            t = re.sub(r"[*_`]", "", t)                       # 去掉强调/行内代码标记
            t = re.sub(r"\\(.)", r"\1", t)                    # 还原 \< \> 等转义
            heads.append(t)
    return heads


def strip_leading_h1(content):
    """正文首个一级标题与文章头部标题重复，渲染前去掉它。"""
    lines = content.split("\n")
    i = 0
    while i < len(lines) and lines[i].strip() == "":
        i += 1
    if i < len(lines) and re.match(r"^#\s+\S", lines[i]):   # 一级标题（非 ## ）
        del lines[i]
        while i < len(lines) and lines[i].strip() == "":
            del lines[i]
    return "\n".join(lines)


def build_index(posts, groups):
    # 文章卡片（全部文章模块）
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

    # 简介模块：取 about.md 的摘要与链接
    about = next((p for p in posts if p["filename"] == "about.md"), None)
    intro_text = (about["summary"] if about and about["summary"]
                  else "技术笔记与日常思考的容器，写什么取决于那一刻在想什么。")
    about_link = (f'<a class="bento-more" href="posts/{about["slug"]}.html">关于本站 →</a>'
                  if about else "")

    # 标签模块：各分类及篇数
    tag_items = "".join(
        f'<li><a href="tags.html#{slugify(name)}">'
        f'<span class="tag-name">{name}</span>'
        f'<span class="tag-count">{len(cat_posts)}</span></a></li>'
        for name, cat_posts in groups
    )

    # 推荐阅读：固定四篇（C# 新特性、Prism、SqlSugar、CAN）
    rec_files = ["csharp-whats-new.md", "design-prism.md",
                 "orm-sqlsugar.md", "comm-can.md"]
    by_file = {p["filename"]: p for p in posts}
    rec = [by_file[f] for f in rec_files if f in by_file]
    rec_items = "".join(
        '<a class="rec-item" href="posts/' + p["slug"] + '.html">'
        f'<span class="cat-badge">{p["category"]}</span>'
        f'<h3>{p["title"]}</h3>'
        f'<time>{p["date"]}</time>'
        '</a>'
        for p in rec
    )

    bento = (
        '<div class="bento">\n'
        '  <section class="bento-card bento-intro">\n'
        '    <span class="bento-label">简介</span>\n'
        '    <h1 class="bento-title">以文字为容器</h1>\n'
        f'    <p class="bento-text">{intro_text}</p>\n'
        '    <div class="bento-stats">\n'
        f'      <span><b>{len(posts)}</b> 篇文章</span>\n'
        f'      <span><b>{len(groups)}</b> 个分类</span>\n'
        '    </div>\n'
        f'    {about_link}\n'
        '  </section>\n'
        '  <section class="bento-card bento-tags">\n'
        '    <span class="bento-label">标签</span>\n'
        f'    <ul class="bento-taglist">{tag_items}</ul>\n'
        '  </section>\n'
        '  <section class="bento-card bento-recommend">\n'
        '    <span class="bento-label">推荐阅读</span>\n'
        f'    <div class="rec-grid">{rec_items}</div>\n'
        '  </section>\n'
        '  <section class="bento-card bento-articles">\n'
        '    <span class="bento-label">全部文章</span>\n'
        f'    <div class="post-list">{items}</div>\n'
        '  </section>\n'
        '</div>'
    )
    return (
        head("博客", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + f'<main>{bento}</main>'
        + foot(root="")
    )


def build_post(post, groups):
    body = render_md(strip_leading_h1(post["content"]))
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
            f'<h2 class="tag-heading">{cat_name}'
            f'<a class="tag-mm-link" href="mindmap.html#{sid}">导图 →</a></h2>'
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


def build_mindmap_data(groups):
    """每个分类一棵树：分类 → 文章 → 二级标题（知识点）。"""
    data = []
    for cat_name, cat_posts in groups:
        data.append({
            "name": cat_name,
            "id":   slugify(cat_name),
            "posts": [
                {"t": p["title"], "s": p["slug"], "h": extract_headings(p["content"])}
                for p in cat_posts
            ],
        })
    return "window.MINDMAP_DATA=" + json.dumps(data, ensure_ascii=False) + ";"


def build_mindmap(groups):
    tabs = "".join(
        f'<button class="mm-tab" type="button" data-id="{slugify(name)}">'
        f'{name}<span class="mm-tab-n">{len(cat_posts)}</span></button>'
        for name, cat_posts in groups
    )
    page = (
        '<main class="mindmap-main">\n'
        '<div class="mindmap-page">\n'
        '  <div class="mm-topbar">\n'
        '    <h1 class="mm-title">思维导图</h1>\n'
        f'    <div class="mm-tabs" id="mm-tabs">{tabs}</div>\n'
        '  </div>\n'
        '  <div class="mm-viewport" id="mm-viewport">\n'
        '    <svg id="mm-svg" xmlns="http://www.w3.org/2000/svg"></svg>\n'
        '    <div class="mm-toolbar">\n'
        '      <button type="button" data-act="in" title="放大">＋</button>\n'
        '      <button type="button" data-act="out" title="缩小">－</button>\n'
        '      <button type="button" data-act="fit" title="适应画布">⤢</button>\n'
        '    </div>\n'
        '    <div class="mm-hint">拖拽平移 · 滚轮缩放 · 点击节点展开/收起 · ↗ 打开文章</div>\n'
        '  </div>\n'
        '</div>\n'
        '</main>\n'
        f'<script defer src="static/mindmap-data.js?v={VERSION}"></script>\n'
        f'<script defer src="static/mindmap.js?v={VERSION}"></script>\n'
    )
    return (
        head("思维导图", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + page
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

    # 搜索索引（标题模糊搜索用），单独成文件便于跨页缓存
    index = [{"t": p["title"], "s": p["slug"], "c": p["category"]} for p in posts]
    (DIST / "static" / "search-index.js").write_text(
        "window.SEARCH_INDEX=" + json.dumps(index, ensure_ascii=False) + ";",
        encoding="utf-8",
    )
    print("✓ static/search-index.js")

    (DIST / "index.html").write_text(build_index(posts, groups), encoding="utf-8")
    print("✓ index.html")

    for p in posts:
        out = DIST / "posts" / f"{p['slug']}.html"
        out.write_text(build_post(p, groups), encoding="utf-8")
        print(f"✓ posts/{p['slug']}.html")

    (DIST / "tags.html").write_text(build_tags(posts, groups), encoding="utf-8")
    print("✓ tags.html")

    (DIST / "static" / "mindmap-data.js").write_text(
        build_mindmap_data(groups), encoding="utf-8")
    print("✓ static/mindmap-data.js")

    (DIST / "mindmap.html").write_text(build_mindmap(groups), encoding="utf-8")
    print("✓ mindmap.html")

    (DIST / "rss.xml").write_text(build_rss(posts), encoding="utf-8")
    print("✓ rss.xml")

    print(f"\n构建完成 → {DIST}")


if __name__ == "__main__":
    main()
