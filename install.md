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
Essentia Discogs-EffNet / Discogs400 模型文件
Discogs400 taxonomy
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

```bash
.venv-essentia/bin/python -c "import essentia; import essentia.standard as es; print(essentia.__version__); print(hasattr(es, 'TensorflowPredictEffnetDiscogs')); print(hasattr(es, 'TensorflowPredict2D'))"
```

预期至少看到：

```text
2.1-beta6-dev
True
True
```

## Essentia 模型文件

项目使用 Essentia 官方 Discogs-EffNet + Discogs400 组合。

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

项目的统一音乐风格体系来自 Essentia Discogs400 metadata。

输入：

```text
models/genre_discogs400-discogs-effnet-1.json
```

生成：

```text
data/discogs-taxonomy.json
public/discogs-taxonomy.js
```

生成命令：

```bash
node scripts/build_discogs_taxonomy.js
```

如果 `data/discogs-taxonomy.json` 不存在，服务端会从 `models/genre_discogs400-discogs-effnet-1.json` 做 fallback，但前端页面仍需要 `public/discogs-taxonomy.js`。

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

## 目录依赖

服务启动或运行过程中会使用这些目录：

```text
public/      前端静态文件
downloads/   下载或上传的音频
models/      Essentia 模型
data/        Discogs400 taxonomy
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

预期返回：

```json
{
  "model": "Essentia Discogs-EffNet + Discogs400",
  "predictions": [
    {
      "label": "Hip Hop---Trap",
      "score": 0.12
    }
  ],
  "source": "essentia-discogs400"
}
```

## 常见问题

### Python 版本太新

如果安装 `essentia-tensorflow` 失败，优先检查 Python 版本。推荐 Python 3.10。

### 模型文件缺失

如果 `/api/essentia` 报错或脚本无法加载 graph，检查 `models/` 下四个模型文件是否存在。

### TensorFlow 日志很多

Essentia / TensorFlow 首次加载 graph 时会输出 INFO/WARNING 日志。这不代表分析失败，最终 JSON 或 `Top genre/style predictions` 才是结果。

### yt-dlp 或 ffmpeg 不可用

自动搜索/下载音频依赖 `yt-dlp`，音频抽取/转码依赖 `ffmpeg` 和 `ffprobe`。如果不可用，输入歌名后的自动音频获取会失败；可以临时使用页面里的本地音频上传，Essentia 分析仍然可用。
