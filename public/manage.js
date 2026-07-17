const statusPill = document.querySelector("#statusPill");
const jobList = document.querySelector("#jobList");
const emptyState = document.querySelector("#emptyState");
const emptyMessage = document.querySelector("#emptyMessage");
const emptyAction = document.querySelector("#emptyAction");
const listTitle = document.querySelector("#listTitle");
const manageIntro = document.querySelector("#manageIntro");
const jobCountHead = document.querySelector("#jobCountHead");
const jobCount = document.querySelector("#jobCount");
const refreshBtn = document.querySelector("#refreshBtn");
const jobCardTemplate = document.querySelector("#jobCardTemplate");
const songCardTemplate = document.querySelector("#songCardTemplate");
const pagination = document.querySelector("#pagination");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const pageInfo = document.querySelector("#pageInfo");
const playlistTabCount = document.querySelector("#playlistTabCount");
const songTabCount = document.querySelector("#songTabCount");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");

const PAGE_SIZE = 20;
let currentPage = 1;
let paginationData = null;
let songQuery = "";
let activeView = new URLSearchParams(location.search).get("view") === "songs" ? "songs" : "playlists";

const STATE_LABELS = {
  running: { text: "分析中", className: "is-busy" },
  done: { text: "已完成", className: "is-done" },
  error: { text: "出错", className: "is-fail" },
  unknown: { text: "已记录", className: "" }
};

function formatTime(timestamp) {
  if (!timestamp) return "时间未知";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs >= 0 && diffMins < 1) return "刚刚";
  if (diffMs >= 0 && diffMins < 60) return `${diffMins} 分钟前`;
  if (diffMs >= 0 && diffHours < 24) return `${diffHours} 小时前`;
  if (diffMs >= 0 && diffDays < 7) return `${diffDays} 天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)} 秒`;
}

function getStateLabel(state) {
  return STATE_LABELS[state] || { text: state || "未知", className: "" };
}

function setView(view, { updateUrl = true } = {}) {
  activeView = view === "songs" ? "songs" : "playlists";
  currentPage = 1;
  paginationData = null;
  for (const tab of document.querySelectorAll(".manage-tab")) {
    const selected = tab.dataset.view === activeView;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  const isSongs = activeView === "songs";
  searchForm.hidden = !isSongs;
  listTitle.textContent = isSongs ? "单曲分析记录" : "分析任务列表";
  manageIntro.textContent = isSongs
    ? "单曲记录来自 .runtime/analysis-log.ndjson。展开卡片可查看模型、耗时、来源与曲风结果。"
    : "查看所有历史歌单分析任务，点击可跳转至对应的歌单分析页面。";
  if (updateUrl) {
    const url = new URL(location.href);
    if (isSongs) url.searchParams.set("view", "songs");
    else url.searchParams.delete("view");
    history.replaceState(null, "", url);
  }
  loadCurrentView(1);
}

async function loadCurrentView(page = 1) {
  statusPill.textContent = "加载中";
  refreshBtn.disabled = true;
  try {
    if (activeView === "songs") await loadSongs(page);
    else await loadJobs(page);
    statusPill.textContent = "已加载";
  } catch (error) {
    statusPill.textContent = "加载失败";
    renderLoadError(error);
    console.error("加载管理列表失败:", error);
  } finally {
    refreshBtn.disabled = false;
  }
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function loadJobs(page) {
  const data = await fetchJson(`/api/playlist-jobs?page=${page}&pageSize=${PAGE_SIZE}`);
  paginationData = data.pagination;
  currentPage = data.pagination.page;
  playlistTabCount.textContent = data.pagination.total;
  renderJobs(data.jobs || []);
  renderPagination(data.pagination, "任务");
}

async function loadSongs(page) {
  const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
  if (songQuery) params.set("q", songQuery);
  const data = await fetchJson(`/api/analysis-logs?${params}`);
  paginationData = data.pagination;
  currentPage = data.pagination.page;
  songTabCount.textContent = data.allTotal;
  renderSongs(data.songs || [], data.pagination);
  renderPagination(data.pagination, "条记录");
}

function renderLoadError(error) {
  jobList.innerHTML = "";
  emptyMessage.textContent = `列表加载失败：${error.message}`;
  emptyAction.hidden = true;
  jobList.appendChild(emptyState);
  pagination.style.display = "none";
  jobCountHead.textContent = "加载失败";
  jobCount.textContent = "";
}

function renderEmpty(message, href, actionLabel) {
  jobList.innerHTML = "";
  emptyMessage.textContent = message;
  emptyAction.hidden = !href;
  if (href) {
    emptyAction.href = href;
    emptyAction.textContent = actionLabel;
  }
  jobList.appendChild(emptyState);
  pagination.style.display = "none";
}

function renderJobs(jobs) {
  jobList.className = "job-list";
  jobList.innerHTML = "";
  if (!jobs.length) {
    renderEmpty("暂无歌单分析任务", "/playlist", "去分析歌单");
    return;
  }

  for (const job of jobs) {
    const card = jobCardTemplate.content.firstElementChild.cloneNode(true);
    card.href = `/playlist?job=${encodeURIComponent(job.jobId)}`;

    const coverImg = card.querySelector(".job-card-cover img");
    if (job.coverImgUrl) {
      coverImg.src = job.coverImgUrl;
      coverImg.alt = job.name || "歌单封面";
    } else {
      coverImg.alt = "无封面";
      card.querySelector(".job-card-cover").classList.add("no-cover");
    }

    card.querySelector(".job-card-name").textContent = job.name || "未命名歌单";
    const statusEl = card.querySelector(".job-status");
    const stateInfo = getStateLabel(job.state);
    statusEl.textContent = stateInfo.text;
    if (stateInfo.className) statusEl.classList.add(stateInfo.className);
    card.querySelector(".job-card-creator").textContent = job.creator ? `by ${job.creator}` : "";
    card.querySelector(".job-card-time").textContent = formatTime(job.createdAt);

    const total = job.total || 0;
    const completed = job.completed || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    card.querySelector(".job-progress-bar span").style.width = `${pct}%`;
    card.querySelector(".job-progress-text").textContent = `${completed}/${total} 首 · 成功 ${job.ok || 0} 首`;
    card.querySelector(".job-card-id").textContent = `ID: ${job.jobId}`;
    jobList.appendChild(card);
  }
}

function addDetail(list, label, value) {
  if (value === "" || value == null) return;
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  list.append(dt, dd);
}

function renderSongs(songs, pag) {
  jobList.className = "job-list song-log-list";
  jobList.innerHTML = "";
  if (!songs.length) {
    renderEmpty(songQuery ? `没有找到与“${songQuery}”匹配的单曲记录` : "暂无单曲分析记录", "/index", "去分析单曲");
    return;
  }

  songs.forEach((song, index) => {
    const card = songCardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".song-log-index").textContent = String((pag.page - 1) * pag.pageSize + index + 1).padStart(2, "0");
    card.querySelector(".song-log-eyebrow").textContent = [song.inputFormat, song.sourceId ? `#${song.sourceId}` : ""].filter(Boolean).join(" · ") || "单曲分析";
    card.querySelector(".song-log-title").textContent = song.title || "未识别歌曲";
    card.querySelector(".song-log-artist").textContent = song.artists || "未知艺人";

    const statusEl = card.querySelector(".song-log-status");
    const stateInfo = getStateLabel(song.status);
    statusEl.textContent = stateInfo.text;
    if (stateInfo.className) statusEl.classList.add(stateInfo.className);

    const album = card.querySelector(".song-log-album");
    album.textContent = song.album ? `专辑 / ${song.album}` : "专辑 / —";
    card.querySelector(".song-log-model").textContent = song.model ? `模型 / ${song.model}` : "模型 / —";
    const time = card.querySelector(".song-log-time");
    time.textContent = formatTime(song.timePoint);
    if (song.timePoint) time.dateTime = song.timePoint;

    const genreBox = card.querySelector(".song-log-genres");
    for (const genre of song.genres || []) {
      const chip = document.createElement("span");
      chip.textContent = genre.percent == null ? genre.name : `${genre.name} ${genre.percent}%`;
      genreBox.appendChild(chip);
    }
    if (!genreBox.childElementCount && song.predictions && song.predictions[0]) {
      const chip = document.createElement("span");
      chip.textContent = song.predictions[0].display;
      genreBox.appendChild(chip);
    }

    const details = card.querySelector(".song-detail-grid");
    addDetail(details, "歌曲", song.title || "未识别");
    addDetail(details, "艺人", song.artists || "未知");
    addDetail(details, "专辑", song.album || "未知");
    addDetail(details, "来源 ID", song.sourceId || "—");
    addDetail(details, "输入类型", song.inputFormat || "—");
    addDetail(details, "曲风模型", song.model || "—");
    addDetail(details, "音频来源", song.audioSource || "—");
    addDetail(details, "音频处理", formatDuration(song.audioElapsedSeconds));
    addDetail(details, "模型分析", formatDuration(song.essentiaElapsedSeconds));
    addDetail(details, "候选数量", `${song.predictionCount || 0} 项`);
    const deviceLabel = [song.device && song.device.os, song.device && song.device.browser, song.device && song.device.formFactor]
      .filter(Boolean).join(" / ");
    addDetail(details, "分析设备", deviceLabel || "—");

    const predictionBox = card.querySelector(".song-predictions");
    const predictionList = predictionBox.querySelector("ol");
    for (const prediction of song.predictions || []) {
      const item = document.createElement("li");
      const score = prediction.score == null ? "" : ` ${Math.round(prediction.score * 100)}%`;
      item.textContent = `${prediction.display}${score}`;
      predictionList.appendChild(item);
    }
    predictionBox.hidden = !predictionList.childElementCount;

    const error = card.querySelector(".song-log-error");
    if (song.error) {
      error.textContent = `错误：${song.error}`;
      error.hidden = false;
    }
    const sourceLink = card.querySelector(".song-source-link");
    if (song.sourceUrl) {
      sourceLink.href = song.sourceUrl;
      sourceLink.hidden = false;
    }
    jobList.appendChild(card);
  });
}

function renderPagination(pag, unit) {
  const suffix = unit === "任务" ? `个${unit}` : unit;
  jobCountHead.textContent = `${pag.total} ${suffix}`;
  jobCount.textContent = `共 ${pag.total} ${suffix} · 第 ${pag.page}/${pag.totalPages} 页`;
  if (pag.total <= PAGE_SIZE) {
    pagination.style.display = "none";
    return;
  }
  pagination.style.display = "flex";
  pageInfo.textContent = `第 ${pag.page} / ${pag.totalPages} 页`;
  prevBtn.disabled = !pag.hasPrev;
  nextBtn.disabled = !pag.hasNext;
}

for (const tab of document.querySelectorAll(".manage-tab")) {
  tab.addEventListener("click", () => {
    if (tab.dataset.view !== activeView) setView(tab.dataset.view);
  });
}
refreshBtn.addEventListener("click", () => loadCurrentView(1));
searchForm.addEventListener("submit", event => {
  event.preventDefault();
  songQuery = searchInput.value.trim();
  loadCurrentView(1);
});
prevBtn.addEventListener("click", () => {
  if (paginationData && paginationData.hasPrev) loadCurrentView(currentPage - 1);
});
nextBtn.addEventListener("click", () => {
  if (paginationData && paginationData.hasNext) loadCurrentView(currentPage + 1);
});

setView(activeView, { updateUrl: false });
