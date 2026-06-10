# 个人博客

极简静态博客，Markdown 写作，push 后自动部署到 VPS。

## 目录结构

```
├── posts/          ← 在这里写文章（.md 文件）
├── static/
│   └── style.css   ← 样式（可自定义）
├── scripts/
│   └── build.py    ← 构建脚本
├── dist/           ← 构建输出（自动生成，不要手动编辑）
└── .github/
    └── workflows/
        └── deploy.yml  ← 自动部署
```

## 写文章

在 `posts/` 目录下新建 `.md` 文件，文件头格式：

```markdown
---
title: 文章标题
date: 2026-06-10
tags: [标签1, 标签2]
summary: 一句话摘要（显示在首页）
---

正文内容...
```

文件名建议用英文或拼音，如 `my-first-post.md`。

## 本地预览

```bash
# 安装依赖（只需一次）
pip install markdown python-frontmatter

# 构建
python scripts/build.py

# 预览（用任意 HTTP 服务器）
cd dist && python -m http.server 8000
# 打开 http://localhost:8000
```

## 自动部署配置

首次使用需要在 GitHub 配置 SSH 密钥：

### 1. 生成部署密钥（在 VPS 上执行）

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
# 将公钥加入授权列表
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
# 显示私钥（复制备用）
cat ~/.ssh/deploy_key
```

### 2. 添加到 GitHub Secrets

进入仓库 → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `SSH_PRIVATE_KEY`
- Value: 粘贴上一步的私钥内容（包含 `-----BEGIN...` 和 `-----END...`）

### 3. 推送触发部署

```bash
git add .
git commit -m "新文章"
git push
```

GitHub Actions 会自动构建并部署，约 1 分钟完成。

## Nginx 配置

VPS 上 Nginx 应监听内部端口 `2096`：

```nginx
server {
    listen 2096;
    server_name www.hfj39dk2jslqwe8r0z7xv6b1asea.dpdns.org;

    root /var/www/blog/myrepo;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    gzip on;
    gzip_types text/html text/css application/javascript;
}
```

Cloudflare DNS：A 记录 → `204.152.198.206`，橙色云朵开启，回源端口 2096。
