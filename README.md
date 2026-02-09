# 音乐下载器（Cloudflare 版）

这是一个可部署到 Cloudflare 的网页版音乐下载器项目，保留桌面版核心流程：

- CSV 批量读取（列：`歌曲名`、`歌手`）
- 匹配模式：`精准` / `模糊` / `手动`
- 下载 MP3 后在浏览器端写入 ID3（标题、歌手、专辑、歌词、封面）

## 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fyxsky/music_downloader_cloudflare)

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

本仓库已内置 GitHub Actions 自动部署工作流：`.github/workflows/deploy.yml`。

你只需要在 GitHub 仓库中配置以下 Secrets：

1. `CLOUDFLARE_API_TOKEN`
2. `CLOUDFLARE_ACCOUNT_ID`

配置路径：

`GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret`

完成后，每次推送到 `main` 分支都会自动部署到 Cloudflare。

如果需要手动触发，也可以在 `Actions` 页面执行 `Deploy to Cloudflare` 工作流（`workflow_dispatch`）。

## 注意事项

- 本项目仅用于学习与技术研究，请遵守当地法律法规与平台条款。
- 浏览器下载文件会保存到系统默认下载目录，无法像桌面应用那样直接指定任意本地文件夹。
