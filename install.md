# Installation

本文档记录 `node server.js` 启动时依赖的本地运行时、Python/Essentia 环境、模型文件和可选外部服务配置。

## 一键安装

新服务器 clone 仓库后，优先运行：

```bash
./scripts/setup_server.sh
```

脚本会尝试安装或验证：

```text
Node.js >= 18
Python 3.10
.venv-essentia
essentia-tensorflow
yt-dlp
所有曲风模型的 Essentia 模型文件（MAEST 30s Discogs519 + Discogs-EffNet/Discogs400），支持运行时切换
Discogs taxonomy
JavaScript / Python 分析脚本可用性
```

安装过程日志会写入：

```text
.setup-logs/
```

脚本最后会打印逐项摘要，包含每一项的 `OK` 或 `FAIL`。如果有失败项，按摘要中的日志文件排查后重新运行脚本即可。

脚本按可重复执行设计：已可用的 Node、Python 3.10、`.venv-essentia`、Python 包和模型文件会直接复用；缺失或不完整的部分才会继续安装。

如果新服务器缺少 Node.js，脚本会优先通过 `nvm` 安装 LTS 版本；如果服务器 glibc 太旧导致官方 Node 二进制无法启动，脚本会回退安装项目本地 Node 到 `.runtime/`，并在 `bin/` 下创建 `node/npm/npx` 链接。

如果缺少 Python 3.10，脚本会尝试通过 Homebrew、`apt-get`、`dnf` 或 `yum` 安装；如果系统源没有 Python 3.10，会回退到项目本地 Miniforge，并在 `.venv-essentia` 中创建 Python 3.10 环境。

## 运行时依赖

### Node.js

项目服务端是原生 Node HTTP server，不依赖 Express。

当前验证环境：

```text
Node.js v23.4.0
```

`package.json` 要求：

```text
node >= 18
```

启动命令：

```bash
npm start
```

如果脚本在老 Linux 上安装了项目本地 Node，先把项目 `bin/` 放到 PATH 前面：

```bash
export PATH="$PWD/bin:$PATH"
npm start
```

等价于：

```bash
node server.js
```

### Python

Essentia 音频模型分析通过本地 Python 虚拟环境运行。

当前验证环境：

```text
Python 3.10.17
```

推荐使用 Python 3.10。Python 3.14 等过新的版本可能缺少可用的 Essentia / TensorFlow wheel。

虚拟环境路径：

```text
.venv-essentia
```

Node 服务端固定调用：

```text
.venv-essentia/bin/python
scripts/analyze_genre.py
```

相关代码：

```text
server.js -> ESSENTIA_PYTHON
server.js -> ESSENTIA_SCRIPT
```

## Python 包依赖

核心包：

```text
essentia-tensorflow==2.1b6.dev1389
```

当前环境中 `essentia-tensorflow` 的依赖：

```text
numpy
pyyaml
six
```

安装命令：

```bash
python3.10 -m venv .venv-essentia
.venv-essentia/bin/python -m pip install --upgrade pip setuptools wheel
.venv-essentia/bin/python -m pip install essentia-tensorflow
```

验证 Essentia 是否可用：

默认模型 MAEST：

```bash
.venv-essentia/bin/python -c "import essentia; import essentia.standard as es; print(essentia.__version__); print(hasattr(es, 'TensorflowPredictMAEST'))"
```

预期至少看到：

```text
2.1-beta6-dev
True
```

如果切到旧的 EffNet + Discogs400 模型（`genreModel=effnet400`）：

```bash
.venv-essentia/bin/python -c "import essentia; import essentia.standard as es; print(essentia.__version__); print(hasattr(es, 'TensorflowPredictEffnetDiscogs')); print(hasattr(es, 'TensorflowPredict2D'))"
```

预期至少看到：

```text
2.1-beta6-dev
True
True
```

## 曲风模型选择

项目支持在运行时按请求切换曲风模型：前端下拉框和 `/api/essentia`、`/api/metadata` 的 `model` 参数都能选择本次分析用哪个模型。`config/defaults.json` 的 `genreModel`（或环境变量 `GENRE_MODEL`）只决定默认模型；请求未指定时回退到它。因为可以随时切换，所以两个模型的文件都需要在本地就位。

```text
maest519  （默认）Essentia MAEST，519 个 style，粒度更细，执行较慢
effnet400          Essentia Discogs400，400 个 style，粒度较粗，执行较快
```

`scripts/setup_server.sh` 默认会下载并校验 `GENRE_MODEL_LIST` 中的所有模型（默认 `effnet400 maest519`），同时为每个模型生成 taxonomy 产物：

```bash
# 默认安装全部模型（支持运行时切换）
./scripts/setup_server.sh

# 只安装单个模型（不需要切换时）
GENRE_MODEL_LIST=maest519 ./scripts/setup_server.sh
```

## Essentia 模型文件

### MAEST 30s Discogs519（默认）

`genreModel=maest519` 时，MAEST 单个模型直接完成音频到 519 个 Discogs style 分类。

必需文件：

```text
models/discogs-maest-30s-pw-519l-2.pb
models/discogs-maest-30s-pw-519l-2.json
```

下载命令：

```bash
mkdir -p models

curl --fail --location \
  --output models/discogs-maest-30s-pw-519l-2.pb \
  https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.pb

curl --fail --location \
  --output models/discogs-maest-30s-pw-519l-2.json \
  https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.json
```

模型说明：

```text
discogs-maest-30s-pw-519l-2.pb
  MAEST（Transformer）音频模型，直接输出 519 个 Discogs Genre/Style 分类

discogs-maest-30s-pw-519l-2.json
  519 个类别清单和 metadata，taxonomy 由此生成
```

### Discogs400（effnet400）

`genreModel=effnet400` 或请求切换到该模型时，使用 Essentia 官方 Discogs-EffNet + Discogs400 组合（两段式：embedding 提取 + 分类头），输出 400 个 style；相比 MAEST 粒度较粗，但通常执行更快。

必需文件：

```text
models/discogs-effnet-bs64-1.pb
models/discogs-effnet-bs64-1.json
models/genre_discogs400-discogs-effnet-1.pb
models/genre_discogs400-discogs-effnet-1.json
```

当前本地文件大小约为：

```text
discogs-effnet-bs64-1.pb                  18 MB
discogs-effnet-bs64-1.json                15 KB
genre_discogs400-discogs-effnet-1.pb     2.0 MB
genre_discogs400-discogs-effnet-1.json    15 KB
```

下载命令：

```bash
mkdir -p models

curl --fail --location \
  --output models/discogs-effnet-bs64-1.pb \
  https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb

curl --fail --location \
  --output models/discogs-effnet-bs64-1.json \
  https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json

curl --fail --location \
  --output models/genre_discogs400-discogs-effnet-1.pb \
  https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb

curl --fail --location \
  --output models/genre_discogs400-discogs-effnet-1.json \
  https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json
```

模型说明：

```text
discogs-effnet-bs64-1.pb
  音频 embedding / feature extractor

genre_discogs400-discogs-effnet-1.pb
  Discogs400 Genre/Style classifier
```

官方模型页：

```text
https://essentia.upf.edu/models.html
```

## Taxonomy 文件

每个模型的音乐风格体系是一份**固定配置文件**，直接手工维护、随代码版本管理，不再由脚本生成：

```text
data/<model>/discogs-taxonomy.json          # 分类体系 + translations.zh 中文名（按模型区分）
data/discogs-style-profiles.json            # 风格文案（语境 / 示例 / 规则），所有模型共用
data/discogs-style-profiles.md
```

其中 `discogs-taxonomy.json` 的 `translations.zh` 提供 genres/styles 的中文表达，供前后端按需查表展示。`discogs-style-profiles.json` 是与模型无关的共享风格说明，按 `Genre---Style` 的 `id` 供前端查表。

前端通过带 `?model=` 的稳定路径请求 taxonomy（如 `/discogs-taxonomy.js?model=effnet400`），服务端读取对应模型目录下的 JSON 并动态包装成 `window.DISCOGS_TAXONOMY = {...}` 返回；不带参数时回退默认模型。风格文案通过固定路径 `/discogs-style-profiles.js` 请求，服务端读取共享的 `data/discogs-style-profiles.json` 并包装成 `window.DISCOGS_STYLE_PROFILES = {...}`，不区分模型。引入新模型时，在 `data/<model>/` 下新增 taxonomy 配置并同步 `scripts/analyze_genre.py`、`server.js` 的模型注册即可。

## 下载音频依赖

服务端支持两类音频来源：

1. 用户上传本地音频
2. 使用 `yt-dlp` 搜索/下载公开视频音频

项目默认工作流是输入歌名/艺人后自动搜索并下载可分析音频，因此 **`yt-dlp` 是推荐安装的必需依赖**。当 `yt-dlp` 需要抽取音频或转码为 mp3 时，还必须能找到 **`ffmpeg` 和 `ffprobe`**。

只有在完全依赖页面里的“本地音频上传”时，才可以不安装 `yt-dlp`。这种情况下无法使用自动搜索和下载能力。

需要确保系统命令可用：

```bash
yt-dlp --version
ffmpeg -version
ffprobe -version
```

安装方式可按本机环境选择，例如：

```bash
brew install yt-dlp ffmpeg
```

或：

```bash
python3 -m pip install -U yt-dlp
sudo apt-get install -y ffmpeg
```

远端部署推荐直接运行：

```bash
bash scripts/setup_server.sh
```

脚本会安装/校验 `yt-dlp`、`ffmpeg`、`ffprobe`，并把 `ffmpeg/ffprobe` 链接到项目 `bin/` 目录，服务端会自动把这个目录传给 `yt-dlp`。如果使用自定义安装路径，可以在启动服务前设置：

```bash
FFMPEG_LOCATION=/path/to/ffmpeg-directory npm start
```

在 CentOS/RHEL 等 `yum install ffmpeg` 找不到包的服务器上，脚本会自动下载 Linux 静态 ffmpeg 到 `.runtime/` 作为兜底，不需要额外配置 EPEL/RPM Fusion。

相关服务端函数：

```text
downloadWithYtDlp()
listSearchCandidates()
downloadSearchAudio()
```

## 可选环境变量

项目会读取：

```text
.env.local
.env
```

可配置项：

```text
PORT=4173
HOST=127.0.0.1
LASTFM_API_KEY=...
DISCOGS_TOKEN=...
```

说明：

```text
PORT / HOST
  控制本地服务监听地址。

LASTFM_API_KEY
  启用 Last.fm track.gettoptags 歌曲级标签。

DISCOGS_TOKEN
  用于 Discogs API 请求，减少匿名请求限流风险。
```

没有 `LASTFM_API_KEY` 时，Last.fm 歌曲级标签不会参与评分。

没有 `DISCOGS_TOKEN` 时，Discogs 搜索仍会尝试匿名请求，但可能被限流。

iTunes Search API 是公开 HTTPS 接口，不依赖 macOS 或本机 iTunes。云服务器需要能访问 `https://itunes.apple.com/search`；如果云上有访问限制，页面证据链会显示 iTunes 请求失败原因。

项目默认配置位于：

```text
config/defaults.json
```

其中 `itunesCountry` 默认是 `CN`。如需临时覆盖 iTunes Search API 的 storefront，也可以设置环境变量 `ITUNES_COUNTRY`，例如 `CN`、`US`、`JP`。

`genreModel` 默认是 `maest519`，作为请求未指定模型时的默认曲风模型；也可以用环境变量 `GENRE_MODEL` 覆盖（`maest519` 或 `effnet400`）。前端下拉框或 API 的 `model` 参数可在运行时逐请求切换到已生成产物的其他模型。

## 目录依赖

服务启动或运行过程中会使用这些目录：

```text
public/      前端静态文件
downloads/   下载或上传的音频
models/      Essentia 模型
data/        Discogs taxonomy
scripts/     模型分析和 taxonomy 构建脚本
```

`downloads/` 会由服务端自动创建。

## 健康检查

### 1. 检查 JS 语法

```bash
node --check server.js
node --check public/app.js
```

### 2. 检查 Essentia 分析脚本

```bash
.venv-essentia/bin/python scripts/analyze_genre.py downloads/example.mp3 --top 5 --json
```

预期输出 JSON，包含：

```text
model
predictions
label
score
```

### 3. 启动服务

```bash
npm start
```

打开：

```text
http://127.0.0.1:4173
```

### 4. 检查 Essentia API

先确保 `downloads/` 中有音频文件，然后调用：

```bash
curl --fail --silent --show-error \
  -X POST http://127.0.0.1:4173/api/essentia \
  -H 'content-type: application/json' \
  -d '{"fileName":"example.mp3","top":5}'
```

预期返回（默认 MAEST）：

```json
{
  "model": "Essentia MAEST - 519 styles, finer/slower",
  "predictions": [
    {
      "label": "Hip Hop---Trap",
      "score": 0.12
    }
  ],
  "source": "essentia-maest519"
}
```

## 常见问题

### Python 版本太新

如果安装 `essentia-tensorflow` 失败，优先检查 Python 版本。推荐 Python 3.10。

### 模型文件缺失

如果 `/api/essentia` 报错或脚本无法加载 graph，检查 `models/` 下当前 `genreModel` 对应的模型文件是否存在（`maest519` 需要 `discogs-maest-30s-pw-519l-2.pb/.json`；`effnet400` 需要 4 个 EffNet/Discogs400 文件）。

### TensorFlow 日志很多

Essentia / TensorFlow 首次加载 graph 时会输出 INFO/WARNING 日志。这不代表分析失败，最终 JSON 或 `Top genre/style predictions` 才是结果。

### yt-dlp 或 ffmpeg 不可用

自动搜索/下载音频依赖 `yt-dlp`，音频抽取/转码依赖 `ffmpeg` 和 `ffprobe`。如果不可用，输入歌名后的自动音频获取会失败；可以临时使用页面里的本地音频上传，Essentia 分析仍然可用。
