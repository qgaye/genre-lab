// Playlist genre analysis page. It submits a NetEase playlist to the server's
// aggregate job endpoint, which downloads a public audio match, runs Essentia
// genre analysis, queries iTunes / Discogs / Last.fm metadata and scores each
// track server-side. The page receives a jobId (kept in the URL so a mobile
// tab can background/resume), polls for per-track results, and renders both the
// per-track composition and the aggregate composition across all tracks.
const form = document.querySelector("#playlistForm");
const playlistInput = document.querySelector("#playlistInput");
const modelSelect = document.querySelector("#modelSelect");
const analyzeBtn = document.querySelector("#analyzeBtn");
const statusPill = document.querySelector("#statusPill");
const parsedLine = document.querySelector("#parsedLine");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressFill = document.querySelector("#progressFill");
const progressLog = document.querySelector("#progressLog");
const playlistMeta = document.querySelector("#playlistMeta");
const genreTwoLevel = document.querySelector("#genreTwoLevel");
const viewToggle = document.querySelector("#viewToggle");
const genreMosaic = document.querySelector("#genreMosaic");
const mosaicCaption = document.querySelector("#mosaicCaption");
const mosaicStage = document.querySelector("#mosaicStage");
const trackList = document.querySelector("#trackList");
const trackCount = document.querySelector("#trackCount");
const trackCardTemplate = document.querySelector("#trackCardTemplate");
const shareMosaicBtn = document.querySelector("#shareMosaic");
const sharePreview = document.querySelector("#sharePreview");
const sharePreviewImage = document.querySelector("#sharePreviewImage");
const langToggle = document.querySelector("#langToggle");
const styleDialog = document.querySelector("#styleDialog");
const styleDialogKicker = document.querySelector("#styleDialogKicker");
const styleDialogTitle = document.querySelector("#styleDialogTitle");
const styleDialogTrackCount = document.querySelector("#styleDialogTrackCount");
const styleDialogTrackList = document.querySelector("#styleDialogTrackList");
const styleDialogInfoToggle = document.querySelector("#styleDialogInfoToggle");
const styleDialogInfoPanel = document.querySelector("#styleDialogInfoPanel");
const styleDialogInfoBack = document.querySelector("#styleDialogInfoBack");
const styleDialogOverview = document.querySelector("#styleDialogOverview");
const styleDialogFocus = document.querySelector("#styleDialogFocus");
const styleDialogHistory = document.querySelector("#styleDialogHistory");
const styleDialogTrack = document.querySelector("#styleDialogTrack");
const styleDialogTrackNote = document.querySelector("#styleDialogTrackNote");

if (new URLSearchParams(window.location.search).get("showModel") === "1") {
  document.documentElement.classList.add("show-model-selector");
}

const MIX_COLORS = ["#1f3fe0", "#ff3d7f", "#0a9d8b", "#e59200", "#7a4fd6", "#111318"];
// Genres whose aggregate share falls below this are folded into a single
// neutral "其他" slice so tiny long-tail genres don't clutter the charts.
const OTHER_GENRE_THRESHOLD = 5;
const OTHER_GENRE_COLOR = "#6b6e64";
// Within each parent genre, styles below this aggregate share, or ranked beyond
// MAX_STYLES_PER_GENRE, are folded into one "其他" child tile so the sunburst /
// mosaic / share image don't fill up with unreadable 1%/0% slivers when a large
// playlist spreads across many styles.
const OTHER_STYLE_THRESHOLD = 2;
const MAX_STYLES_PER_GENRE = 6;

const MOOD_AXES = [
  { key: "mood_happy", zh: "明快", en: "Bright", icon: "☀️" },
  { key: "mood_party", zh: "跃动", en: "Dynamic", icon: "🎶" },
  { key: "mood_aggressive", zh: "激烈", en: "Intense", icon: "⚡" },
  { key: "mood_sad", zh: "沉郁", en: "Somber", icon: "🌧️" },
  { key: "mood_relaxed", zh: "舒缓", en: "Calm", icon: "🌿" }
];
const MOOD_AXIS_KEYS = MOOD_AXES.map(a => a.key);

const MOOD_THEME_DENYLIST = new Set([
  "advertising", "commercial", "corporate",
  "documentary", "film", "movie", "trailer",
  "children", "christmas", "holiday",
  "sport", "game",
  "nature", "space", "travel", "summer",
  "soundscape", "background", "ballad"
]);
const MOOD_THEME_MIN_SCORE = 0.05;
const MOOD_THEME_RELATIVE_RATIO = 0.3;

const MOOD_THEME_LABELS = {
  action: { zh: "动感", en: "Action", icon: "💥" },
  adventure: { zh: "奔放", en: "Adventurous", icon: "🗺️" },
  advertising: { zh: "广告感", en: "Advertising", icon: "📢" },
  background: { zh: "背景音乐", en: "Background", icon: "🎵" },
  ballad: { zh: "抒情", en: "Ballad", icon: "🎶" },
  calm: { zh: "平和", en: "Calm", icon: "😌" },
  children: { zh: "儿童", en: "Children", icon: "🧸" },
  christmas: { zh: "圣诞", en: "Christmas", icon: "🎄" },
  commercial: { zh: "商业感", en: "Commercial", icon: "🏪" },
  cool: { zh: "酷炫", en: "Cool", icon: "😎" },
  corporate: { zh: "企业感", en: "Corporate", icon: "🏢" },
  dark: { zh: "暗调", en: "Dark", icon: "🌑" },
  deep: { zh: "深沉", en: "Deep", icon: "🌊" },
  documentary: { zh: "纪录感", en: "Documentary", icon: "🎬" },
  drama: { zh: "戏剧感", en: "Drama", icon: "🎭" },
  dramatic: { zh: "戏剧张力", en: "Dramatic", icon: "🎭" },
  dream: { zh: "梦幻", en: "Dreamy", icon: "💭" },
  emotional: { zh: "深情", en: "Emotional", icon: "💫" },
  energetic: { zh: "活力", en: "Energetic", icon: "⚡" },
  epic: { zh: "史诗感", en: "Epic", icon: "🏛️" },
  fast: { zh: "疾速", en: "Fast", icon: "💨" },
  film: { zh: "电影感", en: "Film", icon: "🎞️" },
  fun: { zh: "轻快", en: "Fun", icon: "🎉" },
  funny: { zh: "俏皮", en: "Playful", icon: "😄" },
  game: { zh: "游戏", en: "Game", icon: "🎮" },
  groovy: { zh: "律动", en: "Groovy", icon: "🕺" },
  happy: { zh: "愉悦", en: "Happy", icon: "😊" },
  heavy: { zh: "厚重", en: "Heavy", icon: "🪨" },
  holiday: { zh: "假日", en: "Holiday", icon: "🏖️" },
  hopeful: { zh: "希冀", en: "Hopeful", icon: "🌅" },
  inspiring: { zh: "启迪", en: "Inspiring", icon: "✨" },
  love: { zh: "爱意", en: "Romantic", icon: "❤️" },
  meditative: { zh: "禅意", en: "Meditative", icon: "🧘" },
  melancholic: { zh: "惆怅", en: "Melancholic", icon: "🌧️" },
  melodic: { zh: "旋律优美", en: "Melodic", icon: "🎶" },
  motivational: { zh: "励志", en: "Motivational", icon: "💪" },
  movie: { zh: "电影", en: "Movie", icon: "🎥" },
  nature: { zh: "自然", en: "Nature", icon: "🌿" },
  party: { zh: "派对感", en: "Party", icon: "🎊" },
  positive: { zh: "积极", en: "Positive", icon: "☀️" },
  powerful: { zh: "强劲", en: "Powerful", icon: "💪" },
  relaxing: { zh: "松弛", en: "Relaxing", icon: "🍃" },
  retro: { zh: "复古", en: "Retro", icon: "📻" },
  romantic: { zh: "浪漫", en: "Romantic", icon: "💕" },
  sad: { zh: "忧伤", en: "Sad", icon: "😢" },
  sexy: { zh: "魅惑", en: "Sultry", icon: "💋" },
  slow: { zh: "徐缓", en: "Slow", icon: "🐢" },
  soft: { zh: "柔和", en: "Soft", icon: "☁️" },
  soundscape: { zh: "音景", en: "Soundscape", icon: "🌌" },
  space: { zh: "太空", en: "Space", icon: "🚀" },
  sport: { zh: "运动", en: "Sport", icon: "🏃" },
  summer: { zh: "夏日", en: "Summer", icon: "☀️" },
  trailer: { zh: "预告片感", en: "Trailer", icon: "📺" },
  travel: { zh: "旅行", en: "Travel", icon: "✈️" },
  upbeat: { zh: "欢快", en: "Upbeat", icon: "🎶" },
  uplifting: { zh: "昂扬", en: "Uplifting", icon: "🌈" }
};

const MOOD_THEME_AXIS_MAP = {
  action: "mood_aggressive",
  adventure: "mood_party",
  calm: "mood_relaxed",
  cool: "mood_party",
  dark: "mood_sad",
  deep: "mood_sad",
  drama: "mood_sad",
  dramatic: "mood_sad",
  dream: "mood_relaxed",
  emotional: "mood_sad",
  energetic: "mood_party",
  epic: "mood_aggressive",
  fast: "mood_party",
  fun: "mood_happy",
  funny: "mood_happy",
  groovy: "mood_party",
  happy: "mood_happy",
  heavy: "mood_aggressive",
  hopeful: "mood_happy",
  inspiring: "mood_happy",
  love: "mood_happy",
  meditative: "mood_relaxed",
  melancholic: "mood_sad",
  melodic: "mood_relaxed",
  motivational: "mood_aggressive",
  party: "mood_party",
  positive: "mood_happy",
  powerful: "mood_aggressive",
  relaxing: "mood_relaxed",
  retro: "mood_party",
  romantic: "mood_happy",
  sad: "mood_sad",
  sexy: "mood_party",
  slow: "mood_relaxed",
  soft: "mood_relaxed",
  upbeat: "mood_happy",
  uplifting: "mood_happy"
};

const MOOD_AXIS_COLORS = {
  mood_happy: "#cc8aa0",
  mood_party: "#d4a574",
  mood_aggressive: "#b86464",
  mood_sad: "#7b97b6",
  mood_relaxed: "#7ab0a0"
};

let activeModel = "";
let running = false;

// ---------------------------------------------------------------------------
// i18n: static labels via data-i18n* attributes, dynamic strings via t(). The
// selected language is shared with the single-track page through localStorage.
// ---------------------------------------------------------------------------
const LANG_STORAGE_KEY = "genre-lab-lang";
let LANG = "zh";
try {
  const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
  if (savedLang === "en" || savedLang === "zh") LANG = savedLang;
} catch {}

const I18N = {
  zh: {
    "lang.toggle": "EN",
    "console.aria": "歌单曲风分析工作台",
    "field.model": "曲风模型",
    "pl.title": "我的音乐品味",
    "pl.nav.single": "单曲",
    "pl.status.waiting": "等待输入",
    "pl.field.link": "网易云歌单链接",
    "pl.field.linkPlaceholder": "例如：https://music.163.com/playlist?id=13856318070",
    "pl.parsed.default": "粘贴网易云歌单链接，将遍历每首歌进行 Essentia 音频分析并查询 iTunes / Discogs / Last.fm 曲风",
    "pl.action.analyze": "分析歌单",
    "pl.progress.ready": "准备就绪",
    "pl.overview": "歌单概览",
    "pl.overview.empty": "粘贴一个网易云歌单链接开始逐曲分析。",
    "pl.view.aria": "视图切换",
    "pl.view.genre": "曲风",
    "pl.view.mood": "情绪",
    "pl.mosaic.captionGenre": "曲风矩阵 · 面积即占比 / 同色同流派",
    "pl.mosaic.captionMood": "情绪矩阵 · 面积即权重 / 同色同情绪维度",
    "pl.share.title": "生成占比矩阵图片并预览",
    "pl.share.button": "分享",
    "pl.share.busy": "生成中…",
    "pl.share.error": "分享生成失败",
    "pl.tracks.title": "逐曲曲风占比",
    "pl.preview.title": "占比矩阵已生成",
    "pl.preview.close": "关闭占比矩阵预览",
    "pl.preview.alt": "Genre Lab 占比矩阵图片",
    "pl.preview.hint": "长按图片，选择“保存图片”或“添加到照片”。",
    "pl.count.tracks": "{n} 首",
    "pl.request.failed": "请求失败",
    "pl.taxonomy.failed": "曲风分类法加载失败",
    "pl.mix.empty": "未能得出曲风占比。",
    "pl.track.unknownArtist": "未知艺人",
    "pl.other": "其他",
    "pl.sunburst.genre": "流派 · {percent}%",
    "pl.sunburst.dominant": "主导 {percent}%",
    "pl.card.status.download": "下载音频…",
    "pl.card.status.audioNotFound": "音频未找到",
    "pl.card.body.audioFail": "无法获取音频：{err}",
    "pl.card.status.essentia": "Essentia 分析…",
    "pl.card.status.analyzeFail": "分析失败",
    "pl.card.body.essentiaFail": "Essentia 分析失败：{err}",
    "pl.card.status.queryTags": "查询曲风标签…",
    "pl.log.tagFail": "{title}：曲风标签查询失败（{err}），仅用音频分析",
    "pl.log.trackDone": "{title} 分析完成（{i}/{n}）",
    "pl.log.trackFail": "{title} 分析失败（{i}/{n}）",
    "pl.card.status.noResult": "无结果",
    "pl.card.body.noHit": "音频分析未命中任何曲风。",
    "pl.card.status.done": "完成",
    "pl.card.status.queued": "排队中",
    "pl.status.needLink": "请输入歌单链接",
    "pl.overview.parsing": "正在解析网易云歌单…",
    "pl.status.parsing": "解析歌单…",
    "pl.progress.parse": "解析歌单",
    "pl.progress.requesting": "请求网易云歌单信息…",
    "pl.playlist.fallbackName": "网易云歌单",
    "pl.overview.analyzing": "{name} · 共 {n} 首歌曲，逐曲分析中…",
    "pl.parsed.start": "歌单「{name}」共 {n} 首，开始逐曲分析",
    "pl.parsed.start.sampled": "歌单「{name}」{total} 首中随机 {n} 首，开始逐曲分析",
    "pl.progress.parsedInfo": "歌单「{name}」共 {n} 首",
    "pl.sampled.notice": "歌单「{name}」共 {total} 首，超过 {cap} 首上限，已随机挑选其中 {n} 首进行分析。",
    "pl.status.empty": "歌单为空",
    "pl.overview.emptyTracks": "该歌单没有可分析的曲目。",
    "pl.status.analyzing": "分析中 {i}/{n}",
    "pl.progress.analyzingNth": "分析第 {i}/{n} 首",
    "pl.status.resuming": "继续分析 {i}/{n}",
    "pl.progress.resumed": "检测到上次分析被中断，已完成 {done}/{n} 首，继续分析剩余曲目…",
    "pl.progress.complete": "分析完成",
    "pl.progress.completeInfo": "成功分析 {ok}/{n} 首",
    "pl.status.complete": "完成 {ok}/{n}",
    "pl.status.error": "出错了",
    "pl.overview.failed": "分析失败：{err}",
    "pl.overview.expired": "分析结果已过期或不存在，请重新发起分析。",
    "pl.log.error": "错误：{err}",
    "pl.card.footer": "由 Genre Lab · 歌单曲风分析 生成",
    "pl.card.headline": "我的音乐风格",
    "dialog.kicker": "Discogs Style",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.focus": "风格重点",
    "dialog.history": "发展脉络",
    "dialog.entry": "主流入门音乐",
    "dialog.close": "关闭曲风详情",
    "dialog.trackCount": "{n} 首关联歌曲 · {percent}%",
    "dialog.associated": "关联歌曲",
    "dialog.info.toggle": "展开曲风介绍",
    "dialog.info.hide": "收起曲风介绍",
    "dialog.info.back": "返回歌曲",
    "dialog.infoUnavailable": "暂无曲风介绍",
    "dialog.albumPrefix": "专辑",
    "dialog.noAlbum": "未知专辑",
    "dialog.noCover": "无封面",
    "dialog.noTracks": "当前分析结果里没有命中这类曲风的歌曲。",
    "dialog.noEntry": "暂无稳定入门曲"
  },
  en: {
    "lang.toggle": "中",
    "console.aria": "Playlist genre analysis workbench",
    "field.model": "Genre model",
    "pl.title": "Playlist Genre Analysis",
    "pl.nav.single": "Single",
    "pl.status.waiting": "Awaiting input",
    "pl.field.link": "NetEase playlist link",
    "pl.field.linkPlaceholder": "e.g. https://music.163.com/playlist?id=13856318070",
    "pl.parsed.default": "Paste a NetEase playlist link; each track is analyzed with Essentia audio and iTunes / Discogs / Last.fm genre tags",
    "pl.action.analyze": "Analyze playlist",
    "pl.progress.ready": "Ready",
    "pl.overview": "Playlist overview",
    "pl.overview.empty": "Paste a NetEase playlist link to start track-by-track analysis.",
    "pl.view.aria": "View toggle",
    "pl.view.genre": "Genre",
    "pl.view.mood": "Mood",
    "pl.mosaic.captionGenre": "Genre mosaic · area = share / same color = same genre",
    "pl.mosaic.captionMood": "Mood mosaic · area = weight / same color = same mood axis",
    "pl.share.title": "Generate a mosaic image and preview it",
    "pl.share.button": "Share",
    "pl.share.busy": "Generating…",
    "pl.share.error": "Failed to generate image",
    "pl.tracks.title": "Per-track genre share",
    "pl.preview.title": "Mosaic ready",
    "pl.preview.close": "Close mosaic preview",
    "pl.preview.alt": "Genre Lab mosaic image",
    "pl.preview.hint": "Long-press the image and choose \u201cSave Image\u201d or \u201cAdd to Photos\u201d.",
    "pl.count.tracks": "{n} tracks",
    "pl.request.failed": "Request failed",
    "pl.taxonomy.failed": "Failed to load the genre taxonomy",
    "pl.mix.empty": "No genre share could be derived.",
    "pl.track.unknownArtist": "Unknown artist",
    "pl.other": "Other",
    "pl.sunburst.genre": "Genre · {percent}%",
    "pl.sunburst.dominant": "Dominant {percent}%",
    "pl.card.status.download": "Downloading audio…",
    "pl.card.status.audioNotFound": "Audio not found",
    "pl.card.body.audioFail": "Could not fetch audio: {err}",
    "pl.card.status.essentia": "Essentia analysis…",
    "pl.card.status.analyzeFail": "Analysis failed",
    "pl.card.body.essentiaFail": "Essentia analysis failed: {err}",
    "pl.card.status.queryTags": "Querying genre tags…",
    "pl.log.tagFail": "{title}: genre tag lookup failed ({err}); using audio analysis only",
    "pl.log.trackDone": "{title} analyzed ({i}/{n})",
    "pl.log.trackFail": "{title} failed ({i}/{n})",
    "pl.card.status.noResult": "No result",
    "pl.card.body.noHit": "Audio analysis matched no genre.",
    "pl.card.status.done": "Done",
    "pl.card.status.queued": "Queued",
    "pl.status.needLink": "Please enter a playlist link",
    "pl.overview.parsing": "Parsing the NetEase playlist…",
    "pl.status.parsing": "Parsing playlist…",
    "pl.progress.parse": "Parsing playlist",
    "pl.progress.requesting": "Requesting NetEase playlist info…",
    "pl.playlist.fallbackName": "NetEase playlist",
    "pl.overview.analyzing": "{name} · {n} tracks, analyzing…",
    "pl.parsed.start": "Playlist \u201c{name}\u201d has {n} tracks; starting analysis",
    "pl.parsed.start.sampled": "Playlist \u201c{name}\u201d: {n} of {total} tracks picked at random; starting analysis",
    "pl.progress.parsedInfo": "Playlist \u201c{name}\u201d has {n} tracks",
    "pl.sampled.notice": "Playlist \u201c{name}\u201d has {total} tracks, exceeding the {cap}-track cap; {n} were randomly picked for analysis.",
    "pl.status.empty": "Empty playlist",
    "pl.overview.emptyTracks": "This playlist has no analyzable tracks.",
    "pl.status.analyzing": "Analyzing {i}/{n}",
    "pl.progress.analyzingNth": "Analyzing track {i}/{n}",
    "pl.status.resuming": "Resuming {i}/{n}",
    "pl.progress.resumed": "The previous analysis was interrupted; {done}/{n} done, resuming the remaining tracks…",
    "pl.progress.complete": "Analysis complete",
    "pl.progress.completeInfo": "Analyzed {ok}/{n} tracks",
    "pl.status.complete": "Done {ok}/{n}",
    "pl.status.error": "Something went wrong",
    "pl.overview.failed": "Analysis failed: {err}",
    "pl.overview.expired": "This analysis has expired or no longer exists; please start a new one.",
    "pl.log.error": "Error: {err}",
    "pl.card.footer": "Made with Genre Lab · Playlist Genre Analysis",
    "pl.card.headline": "My Music Taste",
    "dialog.kicker": "Discogs Style",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.focus": "Style focus",
    "dialog.history": "History",
    "dialog.entry": "Popular entry track",
    "dialog.close": "Close style details",
    "dialog.trackCount": "{n} linked tracks · {percent}%",
    "dialog.associated": "Linked tracks",
    "dialog.info.toggle": "Show style intro",
    "dialog.info.hide": "Hide style intro",
    "dialog.info.back": "Back to tracks",
    "dialog.infoUnavailable": "No style intro available",
    "dialog.albumPrefix": "Album",
    "dialog.noAlbum": "Unknown album",
    "dialog.noCover": "No cover",
    "dialog.noTracks": "No analyzed tracks matched this style.",
    "dialog.noEntry": "No stable entry track"
  }
};

function t(key, params) {
  const table = I18N[LANG] || I18N.zh;
  let str = table[key];
  if (str == null) str = I18N.zh[key] != null ? I18N.zh[key] : key;
  if (params) str = str.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? params[name] : ""));
  return str;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || t("pl.request.failed"));
    error.data = data;
    throw error;
  }
  return data;
}

function setStatus(text, busy = false) {
  statusPill.textContent = text;
  analyzeBtn.disabled = busy;
}

function setProgress(label, percent, detail) {
  progressLabel.textContent = label;
  progressPercent.textContent = `${Math.round(percent)}%`;
  progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (detail) logLine(detail);
}

function logLine(text) {
  const li = document.createElement("li");
  li.textContent = text;
  progressLog.appendChild(li);
  progressLog.scrollTop = progressLog.scrollHeight;
}

function resetProgress() {
  progressLog.innerHTML = "";
  setProgress(t("pl.progress.ready"), 0);
}

// Localize a "Genre / Style" (or single) label with the taxonomy translations.
// In English mode the raw taxonomy labels are already English, so return as-is.
function displayName(display) {
  const text = String(display || "");
  if (LANG === "en") return text;
  const translations = (window.DISCOGS_TAXONOMY && window.DISCOGS_TAXONOMY.translations && window.DISCOGS_TAXONOMY.translations.zh) || {};
  const genres = translations.genres || {};
  const styles = translations.styles || {};
  const sep = " / ";
  const idx = text.indexOf(sep);
  if (idx === -1) return genres[text] || styles[text] || text;
  const genre = text.slice(0, idx);
  const style = text.slice(idx + sep.length);
  return `${genres[genre] || genre} / ${styles[style] || style}`;
}

// ---------------------------------------------------------------------------
// Model + taxonomy
// ---------------------------------------------------------------------------
async function initModelSelector() {
  try {
    const response = await fetch("/api/models");
    if (!response.ok) return;
    const data = await response.json();
    activeModel = data.default || "";
    modelSelect.innerHTML = "";
    for (const model of data.models || []) {
      const option = document.createElement("option");
      option.value = model.key;
      option.textContent = model.label;
      if (model.key === activeModel) option.selected = true;
      modelSelect.appendChild(option);
    }
  } catch (error) {
    // model selector is optional; ignore failures
  }
}

// Load the model taxonomy script. Scoring itself runs server-side now; the
// browser only needs DISCOGS_TAXONOMY for localized display names.
async function loadModelTaxonomy(model) {
  const src = model ? `/discogs-taxonomy.js?model=${encodeURIComponent(model)}` : "/discogs-taxonomy.js";
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(t("pl.taxonomy.failed")));
    document.head.appendChild(script);
  });
}

modelSelect.addEventListener("change", () => {
  activeModel = modelSelect.value;
});

// ---------------------------------------------------------------------------
// Per-track rendering
// ---------------------------------------------------------------------------
// Per-track summary is intentionally minimal: only the dominant genre is shown
// so the list stays a quiet supporting cast to the aggregate charts above. The
// full composition lives in the title tooltip for anyone who wants the detail.
function renderTrackMix(container, composition) {
  container.innerHTML = "";
  if (!composition.length) {
    container.textContent = t("pl.mix.empty");
    container.classList.add("track-mix-empty");
    return;
  }
  container.classList.remove("track-mix-empty");
  const top = composition[0];

  const tag = document.createElement("span");
  tag.className = "track-top";
  tag.title = composition.map(item => `${displayName(item.name)} ${item.percent}%`).join(" · ");

  const dot = document.createElement("i");
  dot.className = "mix-dot";
  dot.style.background = MIX_COLORS[0];
  tag.appendChild(dot);

  const name = document.createElement("span");
  name.className = "track-top-name";
  name.textContent = displayName(top.name);
  tag.appendChild(name);

  const percent = document.createElement("b");
  percent.textContent = `${top.percent}%`;
  tag.appendChild(percent);

  container.appendChild(tag);
}

function createTrackCard(track, index) {
  const node = trackCardTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".track-index").textContent = String(index + 1).padStart(2, "0");
  node.querySelector(".track-card-name strong").textContent = track.title;
  node.querySelector(".track-card-name small").textContent = (track.artists || []).join(" / ") || t("pl.track.unknownArtist");
  node.querySelector(".track-status").textContent = t("pl.card.status.queued");
  trackList.appendChild(node);
  return {
    node,
    title: track.title,
    status: node.querySelector(".track-status"),
    body: node.querySelector(".track-card-body")
  };
}

function setCardStatus(card, text, state) {
  card.status.textContent = text;
  card.status.className = `track-status${state ? ` is-${state}` : ""}`;
}

// ---------------------------------------------------------------------------
// Aggregate composition across all analyzed tracks (two-level genre / style)
// ---------------------------------------------------------------------------
// Split a "Genre / Style" label into its two taxonomy levels. Genre names can
// themselves contain " / " (e.g. "Funk / Soul"), so the style is separated by
// the LAST occurrence of the separator.
function splitGenreStyle(name) {
  const text = String(name || "");
  const idx = text.lastIndexOf(" / ");
  if (idx === -1) return { genre: text, style: "" };
  return { genre: text.slice(0, idx), style: text.slice(idx + 3) };
}

// ---------------------------------------------------------------------------
// Style intro dialog: reuse the shared Discogs style profiles (same data as the
// single-track page) so clicking a mosaic/sunburst segment shows the same
// genre/style write-up. Profiles are keyed by the English "Genre---Style" id.
// ---------------------------------------------------------------------------
function styleProfilesById() {
  const profiles = (window.DISCOGS_STYLE_PROFILES && window.DISCOGS_STYLE_PROFILES.profiles) || [];
  const map = new Map();
  for (const profile of profiles) map.set(profile.id, profile);
  return map;
}

// Look up a style profile by its English genre + style names. The folded
// "其他" bucket has no profile of its own, but its child styles keep their
// original genre so they still resolve.
function profileFor(genreName, styleName) {
  if (!genreName || !styleName) return null;
  return styleProfilesById().get(`${genreName}---${styleName}`) || null;
}

let lastStyleInfoTrigger = null;
let currentStyleDialogData = null;
let currentDialogIsMood = false;
let styleAssociations = new Map();

function styleAssociationKey(genreName, styleName) {
  return `${genreName || ""}---${styleName || ""}`;
}

function registerStyleAssociations(genres) {
  styleAssociations = new Map();
  for (const genre of genres || []) {
    for (const style of genre.styles || []) {
      const genreName = style.genre || genre.name;
      styleAssociations.set(styleAssociationKey(genreName, style.name), {
        genre: genreName,
        genreLabel: localizeToken(genreName, "genre"),
        style: style.name,
        label: style.label,
        percent: style.percent,
        tracks: style.tracks || [],
        profile: profileFor(genreName, style.name)
      });
    }
  }
}

function getStyleAssociation(genreName, styleName) {
  const data = styleAssociations.get(styleAssociationKey(genreName, styleName));
  if (data) return data;
  return {
    genre: genreName,
    genreLabel: localizeToken(genreName, "genre"),
    style: styleName,
    label: localizeToken(styleName, "style"),
    percent: 0,
    tracks: [],
    profile: profileFor(genreName, styleName)
  };
}

function setStyleInfoOpen(open) {
  if (!styleDialogInfoPanel || !styleDialogInfoToggle) return;
  styleDialogInfoPanel.hidden = !open;
  styleDialog.querySelector(".style-dialog__panel")?.classList.toggle("is-info-open", open);
  styleDialogInfoToggle.setAttribute("aria-expanded", open ? "true" : "false");
  const key = open ? "dialog.info.hide" : "dialog.info.toggle";
  styleDialogInfoToggle.setAttribute("aria-label", t(key));
  styleDialogInfoToggle.title = t(key);
}

function coverImageSrc(url) {
  return `/api/cover-image?url=${encodeURIComponent(url)}`;
}

function renderStyleDialogTracks(rows) {
  if (!styleDialogTrackList) return;
  styleDialogTrackList.innerHTML = "";
  if (!rows || !rows.length) {
    const empty = document.createElement("p");
    empty.className = "style-dialog__empty";
    empty.textContent = t("dialog.noTracks");
    styleDialogTrackList.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const track = row.track || {};
    const item = document.createElement("article");
    item.className = "style-dialog__track";

    const cover = document.createElement("div");
    cover.className = "style-dialog__cover";
    if (track.albumImage) {
      const img = document.createElement("img");
      img.src = coverImageSrc(track.albumImage);
      img.alt = track.album || track.title || t("dialog.noCover");
      img.loading = "lazy";
      cover.appendChild(img);
    } else {
      cover.textContent = t("dialog.noCover");
    }
    item.appendChild(cover);

    const body = document.createElement("div");
    body.className = "style-dialog__track-body";
    const title = document.createElement(track.sourceUrl ? "a" : "strong");
    title.textContent = track.title || "";
    if (track.sourceUrl) {
      title.href = track.sourceUrl;
      title.target = "_blank";
      title.rel = "noreferrer";
    }
    body.appendChild(title);

    const artist = document.createElement("small");
    artist.textContent = (track.artists || []).join(" / ") || t("pl.track.unknownArtist");
    body.appendChild(artist);

    const album = document.createElement("span");
    album.textContent = `${t("dialog.albumPrefix")} · ${track.album || t("dialog.noAlbum")}`;
    body.appendChild(album);
    item.appendChild(body);

    const score = document.createElement("b");
    score.className = "style-dialog__track-score";
    score.textContent = `${Math.round(row.percent || 0)}%`;
    item.appendChild(score);
    styleDialogTrackList.appendChild(item);
  }
}

function renderStyleProfile(profile) {
  const hasProfile = Boolean(profile);
  if (styleDialogInfoToggle) {
    styleDialogInfoToggle.disabled = !hasProfile;
    styleDialogInfoToggle.textContent = hasProfile ? "i" : "–";
    if (!hasProfile) {
      styleDialogInfoToggle.setAttribute("aria-label", t("dialog.infoUnavailable"));
      styleDialogInfoToggle.title = t("dialog.infoUnavailable");
    }
  }
  if (!hasProfile) {
    styleDialogOverview.textContent = "";
    styleDialogHistory.textContent = "";
    styleDialogFocus.innerHTML = "";
    styleDialogTrack.textContent = t("dialog.noEntry");
    styleDialogTrackNote.textContent = "";
    return;
  }
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
}

function openStyleDialog(styleData, trigger, isMood = false) {
  if (!styleData || !styleDialog) return;
  currentStyleDialogData = styleData;
  currentDialogIsMood = isMood;
  lastStyleInfoTrigger = trigger || null;
  const profile = isMood ? null : (styleData.profile || null);
  const genreName = styleData.genre || (profile && profile.genre) || "";
  if (isMood) {
    styleDialogKicker.textContent = styleData.genreLabel || "";
  } else {
    styleDialogKicker.textContent = genreName
      ? t("dialog.kickerGenre", { genre: localizeToken(genreName, "genre") })
      : t("dialog.kicker");
  }
  styleDialogTitle.textContent = styleData.label || localizeToken(styleData.style || (profile && profile.style) || "", "style");
  if (styleDialogTrackCount) {
    styleDialogTrackCount.textContent = t("dialog.trackCount", {
      n: (styleData.tracks || []).length,
      percent: Math.round(styleData.percent || 0)
    });
  }
  renderStyleDialogTracks(styleData.tracks || []);
  setStyleInfoOpen(false);
  renderStyleProfile(profile);
  styleDialog.classList.add("is-open");
  styleDialog.setAttribute("aria-hidden", "false");
  styleDialogInfoToggle?.focus();
}

function closeStyleDialog() {
  if (!styleDialog || !styleDialog.classList.contains("is-open")) return;
  styleDialog.classList.remove("is-open");
  styleDialog.setAttribute("aria-hidden", "true");
  styleDialog.querySelector(".style-dialog__panel")?.classList.remove("is-info-open");
  currentStyleDialogData = null;
  currentDialogIsMood = false;
  if (lastStyleInfoTrigger && typeof lastStyleInfoTrigger.focus === "function") lastStyleInfoTrigger.focus();
  lastStyleInfoTrigger = null;
}

for (const closeControl of document.querySelectorAll("[data-style-dialog-close]")) {
  closeControl.addEventListener("click", closeStyleDialog);
}

if (styleDialogInfoToggle) {
  styleDialogInfoToggle.addEventListener("click", () => {
    if (styleDialogInfoToggle.disabled) return;
    const open = styleDialogInfoToggle.getAttribute("aria-expanded") !== "true";
    setStyleInfoOpen(open);
  });
}

if (styleDialogInfoBack) {
  styleDialogInfoBack.addEventListener("click", () => {
    setStyleInfoOpen(false);
    styleDialogInfoToggle?.focus();
  });
}


// Localize a single genre or style token via the taxonomy translations. In
// English mode the raw taxonomy token is already English, so return it as-is.
function localizeToken(token, kind) {
  if (LANG === "en") return token;
  const translations = (window.DISCOGS_TAXONOMY && window.DISCOGS_TAXONOMY.translations && window.DISCOGS_TAXONOMY.translations.zh) || {};
  const genres = translations.genres || {};
  const styles = translations.styles || {};
  if (kind === "genre") return genres[token] || styles[token] || token;
  return styles[token] || genres[token] || token;
}

// Build the two-level model: parent genres (each with a color + weight) holding
// their child styles, all normalized so parent totals sum to 100%.
function buildTwoLevel(compositions, tracks = []) {
  const genreMap = new Map();
  let counted = 0;
  for (const [trackIndex, comp] of compositions.entries()) {
    if (!comp || !comp.length) continue;
    counted += 1;
    for (const item of comp) {
      const { genre, style } = splitGenreStyle(item.name);
      const entry = genreMap.get(genre) || { name: genre, total: 0, styles: new Map() };
      entry.total += item.percent;
      const styleKey = style || genre;
      const styleEntry = entry.styles.get(styleKey) || { sum: 0, tracks: [] };
      styleEntry.sum += item.percent;
      if (tracks[trackIndex]) {
        styleEntry.tracks.push({
          track: tracks[trackIndex],
          percent: item.percent
        });
      }
      entry.styles.set(styleKey, styleEntry);
      genreMap.set(genre, entry);
    }
  }
  if (!counted) return [];

  const grand = [...genreMap.values()].reduce((sum, g) => sum + g.total, 0) || 1;
  const genres = [...genreMap.values()]
    .map((g, index) => ({
      name: g.name,
      label: localizeToken(g.name, "genre"),
      percent: g.total / grand * 100,
      styles: [...g.styles.entries()]
        .map(([style, data]) => ({
          name: style,
          genre: g.name,
          label: localizeToken(style, "style"),
          percent: data.sum / grand * 100,
          tracks: [...data.tracks].sort((a, b) => b.percent - a.percent)
        }))
        .sort((a, b) => b.percent - a.percent)
    }))
    .sort((a, b) => b.percent - a.percent);

  // Fold long-tail genres (share < threshold) into one neutral "其他" slice.
  // Only the GENRE dimension is thresholded — the style dimension is never
  // filtered, so every real style of the folded genres is kept and shown as a
  // child style of "其他" (with its true style label, not the genre name).
  const major = genres.filter(g => g.percent >= OTHER_GENRE_THRESHOLD);
  const minor = genres.filter(g => g.percent < OTHER_GENRE_THRESHOLD);
  if (minor.length) {
    const otherPercent = minor.reduce((sum, g) => sum + g.percent, 0);
    const otherStyles = minor
      .flatMap(g => g.styles)
      .sort((a, b) => b.percent - a.percent);
    major.push({
      name: "__other__",
      label: t("pl.other"),
      percent: otherPercent,
      styles: otherStyles
    });
  }

  major.forEach((g, index) => {
    g.color = g.name === "__other__" ? OTHER_GENRE_COLOR : MIX_COLORS[index % MIX_COLORS.length];
    g.styles = foldGenreStyles(g.styles, g.name === "__other__");
  });
  return major;
}

// Within one parent genre, keep at most MAX_STYLES_PER_GENRE styles that also
// clear OTHER_STYLE_THRESHOLD and DROP the long-tail rest entirely — folding
// them into an "其他" tile would be misleading, since the sum of many tiny
// styles often outweighs every real style and dominates the chart. The kept
// styles are then rescaled so their shares again sum to the parent genre's
// total, keeping the parent area honest while the mosaic tiles / sunburst arc
// fill it exactly. Always keeps at least the top style.
//
// The "其他" genre is itself an aggregate of long-tail genres, so each of its
// styles is tiny in absolute terms and would all fail OTHER_STYLE_THRESHOLD,
// leaving it with a single tile even when "其他" is large. For it we skip the
// absolute threshold and just keep the top MAX_STYLES_PER_GENRE styles.
function foldGenreStyles(styles, isOther = false) {
  const sorted = [...styles].sort((a, b) => b.percent - a.percent);
  const originalTotal = sorted.reduce((sum, style) => sum + style.percent, 0);
  let kept = isOther
    ? sorted.slice(0, MAX_STYLES_PER_GENRE)
    : sorted.filter((style, i) => i < MAX_STYLES_PER_GENRE && style.percent >= OTHER_STYLE_THRESHOLD);
  if (!kept.length) kept = sorted.slice(0, 1);
  const keptTotal = kept.reduce((sum, style) => sum + style.percent, 0) || 1;
  const scale = originalTotal / keptTotal;
  return kept.map(style => ({ ...style, percent: style.percent * scale }));
}

let twoLevelShown = false;
let shareMeta = { title: "", subtitle: "" };
let lastCompositions = null;
let lastDimensions = [];
let lastSummary = null;
let lastGenreTwoLevel = null;
let lastMoodTwoLevel = null;
let currentMosaicView = "mosaic-genre";
let mosaicData = [];

function moodAxisLabel(key) {
  const ax = MOOD_AXES.find(a => a.key === key);
  if (!ax) return key;
  return LANG === "en" ? ax.en : ax.zh;
}

function moodThemeLabel(tag) {
  const lb = MOOD_THEME_LABELS[tag];
  if (!lb) return tag;
  return LANG === "en" ? lb.en : lb.zh;
}

function buildMoodTwoLevel(dimensionsList, tracks = []) {
  const axisMap = new Map();
  let counted = 0;
  for (const [trackIndex, dims] of dimensionsList.entries()) {
    if (!dims) continue;
    counted += 1;
    const radar = dims.mood_radar && dims.mood_radar.axes;
    const theme = dims.mtg_jamendo_moodtheme && dims.mtg_jamendo_moodtheme.predictions;
    const track = tracks[trackIndex];
    const axisScores = {};
    if (radar) {
      for (const ax of radar) {
        const s = Math.max(0, Math.min(1, Number(ax.score) || 0));
        axisScores[ax.key] = s;
        const entry = axisMap.get(ax.key) || { key: ax.key, total: 0, tags: new Map() };
        entry.total += s;
        axisMap.set(ax.key, entry);
      }
    }
    if (theme) {
      const candidates = theme
        .filter(p => !MOOD_THEME_DENYLIST.has(p.label))
        .map(p => ({ label: p.label, _score: Math.max(0, Math.min(1, Number(p.score) || 0)) }));
      const globalMax = candidates.reduce((m, p) => Math.max(m, p._score), 0);
      const relThreshold = Math.max(MOOD_THEME_MIN_SCORE, globalMax * MOOD_THEME_RELATIVE_RATIO);
      const items = candidates.filter(p => p._score >= relThreshold);
      for (const item of items) {
        const axisKey = MOOD_THEME_AXIS_MAP[item.label];
        if (!axisKey || axisScores[axisKey] == null) continue;
        const weight = item._score * (axisScores[axisKey] > 0.3 ? 1 : 0.5);
        const entry = axisMap.get(axisKey);
        if (!entry) continue;
        const tagEntry = entry.tags.get(item.label) || { sum: 0, tracks: [] };
        tagEntry.sum += weight;
        if (track) tagEntry.tracks.push({ track, percent: item._score * 100 });
        entry.tags.set(item.label, tagEntry);
      }
    }
  }
  if (!counted) return [];
  const grand = [...axisMap.values()].reduce((sum, a) => sum + a.total, 0) || 1;
  const axes = [...axisMap.entries()]
    .map(([key, data]) => {
      const ax = MOOD_AXES.find(a => a.key === key);
      const axisIcon = ax ? ax.icon : "🎵";
      const axisLabelText = ax ? (LANG === "en" ? ax.en : ax.zh) : key;
      const label = `${axisIcon} ${axisLabelText}`;
      const axisPercent = data.total / grand * 100;
      let tags = [...data.tags.entries()]
        .map(([tag, td]) => {
          const lb = MOOD_THEME_LABELS[tag];
          const ic = lb ? lb.icon : "🎵";
          return {
            name: tag,
            genre: key,
            label: `${ic} ${moodThemeLabel(tag)}`,
            percent: td.sum / grand * 100,
            tracks: [...td.tracks].sort((a, b) => b.percent - a.percent)
          };
        })
        .sort((a, b) => b.percent - a.percent);
      tags = foldMoodStyles(tags, axisPercent);
      if (!tags.length || tags[0].name === "__axis__") {
        tags = [{
          name: key,
          genre: key,
          label,
          percent: axisPercent,
          tracks: tags.length && tags[0].name === "__axis__" ? tags[0].tracks : []
        }];
      }
      return {
        name: key,
        label,
        percent: axisPercent,
        color: MOOD_AXIS_COLORS[key] || "#6b6e64",
        styles: tags
      };
    })
    .filter(a => a.percent >= 3)
    .sort((a, b) => b.percent - a.percent);
  return axes;
}

function foldMoodStyles(tags, axisPercent) {
  const MAX_TAGS = 5;
  const MIN_TAG_PCT_REL = 0.02;
  const sorted = [...tags].sort((a, b) => b.percent - a.percent);
  const rawTotal = sorted.reduce((sum, t) => sum + t.percent, 0);
  let kept;
  if (rawTotal > 0) {
    const minAbs = axisPercent * MIN_TAG_PCT_REL;
    kept = sorted.filter((t, i) => i < MAX_TAGS && t.percent >= minAbs);
    if (!kept.length) kept = sorted.slice(0, 1);
  } else {
    kept = [];
  }
  if (!kept.length) return [];
  const keptTotal = kept.reduce((sum, t) => sum + t.percent, 0) || 1;
  const scale = axisPercent / keptTotal;
  return kept.map(t => ({ ...t, percent: t.percent * scale }));
}

function renderAggregate(compositions, dimensionsList) {
  lastCompositions = compositions;
  lastDimensions = dimensionsList || [];
  const tracks = jobState && jobState.tracks ? jobState.tracks : [];
  lastGenreTwoLevel = buildTwoLevel(compositions, tracks);
  lastMoodTwoLevel = buildMoodTwoLevel(lastDimensions, tracks);
  registerStyleAssociations(lastGenreTwoLevel);
  const hasAny = lastGenreTwoLevel.length > 0 || lastMoodTwoLevel.length > 0;
  genreTwoLevel.hidden = !hasAny;
  if (shareMosaicBtn) shareMosaicBtn.disabled = !hasAny;
  if (hasAny && !twoLevelShown) {
    twoLevelShown = true;
    switchView("mosaic-genre");
  } else if (hasAny) {
    showMosaic(currentMosaicView);
  }
}

function showMosaic(view) {
  const isMood = view === "mosaic-mood";
  const data = isMood ? lastMoodTwoLevel : lastGenreTwoLevel;
  mosaicData = data || [];
  mosaicCaption.textContent = isMood ? t("pl.mosaic.captionMood") : t("pl.mosaic.captionGenre");
  genreMosaic.hidden = false;
  renderMosaicTiles(mosaicData);
  requestAnimationFrame(() => layoutMosaicTree());
}

function switchView(view) {
  currentMosaicView = view;
  for (const btn of viewToggle.querySelectorAll(".view-toggle-btn")) {
    const active = btn.dataset.view === view;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
  showMosaic(view);
}

viewToggle.addEventListener("click", event => {
  const btn = event.target.closest(".view-toggle-btn");
  if (btn) switchView(btn.dataset.view);
});

// Mosaic (treemap): every tile's AREA is proportional to its share, so a 4%
// style is genuinely small in both dimensions. Genres are nested regions (not
// forced full-height columns) — same color = same genre, sizes stay honest.
function squarifyTreemap(items, x, y, w, h) {
  const nodes = items
    .filter(it => it.value > 0)
    .map(it => ({ ref: it, value: it.value }))
    .sort((a, b) => b.value - a.value);
  const totalValue = nodes.reduce((s, n) => s + n.value, 0) || 1;
  const totalArea = w * h;
  for (const n of nodes) n.area = n.value / totalValue * totalArea;

  const out = [];
  let free = { x, y, w, h };

  const worst = (row, side) => {
    const sum = row.reduce((s, n) => s + n.area, 0);
    let max = -Infinity;
    let min = Infinity;
    for (const n of row) {
      if (n.area > max) max = n.area;
      if (n.area < min) min = n.area;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const place = row => {
    const sum = row.reduce((s, n) => s + n.area, 0);
    if (free.w >= free.h) {
      const colW = sum / free.h;
      let cy = free.y;
      for (const n of row) {
        const rh = n.area / colW;
        out.push({ ref: n.ref, x: free.x, y: cy, w: colW, h: rh });
        cy += rh;
      }
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      const rowH = sum / free.w;
      let cx = free.x;
      for (const n of row) {
        const rw = n.area / rowH;
        out.push({ ref: n.ref, x: cx, y: free.y, w: rw, h: rowH });
        cx += rw;
      }
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
  };

  let row = [];
  for (const node of nodes) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0) {
      row.push(node);
      continue;
    }
    if (worst(row, side) >= worst([...row, node], side)) {
      row.push(node);
    } else {
      place(row);
      row = [node];
    }
  }
  if (row.length) place(row);
  return out;
}

function renderMosaicTiles(data) {
  mosaicData = data || [];
  mosaicStage.innerHTML = "";
  if (!mosaicData.length) return;

  const legend = document.createElement("div");
  legend.className = "mosaic-legend";
  for (const g of mosaicData) {
    const item = document.createElement("span");
    item.className = "mosaic-legend-item";
    const dot = document.createElement("i");
    dot.className = "mosaic-dot";
    dot.style.background = g.color;
    item.appendChild(dot);
    item.append(document.createTextNode(g.label));
    const pct = document.createElement("b");
    pct.textContent = `${Math.round(g.percent)}%`;
    item.appendChild(pct);
    legend.appendChild(item);
  }
  mosaicStage.appendChild(legend);

  const tree = document.createElement("div");
  tree.className = "mosaic-tree";
  mosaicStage.appendChild(tree);
}

// Scale a tile's label font size to its area so a genre/style that takes up a
// bigger share reads larger, and tiny long-tail tiles shrink to still fit.
function mosaicFontSizes(bw, bh) {
  const pct = Math.max(11, Math.min(34, Math.round(8 + Math.sqrt(bw * bh) * 0.06)));
  const name = Math.max(10, Math.round(pct * 0.8));
  return { pct, name };
}

// Lay out (or re-lay out) the treemap tiles in pixel space. Deferred until the
// tree is actually measurable, since the mosaic figure may be hidden at render
// time (the sunburst is the default view).
function layoutMosaicTree() {
  const tree = mosaicStage.querySelector(".mosaic-tree");
  if (!tree || !mosaicData.length) return;
  const W = tree.clientWidth;
  const H = tree.clientHeight;
  if (!W || !H) return;

  tree.innerHTML = "";
  const GAP = 3;
  const genreRects = squarifyTreemap(
    mosaicData.map(g => ({ value: g.percent, genre: g })),
    0, 0, W, H
  );
  for (const gr of genreRects) {
    const genre = gr.ref.genre;
    const styleRects = squarifyTreemap(
      genre.styles.map((s, i) => ({ value: s.percent, style: s, rank: i })),
      gr.x, gr.y, gr.w, gr.h
    );
    for (const sr of styleRects) {
      const style = sr.ref.style;
      const rank = sr.ref.rank;
      const bw = Math.max(0, sr.w - GAP);
      const bh = Math.max(0, sr.h - GAP);
      const block = document.createElement("div");
      block.className = "mosaic-block";
      block.style.left = `${sr.x + GAP / 2}px`;
      block.style.top = `${sr.y + GAP / 2}px`;
      block.style.width = `${bw}px`;
      block.style.height = `${bh}px`;
      block.style.background = genre.color;
      const minOpacity = currentMosaicView === "mosaic-mood" ? 0.65 : 0.45;
      block.style.opacity = rank === 0 ? "1" : String(Math.max(minOpacity, 1 - rank * (currentMosaicView === "mosaic-mood" ? 0.12 : 0.22)));
      block.title = `${genre.label} / ${style.label} ${Math.round(style.percent)}%`;
      block.dataset.genre = style.genre || genre.name;
      block.dataset.style = style.name;
      const fs = mosaicFontSizes(bw, bh);

      // A tall, narrow block can't fit a horizontal "name  %" row, so switch to
      // a vertical label (text runs top-to-bottom) when the block is clearly
      // portrait and too skinny for horizontal text.
      const isVertical = bh >= bw * 1.6 && bw < 60 && bh >= 60;
      if (isVertical) {
        block.classList.add("is-vertical");
        const name = document.createElement("span");
        name.className = "mb-name";
        name.textContent = style.label;
        name.style.fontSize = `${fs.name}px`;
        const pct = document.createElement("b");
        pct.className = "mb-pct";
        pct.textContent = `${Math.round(style.percent)}%`;
        pct.style.fontSize = `${fs.pct}px`;
        block.appendChild(name);
        block.appendChild(pct);
      } else if (bw >= 44 && bh >= 24) {
        const name = document.createElement("span");
        name.className = "mb-name";
        name.textContent = style.label;
        name.style.fontSize = `${fs.name}px`;
        // Let a horizontal name wrap onto as many lines as the block height
        // allows, instead of truncating with an ellipsis on a single line.
        const lines = Math.max(1, Math.floor((bh - 10) / (fs.name * 1.25 + 2)));
        name.style.setProperty("--mb-lines", String(lines));
        const pct = document.createElement("b");
        pct.className = "mb-pct";
        pct.textContent = `${Math.round(style.percent)}%`;
        pct.style.fontSize = `${fs.pct}px`;
        block.appendChild(name);
        block.appendChild(pct);
      } else if (bw >= 28 && bh >= 15) {
        const pct = document.createElement("b");
        pct.className = "mb-pct mb-pct-solo";
        pct.textContent = `${Math.round(style.percent)}%`;
        pct.style.fontSize = `${Math.max(10, Math.min(fs.pct, 16))}px`;
        block.appendChild(pct);
      }
      tree.appendChild(block);
    }
  }
}

let mosaicResizeQueued = false;
window.addEventListener("resize", () => {
  if (mosaicResizeQueued || genreMosaic.hidden) return;
  mosaicResizeQueued = true;
  requestAnimationFrame(() => {
    mosaicResizeQueued = false;
    layoutMosaicTree();
  });
});

mosaicStage.addEventListener("click", event => {
  const block = event.target.closest(".mosaic-block");
  if (!block) return;
  const genreKey = block.dataset.genre;
  const styleKey = block.dataset.style;
  if (currentMosaicView === "mosaic-mood") {
    openMoodDialog(genreKey, styleKey, block);
  } else {
    openStyleDialog(getStyleAssociation(genreKey, styleKey), block);
  }
});

function findMoodStyle(genreKey, styleKey) {
  for (const axis of lastMoodTwoLevel || []) {
    if (axis.name !== genreKey) continue;
    for (const tag of axis.styles || []) {
      if (tag.name === styleKey) return { axis, tag };
    }
    if (!styleKey) return { axis, tag: null };
  }
  return { axis: null, tag: null };
}

function openMoodDialog(genreKey, styleKey, trigger) {
  const { axis, tag } = findMoodStyle(genreKey, styleKey);
  if (!axis) return;
  const data = tag
    ? { genre: axis.name, genreLabel: axis.label, style: tag.name, label: tag.label, percent: tag.percent, tracks: tag.tracks || [], profile: null }
    : { genre: axis.name, genreLabel: axis.label, style: axis.name, label: axis.label, percent: axis.percent, tracks: [], profile: null };
  openStyleDialog(data, trigger, true);
}

// ---------------------------------------------------------------------------
// Playlist aggregate job: submit once, then poll for per-track results.
//
// Scoring now happens server-side; the client submits the playlist, receives a
// jobId (kept in the page URL so a backgrounded mobile tab can resume), and
// polls a status endpoint every POLL_INTERVAL_MS, rendering each track's
// composition or failure reason as it arrives.
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 10000;
let jobState = null;
let pollTimer = null;
let pollBusy = false;

// Map a failed track's stage to its status pill and body copy.
const TRACK_FAIL_TEXT = {
  download: { status: "pl.card.status.audioNotFound", body: "pl.card.body.audioFail" },
  essentia: { status: "pl.card.status.analyzeFail", body: "pl.card.body.essentiaFail" },
  score: { status: "pl.card.status.noResult", body: "pl.card.body.noHit" }
};

// Render one track result into its card. Returns { composition, dimensions }
// so both can be collected for the aggregate charts.
function renderTrackResult(card, result) {
  if (!card) return { composition: null, dimensions: null };
  if (result.status === "ok") {
    setCardStatus(card, t("pl.card.status.done"), "done");
    renderTrackMix(card.body, result.composition);
    return { composition: result.composition, dimensions: result.dimensions || null };
  }
  const map = TRACK_FAIL_TEXT[result.stage] || TRACK_FAIL_TEXT.essentia;
  setCardStatus(card, t(map.status), "fail");
  card.body.textContent = result.stage === "score"
    ? t("pl.card.body.noHit")
    : t(map.body, { err: result.error || "" });
  return { composition: null, dimensions: result.dimensions || null };
}

// Reset all playlist view state before a fresh submit.
function resetPlaylistView() {
  resetProgress();
  trackList.innerHTML = "";
  mosaicStage.innerHTML = "";
  genreTwoLevel.hidden = true;
  twoLevelShown = false;
  lastCompositions = null;
  lastDimensions = [];
  lastGenreTwoLevel = null;
  lastMoodTwoLevel = null;
  currentMosaicView = "mosaic-genre";
  mosaicData = [];
  styleAssociations = new Map();
  lastSummary = null;
  shareMeta = { title: "", subtitle: "" };
  if (shareMosaicBtn) shareMosaicBtn.disabled = true;
  trackCount.textContent = t("pl.count.tracks", { n: 0 });
  playlistMeta.textContent = t("pl.overview.parsing");
  for (const btn of viewToggle.querySelectorAll(".view-toggle-btn")) {
    const active = btn.dataset.view === "mosaic-genre";
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
}

// Persist (or clear) the jobId in the page URL so refresh / app-switch resumes.
function setJobInUrl(jobId) {
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set("job", jobId);
  else url.searchParams.delete("job");
  history.replaceState(null, "", url);
}

// Render the "analyzing" overview / count / parsed line for a job. When the
// playlist was randomly down-sampled, the overview says "{n} of {total} (random)"
// instead of a plain "{n} tracks" so the count isn't mistaken for the whole list.
function renderPlaylistMeta(info) {
  const name = info.name || t("pl.playlist.fallbackName");
  const { total } = info;
  const sampled = Boolean(info.sampled);
  const originalCount = info.originalCount || total;
  shareMeta = {
    title: name,
    subtitle: ""
  };
  playlistMeta.textContent = t("pl.overview.analyzing", { name, n: total });
  trackCount.textContent = t("pl.count.tracks", { n: total });
  parsedLine.textContent = sampled
    ? t("pl.parsed.start.sampled", { name, n: total, total: originalCount })
    : t("pl.parsed.start", { name, n: total });
  return name;
}

// Build the job's client state (cards + composition slots) from a submit or a
// resumed status payload.
function installJob(info) {
  const name = renderPlaylistMeta(info);
  const tracks = info.tracks || [];
  jobState = {
    jobId: info.jobId,
    name,
    total: info.total,
    sampled: Boolean(info.sampled),
    originalCount: info.originalCount || info.total,
    tracks,
    cards: tracks.map((track, index) => createTrackCard(track, index)),
    compositions: new Array(tracks.length).fill(null),
    dimensions: new Array(tracks.length).fill(null),
    applied: 0
  };
  return name;
}

// Apply the newly completed results from a status payload to the cards and
// aggregate charts. Each newly arrived result also appends a per-track line to
// the progress log so both fresh and resumed runs show "<track> analyzed".
// `silent` skips those lines for the historical batch a resumed page loads in
// one shot (which would otherwise flood the log with hundreds of entries).
function applyResults(data, silent = false) {
  const total = jobState.total || data.total || 0;
  for (const result of data.results || []) {
    const card = jobState.cards[result.index];
    const rendered = renderTrackResult(card, result);
    jobState.compositions[result.index] = rendered.composition;
    jobState.dimensions[result.index] = rendered.dimensions;
    if (silent) continue;
    const title = (card && card.title) || "";
    const key = result.status === "ok" ? "pl.log.trackDone" : "pl.log.trackFail";
    logLine(t(key, { title, i: result.index + 1, n: total }));
  }
  jobState.applied = data.completed;
  if (data.results && data.results.length) renderAggregate(jobState.compositions, jobState.dimensions);
}

function updateJobProgress(data) {
  if (data.state !== "running") return;
  const total = jobState.total || data.total || 0;
  const nth = total ? Math.min(data.completed + 1, total) : 0;
  const pct = total ? 8 + Math.round((data.completed / total) * 90) : 8;
  setStatus(t("pl.status.analyzing", { i: nth, n: total }), true);
  setProgress(t("pl.progress.analyzingNth", { i: nth, n: total }), pct);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function finishJob(data) {
  stopPolling();
  const { name, total } = jobState;
  const ok = data.ok;
  lastSummary = { name, total, ok, sampled: jobState.sampled, originalCount: jobState.originalCount };
  setProgress(t("pl.progress.complete"), 100, t("pl.progress.completeInfo", { ok, n: total }));
  setStatus(t("pl.status.complete", { ok, n: total }));
  shareMeta = {
    title: name,
    subtitle: ""
  };
  playlistMeta.textContent = name;
  running = false;
  analyzeBtn.disabled = false;
}

function failJob(message) {
  stopPolling();
  setStatus(t("pl.status.error"));
  playlistMeta.textContent = t("pl.overview.failed", { err: message || "" });
  logLine(t("pl.log.error", { err: message || "" }));
  running = false;
  analyzeBtn.disabled = false;
}

function expireJob() {
  stopPolling();
  setJobInUrl("");
  setStatus(t("pl.status.error"));
  playlistMeta.textContent = t("pl.overview.expired");
  running = false;
  analyzeBtn.disabled = false;
}

// Fetch job status. A 404 is surfaced as an "expired" state rather than an
// error so callers can prompt the user to restart.
async function fetchJobStatus(jobId, since) {
  const response = await fetch(`/api/analyze-playlist/status?jobId=${encodeURIComponent(jobId)}&since=${since}`);
  const data = await response.json();
  if (response.status === 404) {
    data.state = "expired";
    return data;
  }
  if (!response.ok) throw new Error(data.error || t("pl.request.failed"));
  return data;
}

async function pollOnce() {
  if (!jobState || pollBusy) return;
  pollBusy = true;
  try {
    const data = await fetchJobStatus(jobState.jobId, jobState.applied);
    if (data.state === "expired") {
      expireJob();
      return;
    }
    applyResults(data);
    updateJobProgress(data);
    if (data.state === "done") finishJob(data);
    else if (data.state === "error") failJob(data.error);
  } catch (error) {
    // Transient network error (e.g. app briefly backgrounded); keep polling.
    logLine(t("pl.log.error", { err: error.message }));
  } finally {
    pollBusy = false;
  }
}

// When the server randomly down-sampled a large playlist, make it explicit: the
// full size, the cap, and how many tracks were picked. Shown both on a fresh
// submit and when resuming a sampled job.
function noticeIfSampled(info) {
  if (!info || !info.sampled) return;
  const name = info.name || t("pl.playlist.fallbackName");
  const analyzed = info.total || 0;
  const total = info.originalCount || analyzed;
  logLine(t("pl.sampled.notice", { name, total, cap: analyzed, n: analyzed }));
}

function beginJob(info) {
  const name = installJob(info);
  setProgress(t("pl.progress.parse"), 8, t("pl.progress.parsedInfo", { name, n: info.total }));
  noticeIfSampled(info);
  running = true;
  analyzeBtn.disabled = true;
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  pollOnce();
}

// On page load, resume a job whose id is present in the URL (mobile app-switch
// or refresh). Unknown / expired ids are cleared with a notice.
async function resumeJobFromUrl() {
  const jobId = new URLSearchParams(window.location.search).get("job");
  if (!jobId) return;
  try {
    await loadModelTaxonomy(activeModel);
    const data = await fetchJobStatus(jobId, 0);
    if (data.state === "expired") {
      setJobInUrl("");
      playlistMeta.textContent = t("pl.overview.expired");
      return;
    }
    resetPlaylistView();
    // Refill the link box with the original input so the resumed page matches
    // what the user first submitted.
    if (data.inputUrl) playlistInput.value = data.inputUrl;
    installJob({
      jobId,
      name: data.name,
      tracks: data.tracks,
      total: data.total,
      sampled: data.sampled,
      originalCount: data.originalCount
    });
    // Load the already-finished batch silently (no per-track log spam); the
    // resume notice below explains how many were already done.
    applyResults(data, true);
    updateJobProgress(data);
    if (data.state === "done") {
      finishJob(data);
    } else if (data.state === "error") {
      failJob(data.error);
    } else {
      // The run was interrupted (e.g. server restart); the server resumes it on
      // demand, so surface that clearly and keep polling for progress. setStatus
      // runs after updateJobProgress (line above) so the "resuming" pill wins.
      const total = data.total || 0;
      const nth = total ? Math.min(data.completed + 1, total) : 0;
      logLine(t("pl.progress.resumed", { done: data.completed, n: total }));
      noticeIfSampled(data);
      setStatus(t("pl.status.resuming", { i: nth, n: total }), true);
      running = true;
      analyzeBtn.disabled = true;
      pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
    }
  } catch (error) {
    logLine(t("pl.log.error", { err: error.message }));
  }
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (running) return;
  const raw = playlistInput.value.trim();
  if (!raw) {
    setStatus(t("pl.status.needLink"));
    return;
  }

  running = true;
  resetPlaylistView();

  try {
    setStatus(t("pl.status.parsing"), true);
    await loadModelTaxonomy(activeModel);
    setProgress(t("pl.progress.parse"), 4, t("pl.progress.requesting"));

    // Submit the playlist; the server returns a jobId immediately and analyzes
    // the tracks in the background. Scoring now happens server-side.
    const info = await postJson("/api/analyze-playlist", { url: raw, model: activeModel });
    if (!info.tracks || !info.tracks.length) {
      setStatus(t("pl.status.empty"));
      playlistMeta.textContent = t("pl.overview.emptyTracks");
      running = false;
      analyzeBtn.disabled = false;
      return;
    }
    setJobInUrl(info.jobId);
    beginJob(info);
  } catch (error) {
    failJob(error.message);
  }
});

// ---------------------------------------------------------------------------
// Share card: render the current mosaic (占比矩阵) into a standalone PNG on a
// <canvas> and show it in a top-level preview so mobile users can long-press to
// save. Aligned with the single-track share flow in app.js (same constants,
// background, footer credit and preview interaction).
// ---------------------------------------------------------------------------
const SHARE_CARD_WIDTH = 1200;
const SHARE_CARD_PAD = 64;
const SHARE_SCALE = 2;
const SHARE_CARD_MARK = "Presented by qgaye";
let sharePreviewUrl = "";

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawShareFooter(ctx, x, y, width) {
  ctx.save();
  ctx.font = "400 18px 'Space Mono', ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#55585f";
  ctx.fillText(t("pl.card.footer"), x, y);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(85, 88, 95, 0.74)";
  ctx.fillText(SHARE_CARD_MARK, x + width, y);
  ctx.restore();
}

// Wrap `text` into at most `maxLines` lines that each fit within `maxWidth`,
// breaking on spaces/hyphens first and falling back to per-character breaks for
// long unbreakable tokens. The last line is ellipsized if content overflows.
function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let current = "";
  // Keep separators (space/hyphen) attached to the preceding token so breaks
  // land after them, e.g. "Synth-" / "pop".
  const tokens = text.match(/[^\s-]+[\s-]?|[\s-]/g) || [text];
  const pushChars = (token) => {
    for (const ch of token) {
      const next = current + ch;
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = ch;
        if (lines.length >= maxLines) return true;
      } else {
        current = next;
      }
    }
    return false;
  };
  for (let token of tokens) {
    const candidate = current + token;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current.trimEnd());
      current = "";
      if (lines.length >= maxLines) break;
    }
    if (ctx.measureText(token).width <= maxWidth) {
      current = token;
    } else if (pushChars(token)) {
      current = "";
      break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd());
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsize the last line if we ran out of room mid-text.
  const consumed = lines.join("").replace(/\s/g, "").length;
  const total = text.replace(/\s/g, "").length;
  if (lines.length === maxLines && consumed < total) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

// Draw the two-level treemap onto the canvas, mirroring the on-screen mosaic:
// area = share, same color = same genre, child styles differ by opacity.
function drawShareTreemap(ctx, genres, x, y, width, height) {
  const GAP = 4;
  const BW = 1.5;
  const moodColorSet = new Set(Object.values(MOOD_AXIS_COLORS));
  const isMood = genres.some(g => moodColorSet.has(g.color));
  const minAlpha = isMood ? 0.65 : 0.45;
  const alphaStep = isMood ? 0.12 : 0.22;
  const ix = x + BW;
  const iy = y + BW;
  const iw = width - BW * 2;
  const ih = height - BW * 2;
  const genreRects = squarifyTreemap(
    genres.map(g => ({ value: g.percent, genre: g })),
    ix, iy, iw, ih
  );
  for (const gr of genreRects) {
    const genre = gr.ref.genre;
    const styleRects = squarifyTreemap(
      genre.styles.map((s, i) => ({ value: s.percent, style: s, rank: i })),
      gr.x, gr.y, gr.w, gr.h
    );
    for (const sr of styleRects) {
      const style = sr.ref.style;
      const rank = sr.ref.rank;
      const bw = Math.max(0, sr.w - GAP);
      const bh = Math.max(0, sr.h - GAP);
      if (bw <= 0 || bh <= 0) continue;
      const bx = sr.x + GAP / 2;
      const by = sr.y + GAP / 2;
      ctx.save();
      ctx.globalAlpha = rank === 0 ? 1 : Math.max(minAlpha, 1 - rank * alphaStep);
      ctx.fillStyle = genre.color;
      drawRoundedRect(ctx, bx, by, bw, bh, 0);
      ctx.fill();
      ctx.restore();

      // Label the block when there's room, matching the DOM thresholds. Scale
      // the font to the tile area so bigger shares read larger (mirrors the
      // on-screen mosaic's mosaicFontSizes).
      const pctText = `${Math.round(style.percent)}%`;
      const pctSize = Math.max(15, Math.min(46, Math.round(11 + Math.sqrt(bw * bh) * 0.08)));
      const nameSize = Math.max(13, Math.round(pctSize * 0.8));
      // A tall, narrow tile can't fit a horizontal "name %" row, so run the
      // name top-to-bottom with the percent at the base. Mirrors the DOM
      // mosaic's is-vertical branch (writing-mode: vertical-rl).
      const isVertical = bh >= bw * 1.6 && bw < 60 && bh >= 60;
      if (isVertical) {
        ctx.save();
        ctx.fillStyle = "#f1eee5";
        // Percentage sits horizontally at the bottom of the tile.
        const vPctSize = Math.max(13, Math.min(pctSize, 22));
        ctx.font = `700 ${vPctSize}px 'Space Mono', ui-monospace, Menlo, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(pctText, bx + bw / 2, by + bh - 6);
        // Name runs top-to-bottom (rotated 90°), clipped to the tile height.
        const vNameSize = Math.max(12, Math.min(nameSize, bw - 6));
        ctx.font = `700 ${vNameSize}px 'Space Mono', ui-monospace, Menlo, monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const avail = bh - vPctSize - 16;
        let name = style.label;
        while (name.length > 1 && ctx.measureText(name).width > avail) {
          name = name.slice(0, -1);
        }
        ctx.translate(bx + bw / 2, by + 8);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(name, 0, 0);
        ctx.restore();
      } else if (bw >= 60 && bh >= 40) {
        ctx.save();
        ctx.fillStyle = "#f1eee5";
        ctx.textBaseline = "top";
        ctx.font = `700 ${nameSize}px 'Space Mono', ui-monospace, Menlo, monospace`;
        // Wrap the name onto as many lines as the tile height allows instead of
        // clipping it, matching the DOM mosaic (which wraps via --mb-lines).
        const lineH = nameSize * 1.25 + 2;
        const maxNameLines = Math.max(1, Math.floor((bh - 10 - pctSize - 6) / lineH));
        const nameLines = wrapCanvasText(ctx, style.label, bw - 16, maxNameLines);
        let ny = by + 8;
        for (const line of nameLines) {
          ctx.fillText(line, bx + 8, ny);
          ny += lineH;
        }
        ctx.font = `700 ${pctSize}px 'Space Mono', ui-monospace, Menlo, monospace`;
        ctx.fillText(pctText, bx + 8, ny + 4);
        ctx.restore();
      } else if (bw >= 34 && bh >= 20) {
        ctx.save();
        ctx.fillStyle = "#f1eee5";
        ctx.textBaseline = "top";
        ctx.font = `700 ${Math.max(13, Math.min(pctSize, 20))}px 'Space Mono', ui-monospace, Menlo, monospace`;
        ctx.fillText(pctText, bx + 6, by + 6);
        ctx.restore();
      }
    }
  }
  // Outer border matching the page .mosaic-tree { border: 1.5px solid --line } (border-box).
  ctx.save();
  ctx.fillStyle = "#17181d";
  ctx.fillRect(x, y, width, BW);
  ctx.fillRect(x, y + height - BW, width, BW);
  ctx.fillRect(x, y, BW, height);
  ctx.fillRect(x + width - BW, y, BW, height);
  ctx.restore();
}

function renderShareCard(genres) {
  const canvas = document.createElement("canvas");
  const width = SHARE_CARD_WIDTH;
  const height = 1120;
  canvas.width = width * SHARE_SCALE;
  canvas.height = height * SHARE_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SHARE_SCALE, SHARE_SCALE);

  // Background: newsprint paper + faint blue halftone wash, hard ink border.
  ctx.fillStyle = "#f1eee5";
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createLinearGradient(0, 0, width * 0.7, height * 0.5);
  wash.addColorStop(0, "rgba(31, 63, 224, 0.08)");
  wash.addColorStop(0.5, "rgba(31, 63, 224, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#17181d";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  const x = SHARE_CARD_PAD;
  const contentW = width - SHARE_CARD_PAD * 2;
  let y = SHARE_CARD_PAD;

  // Kicker — printed as a solid blue label chip.
  const kickerText = t("pl.card.headline").toUpperCase();
  ctx.font = "700 20px 'Space Mono', ui-monospace, Menlo, monospace";
  const kickerW = ctx.measureText(kickerText).width;
  ctx.fillStyle = "#1f3fe0";
  ctx.fillRect(x, y, kickerW + 20, 32);
  ctx.fillStyle = "#f1eee5";
  ctx.textBaseline = "middle";
  ctx.fillText(kickerText, x + 10, y + 17);
  ctx.textBaseline = "top";
  y += 54;

  // Playlist pill (title + subtitle) — paper-3 fill with ink border.
  if (shareMeta.title) {
    ctx.font = "700 24px 'Space Mono', ui-monospace, Menlo, monospace";
    let title = shareMeta.title;
    const subtitle = shareMeta.subtitle ? `  ·  ${shareMeta.subtitle}` : "";
    const iconW = 26;
    let titleW = ctx.measureText(title).width;
    ctx.font = "400 20px 'Space Mono', ui-monospace, Menlo, monospace";
    let subW = ctx.measureText(subtitle).width;
    // Clip title if the pill would exceed the content width.
    const maxTitleW = contentW - 44 - iconW - subW;
    if (titleW > maxTitleW) {
      ctx.font = "700 24px 'Space Mono', ui-monospace, Menlo, monospace";
      while (title.length > 1 && ctx.measureText(`${title}…`).width > maxTitleW) {
        title = title.slice(0, -1);
      }
      title = `${title}…`;
      titleW = ctx.measureText(title).width;
    }
    const pillW = Math.min(contentW, iconW + titleW + subW + 44);
    const pillH = 48;
    ctx.fillStyle = "#dedacd";
    ctx.strokeStyle = "#17181d";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x, y, pillW, pillH, 0);
    ctx.fill();
    ctx.stroke();
    let tx = x + 22;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff3d7f";
    ctx.font = "700 20px 'Space Mono', ui-monospace, Menlo, monospace";
    ctx.fillText("♪", tx, y + pillH / 2);
    tx += iconW;
    ctx.fillStyle = "#17181d";
    ctx.font = "700 24px 'Space Mono', ui-monospace, Menlo, monospace";
    ctx.fillText(title, tx, y + pillH / 2 + 1);
    tx += titleW;
    ctx.fillStyle = "#55585f";
    ctx.font = "400 20px 'Space Mono', ui-monospace, Menlo, monospace";
    ctx.fillText(subtitle, tx, y + pillH / 2 + 1);
    ctx.textBaseline = "top";
    y += pillH + 30;
  }

  // Genre legend (wrapped rows), one entry per parent genre.
  ctx.font = "700 20px 'Space Mono', ui-monospace, Menlo, monospace";
  let legendX = x;
  let legendY = y;
  const rowHeight = 34;
  for (const genre of genres) {
    const label = `${genre.label} ${Math.round(genre.percent)}%`;
    const dotW = 16;
    const gap = 10;
    const textW = ctx.measureText(label).width;
    const itemW = dotW + gap + textW + 26;
    if (legendX + itemW > x + contentW) {
      legendX = x;
      legendY += rowHeight;
    }
    ctx.fillStyle = genre.color;
    drawRoundedRect(ctx, legendX, legendY, dotW, dotW, 0);
    ctx.fill();
    ctx.fillStyle = "#2a2c33";
    ctx.textBaseline = "middle";
    ctx.fillText(label, legendX + dotW + gap, legendY + dotW / 2);
    ctx.textBaseline = "top";
    legendX += itemW;
  }
  y = legendY + rowHeight + 8;

  // Treemap: use a large square-ish area so tiles stay readable.
  const treeH = 620;
  drawShareTreemap(ctx, genres, x, y, contentW, treeH);
  y += treeH + 30;

  // Footer hint + subtle author credit
  drawShareFooter(ctx, x, y, contentW);
  y += 34;

  // Crop the canvas to the used height.
  const finalHeight = Math.min(height, y + SHARE_CARD_PAD - 20);
  const cropped = document.createElement("canvas");
  cropped.width = width * SHARE_SCALE;
  cropped.height = finalHeight * SHARE_SCALE;
  const cctx = cropped.getContext("2d");
  cctx.drawImage(canvas, 0, 0);
  return cropped;
}

function revokeSharePreviewUrl() {
  if (!sharePreviewUrl) return;
  URL.revokeObjectURL(sharePreviewUrl);
  sharePreviewUrl = "";
}

function openSharePreview(url) {
  if (!sharePreview || !sharePreviewImage) return;
  revokeSharePreviewUrl();
  sharePreviewUrl = url;
  sharePreviewImage.src = url;
  sharePreview.classList.add("is-open");
  sharePreview.setAttribute("aria-hidden", "false");
  sharePreview.querySelector(".share-preview__close")?.focus();
}

function closeSharePreview() {
  if (!sharePreview || !sharePreview.classList.contains("is-open")) return;
  sharePreview.classList.remove("is-open");
  sharePreview.setAttribute("aria-hidden", "true");
  if (sharePreviewImage) sharePreviewImage.removeAttribute("src");
  revokeSharePreviewUrl();
  shareMosaicBtn?.focus();
}

async function handleShareMosaic() {
  if (!mosaicData.length || !shareMosaicBtn) return;
  const label = shareMosaicBtn.querySelector(".verdict-share-label");
  const originalLabel = label ? label.textContent : "";
  shareMosaicBtn.classList.add("is-busy");
  shareMosaicBtn.disabled = true;
  if (label) label.textContent = t("pl.share.busy");
  try {
    const canvas = renderShareCard(mosaicData);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("toBlob failed");
    const url = URL.createObjectURL(blob);
    openSharePreview(url);
  } catch (error) {
    setStatus(t("pl.share.error"));
  } finally {
    shareMosaicBtn.classList.remove("is-busy");
    shareMosaicBtn.disabled = mosaicData.length === 0;
    if (label) label.textContent = originalLabel || t("pl.share.button");
  }
}

if (shareMosaicBtn) {
  shareMosaicBtn.addEventListener("click", handleShareMosaic);
}

if (sharePreview) {
  sharePreview.addEventListener("click", event => {
    if (event.target.matches("[data-share-preview-close]")) closeSharePreview();
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSharePreview();
    closeStyleDialog();
  }
});

// ---------------------------------------------------------------------------
// Language switching
// ---------------------------------------------------------------------------
// Apply the active language to every static element (data-i18n*) and re-render
// dynamic content (charts, per-track cards' status text) that has already been
// produced. Called once on load and on every language switch.
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
  for (const el of document.querySelectorAll("[data-i18n-alt]")) {
    el.alt = t(el.dataset.i18nAlt);
  }
  // Re-render the aggregate charts so genre/style labels re-localize.
  if (lastCompositions) renderAggregate(lastCompositions, lastDimensions);
  if (currentStyleDialogData && styleDialog.classList.contains("is-open")) {
    if (currentDialogIsMood) {
      openMoodDialog(currentStyleDialogData.genre, currentStyleDialogData.style, lastStyleInfoTrigger);
    } else {
      const refreshed = getStyleAssociation(currentStyleDialogData.genre, currentStyleDialogData.style);
      openStyleDialog(refreshed, lastStyleInfoTrigger);
    }
  }
  // Re-localize the finished-analysis summary text (the generic data-i18n loop
  // above reset these back to their idle defaults).
  if (lastSummary) {
    const { name, total, ok, sampled, originalCount } = lastSummary;
    trackCount.textContent = t("pl.count.tracks", { n: total });
    parsedLine.textContent = sampled
      ? t("pl.parsed.start.sampled", { name, n: total, total: originalCount })
      : t("pl.parsed.start", { name, n: total });
    statusPill.textContent = t("pl.status.complete", { ok, n: total });
    progressLabel.textContent = t("pl.progress.complete");
    playlistMeta.textContent = name;
    shareMeta = {
      title: name,
      subtitle: ""
    };
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

applyLanguage();
initModelSelector();
// Resume an in-flight / finished job whose id is in the page URL (mobile
// app-switch or refresh). Runs after the model selector so activeModel is set.
resumeJobFromUrl();
