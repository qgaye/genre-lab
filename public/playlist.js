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

if (new URLSearchParams(window.location.search).get("showModel") === "1") {
  document.documentElement.classList.add("show-model-selector");
}

const MIX_COLORS = ["#c8ff5f", "#63d2ff", "#ff6f3c", "#b985ff", "#ffd23c", "#4be3a3"];

let activeModel = "";
let taxonomyBundle = null;
let running = false;

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
    const error = new Error(data.error || "请求失败");
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
  setProgress("准备就绪", 0);
}

// Localize a "Genre / Style" (or single) label with the taxonomy translations.
function displayName(display) {
  const translations = (window.DISCOGS_TAXONOMY && window.DISCOGS_TAXONOMY.translations && window.DISCOGS_TAXONOMY.translations.zh) || {};
  const genres = translations.genres || {};
  const styles = translations.styles || {};
  const text = String(display || "");
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
    script.onerror = () => reject(new Error("曲风分类法加载失败"));
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
    container.textContent = "未能得出曲风占比。";
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
  node.querySelector(".track-card-name small").textContent = (track.artists || []).join(" / ") || "未知艺人";
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

// Localize a single genre or style token via the taxonomy translations.
function localizeToken(token, kind) {
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
          label: localizeToken(style, "style"),
          percent: sum / grand * 100
        }))
        .sort((a, b) => b.percent - a.percent)
    }))
    .sort((a, b) => b.percent - a.percent);
  genres.forEach((g, index) => { g.color = MIX_COLORS[index % MIX_COLORS.length]; });
  return genres;
}

function renderAggregate(compositions) {
  const genres = buildTwoLevel(compositions);
  renderSunburst(genres);
  renderMosaic(genres);
  genreTwoLevel.hidden = genres.length === 0;
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
    gPath.dataset.desc = `流派 · ${Math.round(genre.percent)}%`;
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
  sunburstDefault.desc = `主导 ${Math.round(top.percent)}%`;
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

      // A tall, narrow block can't fit a horizontal "name  %" row, so switch to
      // a vertical label (text runs top-to-bottom) when the block is clearly
      // portrait and too skinny for horizontal text.
      const isVertical = bh >= bw * 1.6 && bw < 60 && bh >= 60;
      if (isVertical) {
        block.classList.add("is-vertical");
        const name = document.createElement("span");
        name.className = "mb-name";
        name.textContent = style.label;
        const pct = document.createElement("b");
        pct.className = "mb-pct";
        pct.textContent = `${Math.round(style.percent)}%`;
        block.appendChild(name);
        block.appendChild(pct);
      } else if (bw >= 44 && bh >= 24) {
        const name = document.createElement("span");
        name.className = "mb-name";
        name.textContent = style.label;
        // Let a horizontal name wrap onto as many lines as the block height
        // allows, instead of truncating with an ellipsis on a single line.
        const lines = Math.max(1, Math.floor((bh - 10) / 14));
        name.style.setProperty("--mb-lines", String(lines));
        const pct = document.createElement("b");
        pct.className = "mb-pct";
        pct.textContent = `${Math.round(style.percent)}%`;
        block.appendChild(name);
        block.appendChild(pct);
      } else if (bw >= 28 && bh >= 15) {
        const pct = document.createElement("b");
        pct.className = "mb-pct mb-pct-solo";
        pct.textContent = `${Math.round(style.percent)}%`;
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

// ---------------------------------------------------------------------------
// Single-track analysis pipeline
// ---------------------------------------------------------------------------
async function analyzeTrack(track, card) {
  const trackForScore = { title: track.title, artists: (track.artists || []).join(" / ") };

  setCardStatus(card, "下载音频…", "busy");
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
    setCardStatus(card, "音频未找到", "fail");
    card.body.textContent = `无法获取音频：${error.message}`;
    return null;
  }

  setCardStatus(card, "Essentia 分析…", "busy");
  let essentia;
  try {
    essentia = await postJson("/api/essentia", { fileName: download.fileName, top: 12, model: activeModel });
  } catch (error) {
    setCardStatus(card, "分析失败", "fail");
    card.body.textContent = `Essentia 分析失败：${error.message}`;
    return null;
  }

  setCardStatus(card, "查询曲风标签…", "busy");
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
    logLine(`${track.title}：曲风标签查询失败（${error.message}），仅用音频分析`);
  }

  const composition = window.GenreCore.scoreTrack(taxonomyBundle, {
    essentia,
    metadata,
    track: trackForScore
  });

  if (!composition.length) {
    setCardStatus(card, "无结果", "fail");
    card.body.textContent = "音频分析未命中任何曲风。";
    return null;
  }

  setCardStatus(card, "完成", "done");
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
    setStatus("请输入歌单链接");
    return;
  }

  running = true;
  resetProgress();
  trackList.innerHTML = "";
  sunburstSvg.innerHTML = "";
  sunburstCenter.innerHTML = "";
  mosaicStage.innerHTML = "";
  genreTwoLevel.hidden = true;
  trackCount.textContent = "0 首";
  playlistMeta.textContent = "正在解析网易云歌单…";

  try {
    setStatus("解析歌单…", true);
    await loadModelTaxonomy(activeModel);
    setProgress("解析歌单", 4, "请求网易云歌单信息…");

    const playlist = await postJson("/api/netease-playlist", { url: raw });
    const tracks = playlist.tracks || [];
    playlistMeta.textContent = `${playlist.name || "网易云歌单"} · 共 ${tracks.length} 首歌曲，逐曲分析中…`;
    trackCount.textContent = `${tracks.length} 首`;
    parsedLine.textContent = `歌单「${playlist.name}」共 ${tracks.length} 首，开始逐曲分析`;
    setProgress("解析歌单", 8, `歌单「${playlist.name}」共 ${tracks.length} 首`);

    if (!tracks.length) {
      setStatus("歌单为空");
      playlistMeta.textContent = "该歌单没有可分析的曲目。";
      return;
    }

    const cards = tracks.map((track, index) => createTrackCard(track, index));
    const compositions = [];
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      const card = cards[i];
      const pct = 8 + Math.round(((i + 0.5) / tracks.length) * 90);
      setStatus(`分析中 ${i + 1}/${tracks.length}`, true);
      setProgress(`分析第 ${i + 1}/${tracks.length} 首`, pct, `${track.title} - ${(track.artists || []).join(" / ")}`);
      const composition = await analyzeTrack(track, card);
      compositions.push(composition);
      renderAggregate(compositions);
    }

    const ok = compositions.filter(Boolean).length;
    setProgress("分析完成", 100, `成功分析 ${ok}/${tracks.length} 首`);
    setStatus(`完成 ${ok}/${tracks.length}`);
    playlistMeta.textContent = `${playlist.name || "网易云歌单"} · 共 ${tracks.length} 首，成功分析 ${ok} 首`;
  } catch (error) {
    setStatus("出错了");
    playlistMeta.textContent = `分析失败：${error.message}`;
    logLine(`错误：${error.message}`);
  } finally {
    running = false;
    analyzeBtn.disabled = false;
  }
});

initModelSelector();
