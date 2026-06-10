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

# ── HTML 模板 ─────────────────────────────────────────
HEAD = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="{root}static/style.css">
<link rel="alternate" type="application/rss+xml" title="RSS" href="{root}rss.xml">
</head>
<body>
<header class="site-header">
  <a href="{root}index.html" class="site-logo">—</a>
  <nav>
    <a href="{root}index.html">文章</a>
    <a href="{root}tags.html">标签</a>
  </nav>
</header>
<main>
"""

FOOT = """</main>
<footer class="site-footer">
  <span>以文字为容器</span>
  <a href="{root}rss.xml">RSS</a>
</footer>
</body>
</html>"""


def slugify(text):
    text = re.sub(r'[^\w\u4e00-\u9fff\-]', '-', text.lower())
    return re.sub(r'-+', '-', text).strip('-')


def parse_frontmatter(text):
    """解析 YAML frontmatter，返回 (meta_dict, content_str)"""
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
    for md_file in sorted(POSTS.glob("*.md"), reverse=True):
        raw = md_file.read_text(encoding="utf-8")
        meta, content = parse_frontmatter(raw)

        tags = meta.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",")]

        date_raw = meta.get("date", "")
        if hasattr(date_raw, "strftime"):
            date_str = date_raw.strftime("%Y-%m-%d")
        else:
            date_str = str(date_raw)[:10] if date_raw else ""

        title = meta.get("title", md_file.stem)
        posts.append({
            "title":   title,
            "date":    date_str,
            "tags":    tags,
            "summary": meta.get("summary", ""),
            "slug":    slugify(title),
            "content": content,
            "source":  md_file.name,
        })
    return posts


def render_md(content):
    md = markdown.Markdown(extensions=["fenced_code", "tables", "toc", "nl2br"])
    return md.convert(content)


def build_index(posts):
    items = ""
    for p in posts:
        tag_html = "".join(
            f'<a href="tags.html#{slugify(t)}" class="tag">{t}</a>' for t in p["tags"]
        )
        items += f"""
<article class="post-card">
  <div class="post-meta">
    <time>{p["date"]}</time>
    <div class="tags">{tag_html}</div>
  </div>
  <h2><a href="posts/{p["slug"]}.html">{p["title"]}</a></h2>
  {f'<p class="summary">{p["summary"]}</p>' if p["summary"] else ""}
</article>"""

    return (
        HEAD.format(title="博客", root="")
        + f'<div class="post-list">{items}</div>'
        + FOOT.format(root="")
    )


def build_post(post):
    tag_html = "".join(
        f'<a href="../tags.html#{slugify(t)}" class="tag">{t}</a>' for t in post["tags"]
    )
    body = f"""
<article class="post-full">
  <header class="post-header">
    <div class="post-meta">
      <time>{post["date"]}</time>
      <div class="tags">{tag_html}</div>
    </div>
    <h1>{post["title"]}</h1>
  </header>
  <div class="post-body">
    {render_md(post["content"])}
  </div>
  <a href="../index.html" class="back-link">← 返回</a>
</article>"""
    return (
        HEAD.format(title=post["title"], root="../")
        + body
        + FOOT.format(root="../")
    )


def build_tags(posts):
    tag_map = {}
    for p in posts:
        for t in p["tags"]:
            tag_map.setdefault(t, []).append(p)

    sections = ""
    for tag, tposts in sorted(tag_map.items()):
        sid = slugify(tag)
        items = "".join(
            f'<li><a href="posts/{p["slug"]}.html">{p["title"]}</a>'
            f'<time>{p["date"]}</time></li>'
            for p in tposts
        )
        sections += f"""
<section class="tag-section" id="{sid}">
  <h2 class="tag-heading">#{tag} <span class="tag-count">{len(tposts)}</span></h2>
  <ul class="tag-post-list">{items}</ul>
</section>"""

    return (
        HEAD.format(title="标签", root="")
        + f'<div class="tags-page"><h1 class="page-title">标签</h1>{sections}</div>'
        + FOOT.format(root="")
    )


def build_rss(posts):
    items = ""
    for p in posts[:20]:
        items += f"""
  <item>
    <title><![CDATA[{p["title"]}]]></title>
    <link>posts/{p["slug"]}.html</link>
    <pubDate>{p["date"]}</pubDate>
    <description><![CDATA[{p["summary"]}]]></description>
  </item>"""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>博客</title>
  <link>index.html</link>
  <description>个人博客</description>
  {items}
</channel>
</rss>"""


def main():
    # 清空并重建 dist
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    (DIST / "posts").mkdir()
    (DIST / "static").mkdir()

    # 复制静态资源
    for f in STATIC.glob("*"):
        if f.is_file():
            shutil.copy(f, DIST / "static" / f.name)

    posts = parse_posts()
    print(f"找到 {len(posts)} 篇文章")

    # 首页
    (DIST / "index.html").write_text(build_index(posts), encoding="utf-8")
    print("✓ index.html")

    # 文章页
    for p in posts:
        out = DIST / "posts" / f"{p['slug']}.html"
        out.write_text(build_post(p), encoding="utf-8")
        print(f"✓ posts/{p['slug']}.html")

    # 标签页
    (DIST / "tags.html").write_text(build_tags(posts), encoding="utf-8")
    print("✓ tags.html")

    # RSS
    (DIST / "rss.xml").write_text(build_rss(posts), encoding="utf-8")
    print("✓ rss.xml")

    print(f"\n构建完成 → {DIST}")


if __name__ == "__main__":
    main()
