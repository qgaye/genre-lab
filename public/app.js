const form = document.querySelector("#trackForm");
const trackInput = document.querySelector("#trackInput");
const modelSelect = document.querySelector("#modelSelect");
const formatInputs = [...document.querySelectorAll("input[name='inputFormat']")];
const parsedLine = document.querySelector("#parsedLine");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressFill = document.querySelector("#progressFill");
const progressSteps = document.querySelector("#progressSteps");
const progressLog = document.querySelector("#progressLog");
const fileInput = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const statusPill = document.querySelector("#statusPill");
const genreTitle = document.querySelector("#genreTitle");
const verdictTrack = document.querySelector("#verdictTrack");
const genreReason = document.querySelector("#genreReason");
const confidenceLabel = document.querySelector("#confidenceLabel");
const genreMix = document.querySelector("#genreMix");
const scoreList = document.querySelector("#scoreList");
const scoreCount = document.querySelector("#scoreCount");
const featureGrid = document.querySelector("#featureGrid");
const audioState = document.querySelector("#audioState");
const evidenceList = document.querySelector("#evidenceList");
const evidenceCount = document.querySelector("#evidenceCount");
const scoreTemplate = document.querySelector("#scoreTemplate");
const resultBoard = document.querySelector("#resultBoard");
const verdictCard = document.querySelector(".verdict");
const styleDialog = document.querySelector("#styleDialog");
const styleDialogTitle = document.querySelector("#styleDialogTitle");
const styleDialogKicker = document.querySelector("#styleDialogKicker");
const styleDialogOverview = document.querySelector("#styleDialogOverview");
const styleDialogFocus = document.querySelector("#styleDialogFocus");
const styleDialogHistory = document.querySelector("#styleDialogHistory");
const styleDialogTrack = document.querySelector("#styleDialogTrack");
const styleDialogTrackNote = document.querySelector("#styleDialogTrackNote");
const langToggle = document.querySelector("#langToggle");

// ---------------------------------------------------------------------------
// i18n: full bilingual UI. LANG is "zh" (default) or "en", persisted in
// localStorage. t(key, params) resolves a template from the active table and
// substitutes {name} placeholders. Missing keys fall back to the zh table,
// then to the key itself.
// ---------------------------------------------------------------------------
const LANG_STORAGE_KEY = "genre-lab-lang";
let LANG = "zh";
try {
  const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
  if (savedLang === "en" || savedLang === "zh") LANG = savedLang;
} catch {}

const I18N = {
  zh: {
    "list.sep": "、",
    "reason.group.sep": "；",
    "app.title": "Genre / Style 证据分析器",
    "status.waiting": "等待输入",
    "console.aria": "曲风识别工作台",
    "field.inputFormat": "输入格式",
    "format.neteaseUrl": "网易云音乐链接",
    "format.qqUrl": "QQ音乐链接",
    "field.model": "曲风模型",
    "field.track": "歌曲信息",
    "action.analyze": "分析这首歌",
    "action.analyze.title": "自动查询元信息、搜索音频并融合分析",
    "progress.ready": "准备就绪",
    "step.parse": "解析",
    "step.metadata": "标签",
    "step.search": "音频",
    "step.download": "下载",
    "step.decode": "解码",
    "step.score": "评分",
    "field.fallbacks": "备用输入",
    "field.upload": "上传本地音频",
    "file.none": "没有选择文件",
    "verdict.mix": "Genre / Style 构成",
    "mix.other": "其他",
    "mix.detail": "查看最终得分",
    "mix.detail.score": "最终分 {score}",
    "mix.detail.boosted": "已加成",
    "confidence.init": "证据覆盖 --",
    "verdict.notAnalyzed": "尚未分析",
    "verdict.intro": "输入歌曲信息，并尽量提供音频。只有元信息时会给出“倾向判断”；加入音频后会提升证据质量。",
    "panel.ratio": "Genre / Style 比例",
    "panel.audio": "音频诊断",
    "audio.notRead": "未读取",
    "panel.evidence": "证据链",
    "dialog.kicker": "Discogs Style",
    "dialog.focus": "风格重点",
    "dialog.history": "发展脉络",
    "dialog.entry": "主流入门音乐",
    "dialog.close": "关闭风格介绍",
    "lang.toggle": "EN",
    "genre.summary": "{n} 个本地 Discogs style",
    "status.switchModel": "切换曲风模型",
    "status.modelSwitched": "模型已切换",
    "status.modelSwitchFailed": "模型切换失败：{msg}",
    "status.decoding": "解码音频",
    "status.audioDone": "音频完成",
    "status.essentia": "Essentia 分析",
    "status.metadata": "查元信息",
    "status.metadataDone": "元信息完成",
    "status.analyzeDone": "分析完成",
    "status.failed": "失败",
    "status.parsePlatform": "解析{platform}",
    "status.platformDone": "{platform}完成",
    "status.searchAudio": "搜索公开音频",
    "progress.prepare": "准备分析",
    "progress.decode.label": "解码并提取指纹",
    "progress.decode.detail": "浏览器正在读取波形和频段能量",
    "audio.analyzing": "分析中",
    "progress.decode.done": "音频诊断完成",
    "progress.decode.doneDetail": "BPM {bpm}，低频 {bass}%",
    "audio.localUpload": "本地上传",
    "audio.downloaded": "已下载",
    "progress.essentia.label": "音频曲风模型分析",
    "progress.essentia.detail": "使用本地曲风模型直接判断音频曲风",
    "audio.essentiaDone": "Essentia 已完成",
    "progress.essentia.done": "Essentia 完成",
    "progress.essentia.doneDetail": "最高标签：{label}",
    "progress.essentia.fail": "Essentia 未完成",
    "progress.metadata.label": "查询标签和发行信息",
    "progress.metadata.detail": "按“{fmt}”解析：{title} / {artists}",
    "progress.metadata.done": "元信息完成",
    "progress.metadata.doneDetail": "当前格式解析完成：{title} / {artists}",
    "track.unknownArtist": "未知艺人",
    "progress.parse.platformLabel": "解析{platform}链接",
    "progress.parse.platformDetail": "读取{platform} {idLabel} 和歌曲信息",
    "progress.parse.platformDone": "{platform}解析完成",
    "progress.parse.input": "解析输入",
    "progress.parse.inputDetail": "使用选择格式：{fmt}",
    "progress.search.public": "搜索公开音频",
    "progress.search.searching": "正在搜索可下载的公开视频候选",
    "progress.search.currentFmt": "当前格式：{title} / {artists}",
    "progress.download.done": "音频下载完成",
    "progress.download.doneDetail": "来源：{source}",
    "progress.decode.readLocal": "读取本地音频",
    "progress.decode.readLocalDetail": "使用上传音频，跳过网络搜索",
    "progress.download.fail": "音频获取失败",
    "progress.download.failDetail": "当前格式没有找到匹配音频",
    "progress.score.fuse": "融合证据评分",
    "progress.score.fuseDetail": "合并 Essentia、艺人、标签与专辑证据",
    "progress.score.done": "分析完成",
    "progress.score.doneDetail": "结果已生成",
    "progress.score.fail": "分析失败",
    "parsed.willParseLink": "将解析{platform}歌曲链接，再搜索对应公开音频",
    "parsed.willParseFmt": "将按“{fmt}”解析并搜索对应公开音频",
    "parsed.pending": "待解析{platform}链接：<strong>{raw}</strong>",
    "parsed.current": "当前解析：<strong>{title}</strong> / <strong>{artists}</strong>",
    "parsed.titleOnly": "只识别到歌名：<strong>{title}</strong>，仍会尝试搜索音频",
    "ph.netease": "例如：https://music.163.com/song?id=38689021&uct2=...",
    "ph.qq": "例如：周杰伦《搁浅》 https://c6.y.qq.com/base/fcgi-bin/u?__=CawAX8bL58oP @QQ音乐",
    "ph.artistSong": "例如：TAKF - We All Desire",
    "ph.titleOnly": "例如：WALK IN PARADISE - DVRST",
    "format.songArtist": "歌曲 - 艺人",
    "format.artistSong": "艺人 - 歌曲",
    "platform.qq": "QQ音乐",
    "platform.netease": "网易云",
    "err.requestFailed": "请求失败",
    "err.uploadFailed": "上传音频失败",
    "err.readAudio": "无法读取音频文件",
    "err.loadScript": "无法加载 {src}",
    "err.needLink": "请输入{platform}歌曲链接。",
    "err.needNetease": "请输入网易云音乐歌曲链接。",
    "err.needQQ": "请输入 QQ 音乐歌曲链接。",
    "err.needSongArtist": "请输入类似 “WALK IN PARADISE - DVRST” 的歌曲和艺人。",
    "ev.itunesMatch": "iTunes Search API 匹配到 <strong>{track}</strong>{artist}{score}；Apple 标签 <strong>{genre}</strong> 可映射到本地 Discogs 范围。",
    "ev.itunesMatch.artist": " / <strong>{artist}</strong>",
    "ev.itunesMatch.score": "，匹配分 <strong>{score}</strong>",
    "ev.itunesNoResult": "iTunes Search API 未返回可用结果：{err}。",
    "ev.lastfmAccepted": "{sourceLabel} 的歌曲级标签中，可映射到 Discogs 范围的有 {list}。",
    "ev.lastfmNoResult": "Last.fm 歌曲级标签未返回可用结果：{err}。",
    "ev.lastfmApiEmpty": "Last.fm API 已查询，但这首歌没有返回歌曲级 top tags。",
    "ev.discogsMatch": "Discogs 匹配到发行物/专辑 <strong>{title}</strong>{year}{score}；Genre / Style 为 {list}。",
    "ev.discogsMatch.year": " ({year})",
    "ev.discogsMatch.score": "，匹配分 <strong>{score}</strong>",
    "ev.discogsNoResult": "Discogs 发行物/专辑标签未返回可用结果：{err}。",
    "ev.essentiaNoResult": "Essentia 曲风模型未返回可用结果：{err}。",
    "ev.essentiaTop": "{model} 直接从音频判断，作为最高权重依据；Top 标签为 {list}。",
    "ev.essentiaTopItem": "<strong>{label}</strong> 模型分 {score}，相对强度 {strength}",
    "ev.audioDecoded": "音频已解码：约 <strong>{sec} 秒</strong>，估计 BPM <strong>{bpm}</strong>；这些浏览器端轻量指标仅展示，不参与曲风评分。",
    "ev.mixComposition": "Genre / Style 构成：{list}。",
    "ev.mixItem": "<strong>{label}</strong> {percent}%",
    "ev.none": "暂无证据。先查元信息，或上传/下载音频。",
    "reason.source.essentia": "音频分析 Essentia",
    "reason.source.lastfm": "歌曲标签 Last.fm",
    "reason.source.discogs": "专辑风格 Discogs",
    "reason.source.itunes": "曲库元信息 iTunes",
    "reason.source.other": "其他证据",
    "verdict.insufficient": "证据不足",
    "verdict.notEnough": "还没有足够证据。建议至少填写艺人，并上传或下载一段音频。",
    "verdict.reasonPrefix": "主要依据：{summary}。",
    "verdict.reasonDefault": "主要依据：Essentia 音频模型与现有元信息综合得分最高。",
    "reason.group": "{label}：{values}",
    "pe.platformGet": "{platform}链接解析得到：<strong>{title}</strong> / <strong>{artists}</strong>{album}。",
    "pe.platformResolve": "{platform}链接解析为 <strong>{title}</strong> / <strong>{artists}</strong>{album}。",
    "pe.metadataSupport": "联网元信息支持当前格式解析：<strong>{title}</strong> / <strong>{artists}</strong>。",
    "pe.metadataNoMatch": "公开标签库暂未找到当前格式的明确匹配：<strong>{title}</strong> / <strong>{artists}</strong>。",
    "pe.album": "，专辑 <strong>{album}</strong>",
    "de.uploaded": "使用用户上传的本地音频 {name}；已保存为 {saved} 并纳入 Essentia 分析。",
    "de.deletedServer": " 分析完成后已删除服务端临时音频。",
    "de.deletedLocal": " 分析完成后已删除本地临时音频。",
    "de.sourceSearch": "实时搜索公开音频：{source}{score}",
    "de.sourcePlatform": "优先使用平台来源：{source}",
    "de.sourceFallback": "平台来源不可用，已回退搜索公开音频：{source}{score}",
    "de.sourceSpecified": "使用指定音频来源：{source}",
    "de.matchScore": "，标题匹配分 {score}",
    "de.tail": "{sourceText}{fallback}；已下载为 {name} 并解码分析。",
    "de.fallbackReason": "（{reason}）",
    "de.failed": "按当前格式解析为 <strong>{title}</strong> / <strong>{artists}</strong>，但没有找到足够匹配的公开音频：{err}。",
    "feat.explain": "查看指标含义",
    "feat.bpm": "BPM",
    "feat.bpm.note": "每分钟节拍数。数值越高越快：民谣/抒情约 60-90，流行约 100-130，电子舞曲/朋克常在 128+。",
    "feat.bassRatio": "低频占比",
    "feat.bassRatio.note": "低频能量比例。偏高常见于 Hip-Hop、EDM、Dub、Reggae；偏低多为原声/民谣/古典。",
    "feat.brightness": "明亮度",
    "feat.brightness.note": "高频（2-7kHz）能量占比。越高越明亮：金属、电子偏亮；氛围、Lo-Fi 偏暗。",
    "feat.onset": "起音密度",
    "feat.onset.note": "每分钟音符触发次数。越密越繁忙：电子、Drum&Bass、爵士偏高；Ambient、慢歌偏低。",
    "feat.centroid": "频谱质心",
    "feat.centroid.note": "频谱能量重心（Hz）。越高音色越亮/尖锐（金属、电子），越低越厚/暗（Dub、氛围）。",
    "feat.rolloff": "频谱滚降",
    "feat.rolloff.note": "85% 能量以下的频率上限（Hz）。越高高频延展越丰富，失真吉他/明亮制作偏高。",
    "feat.dynamicRange": "动态范围",
    "feat.dynamicRange.note": "响与轻部分的响度差（dB）。越大越动态：古典、爵士偏高；EDM/流行经压缩后偏低。",
    "feat.regularity": "节奏规整度",
    "feat.regularity.note": "主导节拍的稳定程度。越高节拍越机械规整：电子舞曲、House；越低越松散：爵士、自由演奏。",
    "feat.zcr": "过零率",
    "feat.zcr.note": "波形穿越零点频率，反映噪度。偏高常见于失真吉他/金属、擦音；纯人声/低音偏低。",
    "feat.rms": "整体响度",
    "feat.rms.note": "平均能量（dBFS，越接近 0 越响）。响度大且压缩重多为现代流行/EDM，动态保留多为原声/古典。",
    "count.items": "{n} 项",
    "count.evidence": "{n} 条",
    "score.noStrong": "未命中强证据",
    "confidence.coverage": "证据覆盖 {n}%",
    "dialog.noEntry": "暂无稳定入门曲",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.infoTitle": "查看 {label} 风格介绍"
  },
  en: {
    "list.sep": ", ",
    "reason.group.sep": "; ",
    "app.title": "Genre / Style Evidence Analyzer",
    "status.waiting": "Waiting for input",
    "console.aria": "Genre analysis workbench",
    "field.inputFormat": "Input format",
    "format.neteaseUrl": "NetEase Music link",
    "format.qqUrl": "QQ Music link",
    "field.model": "Genre model",
    "field.track": "Track info",
    "action.analyze": "Analyze this track",
    "action.analyze.title": "Auto-fetch metadata, search audio and fuse the analysis",
    "progress.ready": "Ready",
    "step.parse": "Parse",
    "step.metadata": "Tags",
    "step.search": "Audio",
    "step.download": "Download",
    "step.decode": "Decode",
    "step.score": "Score",
    "field.fallbacks": "Fallback inputs",
    "field.upload": "Upload local audio",
    "file.none": "No file selected",
    "verdict.mix": "Genre / Style mix",
    "mix.other": "Other",
    "mix.detail": "Show final scores",
    "mix.detail.score": "Final {score}",
    "mix.detail.boosted": "boosted",
    "confidence.init": "Evidence coverage --",
    "verdict.notAnalyzed": "Not analyzed yet",
    "verdict.intro": "Enter track info and provide audio if possible. Metadata alone gives a \u201Ctendency\u201D; adding audio improves evidence quality.",
    "panel.ratio": "Genre / Style ratio",
    "panel.audio": "Audio diagnostics",
    "audio.notRead": "Not read",
    "panel.evidence": "Evidence chain",
    "dialog.kicker": "Discogs Style",
    "dialog.focus": "Style focus",
    "dialog.history": "History",
    "dialog.entry": "Popular entry track",
    "dialog.close": "Close style intro",
    "lang.toggle": "\u4E2D\u6587",
    "genre.summary": "{n} local Discogs styles",
    "status.switchModel": "Switching model",
    "status.modelSwitched": "Model switched",
    "status.modelSwitchFailed": "Model switch failed: {msg}",
    "status.decoding": "Decoding audio",
    "status.audioDone": "Audio ready",
    "status.essentia": "Essentia analysis",
    "status.metadata": "Fetching metadata",
    "status.metadataDone": "Metadata ready",
    "status.analyzeDone": "Analysis complete",
    "status.failed": "Failed",
    "status.parsePlatform": "Parsing {platform}",
    "status.platformDone": "{platform} ready",
    "status.searchAudio": "Searching public audio",
    "progress.prepare": "Preparing",
    "progress.decode.label": "Decoding & fingerprinting",
    "progress.decode.detail": "Browser is reading waveform and band energy",
    "audio.analyzing": "Analyzing",
    "progress.decode.done": "Audio diagnostics done",
    "progress.decode.doneDetail": "BPM {bpm}, bass {bass}%",
    "audio.localUpload": "Local upload",
    "audio.downloaded": "Downloaded",
    "progress.essentia.label": "Audio genre model analysis",
    "progress.essentia.detail": "Using local genre model to classify audio directly",
    "audio.essentiaDone": "Essentia done",
    "progress.essentia.done": "Essentia complete",
    "progress.essentia.doneDetail": "Top label: {label}",
    "progress.essentia.fail": "Essentia failed",
    "progress.metadata.label": "Fetching tags & release info",
    "progress.metadata.detail": "Parsing as \u201C{fmt}\u201D: {title} / {artists}",
    "progress.metadata.done": "Metadata ready",
    "progress.metadata.doneDetail": "Parsed: {title} / {artists}",
    "track.unknownArtist": "Unknown artist",
    "progress.parse.platformLabel": "Parsing {platform} link",
    "progress.parse.platformDetail": "Reading {platform} {idLabel} and track info",
    "progress.parse.platformDone": "{platform} parsed",
    "progress.parse.input": "Parsing input",
    "progress.parse.inputDetail": "Using format: {fmt}",
    "progress.search.public": "Search public audio",
    "progress.search.searching": "Searching downloadable public video candidates",
    "progress.search.currentFmt": "Current: {title} / {artists}",
    "progress.download.done": "Audio downloaded",
    "progress.download.doneDetail": "Source: {source}",
    "progress.decode.readLocal": "Reading local audio",
    "progress.decode.readLocalDetail": "Using uploaded audio, skipping search",
    "progress.download.fail": "Audio fetch failed",
    "progress.download.failDetail": "No matching audio found for this format",
    "progress.score.fuse": "Fusing evidence",
    "progress.score.fuseDetail": "Merging Essentia, artist, tag and album evidence",
    "progress.score.done": "Analysis complete",
    "progress.score.doneDetail": "Result generated",
    "progress.score.fail": "Analysis failed",
    "parsed.willParseLink": "Will parse the {platform} track link, then search public audio",
    "parsed.willParseFmt": "Will parse as \u201C{fmt}\u201D and search public audio",
    "parsed.pending": "Pending {platform} link: <strong>{raw}</strong>",
    "parsed.current": "Parsed: <strong>{title}</strong> / <strong>{artists}</strong>",
    "parsed.titleOnly": "Only title detected: <strong>{title}</strong>; will still search audio",
    "ph.netease": "e.g. https://music.163.com/song?id=38689021&uct2=...",
    "ph.qq": "e.g. Jay Chou \u300A\u6041\u6d45\u300B https://c6.y.qq.com/base/fcgi-bin/u?__=CawAX8bL58oP @QQ Music",
    "ph.artistSong": "e.g. TAKF - We All Desire",
    "ph.titleOnly": "e.g. WALK IN PARADISE - DVRST",
    "format.songArtist": "Song - Artist",
    "format.artistSong": "Artist - Song",
    "platform.qq": "QQ Music",
    "platform.netease": "NetEase",
    "err.requestFailed": "Request failed",
    "err.uploadFailed": "Audio upload failed",
    "err.readAudio": "Cannot read audio file",
    "err.loadScript": "Failed to load {src}",
    "err.needLink": "Please enter a {platform} track link.",
    "err.needNetease": "Please enter a NetEase Music track link.",
    "err.needQQ": "Please enter a QQ Music track link.",
    "err.needSongArtist": "Please enter a track & artist like \u201CWALK IN PARADISE - DVRST\u201D.",
    "ev.itunesMatch": "iTunes Search API matched <strong>{track}</strong>{artist}{score}; the Apple tag <strong>{genre}</strong> maps into the local Discogs taxonomy.",
    "ev.itunesMatch.artist": " / <strong>{artist}</strong>",
    "ev.itunesMatch.score": ", match score <strong>{score}</strong>",
    "ev.itunesNoResult": "iTunes Search API returned no usable result: {err}.",
    "ev.lastfmAccepted": "Among {sourceLabel} track-level tags, those mapping into the Discogs taxonomy are {list}.",
    "ev.lastfmNoResult": "Last.fm track-level tags returned no usable result: {err}.",
    "ev.lastfmApiEmpty": "Last.fm API was queried, but this track returned no track-level top tags.",
    "ev.discogsMatch": "Discogs matched the release/album <strong>{title}</strong>{year}{score}; its Genre / Style are {list}.",
    "ev.discogsMatch.year": " ({year})",
    "ev.discogsMatch.score": ", match score <strong>{score}</strong>",
    "ev.discogsNoResult": "Discogs release/album tags returned no usable result: {err}.",
    "ev.essentiaNoResult": "The Essentia genre model returned no usable result: {err}.",
    "ev.essentiaTop": "{model} classifies directly from audio as the highest-weight basis; top labels are {list}.",
    "ev.essentiaTopItem": "<strong>{label}</strong> model score {score}, relative strength {strength}",
    "ev.audioDecoded": "Audio decoded: about <strong>{sec}s</strong>, estimated BPM <strong>{bpm}</strong>; these lightweight browser metrics are display-only and do not affect scoring.",
    "ev.mixComposition": "Genre / Style mix: {list}.",
    "ev.mixItem": "<strong>{label}</strong> {percent}%",
    "ev.none": "No evidence yet. Fetch metadata first, or upload/download audio.",
    "reason.source.essentia": "Essentia audio",
    "reason.source.lastfm": "Last.fm tags",
    "reason.source.discogs": "Discogs release",
    "reason.source.itunes": "iTunes metadata",
    "reason.source.other": "Other evidence",
    "verdict.insufficient": "Insufficient evidence",
    "verdict.notEnough": "Not enough evidence yet. Add at least an artist, and upload or download some audio.",
    "verdict.reasonPrefix": "Main basis: {summary}.",
    "verdict.reasonDefault": "Main basis: the Essentia audio model and available metadata score highest overall.",
    "reason.group": "{label}: {values}",
    "pe.platformGet": "The {platform} link parsed to: <strong>{title}</strong> / <strong>{artists}</strong>{album}.",
    "pe.platformResolve": "The {platform} link resolved to <strong>{title}</strong> / <strong>{artists}</strong>{album}.",
    "pe.metadataSupport": "Online metadata supports the current parse: <strong>{title}</strong> / <strong>{artists}</strong>.",
    "pe.metadataNoMatch": "Public tag databases found no clear match for the current parse: <strong>{title}</strong> / <strong>{artists}</strong>.",
    "pe.album": ", album <strong>{album}</strong>",
    "de.uploaded": "Using your uploaded local audio {name}; saved as {saved} and included in Essentia analysis.",
    "de.deletedServer": " The temporary server audio was deleted after analysis.",
    "de.deletedLocal": " The temporary local audio was deleted after analysis.",
    "de.sourceSearch": "Live search for public audio: {source}{score}",
    "de.sourcePlatform": "Prefer platform source: {source}",
    "de.sourceFallback": "Platform source unavailable, fell back to public audio search: {source}{score}",
    "de.sourceSpecified": "Using specified audio source: {source}",
    "de.matchScore": ", title match {score}",
    "de.tail": "{sourceText}{fallback}; downloaded as {name} and decoded for analysis.",
    "de.fallbackReason": " ({reason})",
    "de.failed": "Parsed as <strong>{title}</strong> / <strong>{artists}</strong> for the current format, but no closely matching public audio was found: {err}.",
    "feat.explain": "Show metric meaning",
    "feat.bpm": "BPM",
    "feat.bpm.note": "Beats per minute. Higher = faster: folk/ballad ~60-90, pop ~100-130, EDM/punk often 128+.",
    "feat.bassRatio": "Bass ratio",
    "feat.bassRatio.note": "Low-frequency energy share. High is common in Hip-Hop, EDM, Dub, Reggae; low in acoustic/folk/classical.",
    "feat.brightness": "Brightness",
    "feat.brightness.note": "High-frequency (2-7kHz) share. Higher = brighter: metal/electronic bright; ambient/Lo-Fi darker.",
    "feat.onset": "Onset density",
    "feat.onset.note": "Note onsets per minute. Denser = busier: electronic, Drum&Bass, jazz high; Ambient/ballads low.",
    "feat.centroid": "Spectral centroid",
    "feat.centroid.note": "Center of spectral energy (Hz). Higher = brighter/sharper (metal, electronic); lower = warm/dark (Dub, ambient).",
    "feat.rolloff": "Spectral rolloff",
    "feat.rolloff.note": "Frequency below which 85% of energy sits (Hz). Higher = more high-end extension, e.g. distorted guitar/bright mixes.",
    "feat.dynamicRange": "Dynamic range",
    "feat.dynamicRange.note": "Loudness gap between loud and quiet parts (dB). Larger = more dynamic: classical/jazz high; EDM/pop low after compression.",
    "feat.regularity": "Rhythm regularity",
    "feat.regularity.note": "Stability of the dominant beat. Higher = more mechanical: EDM, House; lower = looser: jazz, free playing.",
    "feat.zcr": "Zero-crossing rate",
    "feat.zcr.note": "How often the waveform crosses zero; reflects noisiness. High for distorted guitar/metal, sibilance; low for pure vocals/bass.",
    "feat.rms": "Overall loudness",
    "feat.rms.note": "Average energy (dBFS, closer to 0 = louder). Loud and heavily compressed suggests modern pop/EDM; preserved dynamics suggests acoustic/classical.",
    "count.items": "{n} items",
    "count.evidence": "{n} entries",
    "score.noStrong": "No strong evidence",
    "confidence.coverage": "Evidence coverage {n}%",
    "dialog.noEntry": "No stable entry track",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.infoTitle": "View the {label} style intro"
  }
};

function t(key, params) {
  const table = I18N[LANG] || I18N.zh;
  let str = table[key];
  if (str == null) str = I18N.zh[key] != null ? I18N.zh[key] : key;
  if (params) str = str.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? params[name] : ""));
  return str;
}

let metadata = null;
let downloadedAudioUrl = "";
let audioFeatures = null;
let essentiaAnalysis = null;
// i18n key for the audio-diagnostics pill, so it can be re-rendered on language
// switch. Defaults to the "not read" state.
let audioStateKey = "audio.notRead";
// Evidence lines that depend on the active language are stored as builder
// closures instead of baked strings, so they re-translate when LANG changes.
let downloadEvidenceBuilder = null;
let activeTrack = null;
let parseEvidenceBuilder = null;

const MIN_VISIBLE_STYLE_PERCENT = 10;
const MAX_VISIBLE_STYLE_ITEMS = 6;

const viewportRoot = document.documentElement;
let viewportUpdateFrame = 0;

function updateViewportMetrics() {
  if (viewportUpdateFrame) cancelAnimationFrame(viewportUpdateFrame);
  viewportUpdateFrame = requestAnimationFrame(() => {
    const visualViewport = window.visualViewport;
    const viewportHeight = visualViewport ? visualViewport.height : window.innerHeight;
    const rawKeyboardInset = visualViewport
      ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
      : 0;
    const isTextInputFocused = document.activeElement?.matches("input");
    const keyboardInset = isTextInputFocused && rawKeyboardInset > 80 ? rawKeyboardInset : 0;

    viewportRoot.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
    viewportRoot.style.setProperty("--keyboard-inset", `${Math.round(keyboardInset)}px`);
    viewportRoot.classList.toggle("is-keyboard-open", keyboardInset > 0);
    viewportUpdateFrame = 0;
  });
}

function keepFocusedFieldVisible(event) {
  if (!event.target.matches("input")) return;
  setTimeout(() => {
    event.target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, 260);
}

function shouldGuideToResults() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function revealResults() {
  if (!shouldGuideToResults() || !resultBoard || !verdictCard) return;
  verdictCard.classList.remove("is-revealed");
  resultBoard.scrollIntoView({ block: "start", behavior: "smooth" });
  window.setTimeout(() => {
    verdictCard.classList.add("is-revealed");
  }, 360);
  window.setTimeout(() => {
    verdictCard.classList.remove("is-revealed");
  }, 2200);
}

updateViewportMetrics();
window.addEventListener("resize", updateViewportMetrics);
window.addEventListener("orientationchange", updateViewportMetrics);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportMetrics);
  window.visualViewport.addEventListener("scroll", updateViewportMetrics);
}
document.addEventListener("focusin", keepFocusedFieldVisible);
document.addEventListener("focusout", updateViewportMetrics);

let TAXONOMY = window.DISCOGS_TAXONOMY || { genres: [], aliases: {} };
let STYLE_PROFILES = window.DISCOGS_STYLE_PROFILES || { profiles: [] };
let GENRES = [];
const DISCOGS_GENRES_BY_KEY = new Map();
const DISCOGS_STYLES_BY_GENRE = new Map();
const DISCOGS_STYLE_CANDIDATES = new Map();
let DISCOGS_ALIASES = TAXONOMY.aliases || {};
let STYLE_PROFILES_BY_ID = new Map();
let TRANSLATIONS_ZH = (TAXONOMY.translations && TAXONOMY.translations.zh) || { genres: {}, styles: {} };
let lastStyleInfoTrigger = null;

// Look up the localized label for a genre/style. In EN mode the English name
// is authoritative and returned as-is; in ZH mode we consult the taxonomy's
// translations.zh dictionary, falling back to the original English name.
function localGenre(name) {
  if (LANG === "en") return name;
  return (TRANSLATIONS_ZH.genres && TRANSLATIONS_ZH.genres[name]) || name;
}

function localStyle(name) {
  if (LANG === "en") return name;
  return (TRANSLATIONS_ZH.styles && TRANSLATIONS_ZH.styles[name]) || name;
}

// Translate a user-facing display name. Handles both bare genres ("Electronic")
// and "Genre / Style" labels; the underlying English name stays the canonical
// key for scoring and profile lookups.
function displayName(display) {
  const text = String(display || "");
  if (LANG === "en") return text;
  const sep = " / ";
  const idx = text.indexOf(sep);
  if (idx === -1) {
    if (TRANSLATIONS_ZH.genres && TRANSLATIONS_ZH.genres[text]) return TRANSLATIONS_ZH.genres[text];
    if (TRANSLATIONS_ZH.styles && TRANSLATIONS_ZH.styles[text]) return TRANSLATIONS_ZH.styles[text];
    return text;
  }
  return `${localGenre(text.slice(0, idx))} / ${localStyle(text.slice(idx + sep.length))}`;
}

function setStatus(text, busy = false) {
  statusPill.textContent = text;
  form.querySelector(".primary").disabled = busy;
}

const PROGRESS_ORDER = ["parse", "metadata", "search", "download", "decode", "score"];

function setProgress(step, label, percent, detail = "") {
  progressLabel.textContent = label;
  progressPercent.textContent = `${percent}%`;
  progressFill.style.width = `${percent}%`;
  const activeIndex = PROGRESS_ORDER.indexOf(step);
  for (const item of progressSteps.querySelectorAll("span")) {
    const index = PROGRESS_ORDER.indexOf(item.dataset.step);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-done", activeIndex >= 0 && index < activeIndex);
  }
  if (detail) {
    const li = document.createElement("li");
    li.textContent = detail;
    progressLog.appendChild(li);
    progressLog.scrollTop = progressLog.scrollHeight;
  }
}

function resetProgress() {
  progressLog.innerHTML = "";
  for (const item of progressSteps.querySelectorAll("span")) {
    item.classList.remove("is-active", "is-done");
  }
  setProgress("parse", t("progress.prepare"), 0);
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function taxonomyKey(text) {
  return normalize(text)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rebuild every taxonomy-derived structure from the current TAXONOMY /
// STYLE_PROFILES globals. Called once on load and again whenever the active
// model changes and its taxonomy scripts are reloaded.
function rebuildTaxonomyState() {
  TAXONOMY = window.DISCOGS_TAXONOMY || { genres: [], aliases: {} };
  STYLE_PROFILES = window.DISCOGS_STYLE_PROFILES || { profiles: [] };
  DISCOGS_ALIASES = TAXONOMY.aliases || {};
  TRANSLATIONS_ZH = (TAXONOMY.translations && TAXONOMY.translations.zh) || { genres: {}, styles: {} };
  GENRES = (TAXONOMY.genres || []).map(genre => ({
    name: genre.name,
    styles: genre.styles || [],
    keywords: [genre.name, ...(genre.styles || [])],
    summary: t("genre.summary", { n: genre.styles ? genre.styles.length : 0 })
  }));
  DISCOGS_GENRES_BY_KEY.clear();
  DISCOGS_STYLES_BY_GENRE.clear();
  DISCOGS_STYLE_CANDIDATES.clear();
  for (const genre of TAXONOMY.genres || []) {
    DISCOGS_GENRES_BY_KEY.set(taxonomyKey(genre.name), genre.name);
    const styleMap = new Map();
    for (const style of genre.styles || []) {
      const key = taxonomyKey(style);
      styleMap.set(key, style);
      const candidates = DISCOGS_STYLE_CANDIDATES.get(key) || [];
      candidates.push({ genre: genre.name, style, label: `${genre.name} / ${style}` });
      DISCOGS_STYLE_CANDIDATES.set(key, candidates);
    }
    DISCOGS_STYLES_BY_GENRE.set(genre.name, styleMap);
  }
  STYLE_PROFILES_BY_ID = new Map((STYLE_PROFILES.profiles || []).map(profile => [profile.id, profile]));
}

rebuildTaxonomyState();

// The active genre model for the next analysis. Defaults to whatever taxonomy
// was injected at page load; updated by the model selector.
let activeModel = (TAXONOMY.model || "").trim();

// Reload the per-model taxonomy script for the given model and rebuild all
// derived state. Resolves once the new global is in place.
function loadModelTaxonomy(modelName) {
  // Style profiles are model-agnostic and loaded once at page load; only the
  // taxonomy needs to be reloaded when switching models.
  const sources = [
    `/discogs-taxonomy.js?model=${encodeURIComponent(modelName)}`
  ];
  return Promise.all(sources.map(src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t("err.loadScript", { src })));
    document.head.appendChild(script);
  }))).then(() => {
    rebuildTaxonomyState();
  });
}

// Populate the model selector and load the matching taxonomy when switched.
async function initModelSelector() {
  if (!modelSelect) return;
  let config;
  try {
    const response = await fetch("/api/models");
    config = await response.json();
  } catch {
    return;
  }
  const models = config.models || [];
  if (!models.length) return;
  modelSelect.innerHTML = "";
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.key;
    option.textContent = model.label || model.key;
    modelSelect.appendChild(option);
  }
  if (!activeModel) activeModel = config.default || models[0].key;
  modelSelect.value = activeModel;

  modelSelect.addEventListener("change", async () => {
    const next = modelSelect.value;
    if (next === activeModel) return;
    setStatus(t("status.switchModel"), true);
    try {
      await loadModelTaxonomy(next);
      activeModel = next;
      renderScores(GENRES.slice(0, 8).map(genre => ({ name: genre.name, score: 0, reasons: [] })));
      setStatus(t("status.modelSwitched"));
    } catch (error) {
      modelSelect.value = activeModel;
      setStatus(t("status.modelSwitchFailed", { msg: error.message }));
    }
  });
}

initModelSelector();

function uniqueCandidates(candidates) {
  return uniqueBy(candidates, item => `${item.genre}---${item.style || ""}`);
}

function discogsCandidates(tag, genreHint = "") {
  const key = taxonomyKey(tag);
  if (!key) return [];

  const alias = DISCOGS_ALIASES[key];
  if (alias) {
    if (alias.style) return [{ genre: alias.genre, style: alias.style, label: `${alias.genre} / ${alias.style}` }];
    return [{ genre: alias.genre, style: "", label: alias.genre }];
  }

  const genre = DISCOGS_GENRES_BY_KEY.get(key);
  if (genre) return [{ genre, style: "", label: genre }];

  const styleCandidates = DISCOGS_STYLE_CANDIDATES.get(key) || [];
  if (!genreHint) return styleCandidates;

  const exact = styleCandidates.filter(candidate => taxonomyKey(candidate.genre) === taxonomyKey(genreHint));
  return exact.length ? exact : styleCandidates;
}

function firstDiscogsCandidate(tag, genreHint = "") {
  return discogsCandidates(tag, genreHint)[0] || null;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function profileIdFromDisplayName(name) {
  const display = String(name || "");
  for (const genre of TAXONOMY.genres || []) {
    const prefix = `${genre.name} / `;
    if (!display.startsWith(prefix)) continue;
    const style = display.slice(prefix.length);
    return style ? `${genre.name}---${style}` : "";
  }
  return "";
}

function profileForDisplayName(name) {
  return STYLE_PROFILES_BY_ID.get(profileIdFromDisplayName(name)) || null;
}

function createStyleInfoButton(profile, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "style-info-button";
  button.textContent = "i";
  const infoTitle = t("dialog.infoTitle", { label: displayName(label) });
  button.title = infoTitle;
  button.setAttribute("aria-label", infoTitle);
  button.addEventListener("click", event => {
    event.stopPropagation();
    openStyleDialog(profile, button);
  });
  return button;
}

function openStyleDialog(profile, trigger) {
  if (!profile || !styleDialog) return;
  lastStyleInfoTrigger = trigger || null;
  styleDialogKicker.textContent = profile.genre ? t("dialog.kickerGenre", { genre: localGenre(profile.genre) }) : t("dialog.kicker");
  styleDialogTitle.textContent = localStyle(profile.style || profile.title);
  styleDialogOverview.textContent = profile.overview || "";
  styleDialogHistory.textContent = profile.history || "";
  styleDialogFocus.innerHTML = "";
  for (const item of profile.styleFocus || []) {
    const li = document.createElement("li");
    li.textContent = item;
    styleDialogFocus.appendChild(li);
  }
  const entry = profile.mainstreamEntry || {};
  styleDialogTrack.textContent = [entry.artist, entry.title].filter(Boolean).join(" - ") || t("dialog.noEntry");
  styleDialogTrackNote.textContent = entry.note || "";
  styleDialog.classList.add("is-open");
  styleDialog.setAttribute("aria-hidden", "false");
  styleDialog.querySelector(".style-dialog__close")?.focus();
}

function closeStyleDialog() {
  if (!styleDialog || !styleDialog.classList.contains("is-open")) return;
  styleDialog.classList.remove("is-open");
  styleDialog.setAttribute("aria-hidden", "true");
  if (lastStyleInfoTrigger) lastStyleInfoTrigger.focus();
  lastStyleInfoTrigger = null;
}

function splitArtists(value) {
  return normalize(value)
    .split(/\s*(?:\/|,|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedFormat() {
  return formatInputs.find(input => input.checked)?.value || "netease-url";
}

function formatLabel() {
  const keys = {
    "song-artist": "format.songArtist",
    "artist-song": "format.artistSong",
    "netease-url": "format.neteaseUrl",
    "qq-music-url": "format.qqUrl"
  };
  return t(keys[selectedFormat()] || "format.neteaseUrl");
}

function isMusicLinkFormat(format = selectedFormat()) {
  return format === "netease-url" || format === "qq-music-url";
}

function currentPlatformName(format = selectedFormat()) {
  return format === "qq-music-url" ? t("platform.qq") : t("platform.netease");
}

function parseTrackInput(value) {
  const raw = String(value || "").trim();
  if (isMusicLinkFormat()) {
    return { title: "", artists: "", raw, url: raw, orientation: selectedFormat() };
  }

  const parts = raw
    .split(/\s+(?:-|–|—)\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const left = parts[0];
    const right = parts.slice(1).join(" - ");
    if (selectedFormat() === "artist-song") {
      return {
        title: right,
        artists: left,
        raw,
        orientation: "artist-song"
      };
    }
    return {
      title: left,
      artists: right,
      raw,
      orientation: "song-artist"
    };
  }

  const by = raw.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { title: by[1].trim(), artists: by[2].trim(), raw, orientation: "song-by-artist" };

  return { title: raw, artists: "", raw, orientation: "title-only" };
}

function currentTrack() {
  return activeTrack || parseTrackInput(trackInput.value);
}

function inputTrack() {
  return parseTrackInput(trackInput.value);
}

function updateParsedLine() {
  const track = currentTrack();
  if (!track.raw) {
    parsedLine.textContent = isMusicLinkFormat()
      ? t("parsed.willParseLink", { platform: currentPlatformName() })
      : t("parsed.willParseFmt", { fmt: formatLabel() });
  } else if (isMusicLinkFormat(track.orientation) && !track.title) {
    parsedLine.innerHTML = t("parsed.pending", { platform: currentPlatformName(track.orientation), raw: escapeHtml(track.raw) });
  } else if (track.artists) {
    parsedLine.innerHTML = t("parsed.current", { title: escapeHtml(track.title), artists: escapeHtml(track.artists) });
  } else {
    parsedLine.innerHTML = t("parsed.titleOnly", { title: escapeHtml(track.title) });
  }
}

function updateInputPlaceholder() {
  if (selectedFormat() === "netease-url") {
    trackInput.placeholder = t("ph.netease");
  } else if (selectedFormat() === "qq-music-url") {
    trackInput.placeholder = t("ph.qq");
  } else if (selectedFormat() === "artist-song") {
    trackInput.placeholder = t("ph.artistSong");
  } else {
    trackInput.placeholder = t("ph.titleOnly");
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t("err.requestFailed"));
  return data;
}

async function uploadAudioFile(file) {
  const response = await fetch("/api/upload-audio", {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "upload.mp3")
    },
    body: file
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t("err.uploadFailed"));
  return data;
}

function titleMatches(actual, wanted) {
  const a = normalize(actual);
  const w = normalize(wanted);
  return Boolean(w && (a === w || a.includes(w) || w.includes(a)));
}

function artistMatches(actual, wantedArtists) {
  const artist = normalize(actual);
  return wantedArtists.length === 0 || wantedArtists.some(name => artist.includes(name) || name.includes(artist));
}

function metadataFitScore(data, track) {
  let score = 0;
  const wantedTitle = normalize(track.title);
  const wantedArtists = splitArtists(track.artists);
  const itunes = data.sources && data.sources.itunes;
  if (Array.isArray(itunes)) {
    for (const item of itunes.slice(0, 8)) {
      if (titleMatches(item.trackName, wantedTitle) && artistMatches(item.artistName, wantedArtists)) {
        score += firstDiscogsCandidate(item.primaryGenreName) ? 18 : 8;
      }
    }
  }
  const lastfm = data.sources && data.sources.lastfm;
  if (lastfm && Array.isArray(lastfm.trackTags) && lastfm.trackTags.some(tag => firstDiscogsCandidate(tag.name))) score += 16;
  const discogs = data.sources && data.sources.discogs;
  if (discogs && Array.isArray(discogs.releases) && discogs.releases.some(item => item.genre.length || item.style.length)) score += 48;
  return score;
}

function collectMetadataTags(data) {
  const tags = [];
  const evidence = [];
  if (!data) return { tags, evidence };
  const track = currentTrack();
  const wantedTitle = normalize(track.title);
  const wantedArtists = splitArtists(track.artists);

  const itunes = data.sources && data.sources.itunes;
  if (Array.isArray(itunes)) {
    for (const item of itunes.slice(0, 8)) {
      const track = normalize(item.trackName);
      const artist = normalize(item.artistName);
      const titleMatch = wantedTitle && (track === wantedTitle || track.includes(wantedTitle) || wantedTitle.includes(track));
      const artistMatch = wantedArtists.length === 0 || wantedArtists.some(name => artist.includes(name) || name.includes(artist));
      if (!titleMatch || !artistMatch) continue;
      if (item.primaryGenreName && firstDiscogsCandidate(item.primaryGenreName)) {
        tags.push({ tag: normalize(item.primaryGenreName), source: "itunes", weight: 16 });
        evidence.push(t("ev.itunesMatch", {
          track: item.trackName,
          artist: item.artistName ? t("ev.itunesMatch.artist", { artist: item.artistName }) : "",
          score: item.matchScore != null ? t("ev.itunesMatch.score", { score: item.matchScore }) : "",
          genre: item.primaryGenreName
        }));
      }
    }
  } else if (itunes && itunes.error) {
    evidence.push(t("ev.itunesNoResult", { err: escapeHtml(itunes.error) }));
  }

  const lastfm = data.sources && data.sources.lastfm;
  if (lastfm && Array.isArray(lastfm.trackTags)) {
    const trackTags = uniqueBy(lastfm.trackTags, tag => normalize(tag.name)).slice(0, 10);
    const maxCount = Math.max(...trackTags.map(tag => Number(tag.count || 0)), 0);
    for (const [index, tag] of trackTags.entries()) {
      if (!firstDiscogsCandidate(tag.name)) continue;
      const count = Number(tag.count || 0);
      const countBoost = maxCount > 0 ? Math.round((count / maxCount) * 10) : Math.max(0, 8 - index);
      tags.push({
        tag: normalize(tag.name),
        source: "lastfm",
        weight: 24 + countBoost
      });
    }
    if (trackTags.length) {
      const sourceLabel = lastfm.source === "api" ? "Last.fm API" : "Last.fm";
      const accepted = trackTags.filter(tag => firstDiscogsCandidate(tag.name)).slice(0, 6);
      if (accepted.length) {
        evidence.push(t("ev.lastfmAccepted", {
          sourceLabel,
          list: accepted.map(tag => `<strong>${escapeHtml(tag.name)}</strong>${tag.count ? ` (${tag.count})` : ""}`).join(t("list.sep"))
        }));
      }
    } else if (lastfm.error) {
      evidence.push(t("ev.lastfmNoResult", { err: escapeHtml(lastfm.error) }));
    } else if (lastfm.source === "api") {
      evidence.push(t("ev.lastfmApiEmpty"));
    }
  }

  const discogs = data.sources && data.sources.discogs;
  if (discogs && Array.isArray(discogs.releases)) {
    const usefulReleases = discogs.releases
      .filter(item => (item.genre && item.genre.length) || (item.style && item.style.length))
      .slice(0, 5);
    for (const release of usefulReleases) {
      for (const tag of release.genre || []) {
        tags.push({ tag: normalize(tag), source: "discogs", weight: 14 });
      }
      for (const tag of release.style || []) {
        tags.push({ tag: normalize(tag), genreHint: (release.genre || [])[0] || "", source: "discogs", weight: 20 });
      }
    }
    if (usefulReleases.length) {
      const release = usefulReleases[0];
      evidence.push(t("ev.discogsMatch", {
        title: escapeHtml(release.title),
        year: release.year ? t("ev.discogsMatch.year", { year: release.year }) : "",
        score: release.matchScore != null ? t("ev.discogsMatch.score", { score: release.matchScore }) : "",
        list: [...(release.genre || []), ...(release.style || [])].slice(0, 6).map(tag => `<strong>${escapeHtml(tag)}</strong>`).join(t("list.sep"))
      }));
    } else if (discogs.error) {
      evidence.push(t("ev.discogsNoResult", { err: escapeHtml(discogs.error) }));
    }
  }

  return { tags, evidence };
}

function addScore(scores, genreName, amount, reason) {
  const item = scores.get(genreName) || { name: genreName, score: 0, reasons: [] };
  item.score += amount;
  if (reason) item.reasons.push(reason);
  scores.set(genreName, item);
}

function addDiscogsScore(scores, tag, genreHint, amount, reason) {
  const candidates = uniqueCandidates(discogsCandidates(tag, genreHint));
  if (!candidates.length) return false;
  const divided = Math.max(4, Math.round(amount / candidates.length));
  for (const candidate of candidates) {
    addScore(scores, candidate.label, divided, reason);
  }
  return true;
}

// 元信息只做加成：把每个标签映射到 Discogs 候选风格，累积加成点，
// 最终以乘法方式（封顶 +50%）作用于 Essentia 已经命中的风格，不引入新风格。
function applyMetadataBoost(scores, tags) {
  if (!scores.size || !tags.length) return;
  const boosts = new Map();
  for (const item of tags) {
    const candidates = uniqueCandidates(discogsCandidates(item.tag, item.genreHint || ""));
    if (!candidates.length) continue;
    const weight = item.weight || 18;
    const reason = { source: item.source, value: item.tag };
    for (const candidate of candidates) {
      collectBoost(boosts, candidate.label, weight, reason);
    }
  }
  for (const [label, boost] of boosts) {
    const item = scores.get(label);
    if (!item) continue; // 只加成 Essentia 已命中的风格
    const factor = 1 + Math.min(0.5, boost.points / 100);
    item.score *= factor;
    item.boosted = true;
    item.reasons.push(...boost.reasons);
  }
}

function collectBoost(boosts, label, points, reason) {
  const entry = boosts.get(label) || { points: 0, reasons: [] };
  entry.points += points;
  entry.reasons.push(reason);
  boosts.set(label, entry);
}

function splitEssentiaLabel(label) {
  const [genre, style] = String(label || "").split("---");
  return {
    genre: genre || "",
    style: style || "",
    display: style ? `${genre} / ${style}` : genre
  };
}

function formatModelScore(value) {
  return Number(value || 0).toFixed(3);
}

function scoreEssentia(scores, essentia, evidence) {
  const predictions = essentia && Array.isArray(essentia.predictions) ? essentia.predictions : [];
  if (!predictions.length) {
    if (essentia && essentia.error) {
      evidence.push(t("ev.essentiaNoResult", { err: escapeHtml(essentia.error) }));
    }
    return;
  }

  const topScore = Math.max(...predictions.map(item => Number(item.score || 0)), 0) || 1;
  const useful = predictions.slice(0, 8);
  for (const [index, item] of useful.entries()) {
    const parsed = splitEssentiaLabel(item.label);
    const relative = Number(item.score || 0) / topScore;
    const rankDecay = Math.max(0.45, 1 - index * 0.08);
    const weight = Math.max(14, Math.round(18 + relative * 72 * rankDecay));
    if (parsed.style) {
      addDiscogsScore(scores, parsed.style, parsed.genre, weight, { source: "essentia", value: parsed.display });
    } else if (parsed.genre) {
      addDiscogsScore(scores, parsed.genre, "", weight, { source: "essentia", value: parsed.genre });
    }
  }

  const topTags = useful.slice(0, 5).map(item => {
    const parsed = splitEssentiaLabel(item.label);
    const relative = Math.round(Number(item.score || 0) / topScore * 100);
    return t("ev.essentiaTopItem", {
      label: escapeHtml(displayName(parsed.display)),
      score: formatModelScore(item.score),
      strength: relative
    });
  });
  const modelName = (essentia && essentia.model) ? essentia.model : t("reason.source.essentia");
  evidence.push(t("ev.essentiaTop", { model: escapeHtml(modelName), list: topTags.join(t("list.sep")) }));
}

function buildGenreComposition(items) {
  const positive = items.filter(item => item.score > 0);
  if (!positive.length) return [];
  const topScore = positive[0].score;
  const threshold = Math.max(8, Math.round(topScore * 0.12));
  const included = positive.filter(item => item.score >= threshold);
  const total = included.reduce((sum, item) => sum + item.score, 0) || 1;
  const rounded = included.map(item => ({
    ...item,
    percent: Math.max(1, Math.round(item.score / total * 100))
  }));
  const drift = 100 - rounded.reduce((sum, item) => sum + item.percent, 0);
  if (rounded.length && drift !== 0) rounded[0].percent += drift;
  const visible = rounded
    .filter(item => item.percent >= MIN_VISIBLE_STYLE_PERCENT)
    .slice(0, MAX_VISIBLE_STYLE_ITEMS);
  return visible.length ? visible : rounded.slice(0, 1);
}

function buildVerdictTitle(composition) {
  if (!composition.length) return [];
  const [first, second] = composition;
  const parts = [first];
  if (second && second.percent >= 12 && second.score >= first.score * 0.55) {
    parts.push(second);
  }
  return parts;
}

// Render the headline with font sizes scaled by each style's share, so the
// dominant genre reads visibly larger than the secondary one. Each part shows
// the sub-style as the large word and the parent genre as a small tag above it.
function renderVerdictTitle(parts) {
  genreTitle.innerHTML = "";
  if (!parts.length) {
    genreTitle.textContent = t("verdict.insufficient");
    return;
  }
  const lead = parts[0].percent || parts[0].score || 1;
  parts.forEach((part, index) => {
    if (index > 0) {
      const plus = document.createElement("span");
      plus.className = "verdict-title-plus";
      plus.textContent = "+";
      genreTitle.appendChild(plus);
    }
    const span = document.createElement("span");
    span.className = "verdict-title-part";
    // Scale between 0.5em and 1em based on share relative to the leading style.
    const ratio = Math.max(0, Math.min(1, (part.percent || part.score || 0) / lead));
    span.style.fontSize = `${(0.5 + 0.5 * ratio).toFixed(3)}em`;

    const full = displayName(part.name);
    const sepIdx = full.indexOf(" / ");
    const genre = sepIdx === -1 ? "" : full.slice(0, sepIdx);
    const style = sepIdx === -1 ? full : full.slice(sepIdx + 3);

    if (genre) {
      const tag = document.createElement("span");
      tag.className = "verdict-title-genre";
      tag.textContent = genre;
      span.appendChild(tag);
    }
    const main = document.createElement("span");
    main.className = "verdict-title-style";
    main.textContent = style;
    span.appendChild(main);
    genreTitle.appendChild(span);
  });
}

// Show the analyzed track (title — artist) as a kicker above the headline.
function renderVerdictTrack(track) {
  if (!track || !track.title) {
    verdictTrack.hidden = true;
    verdictTrack.textContent = "";
    return;
  }
  const title = track.title;
  const artists = track.artists || t("track.unknownArtist");
  verdictTrack.hidden = false;
  verdictTrack.innerHTML = `<strong>${escapeHtml(title)}</strong><span class="verdict-track-sep">—</span>${escapeHtml(artists)}`;
}

function compactValue(text, maxLength = 34) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

// A reason is a structured object { source, value } produced during scoring.
// The label is localized here so the summary reads in the active language.
function classifyReason(reason) {
  if (!reason || typeof reason !== "object") return { source: "other", label: t("reason.source.other"), value: "" };
  const source = reason.source || "other";
  const labelKey = `reason.source.${source}`;
  const label = t(I18N.zh[labelKey] != null ? labelKey : "reason.source.other");
  return { source, label, value: compactValue(displayName(reason.value || "")) };
}

function compactReasonSummary(reasons, options = {}) {
  const { maxSources = 4, maxValuesPerSource = 2 } = options;
  const sourceOrder = ["essentia", "lastfm", "discogs", "itunes", "other"];
  const sourceLabels = new Map();
  const groups = new Map();

  for (const reason of reasons.filter(Boolean)) {
    const item = classifyReason(reason);
    if (!item.value) continue;
    const values = groups.get(item.source) || [];
    if (!values.some(value => normalize(value) === normalize(item.value))) {
      values.push(item.value);
      groups.set(item.source, values);
      sourceLabels.set(item.source, item.label);
    }
  }

  return sourceOrder
    .filter(source => groups.has(source))
    .slice(0, maxSources)
    .map(source => t("reason.group", {
      label: sourceLabels.get(source) || source,
      values: groups.get(source).slice(0, maxValuesPerSource).join(t("list.sep"))
    }))
    .join(t("reason.group.sep"));
}

function buildVerdictReason(composition) {
  const reasons = composition
    .slice(0, 4)
    .flatMap(item => item.reasons || [])
    .filter(Boolean);
  const summary = compactReasonSummary(uniqueBy(reasons, reason => `${reason.source}---${reason.value}`), {
    maxSources: 4,
    maxValuesPerSource: 2
  });
  return summary
    ? t("verdict.reasonPrefix", { summary })
    : t("verdict.reasonDefault");
}

function analyzeEvidence() {
  const scores = new Map();
  const evidence = [];
  const track = currentTrack();

  if (parseEvidenceBuilder) evidence.push(parseEvidenceBuilder());
  if (downloadEvidenceBuilder) evidence.push(downloadEvidenceBuilder());

  const metadataTags = collectMetadataTags(metadata);
  evidence.push(...metadataTags.evidence);
  // Essentia 音频模型输出作为基准分，唯一决定候选风格集合
  scoreEssentia(scores, essentiaAnalysis, evidence);
  // 元信息（Last.fm / Discogs / iTunes）只对 Essentia 已命中的风格做加成，不引入新风格
  applyMetadataBoost(scores, metadataTags.tags);
  if (audioFeatures) {
    evidence.push(t("ev.audioDecoded", {
      sec: Math.round(audioFeatures.duration),
      bpm: Math.round(audioFeatures.bpm || 0)
    }));
  }

  const sorted = [...scores.values()]
    .map(item => ({ ...item, score: Math.max(0, Math.min(100, Math.round(item.score))) }))
    .sort((a, b) => b.score - a.score);

  const composition = buildGenreComposition(sorted);
  const coverage = Math.max(0, Math.min(96, composition.reduce((sum, item) => sum + item.score, 0)));
  const titleParts = buildVerdictTitle(composition);

  renderScores(composition.length ? composition : sorted.slice(0, 8));
  renderMix(composition, sorted);
  renderEvidence(evidence, composition);
  renderFeatures(audioFeatures);

  renderVerdictTrack(track);
  renderVerdictTitle(titleParts);
  confidenceLabel.textContent = t("confidence.coverage", { n: Math.round(coverage) });
  genreReason.textContent = composition.length
    ? buildVerdictReason(composition)
    : t("verdict.notEnough");
  setStatus(t("status.analyzeDone"));
}

function renderScores(items) {
  scoreList.innerHTML = "";
  scoreCount.textContent = t("count.items", { n: items.filter(item => item.score > 0).length });
  for (const item of items) {
    const node = scoreTemplate.content.firstElementChild.cloneNode(true);
    const profile = profileForDisplayName(item.name);
    const nameWrap = node.querySelector(".score-name");
    node.querySelector("strong").textContent = displayName(item.name);
    if (profile) nameWrap.appendChild(createStyleInfoButton(profile, item.name));
    node.querySelector("small").textContent = compactReasonSummary(item.reasons || [], {
      maxSources: 3,
      maxValuesPerSource: 1
    }) || t("score.noStrong");
    const percent = item.percent ?? item.score;
    node.querySelector(".bar span").style.width = `${percent}%`;
    node.querySelector("b").textContent = item.percent != null ? `${item.percent}%` : item.score;
    scoreList.appendChild(node);
  }
}

// 循环色板：给堆叠条每个风格段分配一个可区分的颜色
const MIX_COLORS = ["#c8ff5f", "#63d2ff", "#ff6f3c", "#b985ff", "#ffd23c", "#4be3a3"];

function renderMix(composition, allScores = composition) {
  genreMix.innerHTML = "";
  if (!composition.length) return;

  const shown = composition.reduce((sum, item) => sum + item.percent, 0);
  const other = Math.max(0, 100 - shown);

  const segments = composition.map((item, index) => ({
    label: displayName(item.name),
    percent: item.percent,
    score: item.score,
    boosted: !!item.boosted,
    color: MIX_COLORS[index % MIX_COLORS.length]
  }));
  if (other > 0) {
    segments.push({ label: t("mix.other"), percent: other, color: "rgba(255,255,255,0.14)", isOther: true });
  }

  // 记录可见风格的颜色，供“最终分”详情区对齐；其余风格使用中性色
  const colorByName = new Map(composition.map((item, index) => [item.name, MIX_COLORS[index % MIX_COLORS.length]]));

  const bar = document.createElement("div");
  bar.className = "mix-bar";
  const legend = document.createElement("div");
  legend.className = "mix-legend";

  for (const seg of segments) {
    const cell = document.createElement("span");
    cell.className = "mix-seg";
    cell.style.width = `${seg.percent}%`;
    cell.style.background = seg.color;
    cell.title = `${seg.label} ${seg.percent}%`;
    if (seg.isOther) cell.classList.add("is-other");
    bar.appendChild(cell);

    const tag = document.createElement("span");
    tag.className = "mix-legend-item";
    if (seg.isOther) tag.classList.add("is-other");
    const dot = document.createElement("i");
    dot.className = "mix-dot";
    dot.style.background = seg.color;
    tag.appendChild(dot);
    tag.append(document.createTextNode(seg.label));
    const percent = document.createElement("b");
    percent.textContent = `${seg.percent}%`;
    tag.appendChild(percent);
    legend.appendChild(tag);
  }

  genreMix.appendChild(bar);
  genreMix.appendChild(legend);

  // 默认折叠的“最终分”详情，颜色与堆叠条 / 图例对齐
  const detail = document.createElement("details");
  detail.className = "mix-detail";
  const summary = document.createElement("summary");
  summary.textContent = t("mix.detail");
  detail.appendChild(summary);
  const scoreRows = document.createElement("div");
  scoreRows.className = "mix-score-list";
  for (const item of allScores) {
    const row = document.createElement("span");
    row.className = "mix-score-item";
    const color = colorByName.get(item.name);
    const dot = document.createElement("i");
    dot.className = "mix-dot";
    dot.style.background = color || "rgba(255,255,255,0.2)";
    if (!color) row.classList.add("is-muted");
    row.appendChild(dot);
    row.append(document.createTextNode(displayName(item.name)));
    const score = document.createElement("b");
    score.textContent = t("mix.detail.score", { score: formatModelScore(item.score) });
    row.appendChild(score);
    if (item.boosted) {
      const badge = document.createElement("em");
      badge.className = "mix-boost-badge";
      badge.textContent = t("mix.detail.boosted");
      row.appendChild(badge);
    }
    scoreRows.appendChild(row);
  }
  detail.appendChild(scoreRows);
  genreMix.appendChild(detail);
}

function renderEvidence(items, composition) {
  evidenceList.innerHTML = "";
  const list = items.length ? items : [t("ev.none")];
  evidenceCount.textContent = t("count.evidence", { n: list.length });
  for (const item of list.slice(0, 18)) {
    const li = document.createElement("li");
    li.innerHTML = item;
    evidenceList.appendChild(li);
  }
  if (composition && composition.length) {
    const li = document.createElement("li");
    li.innerHTML = t("ev.mixComposition", {
      list: composition.map(item => t("ev.mixItem", { label: escapeHtml(displayName(item.name)), percent: item.percent })).join(t("list.sep"))
    });
    evidenceList.appendChild(li);
  }
}

function renderFeatures(features) {
  featureGrid.innerHTML = "";
  // 每一项：[i18n key, 计算展示值的函数, 是否有说明]。说明文案取 `<key>.note`，
  // 默认隐藏，点卡片上的按钮才展开。没有音频时统一显示 "--"。
  const defs = [
    ["feat.bpm", f => Math.round(f.bpm || 0), true],
    ["feat.bassRatio", f => `${Math.round(f.bassRatio * 100)}%`, true],
    ["feat.brightness", f => `${Math.round(f.brightness * 100)}%`, true],
    ["feat.onset", f => `${Math.round(f.onsetDensity)}/min`, true],
    ["feat.centroid", f => `${Math.round(f.centroid || 0)} Hz`, true],
    ["feat.rolloff", f => `${Math.round(f.rolloff || 0)} Hz`, true],
    ["feat.dynamicRange", f => `${(f.dynamicRange || 0).toFixed(1)} dB`, true],
    ["feat.regularity", f => `${Math.round((f.rhythmRegularity || 0) * 100)}%`, true],
    ["feat.zcr", f => (f.zcr || 0).toFixed(3), true],
    ["feat.rms", f => `${(20 * Math.log10(Math.max(f.rms || 0, 1e-6))).toFixed(1)} dB`, true]
  ];

  for (const [key, format, hasNote] of defs) {
    const card = document.createElement("div");
    card.className = "feature";
    const head = hasNote
      ? `<span>${t(key)}<button type="button" class="feature-info" aria-expanded="false" aria-label="${t("feat.explain")}" title="${t("feat.explain")}">?</button></span>`
      : `<span>${t(key)}</span>`;
    const note = hasNote ? `<small hidden>${t(`${key}.note`)}</small>` : "";
    card.innerHTML = `${head}<strong>${features ? format(features) : "--"}</strong>${note}`;
    if (hasNote) {
      const button = card.querySelector(".feature-info");
      const small = card.querySelector("small");
      button.addEventListener("click", () => {
        const open = small.hidden;
        small.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
      });
    }
    featureGrid.appendChild(card);
  }
}

function pickPeaks(energies) {
  const mean = energies.reduce((sum, item) => sum + item, 0) / energies.length;
  const variance = energies.reduce((sum, item) => sum + Math.pow(item - mean, 2), 0) / energies.length;
  const threshold = mean + Math.sqrt(variance) * 0.86;
  const peaks = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] >= energies[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] > 3) peaks.push(i);
    }
  }
  return peaks;
}

function estimateBpm(energies, sampleRate, hopSize) {
  const peaks = pickPeaks(energies);
  const histogram = new Map();
  let total = 0;
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < Math.min(i + 12, peaks.length); j++) {
      const seconds = (peaks[j] - peaks[i]) * hopSize / sampleRate;
      if (seconds <= 0) continue;
      let bpm = 60 / seconds;
      while (bpm < 70) bpm *= 2;
      while (bpm > 190) bpm /= 2;
      const bucket = Math.round(bpm);
      histogram.set(bucket, (histogram.get(bucket) || 0) + 1);
      total++;
    }
  }
  const best = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0];
  // 节奏规整度：主导 BPM 桶（含相邻 ±1）占全部间隔投票的比例，越高越规整。
  let regularity = 0;
  if (best && total > 0) {
    const dominant = best[0];
    let hits = 0;
    for (const [bucket, count] of histogram) {
      if (Math.abs(bucket - dominant) <= 1) hits += count;
    }
    regularity = hits / total;
  }
  return { bpm: best ? best[0] : 0, regularity };
}

// 用 Goertzel 在一组对数频率点上探测能量，得到近似频谱，用于计算频谱质心与滚降。
function spectralShape(samples, start, size, sampleRate) {
  const freqs = [60, 90, 130, 190, 280, 400, 580, 840, 1200, 1750, 2500, 3600, 5200, 7500, 10800];
  let weighted = 0;
  let totalPower = 0;
  const powers = [];
  for (const freq of freqs) {
    if (freq >= sampleRate / 2) break;
    const power = goertzelPower(samples, start, size, sampleRate, freq);
    powers.push([freq, power]);
    weighted += freq * power;
    totalPower += power;
  }
  const centroid = totalPower > 0 ? weighted / totalPower : 0;
  // 滚降：累计能量达到 85% 时对应的频率。
  let rolloff = 0;
  let cumulative = 0;
  const target = totalPower * 0.85;
  for (const [freq, power] of powers) {
    cumulative += power;
    if (cumulative >= target) {
      rolloff = freq;
      break;
    }
  }
  return { centroid, rolloff };
}

function goertzelPower(samples, start, size, sampleRate, frequency) {
  const coeff = 2 * Math.cos(2 * Math.PI * frequency / sampleRate);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < size; i++) {
    s0 = samples[start + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function bandPower(samples, start, size, sampleRate, freqs) {
  return freqs.reduce((sum, freq) => sum + goertzelPower(samples, start, size, sampleRate, freq), 0) / freqs.length;
}

async function decodeAudioFromSource(source) {
  let arrayBuffer;
  if (source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error(t("err.readAudio"));
    arrayBuffer = await response.arrayBuffer();
  }
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
  await context.close();
  return buffer;
}

async function analyzeAudio(source) {
  setStatus(t("status.decoding"), true);
  setProgress("decode", t("progress.decode.label"), 76, t("progress.decode.detail"));
  audioState.textContent = t("audio.analyzing");
  const buffer = await decodeAudioFromSource(source);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const maxSeconds = Math.min(duration, 150);
  const maxSamples = Math.floor(maxSeconds * sampleRate);
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(maxSamples);

  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < maxSamples; i++) mono[i] += data[i] / channels;
  }

  const frameSize = 2048;
  const hopSize = 1024;
  const energies = [];
  let zcrSum = 0;
  let rmsSum = 0;
  let frames = 0;
  let bass = 0;
  let cowbell = 0;
  let bright = 0;
  let totalBand = 0;
  let centroidSum = 0;
  let rolloffSum = 0;
  let bandFrames = 0;
  const bandFrameStep = Math.max(1, Math.floor((maxSamples - frameSize) / 70));

  for (let start = 0; start + frameSize < maxSamples; start += hopSize) {
    let energy = 0;
    let crossings = 0;
    for (let i = 0; i < frameSize; i++) {
      const value = mono[start + i];
      energy += value * value;
      if (i > 0 && Math.sign(value) !== Math.sign(mono[start + i - 1])) crossings++;
    }
    energies.push(Math.sqrt(energy / frameSize));
    zcrSum += crossings / frameSize;
    rmsSum += Math.sqrt(energy / frameSize);
    frames++;
  }

  for (let start = 0; start + frameSize < maxSamples; start += bandFrameStep) {
    const low = bandPower(mono, start, frameSize, sampleRate, [45, 60, 80, 100, 130, 160]);
    const midBell = bandPower(mono, start, frameSize, sampleRate, [650, 780, 920, 1100]);
    const high = bandPower(mono, start, frameSize, sampleRate, [2200, 3200, 4600, 7000]);
    const total = low + midBell + high + bandPower(mono, start, frameSize, sampleRate, [220, 330, 440, 550, 1400]);
    bass += low;
    cowbell += midBell;
    bright += high;
    totalBand += total || 1;
    const shape = spectralShape(mono, start, frameSize, sampleRate);
    centroidSum += shape.centroid;
    rolloffSum += shape.rolloff;
    bandFrames++;
  }

  const { bpm, regularity } = estimateBpm(energies, sampleRate, hopSize);
  const peaks = pickPeaks(energies);
  // 动态范围：帧响度的 95 与 10 百分位之差（dB），古典大、EDM/流行小。
  const sortedEnergies = [...energies].sort((a, b) => a - b);
  const loudPct = sortedEnergies[Math.min(sortedEnergies.length - 1, Math.floor(sortedEnergies.length * 0.95))] || 1e-6;
  const quietPct = sortedEnergies[Math.floor(sortedEnergies.length * 0.1)] || 1e-6;
  const dynamicRange = 20 * Math.log10(Math.max(loudPct, 1e-6) / Math.max(quietPct, 1e-6));
  audioFeatures = {
    duration,
    bpm,
    bassRatio: bass / totalBand,
    cowbellRatio: cowbell / totalBand,
    brightness: bright / totalBand,
    onsetDensity: peaks.length / Math.max(1, maxSeconds / 60),
    centroid: centroidSum / Math.max(1, bandFrames),
    rolloff: rolloffSum / Math.max(1, bandFrames),
    dynamicRange,
    rhythmRegularity: regularity,
    zcr: zcrSum / Math.max(1, frames),
    rms: rmsSum / Math.max(1, frames)
  };

  audioState.textContent = t(source instanceof File ? "audio.localUpload" : "audio.downloaded");
  audioStateKey = source instanceof File ? "audio.localUpload" : "audio.downloaded";
  renderFeatures(audioFeatures);
  setProgress("decode", t("progress.decode.done"), 86, t("progress.decode.doneDetail", { bpm: Math.round(audioFeatures.bpm || 0), bass: Math.round(audioFeatures.bassRatio * 100) }));
  setStatus(t("status.audioDone"));
}

async function analyzeEssentia(fileName) {
  if (!fileName) return;
  setStatus(t("status.essentia"), true);
  setProgress("decode", t("progress.essentia.label"), 88, t("progress.essentia.detail"));
  try {
    essentiaAnalysis = await postJson("/api/essentia", { fileName, top: 12, model: activeModel });
    const top = essentiaAnalysis.predictions && essentiaAnalysis.predictions[0];
    if (top) {
      const parsed = splitEssentiaLabel(top.label);
      audioState.textContent = t("audio.essentiaDone");
      audioStateKey = "audio.essentiaDone";
      setProgress("decode", t("progress.essentia.done"), 92, t("progress.essentia.doneDetail", { label: displayName(parsed.display) }));
    }
  } catch (error) {
    essentiaAnalysis = { predictions: [], error: error.message };
    setProgress("decode", t("progress.essentia.fail"), 88, error.message);
  }
  renderFeatures(audioFeatures);
  return essentiaAnalysis;
}

async function fetchMetadata() {
  const track = currentTrack();
  setStatus(t("status.metadata"), true);
  setProgress("metadata", t("progress.metadata.label"), 22, t("progress.metadata.detail", { fmt: formatLabel(), title: track.title, artists: track.artists || t("track.unknownArtist") }));
  metadata = await postJson("/api/metadata", {
    title: track.title,
    artists: track.artists,
    album: track.album || "",
    model: activeModel
  });
  activeTrack = track;
  const fitScore = metadataFitScore(metadata, track);
  const evTitle = escapeHtml(track.title);
  const evArtists = escapeHtml(track.artists || t("track.unknownArtist"));
  if (isMusicLinkFormat(track.orientation)) {
    const platform = currentPlatformName(track.orientation);
    const albumHtml = track.album ? t("pe.album", { album: escapeHtml(track.album) }) : "";
    parseEvidenceBuilder = () => t("pe.platformGet", { platform, title: evTitle, artists: evArtists, album: albumHtml });
  } else if (fitScore > 0) {
    parseEvidenceBuilder = () => t("pe.metadataSupport", { title: evTitle, artists: evArtists });
  } else {
    parseEvidenceBuilder = () => t("pe.metadataNoMatch", { title: evTitle, artists: evArtists });
  }
  updateParsedLine();
  setProgress("metadata", t("progress.metadata.done"), 36, t("progress.metadata.doneDetail", { title: track.title, artists: track.artists || t("track.unknownArtist") }));
  setStatus(t("status.metadataDone"));
}

async function resolveNetEaseSong() {
  const raw = trackInput.value.trim();
  if (!raw) throw new Error(t("err.needNetease"));
  await resolvePlatformSong({
    raw,
    endpoint: "/api/netease-song",
    orientation: "netease-url",
    platform: t("platform.netease"),
    idKey: "id",
    idLabel: "song id"
  });
}

async function resolveQQMusicSong() {
  const raw = trackInput.value.trim();
  if (!raw) throw new Error(t("err.needQQ"));
  await resolvePlatformSong({
    raw,
    endpoint: "/api/qq-song",
    orientation: "qq-music-url",
    platform: t("platform.qq"),
    idKey: "songMid",
    idLabel: "songmid"
  });
}

async function resolvePlatformSong({ raw, endpoint, orientation, platform, idKey, idLabel }) {
  setStatus(t("status.parsePlatform", { platform }), true);
  setProgress("parse", t("progress.parse.platformLabel", { platform }), 12, t("progress.parse.platformDetail", { platform, idLabel }));
  const data = await postJson(endpoint, { url: raw });
  activeTrack = {
    title: data.title,
    artists: data.artists.join(" / "),
    album: data.album || "",
    raw,
    url: raw,
    orientation,
    sourceId: data[idKey] || data.id,
    sourceUrl: data.sourceUrl || raw
  };
  const evTitle = escapeHtml(data.title);
  const evArtists = escapeHtml(data.artists.join(" / "));
  const albumHtml = data.album ? t("pe.album", { album: escapeHtml(data.album) }) : "";
  parseEvidenceBuilder = () => t("pe.platformResolve", { platform: currentPlatformName(orientation), title: evTitle, artists: evArtists, album: albumHtml });
  updateParsedLine();
  setProgress("parse", t("progress.parse.platformDone", { platform }), 18, `${data.title} / ${data.artists.join(" / ")}`);
  setStatus(t("status.platformDone", { platform }));
}

async function downloadTrackAudio(track) {
  return postJson("/api/download", {
    url: "",
    platformUrl: isMusicLinkFormat(track.orientation) ? (track.sourceUrl || track.url || track.raw) : "",
    platform: track.orientation || "",
    title: track.title,
    artists: track.artists,
    query: [`"${track.title}"`, track.artists ? `"${track.artists}"` : ""].filter(Boolean).join(" ")
  });
}

async function findAndAnalyzeAudio() {
  const file = fileInput.files[0];
  if (file) {
    setProgress("decode", t("progress.decode.readLocal"), 64, t("progress.decode.readLocalDetail"));
    const uploaded = await uploadAudioFile(file);
    downloadedAudioUrl = uploaded.audioUrl;
    const upName = escapeHtml(file.name);
    const upSaved = escapeHtml(uploaded.fileName);
    let deleted = false;
    downloadEvidenceBuilder = () => t("de.uploaded", { name: upName, saved: upSaved }) + (deleted ? t("de.deletedServer") : "");
    await analyzeAudio(file);
    const essentia = await analyzeEssentia(uploaded.fileName);
    if (essentia && essentia.deletedAudio) deleted = true;
    return;
  }

  setStatus(t("status.searchAudio"), true);
  setProgress("search", t("progress.search.public"), 48, t("progress.search.searching"));
  const track = currentTrack();
  setProgress("search", t("progress.search.public"), 52, t("progress.search.currentFmt", { title: track.title, artists: track.artists || t("track.unknownArtist") }));
  const data = await downloadTrackAudio(track);
  downloadedAudioUrl = data.audioUrl;
  setProgress("download", t("progress.download.done"), 66, t("progress.download.doneDetail", { source: data.source }));
  const dlSource = escapeHtml(data.source);
  const dlName = escapeHtml(data.fileName);
  const dlMethod = data.method;
  const dlScore = data.matchScore;
  const dlFallbackReason = data.fallbackReason ? escapeHtml(data.fallbackReason) : "";
  let deleted = false;
  downloadEvidenceBuilder = () => {
    const scoreText = dlScore != null ? t("de.matchScore", { score: dlScore }) : "";
    const sourceText = dlMethod === "yt-dlp-search"
      ? t("de.sourceSearch", { source: dlSource, score: scoreText })
      : dlMethod === "yt-dlp-platform"
        ? t("de.sourcePlatform", { source: dlSource })
        : dlMethod === "yt-dlp-search-fallback"
          ? t("de.sourceFallback", { source: dlSource, score: scoreText })
          : t("de.sourceSpecified", { source: dlSource });
    const fallback = dlFallbackReason ? t("de.fallbackReason", { reason: dlFallbackReason }) : "";
    return t("de.tail", { sourceText, fallback, name: dlName }) + (deleted ? t("de.deletedLocal") : "");
  };
  await analyzeAudio(downloadedAudioUrl);
  const essentia = await analyzeEssentia(data.fileName);
  if (essentia && essentia.deletedAudio) deleted = true;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file ? file.name : t("file.none");
});

trackInput.addEventListener("input", () => {
  metadata = null;
  downloadedAudioUrl = "";
  audioFeatures = null;
  essentiaAnalysis = null;
  downloadEvidenceBuilder = null;
  activeTrack = null;
  parseEvidenceBuilder = null;
  updateParsedLine();
  resetProgress();
});

for (const input of formatInputs) {
  input.addEventListener("change", () => {
    metadata = null;
    downloadedAudioUrl = "";
    audioFeatures = null;
    essentiaAnalysis = null;
    downloadEvidenceBuilder = null;
    activeTrack = null;
    parseEvidenceBuilder = null;
    updateInputPlaceholder();
    updateParsedLine();
    resetProgress();
  });
}

for (const closeControl of document.querySelectorAll("[data-style-dialog-close]")) {
  closeControl.addEventListener("click", closeStyleDialog);
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeStyleDialog();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (document.activeElement?.matches("input")) document.activeElement.blur();
  try {
    const track = currentTrack();
    if (isMusicLinkFormat()) {
      if (!track.raw) throw new Error(t("err.needLink", { platform: currentPlatformName() }));
    } else if (!track.title) {
      throw new Error(t("err.needSongArtist"));
    }
    resetProgress();
    metadata = null;
    downloadedAudioUrl = "";
    audioFeatures = null;
    essentiaAnalysis = null;
    downloadEvidenceBuilder = null;
    activeTrack = null;
    parseEvidenceBuilder = null;
    setProgress("parse", t("progress.parse.input"), 10, t("progress.parse.inputDetail", { fmt: formatLabel() }));
    if (selectedFormat() === "netease-url") {
      await resolveNetEaseSong();
    } else if (selectedFormat() === "qq-music-url") {
      await resolveQQMusicSong();
    }
    await fetchMetadata();
    try {
      await findAndAnalyzeAudio();
    } catch (downloadError) {
      const failedTrack = currentTrack();
      const fTitle = escapeHtml(failedTrack.title);
      const fArtists = escapeHtml(failedTrack.artists || t("track.unknownArtist"));
      const fErr = escapeHtml(downloadError.message);
      downloadEvidenceBuilder = () => t("de.failed", { title: fTitle, artists: fArtists, err: fErr });
      setProgress("download", t("progress.download.fail"), 72, t("progress.download.failDetail"));
    }
    setProgress("score", t("progress.score.fuse"), 90, t("progress.score.fuseDetail"));
    analyzeEvidence();
    setProgress("score", t("progress.score.done"), 100, t("progress.score.doneDetail"));
    revealResults();
  } catch (error) {
    setStatus(t("status.failed"));
    setProgress("score", t("progress.score.fail"), 100, error.message);
    alert(error.message);
  }
});

// Apply the active language to every static element (data-i18n*), refresh the
// dynamic placeholders/parsed line, re-render any existing results and update
// the toggle label. Called once on load and on every language switch.
function applyLanguage() {
  document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
  for (const el of document.querySelectorAll("[data-i18n-ph]")) {
    el.placeholder = t(el.dataset.i18nPh);
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  }
  audioState.textContent = t(audioStateKey);
  const chosenFile = fileInput.files[0];
  fileName.textContent = chosenFile ? chosenFile.name : t("file.none");
  updateInputPlaceholder();
  updateParsedLine();
  if (parseEvidenceBuilder || downloadEvidenceBuilder || metadata || essentiaAnalysis || audioFeatures) {
    analyzeEvidence();
  } else {
    renderScores(GENRES.slice(0, 8).map(genre => ({ name: genre.name, score: 0, reasons: [] })));
    renderMix([]);
    renderFeatures(null);
  }
}

function setLang(next) {
  if (next !== "en" && next !== "zh") return;
  if (next === LANG) return;
  LANG = next;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, LANG);
  } catch {}
  applyLanguage();
}

if (langToggle) {
  langToggle.addEventListener("click", () => {
    setLang(LANG === "zh" ? "en" : "zh");
  });
}

resetProgress();
applyLanguage();
