#!/usr/bin/env python3
"""
博客构建脚本
将 posts/ 目录下的 .md 文件构建为完整静态网站到 dist/ 目录
依赖: pip install markdown PyYAML
"""

import os
import shutil
import re
from pathlib import Path

try:
    import markdown
    import yaml
except ImportError:
    print("安装依赖中...")
    os.system("pip install markdown PyYAML --break-system-packages -q")
    import markdown
    import yaml

# ── 路径配置 ──────────────────────────────────────────
ROOT    = Path(__file__).parent.parent
POSTS   = ROOT / "posts"
STATIC  = ROOT / "static"
DIST    = ROOT / "dist"

# ── 分类（按文件名前缀） ──────────────────────────────
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
        f'<link rel="stylesheet" href="{root}static/style.css">\n'
        f'<link rel="alternate" type="application/rss+xml" title="RSS" href="{root}rss.xml">\n'
        '</head>\n'
        '<body data-theme="paper">\n'
        '<header class="site-header">\n'
        f'  <a href="{root}index.html" class="site-logo">—</a>\n'
        '  <nav>\n'
        f'    <a href="{root}index.html">文章</a>\n'
        f'    <a href="{root}tags.html">目录</a>\n'
        '  </nav>\n'
        '  <button id="theme-toggle" type="button" aria-label="切换主题"><span class="theme-name">纸</span></button>\n'
        '  <button id="sidebar-toggle" type="button" aria-label="目录">≡</button>\n'
        '</header>\n'
        '<div class="layout">\n'
    )


def foot(root=""):
    return (
        '</div>\n'
        '<footer class="site-footer">\n'
        '  <span>以文字为容器</span>\n'
        f'  <a href="{root}rss.xml">RSS</a>\n'
        '</footer>\n'
        f'<script src="{root}static/theme.js"></script>\n'
        f'<script src="{root}static/pet.js"></script>\n'
        '</body>\n'
        '</html>'
    )


def render_sidebar(groups, root="", current_slug=None):
    out = ['<aside class="sidebar" id="sidebar">', '<nav class="cat-nav">']
    for cat_name, cat_posts in groups:
        is_open = any(p["slug"] == current_slug for p in cat_posts)
        open_attr = " open" if is_open else ""
        out.append(f'<details class="cat"{open_attr}>')
        out.append(f'  <summary>{cat_name} <span class="cat-count">{len(cat_posts)}</span></summary>')
        out.append('  <ul class="cat-posts">')
        for p in cat_posts:
            cls = "active" if p["slug"] == current_slug else ""
            slug = p["slug"]
            title = p["title"]
            out.append(f'    <li class="{cls}"><a href="{root}posts/{slug}.html" title="{title}">{title}</a></li>')
        out.append('  </ul>')
        out.append('</details>')
    out.append('</nav>')
    out.append('</aside>')
    return "\n".join(out)


def render_pet():
    parts = []
    parts.append('<aside class="pet-area" id="pet-area">')
    parts.append('<div id="pet-stage">')
    parts.append('<svg id="pet" viewBox="0 0 240 320" xmlns="http://www.w3.org/2000/svg">')
    # 后发
    parts.append('<path id="hair-back" d="M 60 110 Q 50 180 65 240 L 85 250 Q 70 200 80 130 Z M 180 110 Q 190 180 175 240 L 155 250 Q 170 200 160 130 Z" fill="var(--pet-hair)"/>')
    # 双马尾
    parts.append('<g id="tail-left"><path d="M 70 130 Q 40 180 50 240 Q 55 260 70 250 Q 75 200 90 145 Z" fill="var(--pet-hair)"/></g>')
    parts.append('<g id="tail-right"><path d="M 170 130 Q 200 180 190 240 Q 185 260 170 250 Q 165 200 150 145 Z" fill="var(--pet-hair)"/></g>')
    # 身体
    parts.append('<g id="body">')
    parts.append('<path d="M 120 200 L 95 215 L 80 290 L 160 290 L 145 215 Z" fill="var(--pet-dress)"/>')
    parts.append('<ellipse cx="120" cy="208" rx="14" ry="5" fill="var(--pet-skin)"/>')
    parts.append('<g id="ribbon">')
    parts.append('<ellipse cx="108" cy="222" rx="7" ry="5" fill="var(--pet-accent)"/>')
    parts.append('<ellipse cx="132" cy="222" rx="7" ry="5" fill="var(--pet-accent)"/>')
    parts.append('<circle cx="120" cy="222" r="3" fill="var(--pet-accent-dark)"/>')
    parts.append('</g></g>')
    # 待机手臂
    parts.append('<g id="arms-idle">')
    parts.append('<path d="M 95 215 Q 80 245 78 275 Q 76 285 86 285 Q 92 260 105 230 Z" fill="var(--pet-skin)"/>')
    parts.append('<path d="M 145 215 Q 160 245 162 275 Q 164 285 154 285 Q 148 260 135 230 Z" fill="var(--pet-skin)"/>')
    parts.append('</g>')
    # 比心手臂
    parts.append('<g id="arms-heart" style="display:none">')
    parts.append('<path d="M 95 215 Q 75 175 90 130 Q 100 122 108 130 Q 102 165 115 200 Z" fill="var(--pet-skin)"/>')
    parts.append('<path d="M 145 215 Q 165 175 150 130 Q 140 122 132 130 Q 138 165 125 200 Z" fill="var(--pet-skin)"/>')
    parts.append('<path d="M 120 100 C 108 90, 95 100, 105 115 C 110 122, 120 130, 120 130 C 120 130, 130 122, 135 115 C 145 100, 132 90, 120 100 Z" fill="var(--pet-accent)" stroke="var(--pet-accent-dark)" stroke-width="1.5"/>')
    parts.append('</g>')
    # 头部组
    parts.append('<g id="head-group">')
    parts.append('<ellipse id="head" cx="120" cy="135" rx="52" ry="58" fill="var(--pet-skin)"/>')
    # 前发
    parts.append('<path id="hair-front" d="M 68 110 Q 72 75 120 70 Q 168 75 172 110 Q 168 120 150 115 Q 145 95 130 90 Q 125 110 110 112 Q 100 95 90 95 Q 82 110 78 115 Q 70 118 68 110 Z" fill="var(--pet-hair)"/>')
    # 呆毛
    parts.append('<path id="ahoge" d="M 118 70 Q 125 50 130 65 Q 128 72 120 73 Z" fill="var(--pet-hair)"/>')
    # 腮红
    parts.append('<ellipse class="blush" cx="92" cy="155" rx="9" ry="4" fill="var(--pet-blush)" opacity="0.55"/>')
    parts.append('<ellipse class="blush" cx="148" cy="155" rx="9" ry="4" fill="var(--pet-blush)" opacity="0.55"/>')
    # 左眼
    parts.append('<g id="eye-left">')
    parts.append('<ellipse class="eye-white" cx="100" cy="138" rx="9" ry="13" fill="white"/>')
    parts.append('<g class="pupil-wrap">')
    parts.append('<ellipse class="iris" cx="100" cy="139" rx="7" ry="10" fill="var(--pet-eye)"/>')
    parts.append('<circle class="pupil-dark" cx="100" cy="140" r="3.5" fill="#0d1a26"/>')
    parts.append('<circle class="hl-1" cx="102" cy="135" r="2.5" fill="white"/>')
    parts.append('<circle class="hl-2" cx="98" cy="143" r="1.2" fill="white"/>')
    parts.append('</g>')
    parts.append('<rect class="lid" x="89" y="125" width="22" height="0" fill="var(--pet-skin)"/>')
    parts.append('</g>')
    # 右眼
    parts.append('<g id="eye-right">')
    parts.append('<ellipse class="eye-white" cx="140" cy="138" rx="9" ry="13" fill="white"/>')
    parts.append('<g class="pupil-wrap">')
    parts.append('<ellipse class="iris" cx="140" cy="139" rx="7" ry="10" fill="var(--pet-eye)"/>')
    parts.append('<circle class="pupil-dark" cx="140" cy="140" r="3.5" fill="#0d1a26"/>')
    parts.append('<circle class="hl-1" cx="142" cy="135" r="2.5" fill="white"/>')
    parts.append('<circle class="hl-2" cx="138" cy="143" r="1.2" fill="white"/>')
    parts.append('</g>')
    parts.append('<rect class="lid" x="129" y="125" width="22" height="0" fill="var(--pet-skin)"/>')
    parts.append('</g>')
    # 嘴
    parts.append('<path id="mouth" d="M 115 168 Q 120 172 125 168" fill="none" stroke="#a15660" stroke-width="1.5" stroke-linecap="round"/>')
    # 亮闪
    parts.append('<g id="sparkles" style="display:none">')
    parts.append('<path d="M 100 132 l 2 -4 l 2 4 l 4 2 l -4 2 l -2 4 l -2 -4 l -4 -2 z" fill="#ffe66a"/>')
    parts.append('<path d="M 140 132 l 2 -4 l 2 4 l 4 2 l -4 2 l -2 4 l -2 -4 l -4 -2 z" fill="#ffe66a"/>')
    parts.append('</g>')
    parts.append('</g>')  # head-group end
    # 飘心
    parts.append('<g id="floating-hearts" style="display:none">')
    parts.append('<path class="fh fh1" d="M 80 80 c -4 -4 -10 0 -8 4 c 2 4 8 8 8 8 c 0 0 6 -4 8 -8 c 2 -4 -4 -8 -8 -4 z" fill="var(--pet-accent)"/>')
    parts.append('<path class="fh fh2" d="M 160 60 c -4 -4 -10 0 -8 4 c 2 4 8 8 8 8 c 0 0 6 -4 8 -8 c 2 -4 -4 -8 -8 -4 z" fill="var(--pet-accent)"/>')
    parts.append('<path class="fh fh3" d="M 190 100 c -4 -4 -10 0 -8 4 c 2 4 8 8 8 8 c 0 0 6 -4 8 -8 c 2 -4 -4 -8 -8 -4 z" fill="var(--pet-accent)"/>')
    parts.append('</g>')
    parts.append('</svg>')
    parts.append('<div id="pet-msg"></div>')
    parts.append('</div>')
    parts.append('</aside>')
    return "\n".join(parts)


def render_md(content):
    md = markdown.Markdown(extensions=["fenced_code", "tables", "toc", "nl2br"])
    return md.convert(content)


def build_index(posts, groups):
    cards = []
    for p in posts:
        card = (
            '<article class="post-card">\n'
            '  <div class="post-meta">\n'
            f'    <time>{p["date"]}</time>\n'
            f'    <span class="cat-badge">{p["category"]}</span>\n'
            '  </div>\n'
            f'  <h2><a href="posts/{p["slug"]}.html">{p["title"]}</a></h2>\n'
        )
        if p["summary"]:
            card += f'  <p class="summary">{p["summary"]}</p>\n'
        card += '</article>'
        cards.append(card)
    items = "\n".join(cards)
    return (
        head("博客", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + f'<main><div class="post-list">{items}</div></main>'
        + render_pet()
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
        + render_pet()
        + foot(root="../")
    )


def build_tags(posts, groups):
    sections = []
    for cat_name, cat_posts in groups:
        sid = slugify(cat_name)
        items = "".join(
            f'<li><a href="posts/{p["slug"]}.html">{p["title"]}</a><time>{p["date"]}</time></li>'
            for p in cat_posts
        )
        sections.append(
            f'<section class="tag-section" id="{sid}">'
            f'<h2 class="tag-heading">{cat_name} <span class="tag-count">{len(cat_posts)}</span></h2>'
            f'<ul class="tag-post-list">{items}</ul>'
            f'</section>'
        )
    body = "".join(sections)
    return (
        head("目录", root="")
        + render_sidebar(groups, root="", current_slug=None)
        + f'<main><div class="tags-page"><h1 class="page-title">目录</h1>{body}</div></main>'
        + render_pet()
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
