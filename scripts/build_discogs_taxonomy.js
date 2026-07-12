#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODEL_METADATA = path.join(ROOT, "models", "genre_discogs400-discogs-effnet-1.json");
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_OUTPUT = path.join(DATA_DIR, "discogs-taxonomy.json");
const PUBLIC_OUTPUT = path.join(PUBLIC_DIR, "discogs-taxonomy.js");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTaxonomy() {
  const metadata = JSON.parse(fs.readFileSync(MODEL_METADATA, "utf8"));
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

  const aliases = {
    "drum and bass": { genre: "Electronic", style: "Drum n Bass" },
    dnb: { genre: "Electronic", style: "Drum n Bass" },
    "synth pop": { genre: "Electronic", style: "Synth-pop" },
    synthpop: { genre: "Electronic", style: "Synth-pop" },
    "hip-hop": { genre: "Hip Hop" },
    "hip hop": { genre: "Hip Hop" },
    "r and b": { genre: "Funk / Soul", style: "Contemporary R&B" },
    rnb: { genre: "Funk / Soul", style: "Contemporary R&B" },
    "rhythm and blues": { genre: "Funk / Soul", style: "Rhythm & Blues" },
    "lo fi": { genre: "Rock", style: "Lo-Fi" },
    lofi: { genre: "Rock", style: "Lo-Fi" },
    "rock n roll": { genre: "Rock", style: "Rock & Roll" },
    "rock and roll": { genre: "Rock", style: "Rock & Roll" },
    bossanova: { genre: "Latin", style: "Bossanova" },
    "bossa nova": { genre: "Jazz", style: "Bossa Nova" }
  };

  return {
    name: "Discogs Genre/Style Taxonomy",
    version: "discogs400-local-1",
    source: {
      name: metadata.name || "Genre Discogs400",
      description: metadata.description || "",
      link: metadata.link || "",
      dataset: metadata.dataset && metadata.dataset.name ? metadata.dataset.name : "Discogs-4M"
    },
    generatedFrom: "models/genre_discogs400-discogs-effnet-1.json",
    classes: metadata.classes || [],
    genres,
    aliases: Object.fromEntries(Object.entries(aliases).map(([key, value]) => [normalize(key), value]))
  };
}

function main() {
  const taxonomy = buildTaxonomy();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_OUTPUT, `${JSON.stringify(taxonomy, null, 2)}\n`);
  fs.writeFileSync(PUBLIC_OUTPUT, `window.DISCOGS_TAXONOMY = ${JSON.stringify(taxonomy, null, 2)};\n`);
  console.log(`Wrote ${DATA_OUTPUT}`);
  console.log(`Wrote ${PUBLIC_OUTPUT}`);
  console.log(`Genres: ${taxonomy.genres.length}`);
  console.log(`Styles: ${taxonomy.classes.length}`);
}

main();
