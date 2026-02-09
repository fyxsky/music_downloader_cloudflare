# 音乐下载器（Cloudflare 版）

这是一个可部署到 Cloudflare 的网页版音乐下载器项目，保留桌面版核心流程：

- CSV 批量读取（列：`歌曲名`、`歌手`）
- 匹配模式：`精准` / `模糊` / `手动`
- 下载 MP3 后在浏览器端写入 ID3（标题、歌手、专辑、歌词、封面）

## 技术方案

- Cloudflare Workers：提供 `/api/*` 代理接口（搜索、详情、歌词、下载、封面抓取）
- Workers 静态资源托管：直接托管前端页面
- 前端：纯 HTML/CSS/JavaScript + `browser-id3-writer`

## 本地开发

```bash
npm install
npm run dev
```

## 部署到 Cloudflare

```bash
npm install
npx wrangler login
npm run deploy
```

部署完成后会返回可访问域名。

## 通过 GitHub 自动部署（推荐）

1. 将本仓库推送到 GitHub。
2. 在 Cloudflare Dashboard 中创建 Worker 项目并连接该仓库。
3. 构建命令：`npm install`
4. 部署命令：`npm run deploy`

## 注意事项

- 本项目仅用于学习与技术研究，请遵守当地法律法规与平台条款。
- 浏览器下载文件会保存到系统默认下载目录，无法像桌面应用那样直接指定任意本地文件夹。
