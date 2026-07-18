(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.querySelector("#atlasSvg");
  const viewport = document.querySelector("#atlasViewport");
  const stage = document.querySelector("#atlasStage");
  const emptyState = document.querySelector("#atlasEmpty");
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
  const relationStatus = document.querySelector("#atlasRelationStatus");

  let taxonomy = window.DISCOGS_TAXONOMY || { genres: [] };
  let graph = null;
  let selected = null;
  let atlasScope = { type: "all", name: "", error: "" };
  let transform = { x: 0, y: 0, k: 1 };
  let pointerState = null;
  let nodeDragState = null;
  let nodePositions = new Map();
  let nodeElements = new Map();
  let incidentEdges = new Map();
  let highlightedNodes = [];
  let highlightedEdges = [];
  let pendingNodeMove = null;
  let nodeMoveFrame = 0;
  let transformFrame = 0;
  let relationData = { history: { edges: [] } };

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

  function splitGenreStyle(value) {
    const label = String(value || "");
    const separator = " / ";
    const index = label.lastIndexOf(separator);
    if (index === -1) return { genre: label.trim(), style: "" };
    return {
      genre: label.slice(0, index).trim(),
      style: label.slice(index + separator.length).trim()
    };
  }

  function playlistTaxonomy(baseTaxonomy, results) {
    const requested = new Map();
    for (const result of results || []) {
      if (!result || result.status !== "ok") continue;
      for (const item of result.composition || []) {
        const { genre, style } = splitGenreStyle(item.name);
        if (!genre) continue;
        if (!requested.has(genre)) requested.set(genre, new Set());
        if (style) requested.get(genre).add(style);
      }
    }
    const genres = (baseTaxonomy.genres || [])
      .filter(genre => requested.has(genre.name))
      .map(genre => {
        const styles = requested.get(genre.name);
        return {
          ...genre,
          styles: (genre.styles || []).filter(style => styles.has(style))
        };
      });
    return { ...baseTaxonomy, genres };
  }

  async function loadPlaylistScope(baseTaxonomy) {
    const jobId = new URLSearchParams(window.location.search).get("playlist");
    if (!jobId) return baseTaxonomy;
    atlasScope = { type: "playlist", name: "", error: "" };
    try {
      const response = await fetch(`/api/analyze-playlist/status?jobId=${encodeURIComponent(jobId)}&since=0`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "歌单分析结果不可用");
      atlasScope.name = data.name || "当前歌单";
      const filtered = playlistTaxonomy(baseTaxonomy, data.results);
      if (!filtered.genres.length) atlasScope.error = "当前歌单还没有可显示的曲风分析结果";
      return filtered;
    } catch (error) {
      atlasScope.error = error.message || "歌单分析结果不可用";
      return { ...baseTaxonomy, genres: [] };
    }
  }

  function slug(value) {
    return String(value || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function stableUnit(value, salt = 0) {
    let hash = (2166136261 ^ salt) >>> 0;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash / 4294967295;
  }

  function nodeKey(type, name, parent = "") {
    return `${type}:${parent ? `${parent}:` : ""}${name}`;
  }

  function genreLabelLines(label) {
    const preferred = {
      "Brass & Military": ["Brass &", "Military"],
      "Folk, World, & Country": ["Folk, World", "& Country"],
      "Funk / Soul": ["Funk /", "Soul"],
      "Stage & Screen": ["Stage &", "Screen"]
    };
    if (preferred[label]) return preferred[label];
    if (label.length <= 11) return [label];
    const words = label.split(/\s+/);
    const lines = [];
    words.forEach(word => {
      const current = lines[lines.length - 1];
      if (!current || (current.length + word.length + 1 > 11 && lines.length < 3)) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    });
    return lines;
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
    const styles = [...styleOwners.entries()].map(([style, owners]) => ({
      style,
      owners,
      shared: owners.length > 1
    }));
    const styleByName = new Map(styles.map(style => [style.style, style]));
    const stylesByGenre = new Map(genres.map(genre => [genre.name, []]));
    styles.forEach(style => style.owners.forEach(owner => stylesByGenre.get(owner).push(style)));
    const genreByName = new Map(genres.map(genre => [genre.name, genre]));
    const bridges = styles.filter(style => style.shared);
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
    return { genres, styles, styleOwners, styleByName, stylesByGenre, genreByName, bridges, neighbors };
  }

  function setTransform(next = transform) {
    transform = next;
    viewport.setAttribute("transform", `translate(${transform.x} ${transform.y}) scale(${transform.k})`);
    zoomReadout.textContent = `${Math.round(transform.k * 100)}%`;
  }

  function cancelTransformAnimation() {
    if (transformFrame) cancelAnimationFrame(transformFrame);
    transformFrame = 0;
  }

  function animateTransform(next, duration = 260) {
    cancelTransformAnimation();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTransform(next);
      return;
    }
    const from = { ...transform };
    const startedAt = performance.now();
    const step = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setTransform({
        x: from.x + (next.x - from.x) * eased,
        y: from.y + (next.y - from.y) * eased,
        k: from.k + (next.k - from.k) * eased
      });
      if (progress < 1) transformFrame = requestAnimationFrame(step);
      else transformFrame = 0;
    };
    transformFrame = requestAnimationFrame(step);
  }

  function resetTransform() {
    cancelTransformAnimation();
    setTransform({ x: 0, y: 0, k: 1 });
  }

  function focusNode(selection) {
    const key = nodeKey(selection.type, selection.name, selection.parent);
    const position = nodePositions.get(key);
    if (!position) return;
    const minimumZoom = selection.type === "genre" ? 1.18 : 1.55;
    const nextK = Math.min(2.8, Math.max(transform.k, minimumZoom));
    animateTransform({
      k: nextK,
      x: 600 - position.x * nextK,
      y: 370 - position.y * nextK
    });
  }

  function clearSvg() {
    nodeDragState = null;
    pendingNodeMove = null;
    if (nodeMoveFrame) cancelAnimationFrame(nodeMoveFrame);
    nodeMoveFrame = 0;
    nodeElements = new Map();
    incidentEdges = new Map();
    highlightedNodes = [];
    highlightedEdges = [];
    while (viewport.firstChild) viewport.removeChild(viewport.firstChild);
  }

  function paletteFor(index) {
    return PALETTE[index % PALETTE.length];
  }

  function clientToGraphPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const svgX = (clientX - rect.left) * (1200 / rect.width);
    const svgY = (clientY - rect.top) * (760 / rect.height);
    return {
      x: (svgX - transform.x) / transform.k,
      y: (svgY - transform.y) / transform.k
    };
  }

  function registerEdge(edge) {
    [edge.dataset.edgeFrom, edge.dataset.edgeTo].forEach(key => {
      if (!incidentEdges.has(key)) incidentEdges.set(key, []);
      incidentEdges.get(key).push(edge);
    });
    return edge;
  }

  function updateEdgeGeometry(key) {
    (incidentEdges.get(key) || []).forEach(edge => {
      const from = nodePositions.get(edge.dataset.edgeFrom);
      const to = nodePositions.get(edge.dataset.edgeTo);
      if (!from || !to) return;
      if (edge.tagName.toLowerCase() === "path") {
        edge.setAttribute("d", relationPath(from, to, Number(edge.dataset.curve) || 0));
      } else {
        edge.setAttribute("x1", from.x);
        edge.setAttribute("y1", from.y);
        edge.setAttribute("x2", to.x);
        edge.setAttribute("y2", to.y);
      }
    });
  }

  function relationPath(from, to, curve = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const trim = Math.min(34, length * 0.2);
    const start = { x: from.x + (dx / length) * trim, y: from.y + (dy / length) * trim };
    const end = { x: to.x - (dx / length) * trim, y: to.y - (dy / length) * trim };
    const control = {
      x: (start.x + end.x) / 2 + (-dy / length) * curve,
      y: (start.y + end.y) / 2 + (dx / length) * curve
    };
    return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  }

  function moveNode(key, group, x, y) {
    const next = {
      x: Math.min(1180, Math.max(20, x)),
      y: Math.min(740, Math.max(20, y))
    };
    nodePositions.set(key, next);
    group.setAttribute("transform", `translate(${next.x} ${next.y})`);
    updateEdgeGeometry(key);
  }

  function scheduleNodeMove(key, group, x, y) {
    pendingNodeMove = { key, group, x, y };
    if (nodeMoveFrame) return;
    nodeMoveFrame = requestAnimationFrame(() => {
      nodeMoveFrame = 0;
      if (!pendingNodeMove) return;
      const next = pendingNodeMove;
      pendingNodeMove = null;
      moveNode(next.key, next.group, next.x, next.y);
    });
  }

  function flushNodeMove() {
    if (!pendingNodeMove) return;
    if (nodeMoveFrame) cancelAnimationFrame(nodeMoveFrame);
    nodeMoveFrame = 0;
    const next = pendingNodeMove;
    pendingNodeMove = null;
    moveNode(next.key, next.group, next.x, next.y);
  }

  function addNode({ type, name, parent = "", x, y, radius, color = "blue", label = name, dense = false, shared = false }, layer) {
    const key = nodeKey(type, name, parent);
    const group = el("g", {
      class: `atlas-node atlas-node-${type} ink-${color}${dense ? " is-dense" : ""}${shared ? " is-shared" : ""}`,
      transform: `translate(${x} ${y})`,
      "data-node-key": key,
      "data-node-type": type,
      "data-node-name": name,
      "data-node-parent": parent,
      role: "button",
      tabindex: "0",
      "aria-label": `${type === "genre" ? "主曲风" : shared ? "共享 Style" : "Style"}：${name}`
    });
    const title = el("title", {}, parent ? `${parent} / ${name}` : name);
    group.appendChild(title);
    if (type === "genre") {
      group.appendChild(el("circle", { class: "atlas-node-halo", r: radius + 12 }));
      group.appendChild(el("circle", { class: "atlas-node-core", r: radius, filter: "url(#atlasRough)" }));
      group.appendChild(el("circle", { class: "atlas-node-print", r: Math.max(5, radius - 5), fill: "url(#atlasDots)" }));
    } else {
      const size = radius * 1.45;
      group.appendChild(el("circle", { class: "atlas-node-hit", r: Math.max(shared ? 15 : 10, radius + 5) }));
      group.appendChild(el("rect", {
        class: "atlas-node-core",
        x: -size / 2,
        y: -size / 2,
        width: size,
        height: size,
        transform: "rotate(45)"
      }));
    }
    const text = el("text", {
      class: `atlas-node-label${type === "genre" ? " atlas-node-label-genre" : ""}`,
      x: 0,
      y: type === "genre" ? 0 : radius + 18,
      "text-anchor": "middle"
    }, type === "genre" ? "" : label);
    if (type === "genre") {
      const lines = genreLabelLines(label);
      const maxLength = Math.max(...lines.map(line => line.length));
      const fontSize = Math.max(6.6, Math.min(10, (radius * 1.55) / (maxLength * 0.62)));
      const lineHeight = fontSize * 1.02;
      const firstBaseline = fontSize * 0.34 - ((lines.length - 1) * lineHeight) / 2;
      text.setAttribute("font-size", fontSize.toFixed(2));
      lines.forEach((line, index) => {
        text.appendChild(el("tspan", { x: 0, y: (firstBaseline + index * lineHeight).toFixed(2) }, line));
      });
    }
    group.appendChild(text);
    nodeElements.set(key, group);
    layer.appendChild(group);
    return group;
  }

  function addHistoryEdge(edge, index, parent) {
    const fromKey = nodeKey("genre", edge.from);
    const toKey = nodeKey("genre", edge.to);
    const from = nodePositions.get(fromKey);
    const to = nodePositions.get(toKey);
    if (!from || !to) return;
    const direction = index % 2 ? -1 : 1;
    const curve = direction * (46 + (index % 3) * 10);
    const attrs = {
      class: "atlas-edge atlas-edge-history atlas-layer-history",
      d: relationPath(from, to, curve),
      fill: "none",
      "data-edge-from": fromKey,
      "data-edge-to": toKey,
      "data-edge-kind": "history",
      "data-curve": curve
    };
    attrs["marker-end"] = "url(#atlasHistoryArrow)";
    const path = el("path", attrs);
    path.appendChild(el("title", {}, `${edge.from} → ${edge.to} · ${edge.period || "历史影响"}`));
    parent.appendChild(path);
    registerEdge(path);
  }

  function galaxyLayout() {
    const ordered = [...graph.genres].sort((a, b) => (
      graph.neighbors.get(b.name).size - graph.neighbors.get(a.name).size || a.index - b.index
    ));
    const positions = new Map();
    const center = { x: 600, y: 370 };
    ordered.forEach((genre, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, ordered.length)) * Math.PI * 2;
      positions.set(genre.name, {
        x: center.x + Math.cos(angle) * 260,
        y: center.y + Math.sin(angle) * 180,
        angle
      });
    });
    return positions;
  }

  function styleLayout(genrePositions) {
    const center = { x: 600, y: 370 };
    const positions = new Map();
    const singleOwnerStyles = new Map(graph.genres.map(genre => [genre.name, []]));
    graph.styles.forEach(style => {
      if (style.owners.length === 1) singleOwnerStyles.get(style.owners[0]).push(style);
    });

    graph.genres.forEach(genre => {
      const styles = singleOwnerStyles.get(genre.name) || [];
      const parent = genrePositions.get(genre.name);
      const sector = (Math.PI * 2) / Math.max(1, graph.genres.length);
      styles.forEach((style, index) => {
        // A deterministic organic scatter fills the Genre's outer sector
        // without turning the full taxonomy into concentric label rings.
        const angleUnit = stableUnit(style.style, index + 17);
        const radiusUnit = stableUnit(style.style, index + 73);
        const angle = parent.angle + (angleUnit - 0.5) * sector * 0.84;
        const radius = 345 + radiusUnit * 185;
        positions.set(style.style, {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius * 0.66
        });
      });
    });

    graph.bridges.forEach((style, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, graph.bridges.length)) * Math.PI * 2;
      const radius = index % 2 ? 138 : 82;
      positions.set(style.style, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius * 0.72
      });
    });
    return positions;
  }

  function renderGalaxy() {
    clearSvg();
    const positions = galaxyLayout();
    const stylePositions = styleLayout(positions);

    nodePositions = new Map();
    graph.genres.forEach(genre => nodePositions.set(nodeKey("genre", genre.name), positions.get(genre.name)));
    graph.styles.forEach(style => {
      const position = stylePositions.get(style.style);
      if (position) nodePositions.set(nodeKey("style", style.style), position);
    });

    const edgesLayer = el("g", { class: "atlas-edges-layer" });
    graph.styles.forEach(style => {
      const stylePosition = stylePositions.get(style.style);
      if (!stylePosition) return;
      style.owners.forEach(owner => {
        const genrePosition = positions.get(owner);
        const line = el("line", {
          class: `atlas-edge atlas-edge-taxonomy atlas-layer-taxonomy${style.shared ? " is-shared-edge" : ""}`,
          x1: genrePosition.x,
          y1: genrePosition.y,
          x2: stylePosition.x,
          y2: stylePosition.y,
          "data-edge-from": nodeKey("genre", owner),
          "data-edge-to": nodeKey("style", style.style),
          "data-style": style.style
        });
        edgesLayer.appendChild(line);
        registerEdge(line);
      });
    });
    (relationData.history.edges || []).forEach((edge, index) => addHistoryEdge(edge, index, edgesLayer));
    viewport.appendChild(edgesLayer);

    const nodesLayer = el("g", { class: "atlas-nodes-layer" });
    graph.genres.forEach((genre, index) => {
      const position = positions.get(genre.name);
      const radius = 24 + Math.min(24, Math.sqrt(genre.styles.length) * 2.1);
      addNode({
        type: "genre",
        name: genre.name,
        x: position.x,
        y: position.y,
        radius,
        color: paletteFor(index)
      }, nodesLayer);
    });
    graph.styles.forEach(style => {
      const position = stylePositions.get(style.style);
      if (!position) return;
      const owner = graph.genreByName.get(style.owners[0]);
      addNode({
        type: "style",
        name: style.style,
        x: position.x,
        y: position.y,
        radius: style.shared ? 8 : 4.2,
        color: paletteFor((owner && owner.index) || 0),
        dense: !style.shared,
        shared: style.shared
      }, nodesLayer);
    });
    viewport.appendChild(nodesLayer);
    applySelection();
  }

  function render() {
    emptyState.hidden = Boolean(graph && graph.genres.length);
    emptyState.textContent = atlasScope.error || "当前模型没有可显示的曲风数据。";
    svg.hidden = !graph || !graph.genres.length;
    if (!graph || !graph.genres.length) return;
    renderGalaxy();
    captionTitle.textContent = atlasScope.type === "playlist" ? "歌单曲风星云" : "关系星云";
    captionNote.textContent = "每个 Genre 都连接其全部 Style；共享 Style 同时连接多个 Genre";
  }

  function selectNode(next) {
    selected = next;
    updateInspector();
    applySelection();
    focusNode(next);
  }

  function clearSelection({ resetView = false } = {}) {
    selected = null;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest(".atlas-node")) {
      document.activeElement.blur();
    }
    renderOverviewInspector();
    applySelection();
    if (resetView) animateTransform({ x: 0, y: 0, k: 1 }, 220);
  }

  function connectedKeys(selection) {
    const keys = new Set([nodeKey(selection.type, selection.name, selection.parent)]);
    if (selection.type === "genre") {
      (graph.stylesByGenre.get(selection.name) || []).forEach(style => {
        keys.add(nodeKey("style", style.style));
        style.owners.forEach(owner => keys.add(nodeKey("genre", owner)));
      });
    } else if (selection.type === "style") {
      const style = graph.styleByName.get(selection.name);
      (style ? style.owners : []).forEach(owner => keys.add(nodeKey("genre", owner)));
    }
    const selectedKey = nodeKey(selection.type, selection.name, selection.parent);
    (incidentEdges.get(selectedKey) || []).forEach(edge => {
      keys.add(edge.dataset.edgeFrom === selectedKey ? edge.dataset.edgeTo : edge.dataset.edgeFrom);
    });
    return keys;
  }

  function applySelection() {
    highlightedNodes.forEach(node => {
      node.classList.remove("is-selected", "is-neighbor");
      node.setAttribute("aria-pressed", "false");
    });
    highlightedEdges.forEach(edge => edge.classList.remove("is-active", "is-primary"));
    highlightedNodes = [];
    highlightedEdges = [];
    if (!selected) {
      viewport.classList.remove("has-selection");
      return;
    }
    viewport.classList.add("has-selection");
    const selectedKey = nodeKey(selected.type, selected.name, selected.parent);
    const related = connectedKeys(selected);
    related.forEach(key => {
      const node = nodeElements.get(key);
      if (!node) return;
      node.classList.add(key === selectedKey ? "is-selected" : "is-neighbor");
      node.setAttribute("aria-pressed", key === selectedKey ? "true" : "false");
      highlightedNodes.push(node);
    });
    const candidates = new Set();
    related.forEach(key => (incidentEdges.get(key) || []).forEach(edge => candidates.add(edge)));
    candidates.forEach(edge => {
      if (!related.has(edge.dataset.edgeFrom) || !related.has(edge.dataset.edgeTo)) return;
      edge.classList.add("is-active");
      if (edge.dataset.edgeFrom === selectedKey || edge.dataset.edgeTo === selectedKey) {
        edge.classList.add("is-primary");
      }
      highlightedEdges.push(edge);
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

  function appendTypedRelations(selection) {
    if (selection.type === "genre") {
      const historyEdges = (relationData.history.edges || []).filter(edge => edge.from === selection.name || edge.to === selection.name);
      if (historyEdges.length) {
        const heading = document.createElement("h3");
        heading.textContent = "历史影响与演化";
        relationsPanel.appendChild(heading);
        historyEdges.forEach(edge => {
          const row = document.createElement("div");
          row.className = "atlas-relation-row atlas-history-row";
          const outgoing = edge.from === selection.name;
          const other = outgoing ? edge.to : edge.from;
          row.appendChild(relationButton(`${outgoing ? "→" : "←"} ${other}`, "genre", other));
          const detail = document.createElement("span");
          detail.textContent = `${edge.period || ""} ${edge.reason || ""}`.trim();
          row.appendChild(detail);
          if (edge.sourceUrl) {
            const source = document.createElement("a");
            source.href = edge.sourceUrl;
            source.target = "_blank";
            source.rel = "noreferrer";
            source.textContent = "来源";
            row.appendChild(source);
          }
          relationsPanel.appendChild(row);
        });
      }
    }

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
      appendTypedRelations(selected);
      return;
    }

    const selectedStyle = graph.styleByName.get(selected.name) || { owners: [], shared: false };
    const owners = selectedStyle.owners;
    const profile = profileByKey.get(`${owners[0]}\u0000${selected.name}`);
    inspectorKicker.textContent = selectedStyle.shared ? "Shared Style / 共享节点" : "Style / 分类节点";
    inspectorTitle.textContent = selected.name;
    inspectorCopy.textContent = profile && profile.overview
      ? profile.overview
      : selectedStyle.shared
        ? `这个 Style 同时出现在 ${owners.join("、")} 下，因此成为它们之间的分类连接。`
        : `这个 Style 在当前 taxonomy 中归属于 ${owners[0] || "未知 Genre"}。`;
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
    appendTypedRelations(selected);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
    })[char]);
  }

  function renderOverviewInspector() {
    facts.hidden = false;
    inspectorKicker.textContent = atlasScope.type === "playlist" ? "Playlist atlas / 歌单图谱" : "Atlas index";
    inspectorTitle.textContent = "选择一颗星";
    inspectorCopy.textContent = atlasScope.type === "playlist"
      ? `${atlasScope.name || "当前歌单"}仅保留分析结果涉及的 Genre 与 Style。点击任意节点查看连接。`
      : "点击主曲风或任意 Style，查看完整分类归属与历史演化关系。";
    genreCount.textContent = graph ? graph.genres.length : "—";
    styleCount.textContent = graph ? graph.styleOwners.size : "—";
    bridgeCount.textContent = graph ? graph.bridges.length : "—";
    relationsPanel.replaceChildren();
  }

  function installTaxonomy(nextTaxonomy, { deferRender = false } = {}) {
    taxonomy = nextTaxonomy || { genres: [] };
    graph = buildGraph(taxonomy);
    relationData = { history: { edges: [] } };
    selected = null;
    sourceLabel.textContent = `${taxonomy.name || "Discogs taxonomy"} · ${taxonomy.model || "默认模型"}`;
    renderOverviewInspector();
    resetTransform();
    if (!deferRender) render();
  }

  function updateRelationStatus(error = "") {
    if (error) {
      relationStatus.textContent = `关系图层暂不可用：${error}；分类图层仍可正常浏览。`;
      return;
    }
    const historyCount = (relationData.history.edges || []).length;
    relationStatus.textContent = `全部 ${graph ? graph.styles.length : 0} 个 Style 已入图 · ${historyCount} 条历史演化 · 箭头表示影响方向`;
  }

  async function loadRelations() {
    relationStatus.textContent = "正在读取关系图层…";
    try {
      const response = await fetch("/api/genre-relations");
      if (!response.ok) throw new Error("服务返回异常");
      relationData = await response.json();
      updateRelationStatus();
      render();
    } catch (error) {
      relationData = { history: { edges: [] } };
      updateRelationStatus(error.message);
      render();
    }
  }

  async function initAtlas() {
    taxonomy = await loadPlaylistScope(taxonomy);
    installTaxonomy(taxonomy, { deferRender: true });
    await loadRelations();
  }

  svg.addEventListener("pointerdown", event => {
    cancelTransformAnimation();
    const group = event.target.closest("[data-node-key]");
    if (group) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const key = group.dataset.nodeKey;
      const point = clientToGraphPoint(event.clientX, event.clientY);
      const position = nodePositions.get(key);
      if (!position) return;
      nodeDragState = {
        id: event.pointerId,
        key,
        group,
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: point.x - position.x,
        offsetY: point.y - position.y,
        moved: false
      };
      group.dataset.dragged = "0";
      group.dataset.pointerSelected = "0";
      group.classList.add("is-dragging");
      svg.setPointerCapture(event.pointerId);
      return;
    }
    pointerState = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
      moved: false
    };
    svg.setPointerCapture(event.pointerId);
    stage.classList.add("is-panning");
  });
  svg.addEventListener("pointermove", event => {
    if (nodeDragState && nodeDragState.id === event.pointerId) {
      const distance = Math.hypot(
        event.clientX - nodeDragState.startClientX,
        event.clientY - nodeDragState.startClientY
      );
      if (distance > 3) {
        nodeDragState.moved = true;
        nodeDragState.group.dataset.dragged = "1";
      }
      const point = clientToGraphPoint(event.clientX, event.clientY);
      scheduleNodeMove(
        nodeDragState.key,
        nodeDragState.group,
        point.x - nodeDragState.offsetX,
        point.y - nodeDragState.offsetY
      );
      return;
    }
    if (!pointerState || pointerState.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointerState.x, event.clientY - pointerState.y) > 3) {
      pointerState.moved = true;
    }
    const rect = svg.getBoundingClientRect();
    setTransform({
      ...transform,
      x: pointerState.tx + (event.clientX - pointerState.x) * (1200 / rect.width),
      y: pointerState.ty + (event.clientY - pointerState.y) * (760 / rect.height)
    });
  });
  const endPointer = event => {
    if (nodeDragState && nodeDragState.id === event.pointerId) {
      const { group, moved } = nodeDragState;
      flushNodeMove();
      group.classList.remove("is-dragging");
      nodeDragState = null;
      if (event.type === "pointerup" && !moved) {
        group.dataset.pointerSelected = "1";
        selectNode({
          type: group.dataset.nodeType,
          name: group.dataset.nodeName,
          parent: group.dataset.nodeParent || ""
        });
      }
      return;
    }
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const wasClick = event.type === "pointerup" && !pointerState.moved;
    pointerState = null;
    stage.classList.remove("is-panning");
    if (wasClick) clearSelection({ resetView: true });
  };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("click", event => {
    const group = event.target.closest("[data-node-key]");
    if (!group) return;
    if (group.dataset.pointerSelected === "1") {
      group.dataset.pointerSelected = "0";
      return;
    }
    if (group.dataset.dragged === "1") {
      group.dataset.dragged = "0";
      return;
    }
    selectNode({
      type: group.dataset.nodeType,
      name: group.dataset.nodeName,
      parent: group.dataset.nodeParent || ""
    });
  });
  svg.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const group = event.target.closest("[data-node-key]");
    if (!group) return;
    event.preventDefault();
    selectNode({
      type: group.dataset.nodeType,
      name: group.dataset.nodeName,
      parent: group.dataset.nodeParent || ""
    });
  });
  svg.addEventListener("wheel", event => {
    event.preventDefault();
    cancelTransformAnimation();
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

  initAtlas();
})();
