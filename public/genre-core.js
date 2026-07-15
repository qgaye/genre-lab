// DOM-free genre scoring core shared by the playlist page. It mirrors the
// scoring pipeline used in app.js (Essentia defines the candidate styles;
// iTunes / Last.fm / Discogs metadata only boosts styles Essentia already hit)
// but has no DOM or i18n dependency so it can run per-track in a loop.
(function (global) {
  const MIN_VISIBLE_STYLE_PERCENT = 10;
  const MAX_VISIBLE_STYLE_ITEMS = 6;

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

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter(item => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function splitArtists(value) {
    return normalize(value)
      .split(/\s*(?:\/|,|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
      .map(item => item.trim())
      .filter(Boolean);
  }

  // Build the taxonomy lookup structures from a Discogs taxonomy object. The
  // returned bundle is passed back into scoreTrack so callers can rebuild it
  // once whenever the active model changes.
  function buildTaxonomy(taxonomy) {
    const aliases = (taxonomy && taxonomy.aliases) || {};
    const genresByKey = new Map();
    const styleCandidates = new Map();
    for (const genre of (taxonomy && taxonomy.genres) || []) {
      genresByKey.set(taxonomyKey(genre.name), genre.name);
      for (const style of genre.styles || []) {
        const key = taxonomyKey(style);
        const candidates = styleCandidates.get(key) || [];
        candidates.push({ genre: genre.name, style, label: `${genre.name} / ${style}` });
        styleCandidates.set(key, candidates);
      }
    }
    return { aliases, genresByKey, styleCandidates };
  }

  function discogsCandidates(bundle, tag, genreHint = "") {
    const key = taxonomyKey(tag);
    if (!key) return [];

    const alias = bundle.aliases[key];
    if (alias) {
      if (alias.style) return [{ genre: alias.genre, style: alias.style, label: `${alias.genre} / ${alias.style}` }];
      return [{ genre: alias.genre, style: "", label: alias.genre }];
    }

    const genre = bundle.genresByKey.get(key);
    if (genre) return [{ genre, style: "", label: genre }];

    const candidates = bundle.styleCandidates.get(key) || [];
    if (!genreHint) return candidates;

    const exact = candidates.filter(candidate => taxonomyKey(candidate.genre) === taxonomyKey(genreHint));
    return exact.length ? exact : candidates;
  }

  function uniqueCandidates(candidates) {
    return uniqueBy(candidates, item => `${item.genre}---${item.style || ""}`);
  }

  function firstDiscogsCandidate(bundle, tag, genreHint = "") {
    return discogsCandidates(bundle, tag, genreHint)[0] || null;
  }

  function addScore(scores, label, amount, reason) {
    const item = scores.get(label) || { name: label, score: 0, reasons: [] };
    item.score += amount;
    if (reason) item.reasons.push(reason);
    scores.set(label, item);
  }

  function addDiscogsScore(scores, bundle, tag, genreHint, amount, reason) {
    const candidates = uniqueCandidates(discogsCandidates(bundle, tag, genreHint));
    if (!candidates.length) return false;
    const divided = Math.max(4, Math.round(amount / candidates.length));
    for (const candidate of candidates) {
      addScore(scores, candidate.label, divided, reason);
    }
    return true;
  }

  function splitEssentiaLabel(label) {
    const [genre, style] = String(label || "").split("---");
    return {
      genre: genre || "",
      style: style || "",
      display: style ? `${genre} / ${style}` : genre
    };
  }

  // Essentia audio model output defines the baseline scores and the candidate
  // style set. Everything downstream can only boost these styles.
  function scoreEssentia(scores, bundle, essentia) {
    const predictions = essentia && Array.isArray(essentia.predictions) ? essentia.predictions : [];
    if (!predictions.length) return;
    const topScore = Math.max(...predictions.map(item => Number(item.score || 0)), 0) || 1;
    const useful = predictions.slice(0, 8);
    for (const [index, item] of useful.entries()) {
      const parsed = splitEssentiaLabel(item.label);
      const relative = Number(item.score || 0) / topScore;
      const rankDecay = Math.max(0.45, 1 - index * 0.08);
      const weight = Math.max(14, Math.round(18 + relative * 72 * rankDecay));
      if (parsed.style) {
        addDiscogsScore(scores, bundle, parsed.style, parsed.genre, weight, { source: "essentia", value: parsed.display });
      } else if (parsed.genre) {
        addDiscogsScore(scores, bundle, parsed.genre, "", weight, { source: "essentia", value: parsed.genre });
      }
    }
  }

  // Collect boostable tags from the online metadata sources, matching the same
  // acceptance rules used on the single-track page.
  function collectMetadataTags(bundle, metadata, track) {
    const tags = [];
    if (!metadata) return tags;
    const wantedTitle = normalize(track.title);
    const wantedArtists = splitArtists(track.artists);

    const itunes = metadata.sources && metadata.sources.itunes;
    if (Array.isArray(itunes)) {
      for (const item of itunes.slice(0, 8)) {
        const itemTitle = normalize(item.trackName);
        const itemArtist = normalize(item.artistName);
        const titleMatch = wantedTitle && (itemTitle === wantedTitle || itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle));
        const artistMatch = wantedArtists.length === 0 || wantedArtists.some(name => itemArtist.includes(name) || name.includes(itemArtist));
        if (!titleMatch || !artistMatch) continue;
        if (item.primaryGenreName && firstDiscogsCandidate(bundle, item.primaryGenreName)) {
          tags.push({ tag: normalize(item.primaryGenreName), source: "itunes", weight: 16 });
        }
      }
    }

    const lastfm = metadata.sources && metadata.sources.lastfm;
    if (lastfm && Array.isArray(lastfm.trackTags)) {
      const trackTags = uniqueBy(lastfm.trackTags, tag => normalize(tag.name)).slice(0, 10);
      const maxCount = Math.max(...trackTags.map(tag => Number(tag.count || 0)), 0);
      for (const [index, tag] of trackTags.entries()) {
        if (!firstDiscogsCandidate(bundle, tag.name)) continue;
        const count = Number(tag.count || 0);
        const countBoost = maxCount > 0 ? Math.round((count / maxCount) * 10) : Math.max(0, 8 - index);
        tags.push({ tag: normalize(tag.name), source: "lastfm", weight: 24 + countBoost });
      }
    }

    const discogs = metadata.sources && metadata.sources.discogs;
    if (discogs && Array.isArray(discogs.releases)) {
      const usefulReleases = discogs.releases
        .filter(item => (item.genre && item.genre.length) || (item.style && item.style.length))
        .slice(0, 5);
      for (const release of usefulReleases) {
        for (const tag of release.genre || []) {
          tags.push({ tag: normalize(tag), source: "discogs", weight: 14 });
        }
        for (const tag of release.style || []) {
          tags.push({ tag: normalize(tag), genreHint: (release.genre || [])[0] || "", source: "discogs", weight: 20 });
        }
      }
    }

    return tags;
  }

  function collectBoost(boosts, label, points, reason) {
    const entry = boosts.get(label) || { points: 0, reasons: [] };
    entry.points += points;
    entry.reasons.push(reason);
    boosts.set(label, entry);
  }

  function applyMetadataBoost(scores, bundle, tags) {
    if (!scores.size || !tags.length) return;
    const boosts = new Map();
    for (const item of tags) {
      const candidates = uniqueCandidates(discogsCandidates(bundle, item.tag, item.genreHint || ""));
      if (!candidates.length) continue;
      const weight = item.weight || 18;
      const reason = { source: item.source, value: item.tag };
      for (const candidate of candidates) {
        collectBoost(boosts, candidate.label, weight, reason);
      }
    }
    for (const [label, boost] of boosts) {
      const item = scores.get(label);
      if (!item) continue; // only boost styles Essentia already hit
      const factor = 1 + Math.min(0.5, boost.points / 100);
      item.score *= factor;
      item.boosted = true;
      item.reasons.push(...boost.reasons);
    }
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

  // Score one track. `track` is { title, artists }, essentia is the /api/essentia
  // payload, metadata is the /api/metadata payload (optional). Returns the
  // ranked composition (each item: { name, score, percent, reasons, boosted }).
  function scoreTrack(bundle, { essentia, metadata, track }) {
    const scores = new Map();
    scoreEssentia(scores, bundle, essentia);
    const tags = collectMetadataTags(bundle, metadata, track || {});
    applyMetadataBoost(scores, bundle, tags);
    const sorted = [...scores.values()]
      .map(item => ({ ...item, score: Math.max(0, Math.min(100, Math.round(item.score))) }))
      .sort((a, b) => b.score - a.score);
    return buildGenreComposition(sorted);
  }

  global.GenreCore = {
    buildTaxonomy,
    scoreTrack,
    splitEssentiaLabel,
    normalize
  };
})(typeof window !== "undefined" ? window : this);
