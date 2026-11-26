# AGENTS.md

NKC 媒体处理服务。接收 `nkc` 投递的上传任务，按类型转码 / 生成缩略图 / 抽取 PDF 预览，再把产物上传到 `nkc-store` 落盘，最后回调 `nkc` 更新状态。

## 技术栈

- **纯 JavaScript + CommonJS，没有 TypeScript，没有构建步骤**（改完直接重启即生效）
- Koa 2 + koa-router + koa-body（formidable）
- Bull（`bull` 4.x）+ Redis：四类任务队列；`@bull-board` 提供可视化面板
- moleculer：作为 media 服务加入服务网格，回调 `nkc` 的 action
- 外部程序：FFmpeg（`fluent-ffmpeg`）、ImageMagick（`easyimage`）、QPDF、Ghostscript
- 依赖安装用 **npm**（历史原因，锁文件为 `package-lock.json`，与 `nkc` 的 yarn 约定不同）

## 目录结构

```
server.js                     # 入口：建 temp、挂 BullBoard、Koa 中间件、StartBroker、listen
routes.js                     # 只有一个 POST /
router/upload.js              # 按 type 把任务投进对应队列
modules/queue.js              # 四个队列 + BullBoard + worker（调用 fileProcessor[type]）
services/fileProcessor/
├── index.js                  # type → 处理器 的映射表
├── mediaPicture.js / mediaVideo.js / mediaAudio.js / mediaAttachment.js
├── attachment.js / identityPictureA.js / identityPictureB.js / identityVideo.js
└── messageImage.js / messageVideo.js / messageAudio.js / messageVoice.js / messageFile.js
comm/                         # moleculer：broker、configs、call、app（服务+action）、args
socket.js                     # 回调 nkc：setResourceStatus / setVerifiedStatus
tools.js                      # 外部命令、ffprobe、图片/视频信息、storeClient、文件操作
middlewares/                  # init（ctx.data）、error、body（输出 ctx.data）
public/                       # 预览页脚图等静态资源
```

## 一条上传的完整链路

```
nkc ──POST /（multipart：file / cover / data / type / storeUrl）
   → router/upload.js 按 type 选队列
   → modules/queue.js 的 worker 取任务，调 fileProcessor[type]({file, cover, data, storeUrl})
   → 处理器转码、生成衍生物（缩略图 / 封面 / 预览）
   → tools.storeClient() 以 multipart 上传到 nkc-store
   → socket.js 的 sendMessageToNkc() 回调 nkc（resourceStatus / verifiedUploadState）
   → 路由把 job.finished() 的结果放进 ctx.data，由 body 中间件以 JSON 返回
```

**接口是同步等结果的**：`router/upload.js` 里 `await job.finished()`，所以一个请求会挂到任务处理完（`server.requestTimeout` 为 20 分钟）。新增耗时逻辑时考虑这个上限。

## 新增一种媒体类型：必须同步改三处

1. `router/upload.js` 的 `switch (type)` 增加 `case`（决定进哪个队列）
2. `services/fileProcessor/index.js` 注册 `type → 模块`
3. 新建 `services/fileProcessor/<type>.js`，导出 `async ({file, cover, data, storeUrl}) => {...}`

漏改第 1 处会抛 `Unsupported media type <type>`；漏改第 2 处则 worker 里 `fileProcessor[type]` 是 `undefined`，任务反复失败。

### 现有 type 与队列的对应（改队列归属前先看这里）

| 队列 | type |
| --- | --- |
| picture | `mediaPicture`、`identityPictureA`、`identityPictureB`、`attachment`、`messageImage` |
| audio | `mediaAudio`、`messageVoice`、`messageAudio` |
| video | `mediaVideo`、`identityVideo`、`messageVideo` |
| attachment | `mediaAttachment`、`messageFile` |

`identityPictureB.js` 与 `messageVoice.js` 各只有一行，是**转发**到 `identityPictureA` / `messageAudio` 的别名实现——改行为要去被转发的那个文件，改这两个文件没有效果。

队列名是 `queue-<queue.namespace>:<类型>`，**改 namespace 会让已在 Redis 里的积压任务变成孤儿**，只能在空队列时改。

## 配置

`configs.js`（**被 .gitignore 忽略，不要提交、不要把内容贴进对话**），模板见 `configs.template.js`：

| 配置 | 作用 |
| --- | --- |
| `address` / `port` | 主服务监听（默认 10283） |
| `moleculer.namespace` / `transporter` / `web` | 服务网格命名空间（必须与 `nkc`、`nkc-websocket` 一致）、Redis transporter、moleculer-web 端口（20396） |
| `queue` | 四类队列的并发数 + `redisUrl` + `namespace` |
| `ffmpeg.encoder` | `libx264` / `h264_nvenc` / `h264_amf`，按机器有无硬件编码器选 |
| `pdfPreview` | PDF 预览的最大缩放与最大页数 |

并发数按机器 CPU / 内存调：`video` 默认 2，调大很容易把机器压死。模块顶层直接 `require('../configs.js')`，**缺这个文件服务直接启动失败**，这是有意的设计，不要加默认值兜底。

## 规范

- 新增文件用 CommonJS，**不要写 TypeScript**：本仓库没有编译步骤，混入 TS 等于引入一套新工具链。
- 调用外部程序统一走 `tools.spawnProcess()`，不要自己 `child_process.spawn`——里面统一处理了 stdout/stderr 收集与非零退出码。
- 大文件全程流式：上传用 formidable 落到 `temp/`，转存用 `form-data` + `createReadStream`。不要改成 `readFileSync` / `readFile`。
- `temp/` 是临时目录（gitignored），处理完要清理源文件与中间产物，否则磁盘会被悄悄吃满。
- 失败时要让 `nkc` 知道：参照既有处理器，用 `sendMessageToNkc(...)` 带 `status: false` 与 `error` 上报，不要只 `console.error` 后静默返回成功。
- 日志/错误输出沿用现有 `console` 风格即可（本仓库没有 logger 模块），但不要把整个文件内容或用户数据打进日志。
- 中文注释；提交信息用 Conventional Commits 前缀 + 中文描述。

## 运行与验证

```bash
npm i                       # 依赖安装用 npm
cp configs.template.js configs.js   # 再按本机情况改
npm start                   # 或 npm start -- --host 0.0.0.0 --port 8080
```

- 装好 ImageMagick / FFmpeg / QPDF / Ghostscript 并加入 PATH，否则对应处理器会在运行时报错。
- 队列面板：`http://<host>:<port>/admin/queues`，排查"任务卡住 / 反复失败"先看这里。
- **没有测试、没有 lint 脚本**。改完靠静态检查 + 必要时手动 POST 一次真实文件验证；不要为此引入测试框架。
- `socket.js` 不是 WebSocket 服务端，而是回调 `nkc` 的 moleculer 客户端；`server.js` 里那行被注释掉的 `// require('./socket')` 与本文件无关，不要误以为它是未启用的服务端。
