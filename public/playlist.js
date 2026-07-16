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
const chartStyleToggle = document.querySelector("#chartStyleToggle");
const genreSunburst = document.querySelector("#genreSunburst");
const genreMosaic = document.querySelector("#genreMosaic");
const genreNebula = document.querySelector("#genreNebula");
const sunburstSvg = document.querySelector("#sunburstSvg");
const sunburstCenter = document.querySelector("#sunburstCenter");
const sunburstLegend = document.querySelector("#sunburstLegend");
const mosaicStage = document.querySelector("#mosaicStage");
const nebulaStage = document.querySelector("#nebulaStage");
const nebulaCanvas = document.querySelector("#nebulaCanvas");
const nebulaLegend = document.querySelector("#nebulaLegend");
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

const MIX_COLORS = ["#c8ff5f", "#63d2ff", "#ff6f3c", "#b985ff", "#ffd23c", "#4be3a3"];
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
    "pl.view.aria": "曲风视图切换",
    "pl.view.sunburst": "旭日图",
    "pl.view.mosaic": "占比矩阵",
    "pl.view.nebula": "曲风星云",
    "pl.style.aria": "图表风格切换",
    "pl.style.classic": "经典",
    "pl.style.studio": "Studio",
    "pl.sunburst.caption": "曲风构成 · 内环流派 / 外环子风格",
    "pl.mosaic.caption": "占比矩阵 · 面积即占比 / 同色同流派",
    "pl.nebula.caption": "曲风星云 · 每簇一个子风格 / 同色同流派",
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
    "pl.view.aria": "Genre view toggle",
    "pl.view.sunburst": "Sunburst",
    "pl.view.mosaic": "Mosaic",
    "pl.view.nebula": "Nebula",
    "pl.style.aria": "Chart style toggle",
    "pl.style.classic": "Classic",
    "pl.style.studio": "Studio",
    "pl.sunburst.caption": "Genre mix · inner ring genre / outer ring style",
    "pl.mosaic.caption": "Share mosaic · area = share / same color = same genre",
    "pl.nebula.caption": "Genre nebula · one cluster per style / same color = same genre",
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

function openStyleDialog(styleData, trigger) {
  if (!styleData || !styleDialog) return;
  currentStyleDialogData = styleData;
  lastStyleInfoTrigger = trigger || null;
  const profile = styleData.profile || null;
  const genreName = styleData.genre || (profile && profile.genre) || "";
  styleDialogKicker.textContent = genreName
    ? t("dialog.kickerGenre", { genre: localizeToken(genreName, "genre") })
    : t("dialog.kicker");
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
// Meta shown on the share card (playlist name + track stats), set as tracks are
// analyzed so the card matches the on-screen overview.
let shareMeta = { title: "", subtitle: "" };
// Latest compositions kept so the charts can be re-rendered on language switch.
let lastCompositions = null;
// Snapshot of the finished-analysis summary so the overview/status/count text
// can be re-localized when the language is switched after analysis.
let lastSummary = null;
const CHART_STYLE_STORAGE_KEY = "genre-lab-chart-style";
let chartVisualStyle = "classic";
try {
  const savedChartStyle = localStorage.getItem(CHART_STYLE_STORAGE_KEY);
  if (savedChartStyle === "studio" || savedChartStyle === "classic") chartVisualStyle = savedChartStyle;
} catch {}

function isStudioChartStyle() {
  return chartVisualStyle === "studio";
}

function renderAggregate(compositions) {
  lastCompositions = compositions;
  const genres = buildTwoLevel(compositions, jobState && jobState.tracks ? jobState.tracks : []);
  registerStyleAssociations(genres);
  applyChartStyle(chartVisualStyle, false);
  renderSunburst(genres);
  renderMosaic(genres);
  renderNebula(genres);
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
// figures are hidden so only the selected chart is visible.
function switchView(view) {
  genreSunburst.hidden = view !== "sunburst";
  genreMosaic.hidden = view !== "mosaic";
  genreNebula.hidden = view !== "nebula";
  for (const btn of viewToggle.querySelectorAll(".view-toggle-btn")) {
    const active = btn.dataset.view === view;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
  // The mosaic figure has zero size while hidden, so lay it out only once it
  // becomes visible (and thus measurable).
  if (view === "mosaic") layoutMosaicTree();
  // The nebula canvas likewise can't be sized while hidden; only run its
  // animation loop while it's the visible view to avoid wasting frames.
  if (view === "nebula") startNebula();
  else stopNebula();
}

viewToggle.addEventListener("click", event => {
  const btn = event.target.closest(".view-toggle-btn");
  if (btn) switchView(btn.dataset.view);
});

function applyChartStyle(style, persist = true) {
  if (style !== "studio" && style !== "classic") return;
  chartVisualStyle = style;
  if (genreTwoLevel) genreTwoLevel.dataset.chartStyle = style;
  if (chartStyleToggle) {
    for (const btn of chartStyleToggle.querySelectorAll(".chart-style-btn")) {
      const active = btn.dataset.style === style;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  if (persist) {
    try {
      localStorage.setItem(CHART_STYLE_STORAGE_KEY, style);
    } catch {}
  }
}

function refreshActiveChartStyle() {
  applyChartStyle(chartVisualStyle, false);
  if (lastCompositions) renderAggregate(lastCompositions);
  if (!genreMosaic.hidden) layoutMosaicTree();
  if (!genreNebula.hidden) startNebula();
}

if (chartStyleToggle) {
  chartStyleToggle.addEventListener("click", event => {
    const btn = event.target.closest(".chart-style-btn");
    if (!btn || btn.dataset.style === chartVisualStyle) return;
    applyChartStyle(btn.dataset.style);
    refreshActiveChartStyle();
  });
}

// Sunburst: inner ring = parent genre share, outer ring = child style share.
// Child slices share the parent hue, differentiated by opacity.
function renderSunburst(genres) {
  const NS = "http://www.w3.org/2000/svg";
  sunburstSvg.innerHTML = "";
  sunburstCenter.innerHTML = "";
  sunburstLegend.innerHTML = "";
  sunburstSvg.classList.toggle("is-studio", isStudioChartStyle());
  if (!genres.length) return;

  const cx = 112;
  const cy = 112;
  const studio = isStudioChartStyle();
  const rGenreIn = studio ? 32 : 42;
  const rGenreOut = studio ? 63 : 78;
  const rStyleIn = studio ? 69 : 81;
  const rStyleOut = studio ? 108 : 106;
  const GAP = studio ? 0.03 : 0.014;

  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const sector = (rInner, rOuter, a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const o0 = point(rOuter, a0);
    const o1 = point(rOuter, a1);
    const i1 = point(rInner, a1);
    const i0 = point(rInner, a0);
    return `M${o0[0].toFixed(2)} ${o0[1].toFixed(2)} A${rOuter} ${rOuter} 0 ${large} 1 ${o1[0].toFixed(2)} ${o1[1].toFixed(2)} L${i1[0].toFixed(2)} ${i1[1].toFixed(2)} A${rInner} ${rInner} 0 ${large} 0 ${i0[0].toFixed(2)} ${i0[1].toFixed(2)} Z`;
  };

  if (studio) {
    for (const [r, cls] of [[108, "outer"], [86, "mid"], [65, "inner"], [31, "label"]]) {
      const circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r);
      circle.setAttribute("class", `sun-guide sun-guide-${cls}`);
      sunburstSvg.appendChild(circle);
    }
    for (let i = 0; i < 48; i++) {
      const a = -Math.PI / 2 + i / 48 * Math.PI * 2;
      const p0 = point(i % 4 === 0 ? 92 : 98, a);
      const p1 = point(108, a);
      const tick = document.createElementNS(NS, "line");
      tick.setAttribute("x1", p0[0].toFixed(1));
      tick.setAttribute("y1", p0[1].toFixed(1));
      tick.setAttribute("x2", p1[0].toFixed(1));
      tick.setAttribute("y2", p1[1].toFixed(1));
      tick.setAttribute("class", i % 4 === 0 ? "sun-tick sun-tick-major" : "sun-tick");
      sunburstSvg.appendChild(tick);
    }
  }

  let angle = studio ? -Math.PI * 0.72 : -Math.PI / 2;
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

      if (style.percent >= (studio ? 8 : 11)) {
        const mid = sa + ssw / 2;
        const lp = point((rStyleIn + rStyleOut) / 2, mid);
        const text = document.createElementNS(NS, "text");
        text.setAttribute("x", lp[0].toFixed(1));
        text.setAttribute("y", (lp[1] + 3).toFixed(1));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "sun-label");
        text.textContent = studio && style.percent >= 13
          ? `${style.label.slice(0, 8)} ${Math.round(style.percent)}%`
          : `${Math.round(style.percent)}%`;
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
// Click a style slice to open its linked tracks; the info button reveals the
// genre/style intro inside the dialog.
sunburstSvg.addEventListener("click", event => {
  const seg = event.target.closest(".sun-style");
  if (!seg) return;
  openStyleDialog(getStyleAssociation(seg.dataset.genre, seg.dataset.style), seg);
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
    item.style.setProperty("--genre-color", genre.color);
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
      block.dataset.rank = String(rank + 1);
      block.style.left = `${sr.x + GAP / 2}px`;
      block.style.top = `${sr.y + GAP / 2}px`;
      block.style.width = `${bw}px`;
      block.style.height = `${bh}px`;
      block.style.setProperty("--genre-color", genre.color);
      block.style.background = genre.color;
      block.style.opacity = isStudioChartStyle() ? "1" : (rank === 0 ? "1" : String(Math.max(0.45, 1 - rank * 0.22)));
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

// Click a mosaic tile to open its linked tracks; the info button reveals the
// genre/style intro inside the dialog.
mosaicStage.addEventListener("click", event => {
  const block = event.target.closest(".mosaic-block");
  if (!block) return;
  openStyleDialog(getStyleAssociation(block.dataset.genre, block.dataset.style), block);
});

// ---------------------------------------------------------------------------
// Nebula view: a canvas "galaxy" of the same two-level data. Each style is a
// small drifting cluster of particles (≈ one particle per track-share point),
// clusters are placed inside their parent genre's treemap region and share the
// genre color, so same-genre styles read as one constellation. Its area still
// tracks share (cluster radius ∝ √percent), and clicking a cluster opens the
// same style intro dialog as the other views.
// ---------------------------------------------------------------------------
let nebulaGenres = [];
let nebulaClusters = [];
let nebulaRaf = null;
let nebulaTick = 0;
let nebulaW = 0;
let nebulaH = 0;
const nebulaReduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function nebulaRand(a, b) {
  return a + Math.random() * (b - a);
}

// Turn a #rrggbb hex plus alpha into an rgba() string for the canvas.
function nebulaRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderNebula(genres) {
  nebulaGenres = genres;
  // Legend mirrors the mosaic's: one round key per parent genre.
  nebulaLegend.innerHTML = "";
  for (const genre of genres) {
    const item = document.createElement("span");
    item.className = "nebula-legend-item";
    const key = document.createElement("i");
    key.className = "nebula-key";
    key.style.background = genre.color;
    key.style.color = genre.color;
    item.appendChild(key);
    item.append(document.createTextNode(`${genre.label} `));
    const pct = document.createElement("b");
    pct.textContent = `${Math.round(genre.percent)}%`;
    item.appendChild(pct);
    nebulaLegend.appendChild(item);
  }
  // Defer particle layout until the canvas is visible (and measurable).
  if (!genreNebula.hidden) buildNebula();
}

// Build one particle cluster per style, positioned inside its parent genre's
// treemap region so same-genre clusters sit together. Deferred until the canvas
// has a measurable size (the nebula may be hidden behind another view).
function buildNebula() {
  const rect = nebulaStage.getBoundingClientRect();
  nebulaW = rect.width;
  nebulaH = rect.height;
  if (!nebulaW || !nebulaH || !nebulaGenres.length) {
    nebulaClusters = [];
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  nebulaCanvas.width = Math.round(nebulaW * dpr);
  nebulaCanvas.height = Math.round(nebulaH * dpr);
  const ctx = nebulaCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  nebulaClusters = [];
  const studio = isStudioChartStyle();
  if (studio) {
    const cx0 = nebulaW * 0.5;
    const cy0 = nebulaH * 0.5;
    const maxOrbit = Math.max(72, Math.min(nebulaW, nebulaH) * 0.42);
    let angle = -Math.PI * 0.7;
    for (const [genreIndex, genre] of nebulaGenres.entries()) {
      const sweep = Math.max(0.28, genre.percent / 100 * Math.PI * 2);
      const styles = genre.styles.length ? genre.styles : [];
      for (const [styleIndex, style] of styles.entries()) {
        const ratio = (styleIndex + 0.5) / Math.max(1, styles.length);
        const a = angle + sweep * ratio + Math.sin(genreIndex + styleIndex) * 0.08;
        const orbit = maxOrbit * (0.28 + ratio * 0.64);
        const R = Math.max(13, Math.min(44, 8 + Math.sqrt(style.percent) * 6.2));
        const cx = Math.max(R + 12, Math.min(nebulaW - R - 12, cx0 + Math.cos(a) * orbit));
        const cy = Math.max(R + 12, Math.min(nebulaH - R - 12, cy0 + Math.sin(a) * orbit * 0.72));
        const count = Math.max(6, Math.round(style.percent * 4));
        const parts = [];
        for (let i = 0; i < count; i++) {
          const baseRad = R * Math.sqrt(Math.random()) * 0.78;
          parts.push({
            ang: nebulaRand(0, Math.PI * 2),
            baseRad,
            spin: nebulaRand(-0.003, 0.003),
            osc: nebulaRand(0, Math.PI * 2),
            oscSpd: nebulaRand(0.003, 0.008),
            oscAmp: nebulaRand(0.8, 3.5),
            size: nebulaRand(1.1, 2.8),
            twk: nebulaRand(0, Math.PI * 2)
          });
        }
        nebulaClusters.push({
          genre,
          style,
          cx,
          cy,
          R,
          parts,
          drift: nebulaRand(0, Math.PI * 2),
          genreIndex,
          styleIndex
        });
      }
      angle += sweep;
    }
    return;
  }

  const genreRects = squarifyTreemap(
    nebulaGenres.map(g => ({ value: g.percent, genre: g })),
    0, 0, nebulaW, nebulaH
  );
  for (const gr of genreRects) {
    const genre = gr.ref.genre;
    const styleRects = squarifyTreemap(
      genre.styles.map(s => ({ value: s.percent, style: s })),
      gr.x, gr.y, gr.w, gr.h
    );
    for (const sr of styleRects) {
      const style = sr.ref.style;
      // Radius fills most of the style's region but stays circular, so clusters
      // read as blobs rather than tiling the rectangle.
      const R = Math.max(10, Math.min(sr.w, sr.h) * 0.46);
      const cx = sr.x + sr.w / 2;
      const cy = sr.y + sr.h / 2;
      const count = Math.max(5, Math.round(style.percent * 3));
      const parts = [];
      for (let i = 0; i < count; i++) {
        const baseRad = R * Math.sqrt(Math.random());
        parts.push({
          ang: nebulaRand(0, Math.PI * 2),
          baseRad,
          spin: nebulaRand(-0.006, 0.006) * (1 - (baseRad / R) * 0.4),
          osc: nebulaRand(0, Math.PI * 2),
          oscSpd: nebulaRand(0.004, 0.012),
          oscAmp: nebulaRand(1.5, 6),
          size: nebulaRand(0.9, 2.4),
          twk: nebulaRand(0, Math.PI * 2)
        });
      }
      nebulaClusters.push({
        genre,
        style,
        cx,
        cy,
        R,
        parts,
        drift: nebulaRand(0, Math.PI * 2)
      });
    }
  }
}

function drawNebula() {
  const ctx = nebulaCanvas.getContext("2d");
  const studio = isStudioChartStyle();
  nebulaTick += 1;
  ctx.clearRect(0, 0, nebulaW, nebulaH);

  if (studio) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(244, 240, 232, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 24; x < nebulaW; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, nebulaH);
      ctx.stroke();
    }
    for (let y = 24; y < nebulaH; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(nebulaW, y);
      ctx.stroke();
    }
    ctx.translate(nebulaW / 2, nebulaH / 2);
    for (const r of [56, 112, 168, 224]) {
      if (r > Math.max(nebulaW, nebulaH)) continue;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const byGenre = new Map();
    for (const cl of nebulaClusters) {
      const list = byGenre.get(cl.genre.name) || [];
      list.push(cl);
      byGenre.set(cl.genre.name, list);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const list of byGenre.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.styleIndex - b.styleIndex);
      ctx.strokeStyle = nebulaRgba(list[0].genre.color, 0.26);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(list[0].cx, list[0].cy);
      for (let i = 1; i < list.length; i++) ctx.lineTo(list[i].cx, list[i].cy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Particles + halos are drawn additively so overlaps glow like a real nebula.
  ctx.globalCompositeOperation = "lighter";
  for (const cl of nebulaClusters) {
    const driftScale = studio ? 0.025 : 0.05;
    const dx = Math.sin(nebulaTick * 0.004 + cl.drift) * cl.R * driftScale;
    const dy = Math.cos(nebulaTick * 0.005 + cl.drift) * cl.R * driftScale;
    const cx = cl.cx + dx;
    const cy = cl.cy + dy;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cl.R * (studio ? 1.4 : 1.15));
    halo.addColorStop(0, nebulaRgba(cl.genre.color, studio ? 0.24 : 0.16));
    halo.addColorStop(1, nebulaRgba(cl.genre.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, cl.R * (studio ? 1.4 : 1.15), 0, Math.PI * 2);
    ctx.fill();
    if (studio) {
      ctx.strokeStyle = nebulaRgba(cl.genre.color, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, cl.R * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
    cl.drawCx = cx;
    cl.drawCy = cy;
    for (const p of cl.parts) {
      if (!nebulaReduceMotion) {
        p.ang += p.spin;
        p.osc += p.oscSpd;
        p.twk += 0.05;
      }
      const rad = p.baseRad + Math.sin(p.osc) * p.oscAmp;
      const x = cx + Math.cos(p.ang) * rad;
      const y = cy + Math.sin(p.ang) * rad;
      const tw = 0.55 + 0.45 * Math.sin(p.twk);
      ctx.fillStyle = nebulaRgba(cl.genre.color, (studio ? 0.64 : 0.5) + 0.32 * tw);
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Labels sit on top, opaque, so style names stay readable over the glow.
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  for (const cl of nebulaClusters) {
    if (cl.R < 20) continue;
    const nameSize = Math.max(11, Math.min(studio ? 16 : 18, cl.R * (studio ? 0.28 : 0.32)));
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = studio ? 10 : 6;
    if (studio) {
      const label = cl.style.label.length > 14 ? `${cl.style.label.slice(0, 12)}...` : cl.style.label;
      const w = Math.max(62, Math.min(138, ctx.measureText(label).width + 26));
      const h = 28;
      const x = cl.drawCx - w / 2;
      const y = cl.drawCy + cl.R * 0.62;
      ctx.fillStyle = "rgba(13, 15, 13, 0.72)";
      ctx.strokeStyle = nebulaRgba(cl.genre.color, 0.52);
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(244, 240, 232, 0.95)";
      ctx.font = `800 ${nameSize}px "Avenir Next", Helvetica, Arial, sans-serif`;
      ctx.fillText(label, cl.drawCx, y + 12);
      ctx.fillStyle = cl.genre.color;
      ctx.font = `900 10px "Avenir Next", Helvetica, Arial, sans-serif`;
      ctx.fillText(`${Math.round(cl.style.percent)}%`, cl.drawCx, y + 24);
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = `800 ${nameSize}px "Avenir Next", Helvetica, Arial, sans-serif`;
      ctx.fillText(cl.style.label, cl.drawCx, cl.drawCy - 2);
      ctx.fillStyle = cl.genre.color;
      ctx.font = `800 ${Math.max(10, nameSize * 0.82)}px "Avenir Next", Helvetica, Arial, sans-serif`;
      ctx.fillText(`${Math.round(cl.style.percent)}%`, cl.drawCx, cl.drawCy + nameSize);
    }
    ctx.shadowBlur = 0;
  }

  if (nebulaRaf !== null && !nebulaReduceMotion) {
    nebulaRaf = requestAnimationFrame(drawNebula);
  }
}

function startNebula() {
  buildNebula();
  if (!nebulaClusters.length) return;
  if (nebulaReduceMotion) {
    drawNebula();
    return;
  }
  if (nebulaRaf !== null) cancelAnimationFrame(nebulaRaf);
  nebulaRaf = requestAnimationFrame(drawNebula);
}

function stopNebula() {
  if (nebulaRaf !== null) {
    cancelAnimationFrame(nebulaRaf);
    nebulaRaf = null;
  }
}

// Click a cluster to open its linked tracks, mirroring the mosaic/sunburst.
nebulaCanvas.addEventListener("click", event => {
  if (!nebulaClusters.length) return;
  const rect = nebulaCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let hit = null;
  let best = Infinity;
  for (const cl of nebulaClusters) {
    const cx = cl.drawCx != null ? cl.drawCx : cl.cx;
    const cy = cl.drawCy != null ? cl.drawCy : cl.cy;
    const d = Math.hypot(x - cx, y - cy);
    if (d <= cl.R * 1.15 && d < best) {
      best = d;
      hit = cl;
    }
  }
  if (!hit) return;
  openStyleDialog(getStyleAssociation(hit.style.genre || hit.genre.name, hit.style.name), nebulaCanvas);
});

let nebulaResizeQueued = false;
window.addEventListener("resize", () => {
  if (nebulaResizeQueued || genreNebula.hidden) return;
  nebulaResizeQueued = true;
  requestAnimationFrame(() => {
    nebulaResizeQueued = false;
    startNebula();
  });
});

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

// Render one track result into its card. Returns the composition (or null on
// failure) so it can be collected for the aggregate charts.
function renderTrackResult(card, result) {
  if (!card) return null;
  if (result.status === "ok") {
    setCardStatus(card, t("pl.card.status.done"), "done");
    renderTrackMix(card.body, result.composition);
    return result.composition;
  }
  const map = TRACK_FAIL_TEXT[result.stage] || TRACK_FAIL_TEXT.essentia;
  setCardStatus(card, t(map.status), "fail");
  card.body.textContent = result.stage === "score"
    ? t("pl.card.body.noHit")
    : t(map.body, { err: result.error || "" });
  return null;
}

// Reset all playlist view state before a fresh submit.
function resetPlaylistView() {
  resetProgress();
  trackList.innerHTML = "";
  sunburstSvg.innerHTML = "";
  sunburstCenter.innerHTML = "";
  sunburstLegend.innerHTML = "";
  mosaicStage.innerHTML = "";
  nebulaLegend.innerHTML = "";
  stopNebula();
  genreTwoLevel.hidden = true;
  twoLevelShown = false;
  lastCompositions = null;
  styleAssociations = new Map();
  lastSummary = null;
  shareMeta = { title: "", subtitle: "" };
  if (shareMosaicBtn) shareMosaicBtn.disabled = true;
  trackCount.textContent = t("pl.count.tracks", { n: 0 });
  playlistMeta.textContent = t("pl.overview.parsing");
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
    jobState.compositions[result.index] = renderTrackResult(card, result);
    if (silent) continue;
    const title = (card && card.title) || "";
    const key = result.status === "ok" ? "pl.log.trackDone" : "pl.log.trackFail";
    logLine(t(key, { title, i: result.index + 1, n: total }));
  }
  jobState.applied = data.completed;
  if (data.results && data.results.length) renderAggregate(jobState.compositions);
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
      // A tall, narrow tile can't fit a horizontal "name %" row, so run the
      // name top-to-bottom with the percent at the base. Mirrors the DOM
      // mosaic's is-vertical branch (writing-mode: vertical-rl).
      const isVertical = bh >= bw * 1.6 && bw < 60 && bh >= 60;
      if (isVertical) {
        ctx.save();
        ctx.fillStyle = "rgba(15, 17, 15, 0.9)";
        // Percentage sits horizontally at the bottom of the tile.
        const vPctSize = Math.max(13, Math.min(pctSize, 22));
        ctx.font = `800 ${vPctSize}px Avenir Next, Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(pctText, bx + bw / 2, by + bh - 6);
        // Name runs top-to-bottom (rotated 90°), clipped to the tile height.
        const vNameSize = Math.max(12, Math.min(nameSize, bw - 6));
        ctx.font = `700 ${vNameSize}px Avenir Next, Helvetica, Arial, sans-serif`;
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
        ctx.fillStyle = "rgba(15, 17, 15, 0.9)";
        ctx.textBaseline = "top";
        ctx.font = `700 ${nameSize}px Avenir Next, Helvetica, Arial, sans-serif`;
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
        ctx.font = `800 ${pctSize}px Avenir Next, Helvetica, Arial, sans-serif`;
        ctx.fillText(pctText, bx + 8, ny + 4);
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
  if (currentStyleDialogData && styleDialog.classList.contains("is-open")) {
    const refreshed = getStyleAssociation(currentStyleDialogData.genre, currentStyleDialogData.style);
    openStyleDialog(refreshed, lastStyleInfoTrigger);
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

applyChartStyle(chartVisualStyle, false);
applyLanguage();
initModelSelector();
// Resume an in-flight / finished job whose id is in the page URL (mobile
// app-switch or refresh). Runs after the model selector so activeModel is set.
resumeJobFromUrl();
