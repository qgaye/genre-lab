(function () {
  const R = window.playlistRender;
  if (!R) {
    console.error("playlistRender not available");
    return;
  }
  const t = R.t;

  const shareTitle = document.getElementById("shareTitle");
  const shareError = document.getElementById("shareError");
  const shareErrorText = document.getElementById("shareErrorText");

  function showError(key) {
    if (shareErrorText) shareErrorText.textContent = t(key);
    if (shareError) shareError.hidden = false;
  }

  const url = new URL(window.location.href);
  let jobId = url.searchParams.get("job") || url.searchParams.get("jobId") || "";
  if (!jobId && window.location.pathname.startsWith("/share/")) {
    const m = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]+)/);
    if (m) jobId = m[1];
  }

  if (!jobId) {
    if (shareTitle) shareTitle.textContent = t("share.title");
    showError("share.notFound");
    return;
  }

  let pollTimer = null;
  let stopped = false;

  function applyResults(data) {
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    const results = Array.isArray(data.results) ? data.results : [];
    const compositions = [];
    const dimensionsList = [];
    for (const r of results) {
      if (!r || r.status !== "ok") continue;
      if (r.composition) compositions.push(r.composition);
      if (r.dimensions) dimensionsList.push(r.dimensions);
    }

    R.setJobState({
      jobId: data.jobId,
      name: data.name || "",
      total: data.total || 0,
      completed: data.completed || 0,
      ok: data.ok || 0,
      sampled: Boolean(data.sampled),
      originalCount: data.originalCount || data.total || 0,
      tracks
    });

    const name = data.name || t("share.title");
    if (shareTitle) shareTitle.textContent = name;
    document.title = `Genre Lab · ${name}`;

    const summary = {
      name,
      total: data.total || 0,
      ok: data.ok || 0,
      sampled: Boolean(data.sampled),
      originalCount: data.originalCount || data.total || 0
    };
    R.setLastSummary(summary);
    R.setShareMeta({ title: name, subtitle: "" });

    const done = data.state === "done" || data.state === "complete" || data.state === "finished";
    const failed = data.state === "failed" || data.state === "error";

    R.populatePlaylistMeta(
      name,
      data.total || 0,
      data.ok || 0,
      Boolean(data.sampled),
      data.originalCount || data.total || 0,
      data.inputUrl || ""
    );

    if (!done && !failed && data.state !== "processing" && compositions.length === 0) {
      // still pending
    }

    if (compositions.length || dimensionsList.length) {
      R.renderAggregate(compositions, dimensionsList);
    }

    if (failed) {
      if (!compositions.length) {
        showError("share.failed");
      }
      return true;
    }
    if (done) return true;
    return false;
  }

  async function fetchOnce() {
    try {
      const resp = await fetch(`/api/analyze-playlist/status?jobId=${encodeURIComponent(jobId)}`);
      if (resp.status === 404) {
        showError("share.notFound");
        stopped = true;
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const done = applyResults(data);
      if (done) stopped = true;
    } catch (error) {
      console.error("share fetch error:", error);
      showError("share.notFound");
      stopped = true;
    }
  }

  function poll() {
    if (stopped) return;
    fetchOnce().then(() => {
      if (stopped) return;
      pollTimer = setTimeout(poll, 5000);
    });
  }

  fetchOnce().then(() => {
    if (!stopped) poll();
  });

  window.addEventListener("beforeunload", () => {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
  });
})();
