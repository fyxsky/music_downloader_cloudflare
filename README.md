# 音乐下载器（Cloudflare 版）

这是一个可部署到 Cloudflare 的网页版音乐下载器项目，保留桌面版核心流程：

- CSV 批量读取（列：`歌曲名`、`歌手`）
- 匹配模式：`自动` / `手动`
- 自动模式规则：歌曲名必须一致，优先精确歌手，失败后在同名候选中回退到可下载条目
- 支持并发数按钮选择：`1 / 2 / 4`（手动模式会自动降为 `1`）
- 支持任务控制：`暂停/继续` 与 `停止`（停止后当前进行中的任务完成即结束）
- 下载 MP3 后在浏览器端写入 ID3（标题、歌手、专辑、歌词、封面）
- 列表显示封面/歌词写入状态（已写入、无封面、无歌词、获取失败）
- 列表显示专辑艺术家、年份、曲目编号写入结果（专辑艺术家/年份显示具体值）
- 本地下载按每 30 首自动打包成一个 ZIP（降低浏览器内存压力）

## 一键部署到 Cloudflare

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/fyxsky/music_downloader_cloudflare&branch=main" target="_blank" rel="noopener noreferrer">
  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
</a>

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
若未配置上述 Secrets，工作流会自动跳过部署且不会报失败（便于 fork 和一键部署测试）。

如果需要手动触发，也可以在 `Actions` 页面执行 `Deploy to Cloudflare` 工作流（`workflow_dispatch`）。

## 注意事项

- 本项目仅用于学习与技术研究，请遵守当地法律法规与平台条款。
- 当前版本仅支持浏览器本地下载，处理完成后会自动按 30 首一批输出 ZIP 文件。
