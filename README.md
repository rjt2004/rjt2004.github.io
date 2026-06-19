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

这样本地 Markdown 编辑器和 Hexo 网站都更容易兼容。文章里写图片时，使用“文章文件夹名/图片名”的形式：

```html
<p align="center">
  <img src="文章标题/图片名.jpg" alt="图片说明" style="width:60%; max-width:720px;">
</p>
```

`width` 控制图片显示宽度，`max-width` 避免图片在大屏上过宽。给图片添加链接：

```html
<p align="center">
  <a href="https://example.com" target="_blank">
    <img src="文章标题/图片名.jpg" alt="图片说明" style="width:60%; max-width:720px;">
  </a>
</p>
```

文字链接使用 Markdown：

```markdown
[链接文字](https://example.com)
```

文章封面也可以放在同名资源文件夹里，然后在文章开头写：

```yaml
home_cover: 图片名.jpg
```

项目中增加了兼容脚本：

```text
D:\myblog\scripts\post-asset-html-images.js
```

这个脚本会在 Hexo 生成前，把 HTML 图片路径里的 `文章标题/图片名.jpg` 转换为文章资源路径需要的 `图片名.jpg`。这样同一份写法可以同时兼容本地 Markdown 预览和网站部署，不要删除这个脚本。

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
