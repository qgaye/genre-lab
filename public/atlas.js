(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.querySelector("#atlasSvg");
  const viewport = document.querySelector("#atlasViewport");
  const stage = document.querySelector("#atlasStage");
  const emptyState = document.querySelector("#atlasEmpty");
  const modelSelect = document.querySelector("#atlasModelSelect");
  const searchInput = document.querySelector("#atlasSearch");
  const searchOptions = document.querySelector("#atlasSearchOptions");
  const resetButton = document.querySelector("#atlasReset");
  const zoomReadout = document.querySelector("#atlasZoomReadout");
  const captionTitle = document.querySelector("#atlasCaptionTitle");
  const captionNote = document.querySelector("#atlasCaptionNote");
  const inspectorKicker = document.querySelector("#atlasInspectorKicker");
  const inspectorTitle = document.querySelector("#atlasInspectorTitle");
  const inspectorCopy = document.querySelector("#atlasInspectorCopy");
  const facts = document.querySelector("#atlasFacts");
  const genreCount = document.querySelector("#atlasGenreCount");
  const styleCount = document.querySelector("#atlasStyleCount");
  const bridgeCount = document.querySelector("#atlasBridgeCount");
  const relationsPanel = document.querySelector("#atlasRelations");
  const sourceLabel = document.querySelector("#atlasSource");

  let taxonomy = window.DISCOGS_TAXONOMY || { genres: [] };
  let graph = null;
  let selected = null;
  let activeModel = "";
  let transform = { x: 0, y: 0, k: 1 };
  let pointerState = null;

  const profiles = Array.isArray(window.DISCOGS_STYLE_PROFILES && window.DISCOGS_STYLE_PROFILES.profiles)
    ? window.DISCOGS_STYLE_PROFILES.profiles
    : [];
  const profileByKey = new Map(profiles.map(profile => [`${profile.genre}\u0000${profile.style}`, profile]));

  const PALETTE = ["blue", "pink", "teal", "amber"];

  function el(name, attrs = {}, text = "") {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text) node.textContent = text;
    return node;
  }

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function slug(value) {
    return String(value || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function nodeKey(type, name, parent = "") {
    return `${type}:${parent ? `${parent}:` : ""}${name}`;
  }

  function buildGraph(data) {
    const genres = (data.genres || []).map((genre, index) => ({
      name: genre.name,
      styles: [...new Set(genre.styles || [])],
      index
    }));
    const styleOwners = new Map();
    genres.forEach(genre => {
      genre.styles.forEach(style => {
        if (!styleOwners.has(style)) styleOwners.set(style, []);
        styleOwners.get(style).push(genre.name);
      });
    });
    const bridges = [...styleOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([style, owners]) => ({ style, owners }));
    const neighbors = new Map(genres.map(genre => [genre.name, new Map()]));
    bridges.forEach(bridge => {
      bridge.owners.forEach((from, index) => {
        bridge.owners.slice(index + 1).forEach(to => {
          if (!neighbors.get(from).has(to)) neighbors.get(from).set(to, []);
          if (!neighbors.get(to).has(from)) neighbors.get(to).set(from, []);
          neighbors.get(from).get(to).push(bridge.style);
          neighbors.get(to).get(from).push(bridge.style);
        });
      });
    });
    return { genres, styleOwners, bridges, neighbors };
  }

  function setTransform(next = transform) {
    transform = next;
    viewport.setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.k})`);
    zoomReadout.textContent = `${Math.round(transform.k * 100)}%`;
  }

  function resetTransform() {
    setTransform({ x: 0, y: 0, k: 1 });
  }

  function clearSvg() {
    while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
  }

  function paletteFor(index) {
    return PALETTE[index % PALETTE.length];
  }

  function addNode({ type, name, parent = "", x, y, radius, color = "blue", label = name, dense = false }) {
    const key = nodeKey(type, name, parent);
    const group = el("g", {
      class: `atlas-node atlas-node-${type} ink-${color}${dense ? " is-dense" : ""}`,
      transform: `translate(${x} ${y})`,
      "data-node-key": key,
      "data-node-type": type,
      "data-node-name": name,
      "data-node-parent": parent,
      role: "button",
      tabindex: "0",
      "aria-label": `${type === "genre" ? "主曲风" : "Style"}：${name}`
    });
    const title = el("title", {}, parent ? `${parent} / ${name}` : name);
    group.appendChild(title);
    if (type === "genre") {
      group.appendChild(el("circle", { class: "atlas-node-halo", r: radius + 12 }));
      group.appendChild(el("circle", { class: "atlas-node-core", r: radius, filter: "url(#atlasRough)" }));
      group.appendChild(el("circle", { class: "atlas-node-print", r: Math.max(5, radius - 5), fill: "url(#atlasDots)" }));
    } else {
      const size = radius * 1.45;
      group.appendChild(el("rect", {
        class: "atlas-node-core",
        x: -size / 2,
        y: -size / 2,
        width: size,
        height: size,
        transform: "rotate(45)",
        filter: "url(#atlasRough)"
      }));
    }
    const text = el("text", {
      class: "atlas-node-label",
      x: 0,
      y: type === "genre" ? radius + 25 : radius + 18,
      "text-anchor": "middle"
    }, label);
    group.appendChild(text);
    group.addEventListener("click", event => {
      event.stopPropagation();
      selectNode({ type, name, parent });
    });
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNode({ type, name, parent });
      }
    });
    viewport.appendChild(group);
    return group;
  }

  function addEdge(from, to, attrs = {}) {
    const line = el("line", {
      class: `atlas-edge ${attrs.className || ""}`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      "data-edge-from": attrs.from || "",
      "data-edge-to": attrs.to || "",
      "data-bridge": attrs.bridge || ""
    });
    viewport.appendChild(line);
    return line;
  }

  function galaxyLayout() {
    const connected = graph.genres.filter(genre => graph.neighbors.get(genre.name).size > 0);
    const isolated = graph.genres.filter(genre => graph.neighbors.get(genre.name).size === 0);
    connected.sort((a, b) => graph.neighbors.get(b.name).size - graph.neighbors.get(a.name).size || a.index - b.index);
    const positions = new Map();
    const center = { x: 600, y: 370 };
    connected.forEach((genre, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, connected.length)) * Math.PI * 2;
      positions.set(genre.name, {
        x: center.x + Math.cos(angle) * 330,
        y: center.y + Math.sin(angle) * 245
      });
    });
    isolated.forEach((genre, index) => {
      const angle = Math.PI * 0.08 + (index / Math.max(1, isolated.length - 1)) * Math.PI * 0.84;
      positions.set(genre.name, {
        x: center.x + Math.cos(angle) * 510,
        y: center.y + Math.sin(angle) * 330
      });
    });
    return positions;
  }

  function renderGalaxy() {
    clearSvg();
    const positions = galaxyLayout();
    const bridgeGroups = new Map();
    graph.bridges.forEach(bridge => {
      const pair = [...bridge.owners].sort().join("\u0000");
      if (!bridgeGroups.has(pair)) bridgeGroups.set(pair, []);
      bridgeGroups.get(pair).push(bridge);
    });
    const bridgePositions = new Map();
    bridgeGroups.forEach((bridges, pair) => {
      const owners = pair.split("\u0000");
      const a = positions.get(owners[0]);
      const b = positions.get(owners[1]);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      bridges.forEach((bridge, index) => {
        const offset = (index - (bridges.length - 1) / 2) * 28;
        bridgePositions.set(bridge.style, {
          x: (a.x + b.x) / 2 + (-dy / length) * offset,
          y: (a.y + b.y) / 2 + (dx / length) * offset
        });
      });
    });

    const edgesLayer = el("g", { class: "atlas-edges-layer" });
    viewport.appendChild(edgesLayer);
    graph.bridges.forEach(bridge => {
      const bridgePosition = bridgePositions.get(bridge.style);
      if (!bridgePosition) return;
      bridge.owners.forEach(owner => {
        const genrePosition = positions.get(owner);
        const line = el("line", {
          class: "atlas-edge",
          x1: genrePosition.x,
          y1: genrePosition.y,
          x2: bridgePosition.x,
          y2: bridgePosition.y,
          "data-edge-from": nodeKey("genre", owner),
          "data-edge-to": nodeKey("bridge", bridge.style),
          "data-bridge": bridge.style
        });
        edgesLayer.appendChild(line);
      });
    });

    graph.genres.forEach((genre, index) => {
      const position = positions.get(genre.name);
      const radius = 24 + Math.min(24, Math.sqrt(genre.styles.length) * 2.1);
      addNode({ type: "genre", name: genre.name, x: position.x, y: position.y, radius, color: paletteFor(index) });
      const count = el("text", {
        class: "atlas-node-count",
        x: position.x,
        y: position.y + 4,
        "text-anchor": "middle",
        "pointer-events": "none"
      }, String(genre.styles.length));
      viewport.appendChild(count);
    });
    graph.bridges.forEach((bridge, index) => {
      const position = bridgePositions.get(bridge.style);
      if (!position) return;
      addNode({
        type: "bridge",
        name: bridge.style,
        x: position.x,
        y: position.y,
        radius: 9,
        color: paletteFor(index + 1),
        dense: graph.bridges.length > 12
      });
    });
    applySelection();
  }

  function render() {
    emptyState.hidden = Boolean(graph && graph.genres.length);
    svg.hidden = !graph || !graph.genres.length;
    if (!graph || !graph.genres.length) return;
    renderGalaxy();
    captionTitle.textContent = "关系星云";
    captionNote.textContent = "连线表示两个 Genre 在当前模型中拥有同名 Style";
  }

  function selectNode(next) {
    selected = next;
    updateInspector();
    applySelection();
  }

  function connectedKeys(selection) {
    const keys = new Set([nodeKey(selection.type, selection.name, selection.parent)]);
    if (selection.type === "genre") {
      graph.bridges.filter(bridge => bridge.owners.includes(selection.name)).forEach(bridge => {
        keys.add(nodeKey("bridge", bridge.style));
        bridge.owners.forEach(owner => keys.add(nodeKey("genre", owner)));
      });
    } else if (selection.type === "bridge") {
      const bridge = graph.bridges.find(item => item.style === selection.name);
      (bridge ? bridge.owners : []).forEach(owner => keys.add(nodeKey("genre", owner)));
    }
    return keys;
  }

  function applySelection() {
    const nodes = [...viewport.querySelectorAll(".atlas-node")];
    const edges = [...viewport.querySelectorAll(".atlas-edge")];
    if (!selected) {
      nodes.forEach(node => node.classList.remove("is-selected", "is-neighbor", "is-dimmed"));
      edges.forEach(edge => edge.classList.remove("is-active", "is-dimmed"));
      return;
    }
    const selectedKey = nodeKey(selected.type, selected.name, selected.parent);
    const related = connectedKeys(selected);
    nodes.forEach(node => {
      const key = node.dataset.nodeKey;
      node.classList.toggle("is-selected", key === selectedKey);
      node.classList.toggle("is-neighbor", key !== selectedKey && related.has(key));
      node.classList.toggle("is-dimmed", !related.has(key));
    });
    edges.forEach(edge => {
      const active = related.has(edge.dataset.edgeFrom) && related.has(edge.dataset.edgeTo);
      edge.classList.toggle("is-active", active);
      edge.classList.toggle("is-dimmed", !active);
    });
  }

  function relationButton(label, kind, name, parent = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "atlas-relation-chip";
    button.textContent = label;
    button.addEventListener("click", () => selectNode({ type: kind, name, parent }));
    return button;
  }

  function updateInspector() {
    if (!selected) {
      renderOverviewInspector();
      return;
    }
    relationsPanel.replaceChildren();
    facts.hidden = true;
    if (selected.type === "genre") {
      const genre = graph.genres.find(item => item.name === selected.name);
      const neighbors = graph.neighbors.get(selected.name) || new Map();
      inspectorKicker.textContent = "Genre / 主曲风";
      inspectorTitle.textContent = selected.name;
      inspectorCopy.textContent = `${genre.styles.length} 个 Style 被归入这个主曲风；${neighbors.size ? `通过 ${[...neighbors.values()].flat().length} 个共享 Style 与 ${neighbors.size} 个主曲风相连。` : "当前 taxonomy 中没有与其他主曲风重复的同名 Style。"}`;
      if (neighbors.size) {
        const heading = document.createElement("h3");
        heading.textContent = "共享风格连接";
        relationsPanel.appendChild(heading);
        neighbors.forEach((styles, neighbor) => {
          const row = document.createElement("div");
          row.className = "atlas-relation-row";
          row.appendChild(relationButton(neighbor, "genre", neighbor));
          const detail = document.createElement("span");
          detail.textContent = styles.join(" · ");
          row.appendChild(detail);
          relationsPanel.appendChild(row);
        });
      }
      return;
    }

    const owners = (graph.bridges.find(item => item.style === selected.name) || { owners: [] }).owners;
    const profile = profileByKey.get(`${owners[0]}\u0000${selected.name}`);
    inspectorKicker.textContent = "Bridge Style / 共享节点";
    inspectorTitle.textContent = selected.name;
    inspectorCopy.textContent = profile && profile.overview
      ? profile.overview
      : `这个 Style 同时出现在 ${owners.join("、")} 下，因此成为它们之间的可验证连接。`;
    const heading = document.createElement("h3");
    heading.textContent = "连接的主曲风";
    relationsPanel.appendChild(heading);
    const chips = document.createElement("div");
    chips.className = "atlas-chip-list";
    owners.forEach(owner => chips.appendChild(relationButton(owner, "genre", owner)));
    relationsPanel.appendChild(chips);
    if (profile && profile.mainstreamEntry) {
      const entry = document.createElement("p");
      entry.className = "atlas-listen-entry";
      entry.innerHTML = `<span>入门聆听</span><strong>${escapeHtml(profile.mainstreamEntry.artist)} — ${escapeHtml(profile.mainstreamEntry.title)}</strong>`;
      relationsPanel.appendChild(entry);
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
    })[char]);
  }

  function renderOverviewInspector() {
    facts.hidden = false;
    inspectorKicker.textContent = "Atlas index";
    inspectorTitle.textContent = "选择一颗星";
    inspectorCopy.textContent = "点击主曲风或共享 Style，查看它在分类体系里的位置与连接。图中关系来自当前模型 taxonomy，不表示音乐史上的直接影响。";
    genreCount.textContent = graph ? graph.genres.length : "—";
    styleCount.textContent = graph ? graph.styleOwners.size : "—";
    bridgeCount.textContent = graph ? graph.bridges.length : "—";
    relationsPanel.replaceChildren();
  }

  function rebuildSearchOptions() {
    searchOptions.replaceChildren();
    const values = new Set();
    graph.genres.forEach(genre => values.add(genre.name));
    graph.bridges.forEach(bridge => values.add(bridge.style));
    [...values].sort((a, b) => a.localeCompare(b)).forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      searchOptions.appendChild(option);
    });
  }

  function runSearch() {
    const query = normalize(searchInput.value);
    if (!query) return;
    const genre = graph.genres.find(item => normalize(item.name) === query)
      || graph.genres.find(item => normalize(item.name).includes(query));
    if (genre) {
      selectNode({ type: "genre", name: genre.name });
      return;
    }
    const bridgeNames = graph.bridges.map(bridge => bridge.style);
    const exactStyle = bridgeNames.find(style => normalize(style) === query);
    const style = exactStyle || bridgeNames.find(item => normalize(item).includes(query));
    if (!style) {
      inspectorKicker.textContent = "No match";
      inspectorTitle.textContent = "没有找到这个曲风";
      inspectorCopy.textContent = "试试英文 Genre 或共享 Style 名称，例如 Rock、Disco、Trip Hop。";
      return;
    }
    selectNode({ type: "bridge", name: style });
  }

  function installTaxonomy(nextTaxonomy) {
    taxonomy = nextTaxonomy || { genres: [] };
    graph = buildGraph(taxonomy);
    selected = null;
    sourceLabel.textContent = `${taxonomy.name || "Discogs taxonomy"} · ${taxonomy.model || activeModel}`;
    rebuildSearchOptions();
    renderOverviewInspector();
    resetTransform();
    render();
  }

  function loadTaxonomy(model) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `/discogs-taxonomy.js?model=${encodeURIComponent(model)}&v=${Date.now()}`;
      script.onload = () => {
        script.remove();
        resolve(window.DISCOGS_TAXONOMY);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("曲风分类数据加载失败"));
      };
      document.head.appendChild(script);
    });
  }

  async function initModels() {
    try {
      const response = await fetch("/api/models");
      if (!response.ok) throw new Error("models unavailable");
      const config = await response.json();
      const requested = new URLSearchParams(window.location.search).get("model");
      const modelKeys = (config.models || []).map(model => model.key);
      activeModel = modelKeys.includes(requested) ? requested : (config.default || modelKeys[0] || taxonomy.model || "");
      modelSelect.replaceChildren();
      (config.models || []).forEach(model => {
        const option = document.createElement("option");
        option.value = model.key;
        option.textContent = model.label;
        option.selected = model.key === activeModel;
        modelSelect.appendChild(option);
      });
      if (activeModel && taxonomy.model !== activeModel) taxonomy = await loadTaxonomy(activeModel);
    } catch {
      activeModel = taxonomy.model || "";
      const option = document.createElement("option");
      option.value = activeModel;
      option.textContent = activeModel || "当前模型";
      modelSelect.replaceChildren(option);
    }
    installTaxonomy(taxonomy);
  }

  resetButton.addEventListener("click", () => {
    selected = null;
    searchInput.value = "";
    resetTransform();
    renderOverviewInspector();
    applySelection();
  });
  searchInput.addEventListener("change", runSearch);
  searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  });
  modelSelect.addEventListener("change", async () => {
    const nextModel = modelSelect.value;
    modelSelect.disabled = true;
    try {
      const nextTaxonomy = await loadTaxonomy(nextModel);
      activeModel = nextModel;
      const url = new URL(window.location.href);
      url.searchParams.set("model", nextModel);
      history.replaceState(null, "", url);
      installTaxonomy(nextTaxonomy);
    } catch (error) {
      inspectorKicker.textContent = "Load error";
      inspectorTitle.textContent = "模型切换失败";
      inspectorCopy.textContent = error.message;
      modelSelect.value = activeModel;
    } finally {
      modelSelect.disabled = false;
    }
  });

  svg.addEventListener("pointerdown", event => {
    if (event.target.closest("[data-node-key]")) return;
    pointerState = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    svg.setPointerCapture(event.pointerId);
    stage.classList.add("is-panning");
  });
  svg.addEventListener("pointermove", event => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const rect = svg.getBoundingClientRect();
    setTransform({
      ...transform,
      x: pointerState.tx + (event.clientX - pointerState.x) * (1200 / rect.width),
      y: pointerState.ty + (event.clientY - pointerState.y) * (760 / rect.height)
    });
  });
  const endPan = event => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    pointerState = null;
    stage.classList.remove("is-panning");
  };
  svg.addEventListener("pointerup", endPan);
  svg.addEventListener("pointercancel", endPan);
  svg.addEventListener("wheel", event => {
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (1200 / rect.width);
    const py = (event.clientY - rect.top) * (760 / rect.height);
    const nextK = Math.min(2.8, Math.max(0.58, transform.k * Math.exp(-event.deltaY * 0.001)));
    const ratio = nextK / transform.k;
    setTransform({
      k: nextK,
      x: px - (px - transform.x) * ratio,
      y: py - (py - transform.y) * ratio
    });
  }, { passive: false });

  initModels();
})();
