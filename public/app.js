const form = document.querySelector("#trackForm");
const trackInput = document.querySelector("#trackInput");
const formatInputs = [...document.querySelectorAll("input[name='inputFormat']")];
const parsedLine = document.querySelector("#parsedLine");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressFill = document.querySelector("#progressFill");
const progressSteps = document.querySelector("#progressSteps");
const progressLog = document.querySelector("#progressLog");
const albumInput = document.querySelector("#albumInput");
const urlInput = document.querySelector("#urlInput");
const fileInput = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const statusPill = document.querySelector("#statusPill");
const genreTitle = document.querySelector("#genreTitle");
const genreReason = document.querySelector("#genreReason");
const confidenceLabel = document.querySelector("#confidenceLabel");
const confidenceMeter = document.querySelector("#confidenceMeter");
const genreMix = document.querySelector("#genreMix");
const scoreList = document.querySelector("#scoreList");
const scoreCount = document.querySelector("#scoreCount");
const featureGrid = document.querySelector("#featureGrid");
const audioState = document.querySelector("#audioState");
const evidenceList = document.querySelector("#evidenceList");
const evidenceCount = document.querySelector("#evidenceCount");
const scoreTemplate = document.querySelector("#scoreTemplate");

let metadata = null;
let downloadedAudioUrl = "";
let audioFeatures = null;
let essentiaAnalysis = null;
let downloadEvidence = "";
let activeTrack = null;
let parseEvidence = "";

const MIN_VISIBLE_STYLE_PERCENT = 10;
const MAX_VISIBLE_STYLE_ITEMS = 6;

const TAXONOMY = window.DISCOGS_TAXONOMY || { genres: [], aliases: {} };
const GENRES = (TAXONOMY.genres || []).map(genre => ({
  name: genre.name,
  styles: genre.styles || [],
  keywords: [genre.name, ...(genre.styles || [])],
  summary: `${genre.styles ? genre.styles.length : 0} 个本地 Discogs style`
}));
const DISCOGS_GENRES_BY_KEY = new Map();
const DISCOGS_STYLES_BY_GENRE = new Map();
const DISCOGS_STYLE_CANDIDATES = new Map();
const DISCOGS_ALIASES = TAXONOMY.aliases || {};

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
  setProgress("parse", "准备分析", 0);
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
  return formatInputs.find(input => input.checked)?.value || "song-artist";
}

function formatLabel() {
  const labels = {
    "song-artist": "歌曲 - 艺人",
    "artist-song": "艺人 - 歌曲",
    "netease-url": "网易云音乐链接"
  };
  return labels[selectedFormat()] || labels["song-artist"];
}

function parseTrackInput(value) {
  const raw = String(value || "").trim();
  if (selectedFormat() === "netease-url") {
    return { title: "", artists: "", raw, url: raw, orientation: "netease-url" };
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
    parsedLine.textContent = selectedFormat() === "netease-url"
      ? "将解析网易云歌曲链接，再搜索对应公开音频"
      : `将按“${formatLabel()}”解析并搜索对应公开音频`;
  } else if (track.orientation === "netease-url" && !track.title) {
    parsedLine.innerHTML = `待解析网易云链接：<strong>${escapeHtml(track.raw)}</strong>`;
  } else if (track.artists) {
    parsedLine.innerHTML = `当前解析：<strong>${escapeHtml(track.title)}</strong> / <strong>${escapeHtml(track.artists)}</strong>`;
  } else {
    parsedLine.innerHTML = `只识别到歌名：<strong>${escapeHtml(track.title)}</strong>，仍会尝试搜索音频`;
  }
}

function updateInputPlaceholder() {
  if (selectedFormat() === "netease-url") {
    trackInput.placeholder = "例如：https://music.163.com/song?id=38689021&uct2=...";
  } else if (selectedFormat() === "artist-song") {
    trackInput.placeholder = "例如：TAKF - We All Desire";
  } else {
    trackInput.placeholder = "例如：WALK IN PARADISE - DVRST";
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
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
  if (!response.ok) throw new Error(data.error || "上传音频失败");
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
w      if (item.primaryGenreName && firstDiscogsCandidate(item.primaryGenreName)) {
        tags.push({ tag: normalize(item.primaryGenreName), source: `iTunes：${item.trackName}`, weight: 16 });
        evidence.push(`iTunes Search API 匹配到 <strong>${item.trackName}</strong>${item.artistName ? ` / <strong>${item.artistName}</strong>` : ""}${item.matchScore != null ? `，匹配分 <strong>${item.matchScore}</strong>` : ""}；Apple 标签 <strong>${item.primaryGenreName}</strong> 可映射到本地 Discogs 范围。`);
      }
    }
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
        source: `Last.fm 歌曲标签`,
        weight: 24 + countBoost
      });
    }
    if (trackTags.length) {
      const sourceLabel = lastfm.source === "api" ? "Last.fm API" : "Last.fm";
      const accepted = trackTags.filter(tag => firstDiscogsCandidate(tag.name)).slice(0, 6);
      if (accepted.length) {
        evidence.push(`${sourceLabel} 的歌曲级标签中，可映射到 Discogs 范围的有 ${accepted.map(tag => `<strong>${escapeHtml(tag.name)}</strong>${tag.count ? ` (${tag.count})` : ""}`).join("、")}。`);
      }
    } else if (lastfm.error) {
      evidence.push(`Last.fm 歌曲级标签未返回可用结果：${escapeHtml(lastfm.error)}。`);
    } else if (lastfm.source === "api") {
      evidence.push("Last.fm API 已查询，但这首歌没有返回歌曲级 top tags。");
    }
  }

  const discogs = data.sources && data.sources.discogs;
  if (discogs && Array.isArray(discogs.releases)) {
    const usefulReleases = discogs.releases
      .filter(item => (item.genre && item.genre.length) || (item.style && item.style.length))
      .slice(0, 5);
    for (const release of usefulReleases) {
      for (const tag of release.genre || []) {
        tags.push({ tag: normalize(tag), source: `Discogs 发行物 genre：${release.title}`, weight: 14 });
      }
      for (const tag of release.style || []) {
        tags.push({ tag: normalize(tag), genreHint: (release.genre || [])[0] || "", source: `Discogs 发行物 style：${release.title}`, weight: 20 });
      }
    }
    if (usefulReleases.length) {
      const release = usefulReleases[0];
      evidence.push(`Discogs 匹配到发行物/专辑 <strong>${escapeHtml(release.title)}</strong>${release.year ? ` (${release.year})` : ""}${release.matchScore != null ? `，匹配分 <strong>${release.matchScore}</strong>` : ""}；Genre / Style 为 ${[...(release.genre || []), ...(release.style || [])].slice(0, 6).map(tag => `<strong>${escapeHtml(tag)}</strong>`).join("、")}。`);
    } else if (discogs.error) {
      evidence.push(`Discogs 发行物/专辑标签未返回可用结果：${escapeHtml(discogs.error)}。`);
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
    if (candidate.style) {
      addScore(scores, candidate.genre, Math.max(3, Math.round(divided * 0.32)), `${reason}，归入 Discogs Genre “${candidate.genre}”`);
    }
  }
  return true;
}

function scoreKeyword(scores, tag, source, weight = 18, genreHint = "") {
  addDiscogsScore(scores, tag, genreHint, weight, `${source} 给出 Discogs Genre / Style 标签 “${tag}”`);
}

function scoreAudio(scores, features, evidence) {
  if (!features) return;
  const { bpm, bassRatio, cowbellRatio, brightness, onsetDensity, zcr, duration } = features;
  evidence.push(`音频已解码：约 <strong>${Math.round(duration)} 秒</strong>，估计 BPM <strong>${Math.round(bpm || 0)}</strong>。`);

  if (bpm >= 120 && bpm <= 180 && bassRatio > 0.32 && cowbellRatio > 0.11) {
    addDiscogsScore(scores, "Trap", "Hip Hop", 34, "音频：高速区间 + 低频强 + cowbell/中高频脉冲突出");
    evidence.push("音频特征显示低频和 cowbell 区间能量较强；本地 Discogs400 不含 Phonk，按最接近的 Hip Hop / Trap 计入。");
  }
  if (bpm >= 120 && bpm <= 180 && bassRatio > 0.45 && onsetDensity > 42 && brightness < 0.16) {
    addDiscogsScore(scores, "Trap", "Hip Hop", 24, "音频：强低频、高推进感、暗色半拍制作");
    evidence.push("音频特征显示 120-180 BPM、强低频和较暗的频谱重心；在 Discogs400 范围内按 Hip Hop / Trap 计入。");
  }
  if (bpm >= 95 && bpm < 125 && bassRatio > 0.45 && onsetDensity > 55 && brightness < 0.18) {
    addDiscogsScore(scores, "Trap", "Hip Hop", 18, "音频：中速、强低频、暗色 Hip Hop 制作倾向");
    evidence.push("音频特征显示中速但低频很强、频谱偏暗；在 Discogs400 范围内按 Hip Hop / Trap 倾向处理。");
  }
  if ((bpm >= 70 && bpm <= 105) || (bpm >= 130 && bpm <= 170)) {
    if (bassRatio > 0.26 && onsetDensity > 22) {
      addDiscogsScore(scores, "Hip Hop", "", 20, "音频：Hip Hop 常见速度区间，鼓点与低频明显");
      addDiscogsScore(scores, "Trap", "Hip Hop", 14, "音频：半拍或双倍速度区间，808 倾向");
    }
  }
  if (bpm >= 118 && bpm <= 136 && onsetDensity > 38) {
    addDiscogsScore(scores, "House", "Electronic", 18, "音频：120-135 BPM 且起音密集");
    addDiscogsScore(scores, "Techno", "Electronic", 12, "音频：120-135 BPM 且起音密集");
  }
  if (bpm >= 160 && bpm <= 185 && onsetDensity > 48 && brightness > 0.38) {
    addDiscogsScore(scores, "Drum n Bass", "Electronic", 28, "音频：高速、明亮、起音密集");
  }
  if (brightness > 0.45 && zcr > 0.11 && onsetDensity > 32) {
    addDiscogsScore(scores, "Rock", "", 14, "音频：高频/过零率较高，可能有失真或真实鼓组");
  }
  if (brightness > 0.52 && zcr > 0.14 && onsetDensity > 44) {
    addDiscogsScore(scores, "Heavy Metal", "Rock", 12, "音频：高亮度、高过零率和密集起音");
  }
  if (onsetDensity < 12 && bassRatio < 0.22) {
    addDiscogsScore(scores, "Ambient", "Electronic", 18, "音频：起伏较少、低频冲击弱");
  }
  if (bpm >= 88 && bpm <= 112 && brightness < 0.36 && onsetDensity < 34) {
    addDiscogsScore(scores, "Contemporary R&B", "Funk / Soul", 10, "音频：中速、较柔和、起音不密集");
  }
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
      evidence.push(`Essentia 曲风模型未返回可用结果：${escapeHtml(essentia.error)}。`);
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
    const strength = Math.round(relative * 100);
    const modelScore = formatModelScore(item.score);
    if (parsed.style) {
      addDiscogsScore(
        scores,
        parsed.style,
        parsed.genre,
        weight,
        `Essentia 音频模型：${parsed.genre} / ${parsed.style}，模型分 ${modelScore}，相对强度 ${strength}`
      );
    } else if (parsed.genre) {
      addDiscogsScore(
        scores,
        parsed.genre,
        "",
        weight,
        `Essentia 音频模型：${parsed.genre}，模型分 ${modelScore}，相对强度 ${strength}`
      );
    }
  }

  const topTags = useful.slice(0, 5).map(item => {
    const parsed = splitEssentiaLabel(item.label);
    const relative = Math.round(Number(item.score || 0) / topScore * 100);
    return `<strong>${escapeHtml(parsed.display)}</strong> 模型分 ${formatModelScore(item.score)}，相对强度 ${relative}`;
  });
  evidence.push(`Essentia Discogs-EffNet + Discogs400 直接从音频判断，作为最高权重依据；Top 标签为 ${topTags.join("、")}。`);
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
  if (!composition.length) return "证据不足";
  const [first, second] = composition;
  if (second && second.percent >= 12 && second.score >= first.score * 0.55) {
    return `${first.name} + ${second.name}`;
  }
  return first.name;
}

function buildVerdictReason(composition) {
  const reasons = composition
    .slice(0, 2)
    .flatMap(item => item.reasons || [])
    .filter(Boolean);
  const uniqueReasons = uniqueBy(reasons, reason => reason).slice(0, 2);
  return uniqueReasons.length
    ? `主要依据：${uniqueReasons.join("；")}。`
    : "主要依据：现有元信息与音频特征综合得分最高。";
}

function analyzeEvidence() {
  const scores = new Map();
  const evidence = [];
  const track = currentTrack();

  if (parseEvidence) evidence.push(parseEvidence);
  if (downloadEvidence) evidence.push(downloadEvidence);

  const metadataTags = collectMetadataTags(metadata);
  for (const item of metadataTags.tags) scoreKeyword(scores, item.tag, item.source, item.weight || 18, item.genreHint || "");
  evidence.push(...metadataTags.evidence);
  scoreEssentia(scores, essentiaAnalysis, evidence);
  scoreAudio(scores, audioFeatures, evidence);

  const sorted = [...scores.values()]
    .map(item => ({ ...item, score: Math.max(0, Math.min(100, Math.round(item.score))) }))
    .sort((a, b) => b.score - a.score);

  const composition = buildGenreComposition(sorted);
  const coverage = Math.max(0, Math.min(96, composition.reduce((sum, item) => sum + item.score, 0)));
  const leadingNames = buildVerdictTitle(composition);

  renderScores(composition.length ? composition : sorted.slice(0, 8));
  renderMix(composition);
  renderEvidence(evidence, composition);
  renderFeatures(audioFeatures);

  genreTitle.textContent = composition.length ? leadingNames : "证据不足";
  confidenceLabel.textContent = `证据覆盖 ${Math.round(coverage)}%`;
  confidenceMeter.style.width = `${Math.round(coverage)}%`;
  genreReason.textContent = composition.length
    ? buildVerdictReason(composition)
    : "还没有足够证据。建议至少填写艺人，并上传或下载一段音频。";
  setStatus("分析完成");
}

function renderScores(items) {
  scoreList.innerHTML = "";
  scoreCount.textContent = `${items.filter(item => item.score > 0).length} 项`;
  for (const item of items) {
    const node = scoreTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = item.name;
    node.querySelector("small").textContent = item.reasons[0] || "未命中强证据";
    const percent = item.percent ?? item.score;
    node.querySelector(".bar span").style.width = `${percent}%`;
    node.querySelector("b").textContent = item.percent != null ? `${item.percent}%` : item.score;
    scoreList.appendChild(node);
  }
}

function renderMix(composition) {
  genreMix.innerHTML = "";
  for (const item of composition) {
    const chip = document.createElement("span");
    chip.className = "mix-chip";
    chip.innerHTML = `${escapeHtml(item.name)} <b>${item.percent}%</b>`;
    genreMix.appendChild(chip);
  }
}

function renderEvidence(items, composition) {
  evidenceList.innerHTML = "";
  const list = items.length ? items : ["暂无证据。先查元信息，或上传/下载音频。"];
  evidenceCount.textContent = `${list.length} 条`;
  for (const item of list.slice(0, 18)) {
    const li = document.createElement("li");
    li.innerHTML = item;
    evidenceList.appendChild(li);
  }
  if (composition && composition.length) {
    const li = document.createElement("li");
    li.innerHTML = `Genre / Style 构成：${composition.map(item => `<strong>${item.name}</strong> ${item.percent}%`).join("，")}。`;
    evidenceList.appendChild(li);
  }
}

function renderFeatures(features) {
  featureGrid.innerHTML = "";
  const essentiaTop = essentiaAnalysis && Array.isArray(essentiaAnalysis.predictions) && essentiaAnalysis.predictions[0]
    ? splitEssentiaLabel(essentiaAnalysis.predictions[0].label).display
    : "--";
  const rows = features ? [
    ["Essentia Top", essentiaTop],
    ["BPM", Math.round(features.bpm || 0)],
    ["低频占比", `${Math.round(features.bassRatio * 100)}%`],
    ["Cowbell 区间", `${Math.round(features.cowbellRatio * 100)}%`],
    ["明亮度", `${Math.round(features.brightness * 100)}%`],
    ["起音密度", `${Math.round(features.onsetDensity)}/min`]
  ] : [
    ["Essentia Top", "--"],
    ["BPM", "--"],
    ["低频占比", "--"],
    ["Cowbell 区间", "--"],
    ["明亮度", "--"],
    ["起音密度", "--"]
  ];

  for (const [label, value] of rows) {
    const card = document.createElement("div");
    card.className = "feature";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
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
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < Math.min(i + 12, peaks.length); j++) {
      const seconds = (peaks[j] - peaks[i]) * hopSize / sampleRate;
      if (seconds <= 0) continue;
      let bpm = 60 / seconds;
      while (bpm < 70) bpm *= 2;
      while (bpm > 190) bpm /= 2;
      const bucket = Math.round(bpm);
      histogram.set(bucket, (histogram.get(bucket) || 0) + 1);
    }
  }
  const best = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 0;
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
    if (!response.ok) throw new Error("无法读取音频文件");
    arrayBuffer = await response.arrayBuffer();
  }
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
  await context.close();
  return buffer;
}

async function analyzeAudio(source) {
  setStatus("解码音频", true);
  setProgress("decode", "解码并提取指纹", 76, "浏览器正在读取波形和频段能量");
  audioState.textContent = "分析中";
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
  }

  const bpm = estimateBpm(energies, sampleRate, hopSize);
  const peaks = pickPeaks(energies);
  audioFeatures = {
    duration,
    bpm,
    bassRatio: bass / totalBand,
    cowbellRatio: cowbell / totalBand,
    brightness: bright / totalBand,
    onsetDensity: peaks.length / Math.max(1, maxSeconds / 60),
    zcr: zcrSum / Math.max(1, frames),
    rms: rmsSum / Math.max(1, frames)
  };

  audioState.textContent = source instanceof File ? "本地上传" : "已下载";
  renderFeatures(audioFeatures);
  setProgress("decode", "音频指纹完成", 86, `BPM ${Math.round(audioFeatures.bpm || 0)}，低频 ${Math.round(audioFeatures.bassRatio * 100)}%`);
  setStatus("音频完成");
}

async function analyzeEssentia(fileName) {
  if (!fileName) return;
  setStatus("Essentia 分析", true);
  setProgress("decode", "Essentia 曲风模型分析", 88, "使用 Discogs-EffNet + Discogs400 直接判断音频曲风");
  try {
    essentiaAnalysis = await postJson("/api/essentia", { fileName, top: 12 });
    const top = essentiaAnalysis.predictions && essentiaAnalysis.predictions[0];
    if (top) {
      const parsed = splitEssentiaLabel(top.label);
      audioState.textContent = "Essentia 已完成";
      setProgress("decode", "Essentia 完成", 92, `最高标签：${parsed.display}`);
    }
  } catch (error) {
    essentiaAnalysis = { predictions: [], error: error.message };
    setProgress("decode", "Essentia 未完成", 88, error.message);
  }
  renderFeatures(audioFeatures);
}

async function fetchMetadata() {
  const track = currentTrack();
  setStatus("查元信息", true);
  setProgress("metadata", "查询标签和发行信息", 22, `按“${formatLabel()}”解析：${track.title} / ${track.artists || "未知艺人"}`);
  metadata = await postJson("/api/metadata", {
    title: track.title,
    artists: track.artists,
    album: albumInput.value
  });
  activeTrack = track;
  const fitScore = metadataFitScore(metadata, track);
  if (track.orientation === "netease-url") {
    parseEvidence = `网易云链接解析得到：<strong>${escapeHtml(track.title)}</strong> / <strong>${escapeHtml(track.artists || "未知艺人")}</strong>${track.album ? `，专辑 <strong>${escapeHtml(track.album)}</strong>` : ""}。`;
  } else {
    parseEvidence = fitScore > 0
      ? `联网元信息支持当前格式解析：<strong>${escapeHtml(track.title)}</strong> / <strong>${escapeHtml(track.artists || "未知艺人")}</strong>。`
      : `公开标签库暂未找到当前格式的明确匹配：<strong>${escapeHtml(track.title)}</strong> / <strong>${escapeHtml(track.artists || "未知艺人")}</strong>。`;
  }
  updateParsedLine();
  setProgress("metadata", "元信息完成", 36, `当前格式解析完成：${track.title} / ${track.artists || "未知艺人"}`);
  setStatus("元信息完成");
}

async function resolveNetEaseSong() {
  const raw = trackInput.value.trim();
  if (!raw) throw new Error("请输入网易云音乐歌曲链接。");
  setStatus("解析网易云", true);
  setProgress("parse", "解析网易云链接", 12, "读取网易云 song id 和歌曲信息");
  const data = await postJson("/api/netease-song", { url: raw });
  activeTrack = {
    title: data.title,
    artists: data.artists.join(" / "),
    album: data.album || "",
    raw,
    url: raw,
    orientation: "netease-url",
    sourceId: data.id
  };
  if (!albumInput.value && data.album) albumInput.value = data.album;
  parseEvidence = `网易云链接解析为 <strong>${escapeHtml(data.title)}</strong> / <strong>${escapeHtml(data.artists.join(" / "))}</strong>${data.album ? `，专辑 <strong>${escapeHtml(data.album)}</strong>` : ""}。`;
  updateParsedLine();
  setProgress("parse", "网易云解析完成", 18, `${data.title} / ${data.artists.join(" / ")}`);
  setStatus("网易云完成");
}

async function downloadTrackAudio(track) {
  return postJson("/api/download", {
    url: urlInput.value.trim(),
    title: track.title,
    artists: track.artists,
    query: [`"${track.title}"`, track.artists ? `"${track.artists}"` : ""].filter(Boolean).join(" ")
  });
}

async function findAndAnalyzeAudio() {
  const file = fileInput.files[0];
  if (file) {
    setProgress("decode", "读取本地音频", 64, "使用上传音频，跳过网络搜索");
    const uploaded = await uploadAudioFile(file);
    downloadedAudioUrl = uploaded.audioUrl;
    downloadEvidence = `使用用户上传的本地音频 ${escapeHtml(file.name)}；已保存为 ${escapeHtml(uploaded.fileName)} 并纳入 Essentia 分析。`;
    await analyzeAudio(file);
    await analyzeEssentia(uploaded.fileName);
    return;
  }

  setStatus(urlInput.value.trim() ? "下载指定音频" : "搜索公开音频", true);
  setProgress("search", urlInput.value.trim() ? "使用指定音频" : "搜索公开音频", 48, urlInput.value.trim() ? "准备下载指定链接" : "正在搜索可下载的公开视频候选");
  const track = currentTrack();
  setProgress("search", "搜索公开音频", 52, `当前格式：${track.title} / ${track.artists || "未知艺人"}`);
  const data = await downloadTrackAudio(track);
  downloadedAudioUrl = data.audioUrl;
  setProgress("download", "音频下载完成", 66, `来源：${data.source}`);
  const sourceText = data.method === "yt-dlp-search"
    ? `实时搜索公开音频：${escapeHtml(data.source)}${data.matchScore != null ? `，标题匹配分 ${data.matchScore}` : ""}`
    : `使用指定音频来源：${escapeHtml(data.source)}`;
  downloadEvidence = `${sourceText}；已下载为 ${escapeHtml(data.fileName)} 并解码分析。`;
  await analyzeAudio(downloadedAudioUrl);
  await analyzeEssentia(data.fileName);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileName.textContent = file ? file.name : "没有选择文件";
});

trackInput.addEventListener("input", () => {
  metadata = null;
  downloadedAudioUrl = "";
  audioFeatures = null;
  essentiaAnalysis = null;
  downloadEvidence = "";
  activeTrack = null;
  parseEvidence = "";
  updateParsedLine();
  resetProgress();
});

for (const input of formatInputs) {
  input.addEventListener("change", () => {
    metadata = null;
    downloadedAudioUrl = "";
    audioFeatures = null;
    essentiaAnalysis = null;
    downloadEvidence = "";
    activeTrack = null;
    parseEvidence = "";
    updateInputPlaceholder();
    updateParsedLine();
    resetProgress();
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const track = currentTrack();
    if (selectedFormat() === "netease-url") {
      if (!track.raw) throw new Error("请输入网易云音乐歌曲链接。");
    } else if (!track.title) {
      throw new Error("请输入类似 “WALK IN PARADISE - DVRST” 的歌曲和艺人。");
    }
    resetProgress();
    metadata = null;
    downloadedAudioUrl = "";
    audioFeatures = null;
    essentiaAnalysis = null;
    downloadEvidence = "";
    activeTrack = null;
    parseEvidence = "";
    setProgress("parse", "解析输入", 10, `使用选择格式：${formatLabel()}`);
    if (selectedFormat() === "netease-url") {
      await resolveNetEaseSong();
    }
    await fetchMetadata();
    try {
      await findAndAnalyzeAudio();
    } catch (downloadError) {
      const failedTrack = currentTrack();
      downloadEvidence = `按当前格式解析为 <strong>${escapeHtml(failedTrack.title)}</strong> / <strong>${escapeHtml(failedTrack.artists || "未知艺人")}</strong>，但没有找到足够匹配的公开音频：${escapeHtml(downloadError.message)}。`;
      setProgress("download", "音频获取失败", 72, "当前格式没有找到匹配音频");
    }
    setProgress("score", "融合证据评分", 90, "合并艺人、标签、专辑与音频指纹");
    analyzeEvidence();
    setProgress("score", "分析完成", 100, "结果已生成");
  } catch (error) {
    setStatus("失败");
    setProgress("score", "分析失败", 100, error.message);
    alert(error.message);
  }
});

renderScores(GENRES.slice(0, 8).map(genre => ({ name: genre.name, score: 0, reasons: [] })));
renderMix([]);
renderFeatures(null);
updateInputPlaceholder();
updateParsedLine();
resetProgress();
