// Playlist genre analysis page. It fetches a NetEase playlist, then for each
// track downloads a public audio match, runs Essentia genre analysis and
// queries iTunes / Discogs / Last.fm metadata, scores the track with the shared
// GenreCore pipeline, and renders the per-track genre composition. The
// aggregate composition across all tracks is shown at the top.
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
const genreSunburst = document.querySelector("#genreSunburst");
const genreMosaic = document.querySelector("#genreMosaic");
const sunburstSvg = document.querySelector("#sunburstSvg");
const sunburstCenter = document.querySelector("#sunburstCenter");
const sunburstLegend = document.querySelector("#sunburstLegend");
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
const styleDialogOverview = document.querySelector("#styleDialogOverview");
const styleDialogFocus = document.querySelector("#styleDialogFocus");
const styleDialogHistory = document.querySelector("#styleDialogHistory");
const styleDialogTrack = document.querySelector("#styleDialogTrack");
const styleDialogTrackNote = document.querySelector("#styleDialogTrackNote");

if (new URLSearchParams(window.location.search).get("showModel") === "1") {
  document.documentElement.classList.add("show-model-selector");
}

const MIX_COLORS = ["#c8ff5f", "#63d2ff", "#ff6f3c", "#b985ff", "#ffd23c", "#4be3a3"];
// Genres whose aggregate share falls below this are folded into a single
// neutral "其他" slice so tiny long-tail genres don't clutter the charts.
const OTHER_GENRE_THRESHOLD = 5;
const OTHER_GENRE_COLOR = "#6b6e64";
// Cap the number of tracks analyzed per playlist to keep long playlists from
// running for too long; extras beyond this are dropped with a notice.
const MAX_TRACKS = 20;

let activeModel = "";
let taxonomyBundle = null;
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
    "pl.title": "歌单曲风分析",
    "pl.nav.single": "单曲",
    "pl.status.waiting": "等待输入",
    "pl.field.link": "网易云歌单链接",
    "pl.field.linkPlaceholder": "例如：https://music.163.com/playlist?id=13856318070",
    "pl.parsed.default": "粘贴网易云歌单链接，将遍历每首歌进行 Essentia 音频分析并查询 iTunes / Discogs / Last.fm 曲风",
    "pl.action.analyze": "分析歌单",
    "pl.progress.ready": "准备就绪",
    "pl.overview": "歌单概览",
    "pl.overview.empty": "粘贴一个网易云歌单链接开始逐曲分析。",
    "pl.view.aria": "曲风视图切换",
    "pl.view.sunburst": "旭日图",
    "pl.view.mosaic": "占比矩阵",
    "pl.sunburst.caption": "曲风构成 · 内环流派 / 外环子风格",
    "pl.mosaic.caption": "占比矩阵 · 面积即占比 / 同色同流派",
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
    "pl.overview.subtitle": "共 {n} 首",
    "pl.overview.analyzing": "{name} · 共 {n} 首歌曲，逐曲分析中…",
    "pl.parsed.start": "歌单「{name}」共 {n} 首，开始逐曲分析",
    "pl.progress.parsedInfo": "歌单「{name}」共 {n} 首",
    "pl.limit.notice": "歌单共 {total} 首，超过上限，仅分析前 {limit} 首。",
    "pl.count.trackedOf": "{n} / {total} 首",
    "pl.overview.subtitleLimited": "共 {total} 首 · 仅分析前 {limit} 首",
    "pl.overview.analyzingLimited": "{name} · 共 {total} 首，仅分析前 {limit} 首，逐曲分析中…",
    "pl.parsed.startLimited": "歌单「{name}」共 {total} 首，仅分析前 {limit} 首，开始分析",
    "pl.progress.parsedInfoLimited": "歌单「{name}」共 {total} 首，仅分析前 {limit} 首",
    "pl.overview.completeSubtitleLimited": "共 {total} 首 · 分析前 {limit} 首，成功 {ok} 首",
    "pl.overview.completeLimited": "{name} · 共 {total} 首，仅分析前 {limit} 首，成功分析 {ok} 首",
    "pl.status.empty": "歌单为空",
    "pl.overview.emptyTracks": "该歌单没有可分析的曲目。",
    "pl.status.analyzing": "分析中 {i}/{n}",
    "pl.progress.analyzingNth": "分析第 {i}/{n} 首",
    "pl.progress.complete": "分析完成",
    "pl.progress.completeInfo": "成功分析 {ok}/{n} 首",
    "pl.status.complete": "完成 {ok}/{n}",
    "pl.overview.completeSubtitle": "共 {n} 首 · 成功分析 {ok} 首",
    "pl.overview.complete": "{name} · 共 {n} 首，成功分析 {ok} 首",
    "pl.status.error": "出错了",
    "pl.overview.failed": "分析失败：{err}",
    "pl.log.error": "错误：{err}",
    "pl.card.footer": "由 Genre Lab · 歌单曲风分析 生成",
    "pl.card.headline": "我的音乐风格",
    "dialog.kicker": "Discogs Style",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.focus": "风格重点",
    "dialog.history": "发展脉络",
    "dialog.entry": "主流入门音乐",
    "dialog.close": "关闭风格介绍",
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
    "pl.view.aria": "Genre view toggle",
    "pl.view.sunburst": "Sunburst",
    "pl.view.mosaic": "Mosaic",
    "pl.sunburst.caption": "Genre mix · inner ring genre / outer ring style",
    "pl.mosaic.caption": "Share mosaic · area = share / same color = same genre",
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
    "pl.overview.subtitle": "{n} tracks",
    "pl.overview.analyzing": "{name} · {n} tracks, analyzing…",
    "pl.parsed.start": "Playlist \u201c{name}\u201d has {n} tracks; starting analysis",
    "pl.progress.parsedInfo": "Playlist \u201c{name}\u201d has {n} tracks",
    "pl.limit.notice": "Playlist has {total} tracks, exceeding the limit; analyzing the first {limit} only.",
    "pl.count.trackedOf": "{n} / {total} tracks",
    "pl.overview.subtitleLimited": "{total} tracks · first {limit} analyzed",
    "pl.overview.analyzingLimited": "{name} · {total} tracks, analyzing the first {limit}…",
    "pl.parsed.startLimited": "Playlist \u201c{name}\u201d has {total} tracks; analyzing the first {limit}",
    "pl.progress.parsedInfoLimited": "Playlist \u201c{name}\u201d has {total} tracks; analyzing the first {limit}",
    "pl.overview.completeSubtitleLimited": "{total} tracks · first {limit} analyzed, {ok} succeeded",
    "pl.overview.completeLimited": "{name} · {total} tracks, first {limit} analyzed, {ok} succeeded",
    "pl.status.empty": "Empty playlist",
    "pl.overview.emptyTracks": "This playlist has no analyzable tracks.",
    "pl.status.analyzing": "Analyzing {i}/{n}",
    "pl.progress.analyzingNth": "Analyzing track {i}/{n}",
    "pl.progress.complete": "Analysis complete",
    "pl.progress.completeInfo": "Analyzed {ok}/{n} tracks",
    "pl.status.complete": "Done {ok}/{n}",
    "pl.overview.completeSubtitle": "{n} tracks · {ok} analyzed",
    "pl.overview.complete": "{name} · {n} tracks, {ok} analyzed",
    "pl.status.error": "Something went wrong",
    "pl.overview.failed": "Analysis failed: {err}",
    "pl.log.error": "Error: {err}",
    "pl.card.footer": "Made with Genre Lab · Playlist Genre Analysis",
    "pl.card.headline": "My Music Taste",
    "dialog.kicker": "Discogs Style",
    "dialog.kickerGenre": "{genre} / Discogs Style",
    "dialog.focus": "Style focus",
    "dialog.history": "History",
    "dialog.entry": "Popular entry track",
    "dialog.close": "Close style intro",
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

async function loadModelTaxonomy(model) {
  const src = model ? `/discogs-taxonomy.js?model=${encodeURIComponent(model)}` : "/discogs-taxonomy.js";
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(t("pl.taxonomy.failed")));
    document.head.appendChild(script);
  });
  taxonomyBundle = window.GenreCore.buildTaxonomy(window.DISCOGS_TAXONOMY);
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

function openStyleDialog(profile, trigger) {
  if (!profile || !styleDialog) return;
  lastStyleInfoTrigger = trigger || null;
  styleDialogKicker.textContent = profile.genre
    ? t("dialog.kickerGenre", { genre: localizeToken(profile.genre, "genre") })
    : t("dialog.kicker");
  styleDialogTitle.textContent = localizeToken(profile.style || profile.title, "style");
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
  if (lastStyleInfoTrigger && typeof lastStyleInfoTrigger.focus === "function") lastStyleInfoTrigger.focus();
  lastStyleInfoTrigger = null;
}

for (const closeControl of document.querySelectorAll("[data-style-dialog-close]")) {
  closeControl.addEventListener("click", closeStyleDialog);
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
function buildTwoLevel(compositions) {
  const genreMap = new Map();
  let counted = 0;
  for (const comp of compositions) {
    if (!comp || !comp.length) continue;
    counted += 1;
    for (const item of comp) {
      const { genre, style } = splitGenreStyle(item.name);
      const entry = genreMap.get(genre) || { name: genre, total: 0, styles: new Map() };
      entry.total += item.percent;
      const styleKey = style || genre;
      entry.styles.set(styleKey, (entry.styles.get(styleKey) || 0) + item.percent);
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
        .map(([style, sum]) => ({
          name: style,
          genre: g.name,
          label: localizeToken(style, "style"),
          percent: sum / grand * 100
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
  });
  return major;
}

let twoLevelShown = false;
// Meta shown on the share card (playlist name + track stats), set as tracks are
// analyzed so the card matches the on-screen overview.
let shareMeta = { title: "", subtitle: "" };
// Latest compositions kept so the charts can be re-rendered on language switch.
let lastCompositions = null;
// Snapshot of the finished-analysis summary so the overview/status/count text
// can be re-localized when the language is switched after analysis.
let lastSummary = null;

function renderAggregate(compositions) {
  lastCompositions = compositions;
  const genres = buildTwoLevel(compositions);
  renderSunburst(genres);
  renderMosaic(genres);
  genreTwoLevel.hidden = genres.length === 0;
  if (shareMosaicBtn) shareMosaicBtn.disabled = genres.length === 0;
  // Default to the mosaic view the first time the charts appear, without
  // overriding a view the user may have switched to during analysis.
  if (genres.length && !twoLevelShown) {
    twoLevelShown = true;
    switchView("mosaic");
  }
}

// Show one view at a time. The toggle acts as a tablist and the inactive
// figure is hidden so only the selected chart is visible.
function switchView(view) {
  const isMosaic = view === "mosaic";
  genreSunburst.hidden = isMosaic;
  genreMosaic.hidden = !isMosaic;
  for (const btn of viewToggle.querySelectorAll(".view-toggle-btn")) {
    const active = btn.dataset.view === view;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
  // The mosaic figure has zero size while hidden, so lay it out only once it
  // becomes visible (and thus measurable).
  if (isMosaic) layoutMosaicTree();
}

viewToggle.addEventListener("click", event => {
  const btn = event.target.closest(".view-toggle-btn");
  if (btn) switchView(btn.dataset.view);
});

// Sunburst: inner ring = parent genre share, outer ring = child style share.
// Child slices share the parent hue, differentiated by opacity.
function renderSunburst(genres) {
  const NS = "http://www.w3.org/2000/svg";
  sunburstSvg.innerHTML = "";
  sunburstCenter.innerHTML = "";
  sunburstLegend.innerHTML = "";
  if (!genres.length) return;

  const cx = 112;
  const cy = 112;
  const rGenreIn = 42;
  const rGenreOut = 78;
  const rStyleIn = 81;
  const rStyleOut = 106;
  const GAP = 0.014;

  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const sector = (rInner, rOuter, a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const o0 = point(rOuter, a0);
    const o1 = point(rOuter, a1);
    const i1 = point(rInner, a1);
    const i0 = point(rInner, a0);
    return `M${o0[0].toFixed(2)} ${o0[1].toFixed(2)} A${rOuter} ${rOuter} 0 ${large} 1 ${o1[0].toFixed(2)} ${o1[1].toFixed(2)} L${i1[0].toFixed(2)} ${i1[1].toFixed(2)} A${rInner} ${rInner} 0 ${large} 0 ${i0[0].toFixed(2)} ${i0[1].toFixed(2)} Z`;
  };

  let angle = -Math.PI / 2;
  for (const genre of genres) {
    const sweep = genre.percent / 100 * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;

    const gPath = document.createElementNS(NS, "path");
    gPath.setAttribute("d", sector(rGenreIn, rGenreOut, a0, Math.max(a0, a1 - GAP)));
    gPath.setAttribute("fill", genre.color);
    gPath.setAttribute("class", "sun-genre");
    gPath.dataset.title = genre.label;
    gPath.dataset.desc = t("pl.sunburst.genre", { percent: Math.round(genre.percent) });
    const gTitle = document.createElementNS(NS, "title");
    gTitle.textContent = `${genre.label} ${Math.round(genre.percent)}%`;
    gPath.appendChild(gTitle);
    sunburstSvg.appendChild(gPath);

    let sa = a0;
    for (const [si, style] of genre.styles.entries()) {
      const ssw = genre.percent > 0 ? style.percent / genre.percent * sweep : 0;
      const sPath = document.createElementNS(NS, "path");
      sPath.setAttribute("d", sector(rStyleIn, rStyleOut, sa, Math.max(sa, sa + ssw - GAP)));
      sPath.setAttribute("fill", genre.color);
      sPath.setAttribute("fill-opacity", si === 0 ? "0.9" : String(Math.max(0.4, 0.9 - si * 0.22)));
      sPath.setAttribute("class", "sun-style");
      sPath.dataset.title = style.label;
      sPath.dataset.desc = `${genre.label} · ${Math.round(style.percent)}%`;
      sPath.dataset.genre = style.genre || genre.name;
      sPath.dataset.style = style.name;
      const sTitle = document.createElementNS(NS, "title");
      sTitle.textContent = `${genre.label} / ${style.label} ${Math.round(style.percent)}%`;
      sPath.appendChild(sTitle);
      sunburstSvg.appendChild(sPath);

      if (style.percent >= 11) {
        const mid = sa + ssw / 2;
        const lp = point((rStyleIn + rStyleOut) / 2, mid);
        const text = document.createElementNS(NS, "text");
        text.setAttribute("x", lp[0].toFixed(1));
        text.setAttribute("y", (lp[1] + 3).toFixed(1));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "sun-label");
        text.textContent = `${Math.round(style.percent)}%`;
        sunburstSvg.appendChild(text);
      }
      sa += ssw;
    }
    angle = a1;
  }

  // Default center: dominant genre. Hovering a sector swaps in its own label so
  // every ring segment can reveal the music style/genre it represents.
  const top = genres[0];
  sunburstDefault.title = top.label;
  sunburstDefault.desc = t("pl.sunburst.dominant", { percent: Math.round(top.percent) });
  setSunburstCenter(sunburstDefault.title, sunburstDefault.desc);

  // Vertical genre legend beside the ring: one row per parent genre, stacked
  // top-to-bottom so the color mapping reads cleanly on narrow layouts.
  for (const genre of genres) {
    const item = document.createElement("span");
    item.className = "sunburst-legend-item";
    const dot = document.createElement("i");
    dot.className = "mosaic-dot";
    dot.style.background = genre.color;
    item.appendChild(dot);
    const name = document.createElement("span");
    name.className = "sunburst-legend-name";
    name.textContent = genre.label;
    item.appendChild(name);
    const pct = document.createElement("b");
    pct.textContent = `${Math.round(genre.percent)}%`;
    item.appendChild(pct);
    sunburstLegend.appendChild(item);
  }
}

// Center label state, shared between render and the once-bound hover handlers.
const sunburstDefault = { title: "", desc: "" };
function setSunburstCenter(title, desc) {
  sunburstCenter.innerHTML = "";
  const name = document.createElement("strong");
  name.textContent = title;
  const meta = document.createElement("span");
  meta.textContent = desc;
  sunburstCenter.appendChild(name);
  sunburstCenter.appendChild(meta);
}
sunburstSvg.addEventListener("mouseover", event => {
  const seg = event.target.closest(".sun-genre, .sun-style");
  if (!seg) return;
  sunburstSvg.classList.add("is-hovering");
  seg.classList.add("is-active");
  setSunburstCenter(seg.dataset.title, seg.dataset.desc);
});
sunburstSvg.addEventListener("mouseout", event => {
  const seg = event.target.closest(".sun-genre, .sun-style");
  if (seg) seg.classList.remove("is-active");
  if (!sunburstSvg.querySelector(".is-active")) {
    sunburstSvg.classList.remove("is-hovering");
    setSunburstCenter(sunburstDefault.title, sunburstDefault.desc);
  }
});
// Click a style slice to open its genre/style intro (same as the mosaic tiles).
sunburstSvg.addEventListener("click", event => {
  const seg = event.target.closest(".sun-style");
  if (!seg) return;
  const profile = profileFor(seg.dataset.genre, seg.dataset.style);
  if (profile) openStyleDialog(profile, seg);
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

let mosaicGenres = [];

function renderMosaic(genres) {
  mosaicGenres = genres;
  mosaicStage.innerHTML = "";
  if (!genres.length) return;

  const legend = document.createElement("div");
  legend.className = "mosaic-legend";
  for (const genre of genres) {
    const item = document.createElement("span");
    item.className = "mosaic-legend-item";
    const dot = document.createElement("i");
    dot.className = "mosaic-dot";
    dot.style.background = genre.color;
    item.appendChild(dot);
    item.append(document.createTextNode(genre.label));
    const pct = document.createElement("b");
    pct.textContent = `${Math.round(genre.percent)}%`;
    item.appendChild(pct);
    legend.appendChild(item);
  }
  mosaicStage.appendChild(legend);

  const tree = document.createElement("div");
  tree.className = "mosaic-tree";
  mosaicStage.appendChild(tree);

  layoutMosaicTree();
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
  if (!tree || !mosaicGenres.length) return;
  const W = tree.clientWidth;
  const H = tree.clientHeight;
  if (!W || !H) return;

  tree.innerHTML = "";
  const GAP = 3;
  const genreRects = squarifyTreemap(
    mosaicGenres.map(g => ({ value: g.percent, genre: g })),
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
      block.style.opacity = rank === 0 ? "1" : String(Math.max(0.45, 1 - rank * 0.22));
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

// Click a mosaic tile to open its genre/style intro (same as the sunburst).
mosaicStage.addEventListener("click", event => {
  const block = event.target.closest(".mosaic-block");
  if (!block) return;
  const profile = profileFor(block.dataset.genre, block.dataset.style);
  if (profile) openStyleDialog(profile, block);
});

// ---------------------------------------------------------------------------
// Single-track analysis pipeline
// ---------------------------------------------------------------------------
async function analyzeTrack(track, card) {
  const trackForScore = { title: track.title, artists: (track.artists || []).join(" / ") };

  setCardStatus(card, t("pl.card.status.download"), "busy");
  let download;
  try {
    download = await postJson("/api/download", {
      url: "",
      platformUrl: track.sourceUrl || "",
      platform: "netease-url",
      title: track.title,
      artists: trackForScore.artists,
      query: [`"${track.title}"`, trackForScore.artists ? `"${trackForScore.artists}"` : ""].filter(Boolean).join(" ")
    });
  } catch (error) {
    setCardStatus(card, t("pl.card.status.audioNotFound"), "fail");
    card.body.textContent = t("pl.card.body.audioFail", { err: error.message });
    return null;
  }

  setCardStatus(card, t("pl.card.status.essentia"), "busy");
  let essentia;
  try {
    essentia = await postJson("/api/essentia", { fileName: download.fileName, top: 12, model: activeModel });
  } catch (error) {
    setCardStatus(card, t("pl.card.status.analyzeFail"), "fail");
    card.body.textContent = t("pl.card.body.essentiaFail", { err: error.message });
    return null;
  }

  setCardStatus(card, t("pl.card.status.queryTags"), "busy");
  let metadata = null;
  try {
    metadata = await postJson("/api/metadata", {
      title: track.title,
      artists: trackForScore.artists,
      album: track.album || "",
      model: activeModel
    });
  } catch (error) {
    // metadata is optional; Essentia alone still yields a composition
    logLine(t("pl.log.tagFail", { title: track.title, err: error.message }));
  }

  const composition = window.GenreCore.scoreTrack(taxonomyBundle, {
    essentia,
    metadata,
    track: trackForScore
  });

  if (!composition.length) {
    setCardStatus(card, t("pl.card.status.noResult"), "fail");
    card.body.textContent = t("pl.card.body.noHit");
    return null;
  }

  setCardStatus(card, t("pl.card.status.done"), "done");
  renderTrackMix(card.body, composition);
  return composition;
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
  resetProgress();
  trackList.innerHTML = "";
  sunburstSvg.innerHTML = "";
  sunburstCenter.innerHTML = "";
  mosaicStage.innerHTML = "";
  genreTwoLevel.hidden = true;
  twoLevelShown = false;
  lastCompositions = null;
  lastSummary = null;
  shareMeta = { title: "", subtitle: "" };
  if (shareMosaicBtn) shareMosaicBtn.disabled = true;
  trackCount.textContent = t("pl.count.tracks", { n: 0 });
  playlistMeta.textContent = t("pl.overview.parsing");

  try {
    setStatus(t("pl.status.parsing"), true);
    await loadModelTaxonomy(activeModel);
    setProgress(t("pl.progress.parse"), 4, t("pl.progress.requesting"));

    const playlist = await postJson("/api/netease-playlist", { url: raw });
    const allTracks = playlist.tracks || [];
    const name = playlist.name || t("pl.playlist.fallbackName");
    const truncated = allTracks.length > MAX_TRACKS;
    const tracks = truncated ? allTracks.slice(0, MAX_TRACKS) : allTracks;
    const totalTracks = allTracks.length;
    if (truncated) {
      logLine(t("pl.limit.notice", { total: totalTracks, limit: MAX_TRACKS }));
    }
    shareMeta = {
      title: name,
      subtitle: truncated
        ? t("pl.overview.subtitleLimited", { total: totalTracks, limit: MAX_TRACKS })
        : t("pl.overview.subtitle", { n: tracks.length })
    };
    playlistMeta.textContent = truncated
      ? t("pl.overview.analyzingLimited", { name, total: totalTracks, limit: MAX_TRACKS })
      : t("pl.overview.analyzing", { name, n: tracks.length });
    trackCount.textContent = truncated
      ? t("pl.count.trackedOf", { n: tracks.length, total: totalTracks })
      : t("pl.count.tracks", { n: tracks.length });
    parsedLine.textContent = truncated
      ? t("pl.parsed.startLimited", { name, total: totalTracks, limit: MAX_TRACKS })
      : t("pl.parsed.start", { name, n: tracks.length });
    setProgress(t("pl.progress.parse"), 8, truncated
      ? t("pl.progress.parsedInfoLimited", { name, total: totalTracks, limit: MAX_TRACKS })
      : t("pl.progress.parsedInfo", { name, n: tracks.length }));

    if (!tracks.length) {
      setStatus(t("pl.status.empty"));
      playlistMeta.textContent = t("pl.overview.emptyTracks");
      return;
    }

    const cards = tracks.map((track, index) => createTrackCard(track, index));
    const compositions = [];
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      const card = cards[i];
      const pct = 8 + Math.round(((i + 0.5) / tracks.length) * 90);
      setStatus(t("pl.status.analyzing", { i: i + 1, n: tracks.length }), true);
      setProgress(t("pl.progress.analyzingNth", { i: i + 1, n: tracks.length }), pct, `${track.title} - ${(track.artists || []).join(" / ")}`);
      const composition = await analyzeTrack(track, card);
      compositions.push(composition);
      renderAggregate(compositions);
    }

    const ok = compositions.filter(Boolean).length;
    lastSummary = { name, analyzed: tracks.length, total: totalTracks, limit: MAX_TRACKS, truncated, ok };
    setProgress(t("pl.progress.complete"), 100, t("pl.progress.completeInfo", { ok, n: tracks.length }));
    setStatus(t("pl.status.complete", { ok, n: tracks.length }));
    shareMeta = {
      title: name,
      subtitle: truncated
        ? t("pl.overview.completeSubtitleLimited", { total: totalTracks, limit: MAX_TRACKS, ok })
        : t("pl.overview.completeSubtitle", { n: tracks.length, ok })
    };
    playlistMeta.textContent = truncated
      ? t("pl.overview.completeLimited", { name, total: totalTracks, limit: MAX_TRACKS, ok })
      : t("pl.overview.complete", { name, n: tracks.length, ok });
  } catch (error) {
    setStatus(t("pl.status.error"));
    playlistMeta.textContent = t("pl.overview.failed", { err: error.message });
    logLine(t("pl.log.error", { err: error.message }));
  } finally {
    running = false;
    analyzeBtn.disabled = false;
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
  ctx.font = "500 18px Avenir Next, Helvetica, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#73766c";
  ctx.fillText(t("pl.card.footer"), x, y);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(115, 118, 108, 0.74)";
  ctx.fillText(SHARE_CARD_MARK, x + width, y);
  ctx.restore();
}

// Draw the two-level treemap onto the canvas, mirroring the on-screen mosaic:
// area = share, same color = same genre, child styles differ by opacity.
function drawShareTreemap(ctx, genres, x, y, width, height) {
  const GAP = 4;
  const genreRects = squarifyTreemap(
    genres.map(g => ({ value: g.percent, genre: g })),
    x, y, width, height
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
      ctx.globalAlpha = rank === 0 ? 1 : Math.max(0.45, 1 - rank * 0.22);
      ctx.fillStyle = genre.color;
      drawRoundedRect(ctx, bx, by, bw, bh, 6);
      ctx.fill();
      ctx.restore();

      // Label the block when there's room, matching the DOM thresholds. Scale
      // the font to the tile area so bigger shares read larger (mirrors the
      // on-screen mosaic's mosaicFontSizes).
      const pctText = `${Math.round(style.percent)}%`;
      const pctSize = Math.max(15, Math.min(46, Math.round(11 + Math.sqrt(bw * bh) * 0.08)));
      const nameSize = Math.max(13, Math.round(pctSize * 0.8));
      if (bw >= 60 && bh >= 40) {
        ctx.save();
        ctx.fillStyle = "rgba(15, 17, 15, 0.9)";
        ctx.textBaseline = "top";
        ctx.font = `700 ${nameSize}px Avenir Next, Helvetica, Arial, sans-serif`;
        // Clip name to block width to avoid overflow.
        let name = style.label;
        while (name.length > 1 && ctx.measureText(name).width > bw - 16) {
          name = name.slice(0, -1);
        }
        ctx.fillText(name, bx + 8, by + 8);
        ctx.font = `800 ${pctSize}px Avenir Next, Helvetica, Arial, sans-serif`;
        ctx.fillText(pctText, bx + 8, by + 8 + nameSize + 6);
        ctx.restore();
      } else if (bw >= 34 && bh >= 20) {
        ctx.save();
        ctx.fillStyle = "rgba(15, 17, 15, 0.88)";
        ctx.textBaseline = "top";
        ctx.font = `800 ${Math.max(13, Math.min(pctSize, 20))}px Avenir Next, Helvetica, Arial, sans-serif`;
        ctx.fillText(pctText, bx + 6, by + 6);
        ctx.restore();
      }
    }
  }
}

function renderShareCard(genres) {
  const canvas = document.createElement("canvas");
  const width = SHARE_CARD_WIDTH;
  const height = 1120;
  canvas.width = width * SHARE_SCALE;
  canvas.height = height * SHARE_SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SHARE_SCALE, SHARE_SCALE);

  // Background: base panel color + accent gradient wash (mirrors .verdict).
  ctx.fillStyle = "#181b17";
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createLinearGradient(0, 0, width * 0.7, height * 0.5);
  wash.addColorStop(0, "rgba(200, 255, 95, 0.16)");
  wash.addColorStop(0.4, "rgba(200, 255, 95, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(244, 240, 232, 0.16)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 3, 3, width - 6, height - 6, 22);
  ctx.stroke();

  const x = SHARE_CARD_PAD;
  const contentW = width - SHARE_CARD_PAD * 2;
  let y = SHARE_CARD_PAD;

  // Kicker
  ctx.fillStyle = "#a9aa9d";
  ctx.font = "600 22px Avenir Next, Helvetica, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(t("pl.card.headline"), x, y);
  y += 44;

  // Playlist pill (title + subtitle)
  if (shareMeta.title) {
    ctx.font = "800 24px Avenir Next, Helvetica, Arial, sans-serif";
    let title = shareMeta.title;
    const subtitle = shareMeta.subtitle ? `  ·  ${shareMeta.subtitle}` : "";
    const iconW = 26;
    let titleW = ctx.measureText(title).width;
    ctx.font = "500 20px Avenir Next, Helvetica, Arial, sans-serif";
    let subW = ctx.measureText(subtitle).width;
    // Clip title if the pill would exceed the content width.
    const maxTitleW = contentW - 44 - iconW - subW;
    if (titleW > maxTitleW) {
      ctx.font = "800 24px Avenir Next, Helvetica, Arial, sans-serif";
      while (title.length > 1 && ctx.measureText(`${title}…`).width > maxTitleW) {
        title = title.slice(0, -1);
      }
      title = `${title}…`;
      titleW = ctx.measureText(title).width;
    }
    const pillW = Math.min(contentW, iconW + titleW + subW + 44);
    const pillH = 48;
    ctx.fillStyle = "rgba(200, 255, 95, 0.10)";
    ctx.strokeStyle = "rgba(200, 255, 95, 0.4)";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, x, y, pillW, pillH, 24);
    ctx.fill();
    ctx.stroke();
    let tx = x + 22;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#c8ff5f";
    ctx.font = "600 20px Avenir Next, Helvetica, Arial, sans-serif";
    ctx.fillText("♪", tx, y + pillH / 2);
    tx += iconW;
    ctx.fillStyle = "#f4f0e8";
    ctx.font = "800 24px Avenir Next, Helvetica, Arial, sans-serif";
    ctx.fillText(title, tx, y + pillH / 2 + 1);
    tx += titleW;
    ctx.fillStyle = "#a9aa9d";
    ctx.font = "500 20px Avenir Next, Helvetica, Arial, sans-serif";
    ctx.fillText(subtitle, tx, y + pillH / 2 + 1);
    ctx.textBaseline = "top";
    y += pillH + 30;
  }

  // Genre legend (wrapped rows), one entry per parent genre.
  ctx.font = "600 20px Avenir Next, Helvetica, Arial, sans-serif";
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
    drawRoundedRect(ctx, legendX, legendY, dotW, dotW, 4);
    ctx.fill();
    ctx.fillStyle = "#c9cabb";
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
  if (!mosaicGenres.length || !shareMosaicBtn) return;
  const label = shareMosaicBtn.querySelector(".verdict-share-label");
  const originalLabel = label ? label.textContent : "";
  shareMosaicBtn.classList.add("is-busy");
  shareMosaicBtn.disabled = true;
  if (label) label.textContent = t("pl.share.busy");
  try {
    const canvas = renderShareCard(mosaicGenres);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("toBlob failed");
    const url = URL.createObjectURL(blob);
    openSharePreview(url);
  } catch (error) {
    setStatus(t("pl.share.error"));
  } finally {
    shareMosaicBtn.classList.remove("is-busy");
    shareMosaicBtn.disabled = mosaicGenres.length === 0;
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
  if (lastCompositions) renderAggregate(lastCompositions);
  // Re-localize the finished-analysis summary text (the generic data-i18n loop
  // above reset these back to their idle defaults).
  if (lastSummary) {
    const { name, analyzed, total, limit, truncated, ok } = lastSummary;
    trackCount.textContent = truncated
      ? t("pl.count.trackedOf", { n: analyzed, total })
      : t("pl.count.tracks", { n: analyzed });
    parsedLine.textContent = truncated
      ? t("pl.parsed.startLimited", { name, total, limit })
      : t("pl.parsed.start", { name, n: analyzed });
    statusPill.textContent = t("pl.status.complete", { ok, n: analyzed });
    progressLabel.textContent = t("pl.progress.complete");
    playlistMeta.textContent = truncated
      ? t("pl.overview.completeLimited", { name, total, limit, ok })
      : t("pl.overview.complete", { name, n: analyzed, ok });
    shareMeta = {
      title: name,
      subtitle: truncated
        ? t("pl.overview.completeSubtitleLimited", { total, limit, ok })
        : t("pl.overview.completeSubtitle", { n: analyzed, ok })
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
