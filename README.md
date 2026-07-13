# Genre Lab

本项目是一个本地运行的音乐曲风分析工作台。它会结合 Essentia 音频模型、发行物元数据和用户标签，输出统一的 `Genre / Style` 判断。

## 核心原则

项目采用 **Essentia Discogs400** 作为唯一的音乐风格输出体系。

也就是说，最终进入评分和展示的合法曲风标签都必须能落到 Discogs400 的：

```text
Genre---Style
```

例如：

```text
Rock---Pop Rock
Hip Hop---Trap
Funk / Soul---Soul
Electronic---House
```

外部来源可以作为证据，但不能创造新的最终风格标签。无法映射到 Discogs400 的标签，只应作为说明性证据保留，不参与最终 `Genre / Style` 评分。

## 音乐风格元数据来源

### 1. Canonical Taxonomy: Essentia / Discogs400

本地 taxonomy 来自：

```text
models/genre_discogs400-discogs-effnet-1.json
```

构建脚本：

```text
scripts/build_discogs_taxonomy.js
```

生成文件：

```text
data/discogs-taxonomy.json
public/discogs-taxonomy.js
```

这个 taxonomy 是项目的唯一标准风格表。服务端和前端都会用它来判断某个外部标签是否能进入最终评分。

### 2. Primary Evidence: Essentia Audio Model

Essentia 是当前最重要的曲风分析依据。

使用模型：

```text
Discogs-EffNet embedding:
models/discogs-effnet-bs64-1.pb

Discogs400 classifier:
models/genre_discogs400-discogs-effnet-1.pb
```

分析脚本：

```text
scripts/analyze_genre.py
```

服务端接口：

```text
POST /api/essentia
```

Essentia 直接从音频输出 Discogs400 标签，例如：

```text
Rock---Pop Rock
Rock---Psychedelic Rock
Funk / Soul---Soul
```

注意：Essentia 的原始输出不是“曲风占比”。项目中应显示为：

```text
模型分 0.084，相对强度 100
```

而不是：

```text
8.4%
```

`模型分` 是 Essentia 原始输出值；`相对强度` 是相对当前 Top1 标签的强弱关系。

### 3. Supporting Metadata: Discogs API

Discogs API 是最直接的外部元数据来源。

服务端会搜索 release：

```text
https://api.discogs.com/database/search?type=release
```

然后读取返回项中的：

```text
item.genre
item.style
```

这些标签会先被过滤到本地 Discogs400 taxonomy。只有能匹配本地 taxonomy 的 `genre/style` 才会进入评分。

Discogs 适合补充“发行物/专辑语境”，但权重低于 Essentia 音频模型。

### 4. Supporting Metadata: Last.fm

Last.fm 使用歌曲级 top tags：

```text
track.gettoptags
```

需要配置：

```text
LASTFM_API_KEY
```

Last.fm 标签可能很自由，例如 `seen live`、`favorites`、`chill`、`trap`。项目只接受能映射到 Discogs400 的标签进入评分。

### 5. Supporting Metadata: iTunes Search API

iTunes Search API 返回：

```text
primaryGenreName
```

它通常是较粗的大类，例如 `Pop`、`Hip-Hop/Rap`、`R&B/Soul`。项目会尝试把它映射到 Discogs400，但它不是 style 级别证据，因此权重较低。

### 6. Browser Audio Diagnostics

前端还会展示轻量音频诊断指标：

```text
BPM
低频占比
Cowbell 区间能量
明亮度
起音密度
过零率
```

这些指标只用于页面展示和排查音频读取状态，不参与 `Genre / Style` 打分。曲风判断应优先相信 Essentia 的 Discogs400 输出。

## 打分 / 投票方式

最终评分采用“统一 taxonomy 下的加权投票”：

```text
证据源 -> 映射到 Discogs400 Genre/Style -> 加权投票 -> 排序 -> 构成比例
```

简化公式：

```text
styleScore(label) =
  EssentiaVote(label)
  + DiscogsVote(label)
  + LastFmVote(label)
  + ITunesVote(label)

genreScore(genre) =
  directGenreVotes(genre)
  + 0.32 * sum(styleScore(style under genre))

finalPercent(label) =
  visibleScore(label) / sum(visibleScores) * 100
```

其中：

```text
EssentiaVote = max(14, 18 + relativeStrength * 72 * rankDecay)
DiscogsVote = 14 for genre, 20 for style
LastFmVote = 24 + countBoost
ITunesVote = 16
```

`relativeStrength` 是 Essentia 当前标签相对 Top1 的强度，`rankDecay` 是按 Essentia 排名递减的轻微衰减系数。最终百分比只表示融合评分后的构成，不表示 Essentia 原始概率。

### Essentia 投票

Essentia 输出 Top N 个 `Genre---Style` 标签。

当前规则：

```text
Top1 作为相对强度 100
其他标签按 score / topScore 计算相对强度
排名越靠后会有轻微衰减
```

权重公式位于：

```text
public/app.js -> scoreEssentia()
```

当前大致逻辑：

```text
weight = 18 + relativeStrength * 72 * rankDecay
minimum weight = 14
```

因此，哪怕 Essentia 原始模型分看起来不高，只要它是 Top 标签，仍会作为最高权重证据进入最终判断。

### Discogs 投票

Discogs release 的标签进入评分时：

```text
genre weight = 14
style weight = 20
```

Discogs 的作用是补充发行物层面的元数据语境。

### Last.fm 投票

Last.fm 歌曲级 tag 进入评分时：

```text
base weight = 24
count boost = 0-10
```

如果 Last.fm 返回 tag count，会按最高 count 做相对增强。

### iTunes 投票

iTunes `primaryGenreName` 进入评分时：

```text
weight = 16
```

它是粗粒度辅助证据。

### Browser Audio Diagnostics

浏览器端的 BPM、低频占比、频谱明亮度、起音密度等指标只作为诊断展示，不再给任何 Discogs400 标签加分。这样可以避免粗浅启发式规则覆盖 Essentia 的模型判断。

## Style 与 Genre 的关系

项目优先给 `Genre / Style` 组合加分，例如：

```text
Rock / Pop Rock
Hip Hop / Trap
```

当某个 Style 命中时，也会给其上级 Genre 一部分归因分：

```text
style score -> genre score * 0.32
```

相关逻辑：

```text
public/app.js -> addDiscogsScore()
```

这样可以同时保留细粒度 style 判断和粗粒度 genre 归纳。

## 最终构成比例

页面上的 `Genre / Style 构成` 是融合评分后的比例，不是 Essentia 原始概率。

流程：

```text
所有证据加权得分
-> 过滤低分项
-> 对保留项归一化
-> 显示为构成比例
```

因此：

```text
Essentia 模型分 0.084
```

和：

```text
最终构成 Pop Rock 48%
```

不是同一个概念。

## 本地运行

启动服务：

```bash
npm start
```

默认地址：

```text
http://127.0.0.1:4173
```

单独运行 Essentia 分析：

```bash
.venv-essentia/bin/python scripts/analyze_genre.py downloads/example.mp3 --top 12
```

JSON 输出：

```bash
.venv-essentia/bin/python scripts/analyze_genre.py downloads/example.mp3 --top 12 --json
```

## 环境变量

可选配置：

```text
LASTFM_API_KEY=...
DISCOGS_TOKEN=...
PORT=4173
HOST=127.0.0.1
```

没有 `LASTFM_API_KEY` 时，Last.fm 歌曲级标签不会参与评分。

没有 `DISCOGS_TOKEN` 时，Discogs 搜索仍会尝试匿名请求，但可能遇到限流。
