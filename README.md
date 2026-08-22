# Ton3rr 博客（Hexo + Keep 主题）

## 项目目录结构

```text
D:\myblog\
├── _config.yml              
├── package.json             
├── package-lock.json        
├── deploy.ps1               # 部署脚本：clean → generate → main → 发布 public 到 gh-pages
├── preview.ps1              # 本地预览脚本（默认 4000 端口，可用 -Port 指定）
├── README.md                
├── scaffolds/               # Hexo 新文章/页面模板
├── scripts/                 # 自定义 Hexo 脚本（文章日期处理、文章内图片路径处理）
├── source/                  # 网站内容源（构建时处理）
│   ├── _data/               
│   │   ├── keep.yml         #   主题配置
│   │   ├── tools.yml        #   tools 页面数据
│   │   ├── record.yml       #   record 页面数据
│   │   └── icons.yml        #   自定义社交图标
│   ├── _posts/              # 博客文章（Markdown，图片放在同名资源文件夹）
│   ├── images/              
│   ├── record/              
│   ├── tools/               
│   └── .nojekyll
├── themes/
│   └── hexo-theme-keep-master/   # Keep 主题源码
├── public/                  # 生成的静态网站（部署到 gh-pages 分支）
├── workers/                 
│   ├── myblog-weather.js    #   天气代理：和风天气 JWT 签名 + 城市查询 + 实时天气
│   └── myblog-music.js      #   音乐代理：网易云歌单/播放地址/歌词（需配 NETEASE_COOKIE）
├── .github/
│   └── dependabot.yml      
└── .gitignore
```

## 发布文章

新建文章：

```powershell
cd D:\myblog
hexo new "文章标题"
```

然后编辑生成的 Markdown 文件：

```text
D:\myblog\source\_posts\文章标题.md
```

文章图片建议放在文章同名资源文件夹里：

```text
D:\myblog\source\_posts\文章标题.md
D:\myblog\source\_posts\文章标题\图片名.jpg
```

## 更新 Record

Record 页面用于记录图片、音乐、影视、游戏等。常用文件：

```text
D:\myblog\source\_data\record.yml
D:\myblog\source\images\record\
```

新增一条 Record 时，先把封面图片放到：

```text
D:\myblog\source\images\record\图片名.jpg
```

然后在 `D:\myblog\source\_data\record.yml` 里新增一段：

```yaml
- type: photo / music / drama / game
  title: "标题"                       
  date: 2026-06-13
  cover: /images/record/图片名.jpg
  rating:
  link:
  text: "文字记录"
```

## 本地预览

运行：

```powershell
./ D:\myblog\preview.ps1
```

然后打开：

```text
http://127.0.0.1:4000/
```

如果 4000 端口被占用，可以指定端口：

```powershell
./ D:\myblog\preview.ps1 -Port 4010
```

## 部署

当前仓库结构：

```text
main 分支：Hexo 源码、主题、文章、配置、脚本
gh-pages 分支：只保存 public 生成后的静态网站文件
```

确认本地预览没问题后，运行：

```powershell
./ D:\myblog\deploy.ps1
```

部署脚本会自动执行：

```text
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

也可以手动指定：

```powershell
./ D:\myblog\deploy.ps1 -Message "new post"
```
