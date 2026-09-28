## 项目目录结构

```text
myblog/
├── _config.yml              
├── package.json             
├── package-lock.json        
├── deploy.js                # 部署脚本（跨平台）：pull → 优化图片 → clean → generate → main → 发布 public 到 gh-pages
├── preview.js               # 本地预览脚本（跨平台，默认 4000 端口）：先自动优化图片
├── README.md                
├── scaffolds/               # Hexo `hexo new` 使用的文章/页面/草稿模板
├── scripts/                 # 构建时自动加载的 Hexo 插件（文章日期 / 文章内图片路径 / search.json 排序）
├── tools/                   
│   └── optimize-images.js   
├── source/                  # 网站内容源（构建时处理）
│   ├── _data/               
│   │   ├── keep.yml         #   主题配置（首屏/一言/决策器/音乐播放器等）
│   │   ├── bookmarks.yml    #   书签页面数据
│   │   ├── record.yml       #   record 页面数据
│   │   └── icons.yml        #   自定义社交图标
│   ├── _posts/              # 博客文章（Markdown，图片放在同名资源文件夹）
│   ├── images/              # 站点图片（头像/社交/书签缩略图/record 封面等）
│   ├── bookmarks/           # 书签页面源（index.md，template: bookmarks）
│   ├── record/              # record 页面源（index.md）
│   └── .nojekyll
├── themes/
│   └── hexo-theme-keep-master/   # Keep 主题源码
├── public/                  # 生成的静态网站（部署到 gh-pages 分支）
├── workers/                 # Cloudflare Worker 源码（部署到 Cloudflare，与博客构建无关）
│   ├── myblog-weather.js    #   天气代理：和风天气 JWT 签名 + 城市查询 + 实时天气
│   └── myblog-music.js      #   音乐代理：网易云歌单/播放地址/歌词（需配 NETEASE_COOKIE）
├── .github/
│   └── dependabot.yml      
└── .gitignore
```

## 发布文章

新建文章（在博客根目录运行）：

```bash
hexo new "文章标题"
```

然后编辑生成的 Markdown 文件：

```text
source/_posts/文章标题.md
```

文章图片建议放在文章同名资源文件夹里：

```text
source/_posts/文章标题.md
source/_posts/文章标题/图片名.jpg
```

## 更新 Record

Record 页面用于记录图片、音乐、影视、游戏等。常用文件：

```text
source/_data/record.yml
source/images/record/
```

新增一条 Record 时，先把封面图片（任意格式/任意大小）放到：

```text
source/images/record/图片名.jpg
```

然后在 `source/_data/record.yml` 里新增一段：

```yaml
- type: photo / music / drama / game
  title: "标题"                       
  date: 2026-06-13
  cover: ../images/record/图片名.jpg
  rating:
  link:
  text: "文字记录"
```

封面图片**无需手动压缩**：运行 `node preview.js` 或 `node deploy.js` 时，`tools/optimize-images.js` 会自动把它转成 WebP（宽 800px、质量 82），并把 `record.yml` 里的 `cover` 路径同步为 `.webp`（原图会备份到 `source/images/record/_original/`，不会上传）。

也可以手动执行：

```bash
npm run images
# 或指定目录：node tools/optimize-images.js source/images/record source/images/其他目录
```

> 提示：`_original/` 目录已被 `.gitignore` 忽略，备份仅作本地安全网，可从 git 历史恢复原始文件。

## 本地预览

在博客根目录运行：

```bash
node preview.js          # 默认 4000 端口
node preview.js 4010     # 指定端口
```

脚本会先自动优化 `source/images/record/` 下的图片（WebP + 800px，已规范化则跳过），再构建并启动本地服务。然后打开：

```text
http://127.0.0.1:4000/
```

## 部署

当前仓库结构：

```text
main 分支：Hexo 源码、主题、文章、配置、脚本
gh-pages 分支：只保存 public 生成后的静态网站文件
```

确认本地预览没问题后，在博客根目录运行：

```bash
node deploy.js
```

部署脚本会自动执行：

```text
git pull --rebase --autostash origin main   # 先同步另一台设备，避免 push 失败
优化图片（tools/optimize-images.js，WebP + 800px）
hexo clean
hexo generate
git add -A
git commit
git push origin main
将 public 内容发布到 gh-pages 分支
```

默认提交说明会自动生成，例如：

```text
update blog 2026-06-03 19:20
```

也可以手动指定提交说明：

```bash
node deploy.js "new post"
```

> **设备同步**：每次开始前先 `git pull`（`node deploy.js` 会自动执行），发布统一用 `node deploy.js`。
> 不要对 `main` 分支使用 `--force` 推送，否则会覆盖另一台设备的提交。
