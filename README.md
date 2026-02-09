# 音乐下载器（Cloudflare 版）

这是一个可部署到 Cloudflare 的网页版音乐下载器项目，保留桌面版核心流程：

- CSV 批量读取（列：`歌曲名`、`歌手`）
- 匹配模式：`精准` / `模糊` / `手动`
- 下载 MP3 后在浏览器端写入 ID3（标题、歌手、专辑、歌词、封面）
- 支持写入 Cloudflare R2，并生成可分享下载链接（默认启用）

## 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fyxsky/music_downloader_cloudflare&branch=main)

## 技术方案

- Cloudflare Workers：提供 `/api/*` 代理接口（搜索、详情、歌词、下载、封面抓取）
- Workers 静态资源托管：直接托管前端页面
- Cloudflare R2：存储生成的 MP3 文件并提供下载链接
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

## R2 配置（必须）

项目已在 `wrangler.toml` 内声明 R2 绑定：

- 绑定名：`MUSIC_BUCKET`
- 桶名：`music-downloader-files`

首次部署前，请在 Cloudflare R2 中创建同名桶 `music-downloader-files`，否则部署会因绑定不存在而失败。

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
- 勾选“上传到 R2”后，文件将存入 R2 并返回下载链接，不会每首歌都弹本地保存框。
- 取消“上传到 R2”后，回退为浏览器本地下载模式（会弹保存提示）。
