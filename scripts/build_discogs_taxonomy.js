#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODELS_DIR = path.join(ROOT, "models");
const ALIASES_DIR = path.join(ROOT, "config", "aliases");

// Keep this registry in sync with scripts/analyze_genre.py. The taxonomy is
// always derived from the selected model's own metadata json, never hardcoded.
const MODEL_REGISTRY = {
  effnet400: {
    label: "Essentia Discogs-EffNet + Discogs400",
    metadata: "genre_discogs400-discogs-effnet-1.json",
    version: "discogs400-local-1"
  },
  maest519: {
    label: "Essentia MAEST 30s (Discogs519)",
    metadata: "discogs-maest-30s-pw-519l-2.json",
    version: "discogs519-maest-1"
  }
};

function resolveModel(name) {
  const config = MODEL_REGISTRY[name];
  if (!config) {
    console.error(`Unknown genre model '${name}'. Available: ${Object.keys(MODEL_REGISTRY).join(", ")}`);
    process.exit(1);
  }
  return config;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Per-model alias table. Each model keeps its own hand-maintained file under
// config/aliases/<model>.json. Missing file just means no aliases.
function loadAliases(modelName) {
  const aliasPath = path.join(ALIASES_DIR, `${modelName}.json`);
  if (!fs.existsSync(aliasPath)) {
    console.warn(`No alias file for '${modelName}' at ${aliasPath}; using empty alias table.`);
    return {};
  }
  const raw = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalize(key), value]));
}

function buildTaxonomy(modelName, config) {
  const metadataPath = path.join(MODELS_DIR, config.metadata);
  if (!fs.existsSync(metadataPath)) {
    console.error(`Model metadata not found: ${metadataPath}`);
    console.error("Download the model files first (see install.md / scripts/setup_server.sh).");
    process.exit(1);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const byGenre = new Map();

  for (const label of metadata.classes || []) {
    const [genre, style] = String(label).split("---");
    if (!genre || !style) continue;
    if (!byGenre.has(genre)) byGenre.set(genre, new Set());
    byGenre.get(genre).add(style);
  }

  const genres = [...byGenre.entries()].map(([name, styles]) => ({
    name,
    styles: [...styles].sort((a, b) => a.localeCompare(b, "en"))
  }));

  return {
    name: "Discogs Genre/Style Taxonomy",
    version: config.version,
    model: modelName,
    source: {
      name: metadata.name || config.label,
      description: metadata.description || "",
      link: metadata.link || "",
      dataset: metadata.dataset && metadata.dataset.name ? metadata.dataset.name : "Discogs"
    },
    generatedFrom: `models/${config.metadata}`,
    classes: metadata.classes || [],
    genres,
    aliases: loadAliases(modelName)
  };
}

function main() {
  const modelName = (process.env.GENRE_MODEL || "maest519").trim();
  const config = resolveModel(modelName);
  const taxonomy = buildTaxonomy(modelName, config);

  const dataDir = path.join(ROOT, "data", modelName);
  const publicDir = path.join(ROOT, "public", modelName);
  const dataOutput = path.join(dataDir, "discogs-taxonomy.json");
  const publicOutput = path.join(publicDir, "discogs-taxonomy.js");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(dataOutput, `${JSON.stringify(taxonomy, null, 2)}\n`);
  fs.writeFileSync(publicOutput, `window.DISCOGS_TAXONOMY = ${JSON.stringify(taxonomy, null, 2)};\n`);
  console.log(`Model: ${config.label}`);
  console.log(`Wrote ${dataOutput}`);
  console.log(`Wrote ${publicOutput}`);
  console.log(`Genres: ${taxonomy.genres.length}`);
  console.log(`Styles: ${taxonomy.classes.length}`);
}

main();
