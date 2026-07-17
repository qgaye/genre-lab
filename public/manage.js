const statusPill = document.querySelector("#statusPill");
const jobList = document.querySelector("#jobList");
const emptyState = document.querySelector("#emptyState");
const jobCountHead = document.querySelector("#jobCountHead");
const jobCount = document.querySelector("#jobCount");
const refreshBtn = document.querySelector("#refreshBtn");
const jobCardTemplate = document.querySelector("#jobCardTemplate");
const pagination = document.querySelector("#pagination");
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const pageInfo = document.querySelector("#pageInfo");

const PAGE_SIZE = 20;
let currentPage = 1;
let paginationData = null;

const STATE_LABELS = {
  running: { text: "分析中", className: "is-busy" },
  done: { text: "已完成", className: "is-done" },
  error: { text: "出错", className: "is-fail" }
};

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getStateLabel(state) {
  return STATE_LABELS[state] || { text: state || "未知", className: "" };
}

async function loadJobs(page = 1) {
  statusPill.textContent = "加载中";
  refreshBtn.disabled = true;

  try {
    const resp = await fetch(`/api/playlist-jobs?page=${page}&pageSize=${PAGE_SIZE}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    paginationData = data.pagination;
    currentPage = data.pagination.page;
    renderJobs(data.jobs || []);
    renderPagination(data.pagination);
    statusPill.textContent = "已加载";
  } catch (error) {
    statusPill.textContent = "加载失败";
    console.error("加载任务列表失败:", error);
  } finally {
    refreshBtn.disabled = false;
  }
}

function renderJobs(jobs) {
  jobList.innerHTML = "";

  if (!jobs.length && paginationData && paginationData.page === 1) {
    jobList.appendChild(emptyState);
    pagination.style.display = "none";
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

    const nameEl = card.querySelector(".job-card-name");
    nameEl.textContent = job.name || "未命名歌单";

    const statusEl = card.querySelector(".job-status");
    const stateInfo = getStateLabel(job.state);
    statusEl.textContent = stateInfo.text;
    if (stateInfo.className) statusEl.classList.add(stateInfo.className);

    const creatorEl = card.querySelector(".job-card-creator");
    creatorEl.textContent = job.creator ? `by ${job.creator}` : "";

    const timeEl = card.querySelector(".job-card-time");
    timeEl.textContent = formatTime(job.createdAt);

    const progressBar = card.querySelector(".job-progress-bar span");
    const progressText = card.querySelector(".job-progress-text");
    const total = job.total || 0;
    const completed = job.completed || 0;
    const ok = job.ok || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${completed}/${total} 首 · 成功 ${ok} 首`;

    const idEl = card.querySelector(".job-card-id");
    idEl.textContent = `ID: ${job.jobId}`;

    jobList.appendChild(card);
  }
}

function renderPagination(pag) {
  jobCountHead.textContent = `${pag.total} 个任务`;
  jobCount.textContent = `共 ${pag.total} 个任务 · 第 ${pag.page}/${pag.totalPages} 页`;

  if (pag.total <= PAGE_SIZE) {
    pagination.style.display = "none";
    return;
  }

  pagination.style.display = "flex";
  pageInfo.textContent = `第 ${pag.page} / ${pag.totalPages} 页`;
  prevBtn.disabled = !pag.hasPrev;
  nextBtn.disabled = !pag.hasNext;
}

refreshBtn.addEventListener("click", () => loadJobs(1));
prevBtn.addEventListener("click", () => {
  if (paginationData && paginationData.hasPrev) {
    loadJobs(currentPage - 1);
  }
});
nextBtn.addEventListener("click", () => {
  if (paginationData && paginationData.hasNext) {
    loadJobs(currentPage + 1);
  }
});

loadJobs();
