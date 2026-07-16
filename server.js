const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
// The DOM-free genre scoring core is shared with the playlist frontend. The
// aggregate playlist job scores every track server-side instead of relaying
// raw Essentia/metadata payloads back to the browser. The module assigns to
// `this` (module.exports) when required in Node, exposing a GenreCore field.
const GenreCore = require("./public/genre-core.js").GenreCore;

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DOWNLOAD_DIR = path.join(ROOT, "downloads");
const RUNTIME_DIR = path.join(ROOT, ".runtime");
const ANALYSIS_LOG_FILE = path.join(RUNTIME_DIR, "analysis-log.ndjson");
// Playlist aggregate jobs are persisted here (one JSON file per jobId) so an
// in-flight or finished analysis survives a server restart.
const PLAYLIST_JOBS_DIR = path.join(RUNTIME_DIR, "playlist-jobs");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "config", "defaults.json");
const ESSENTIA_PYTHON = path.join(ROOT, ".venv-essentia", "bin", "python");
const ESSENTIA_SCRIPT = path.join(ROOT, "scripts", "analyze_genre.py");
const RUNTIME_PATH = [
  path.join(ROOT, ".venv-essentia", "bin"),
  path.join(ROOT, "bin"),
  process.env.PATH || ""
].join(path.delimiter);
const MAX_AUDIO_BYTES = 90 * 1024 * 1024;
const NETEASE_LINK_HOSTS = new Set(["163cn.tv", "music.163.com"]);
const QQ_MUSIC_LINK_HOSTS = new Set(["y.qq.com", "i.y.qq.com"]);
const SPOTIFY_LINK_HOSTS = new Set(["open.spotify.com", "spotify.link"]);
const SEARCH_RESULT_LIMIT = 5;
const YTDLP_SEARCH_SOURCES = {
  youtube: { name: "youtube", label: "YouTube", prefix: "ytsearch", priority: 0 },
  bilibili: { name: "bilibili", label: "Bilibili", prefix: "bilisearch", priority: 1, flatPlaylist: false },
  soundcloud: { name: "soundcloud", label: "SoundCloud", prefix: "scsearch", priority: 1 }
};
const CJK_VARIANT_MAP = new Map(Object.entries({
  佈: "布",
  來: "来",
  們: "们",
  個: "个",
  傘: "伞",
  內: "内",
  再: "再",
  動: "动",
  勁: "劲",
  勞: "劳",
  勢: "势",
  區: "区",
  卻: "却",
  參: "参",
  變: "变",
  只: "只",
  另: "另",
  同: "同",
  嗎: "吗",
  團: "团",
  場: "场",
  墮: "堕",
  夢: "梦",
  奮: "奋",
  妳: "你",
  實: "实",
  對: "对",
  將: "将",
  層: "层",
  嵐: "岚",
  帶: "带",
  幫: "帮",
  幾: "几",
  從: "从",
  復: "复",
  戀: "恋",
  戰: "战",
  戲: "戏",
  換: "换",
  擁: "拥",
  擇: "择",
  數: "数",
  斷: "断",
  於: "于",
  時: "时",
  會: "会",
  東: "东",
  樂: "乐",
  樣: "样",
  樓: "楼",
  歲: "岁",
  歸: "归",
  氣: "气",
  沒: "没",
  淚: "泪",
  為: "为",
  無: "无",
  愛: "爱",
  爾: "尔",
  獨: "独",
  現: "现",
  畫: "画",
  當: "当",
  發: "发",
  的: "的",
  盡: "尽",
  眼: "眼",
  著: "着",
  處: "处",
  裡: "里",
  見: "见",
  覺: "觉",
  詞: "词",
  語: "语",
  說: "说",
  誰: "谁",
  請: "请",
  變: "变",
  貓: "猫",
  起: "起",
  過: "过",
  還: "还",
  開: "开",
  間: "间",
  關: "关",
  隊: "队",
  離: "离",
  難: "难",
  電: "电",
  靈: "灵",
  音: "音",
  頭: "头",
  願: "愿",
  類: "类",
  風: "风",
  飛: "飞",
  體: "体"
}));

function executablePath(commandName) {
  for (const dir of RUNTIME_PATH.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, commandName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return "";
}

function ytdlpFfmpegLocation() {
  const configured = process.env.FFMPEG_LOCATION || process.env.YTDLP_FFMPEG_LOCATION || "";
  if (configured) return configured;

  const ffmpeg = executablePath("ffmpeg");
  const ffprobe = executablePath("ffprobe");
  if (ffmpeg && ffprobe && path.dirname(ffmpeg) === path.dirname(ffprobe)) {
    return path.dirname(ffmpeg);
  }
  return "";
}

function cleanYtDlpError(stderr, fallback) {
  const message = stderr.trim() || fallback;
  if (/ffprobe and ffmpeg not found|ffmpeg not found|ffprobe not found/i.test(message)) {
    return [
      "服务器缺少 ffmpeg/ffprobe，yt-dlp 无法把公开视频转成可分析音频。",
      "请在远端运行 scripts/setup_server.sh，或安装 ffmpeg 后重启服务；也可以设置 FFMPEG_LOCATION 指向 ffmpeg/ffprobe 所在目录。"
    ].join(" ");
  }
  return message;
}

function conciseErrorMessage(error) {
  return String(error && error.message ? error.message : error)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-1)[0] || "未知错误";
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const raw = match[2].replace(/^['"]|['"]$/g, "");
    process.env[match[1]] = raw;
  }
}

function loadDefaultConfig() {
  if (!fs.existsSync(DEFAULT_CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, "utf8"));
  } catch (error) {
    console.warn(`无法读取默认配置 ${DEFAULT_CONFIG_FILE}: ${error.message}`);
    return {};
  }
}

const DEFAULT_CONFIG = loadDefaultConfig();

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env"));

// A playlist larger than this many tracks is randomly down-sampled to this size
// before we fetch song names / analyze, keeping big playlists tractable. Order
// of precedence: PLAYLIST_MAX_TRACKS env > config/defaults.json > 100. Set to 0
// to disable the cap (analyze everything). Computed after .env files load so an
// env-file override is honored.
const PLAYLIST_MAX_TRACKS = (() => {
  const raw = process.env.PLAYLIST_MAX_TRACKS;
  const source = raw != null && raw !== "" ? raw : DEFAULT_CONFIG.playlistMaxTracks;
  const n = Number(source);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
})();

// Genre model registry. Keep in sync with scripts/analyze_genre.py. Each model
// has a fixed taxonomy config at data/<model>/discogs-taxonomy.json. A request
// may target either model; the active default is chosen by GENRE_MODEL env or
// config/defaults.json genreModel.
//
// Memory note: effnet400's model is cached/reused in the worker (~1.2GB
// resident). maest519 is far heavier (~4GB RSS), so the worker builds it fresh
// per request and never caches it — see scripts/analyze_genre.py.
const GENRE_MODELS = {
  effnet400: {
    label: "Essentia Discogs400 - 400 styles, faster/coarser",
    metadata: "genre_discogs400-discogs-effnet-1.json"
  },
  maest519: {
    label: "Essentia MAEST - 519 styles, finer/slower",
    metadata: "discogs-maest-30s-pw-519l-2.json"
  }
};

function resolveGenreModelName() {
  const name = String(process.env.GENRE_MODEL || DEFAULT_CONFIG.genreModel || "effnet400").trim();
  return GENRE_MODELS[name] ? name : "effnet400";
}

// Resolve a per-request model name, falling back to the global default when the
// request does not specify a valid model.
function resolveRequestModelName(value) {
  const name = String(value || "").trim();
  return GENRE_MODELS[name] ? name : GENRE_MODEL_NAME;
}

const GENRE_MODEL_NAME = resolveGenreModelName();
const GENRE_MODEL = GENRE_MODELS[GENRE_MODEL_NAME];

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac"
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  res.end(data);
}

function elapsedSecondsSince(start) {
  return Number((Number(process.hrtime.bigint() - start) / 1e9).toFixed(2));
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  return forwarded || realIp || req.socket.remoteAddress || "";
}

function requestDevice(req) {
  const ua = String(req.headers["user-agent"] || "");
  const lower = ua.toLowerCase();
  const os = /iphone|ipad|ipod/.test(lower)
    ? "iOS"
    : /android/.test(lower)
      ? "Android"
      : /mac os x|macintosh/.test(lower)
        ? "macOS"
        : /windows/.test(lower)
          ? "Windows"
          : /linux/.test(lower)
            ? "Linux"
            : "Unknown";
  const browser = /edg\//.test(lower)
    ? "Edge"
    : /chrome|crios/.test(lower)
      ? "Chrome"
      : /firefox|fxios/.test(lower)
        ? "Firefox"
        : /safari/.test(lower)
          ? "Safari"
          : "Unknown";
  const formFactor = /mobile|iphone|ipod|android.*mobile/.test(lower)
    ? "mobile"
    : /ipad|tablet|android/.test(lower)
      ? "tablet"
      : "desktop";
  return { os, browser, formFactor };
}

function appendAnalysisLog(entry) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.appendFileSync(ANALYSIS_LOG_FILE, `${JSON.stringify(entry)}\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function readBinaryBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) {
        reject(new Error("音频超过 90MB，本地分析工具已停止上传。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "GenreLab/1.0 (local research tool)",
        ...headers
      },
      timeout: 12000
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const source = (() => {
            try {
              const parsed = new URL(url);
              return `${parsed.hostname}${parsed.pathname}`;
            } catch {
              return url;
            }
          })();
          reject(new Error(`${source} 返回 HTTP ${res.statusCode}${data ? `：${data.slice(0, 160)}` : ""}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Could not parse ${url}: ${error.message}`));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Network request timed out."));
    });
    req.on("error", reject);
  });
}

function fetchRedirectLocation(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "GenreLab/1.0 (local research tool)"
      },
      timeout: 12000
    }, res => {
      const location = res.headers.location
        ? new URL(res.headers.location, url).toString()
        : "";
      res.resume();
      resolve({
        statusCode: res.statusCode || 0,
        location
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Network request timed out."));
    });
    req.on("error", reject);
  });
}

function cleanTerm(value) {
  return String(value || "").replace(/[“”"]/g, " ").replace(/\s+/g, " ").trim();
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; GenreLab/1.0; local research tool)",
        ...headers
      },
      timeout: 12000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(fetchText(next, headers));
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${url} 返回 HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Network request timed out."));
    });
    req.on("error", reject);
  });
}

function fetchBinary(url, headers = {}, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, {
      headers: {
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; GenreLab/1.0; local research tool)",
        ...headers
      },
      timeout: 12000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(fetchBinary(next, headers, limitBytes));
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`图片返回 HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on("data", chunk => {
        size += chunk.length;
        if (size > limitBytes) {
          req.destroy(new Error("图片过大。"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({
          contentType: String(res.headers["content-type"] || "image/jpeg"),
          data: Buffer.concat(chunks)
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("Network request timed out."));
    });
    req.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/gu, char => CJK_VARIANT_MAP.get(char) || char)
    .replace(/[^\p{L}\p{N}$!]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadDiscogsTaxonomy(modelName) {
  const taxonomyPath = path.join(ROOT, "data", modelName, "discogs-taxonomy.json");
  if (!fs.existsSync(taxonomyPath)) {
    throw new Error(`Missing taxonomy config for model '${modelName}': ${taxonomyPath}`);
  }
  return JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
}

// Per-model taxonomy bundles. A single request may target either model, so the
// lookup maps must be selectable by model name rather than being one global
// singleton. Bundles are built lazily and cached per model.
function buildTaxonomyBundle(modelName) {
  const taxonomy = loadDiscogsTaxonomy(modelName);
  const genresByKey = new Map();
  const stylesByGenre = new Map();
  const styleCandidates = new Map();
  for (const genre of taxonomy.genres || []) {
    genresByKey.set(normalizeText(genre.name), genre.name);
    const styleMap = new Map();
    for (const style of genre.styles || []) {
      const styleKey = normalizeText(style);
      styleMap.set(styleKey, style);
      const candidates = styleCandidates.get(styleKey) || [];
      candidates.push({ genre: genre.name, style });
      styleCandidates.set(styleKey, candidates);
    }
    stylesByGenre.set(genre.name, styleMap);
  }
  return { taxonomy, genresByKey, stylesByGenre, styleCandidates };
}

const TAXONOMY_BUNDLES = new Map();

function getTaxonomyBundle(modelName) {
  const name = GENRE_MODELS[modelName] ? modelName : GENRE_MODEL_NAME;
  if (!TAXONOMY_BUNDLES.has(name)) {
    TAXONOMY_BUNDLES.set(name, buildTaxonomyBundle(name));
  }
  return TAXONOMY_BUNDLES.get(name);
}

function uniqueNormalized(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = normalizeText(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalDiscogsGenre(bundle, value) {
  return bundle.genresByKey.get(normalizeText(value)) || "";
}

function canonicalDiscogsStyle(bundle, value, genreHints = []) {
  const styleKey = normalizeText(value);
  if (!styleKey) return "";
  for (const genre of genreHints) {
    const styles = bundle.stylesByGenre.get(genre);
    if (styles && styles.has(styleKey)) return styles.get(styleKey);
  }
  const candidates = bundle.styleCandidates.get(styleKey) || [];
  return candidates[0] ? candidates[0].style : "";
}

function filterDiscogsTaxonomyTags(bundle, genres, styles) {
  const canonicalGenres = uniqueNormalized((genres || []).map(value => canonicalDiscogsGenre(bundle, value)).filter(Boolean));
  const canonicalStyles = uniqueNormalized((styles || [])
    .map(style => canonicalDiscogsStyle(bundle, style, canonicalGenres))
    .filter(Boolean));
  return { genre: canonicalGenres, style: canonicalStyles };
}

function textMatchScore(actual, wanted) {
  const actualText = normalizeText(actual);
  const wantedText = normalizeText(wanted);
  if (!actualText || !wantedText) return 0;
  if (actualText === wantedText) return 100;
  if (actualText.includes(wantedText) || wantedText.includes(actualText)) return 82;
  const tokens = wantedText.split(" ").filter(token => token.length > 1);
  if (!tokens.length) return 0;
  const hits = tokens.filter(token => actualText.includes(token)).length;
  return Math.round((hits / tokens.length) * 70);
}

function anyArtistMatchScore(actual, artists) {
  const wantedArtists = artists.map(normalizeText).filter(Boolean);
  if (!wantedArtists.length) return 0;
  const actualText = normalizeText(actual);
  return Math.max(...wantedArtists.map(artist => {
    if (!actualText || !artist) return 0;
    if (actualText === artist) return 100;
    if (actualText.includes(artist) || artist.includes(actualText)) return 82;
    return textMatchScore(actualText, artist);
  }));
}

function quoteSearchTerm(value) {
  const text = cleanTerm(value).replace(/"/g, " ").trim();
  return text ? `"${text}"` : "";
}

function splitArtists(value) {
  return cleanTerm(value)
    .split(/\s*(?:\/|,|&|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 5);
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

function lastFmPathPart(value) {
  return encodeURIComponent(cleanTerm(value)).replace(/%20/g, "+");
}

async function searchITunes(title, artists) {
  const params = new URLSearchParams({
    media: "music",
    entity: "song",
    limit: "8",
    term: [title, artists[0] || ""].join(" ")
  });
  const country = String(process.env.ITUNES_COUNTRY || DEFAULT_CONFIG.itunesCountry || "").trim();
  if (/^[a-z]{2}$/i.test(country)) params.set("country", country.toUpperCase());
  const url = `https://itunes.apple.com/search?${params.toString()}`;
  const data = await fetchJson(url, { "user-agent": "GenreLab/1.0" });
  return (data.results || [])
    .map(item => {
      const titleScore = textMatchScore(item.trackName, title);
      const artistScore = anyArtistMatchScore(item.artistName, artists);
      const matchScore = Math.round(titleScore * 0.62 + artistScore * 0.38);
      return {
        trackName: item.trackName,
        artistName: item.artistName,
        collectionName: item.collectionName,
        primaryGenreName: item.primaryGenreName,
        releaseDate: item.releaseDate,
        trackViewUrl: item.trackViewUrl,
        artworkUrl100: item.artworkUrl100,
        matchScore
      };
    })
    .filter(item => item.matchScore >= 74)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

async function searchLastFm(title, artists) {
  const artist = artists[0] || "";
  if (!title || !artist) {
    return { trackTags: [], album: "", source: "skipped", error: "Last.fm 需要歌名和主艺人。" };
  }

  const apiKey = process.env.LASTFM_API_KEY || "";
  if (apiKey) {
    const params = new URLSearchParams({
      method: "track.gettoptags",
      artist,
      track: title,
      api_key: apiKey,
      format: "json",
      autocorrect: "1"
    });
    const infoParams = new URLSearchParams({
      method: "track.getInfo",
      artist,
      track: title,
      api_key: apiKey,
      format: "json",
      autocorrect: "1"
    });
    const [tagsResult, infoResult] = await Promise.allSettled([
      fetchJson(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`),
      fetchJson(`https://ws.audioscrobbler.com/2.0/?${infoParams.toString()}`)
    ]);
    const tags = tagsResult.status === "fulfilled"
      ? (tagsResult.value.toptags && tagsResult.value.toptags.tag || [])
      : [];
    const info = infoResult.status === "fulfilled" ? infoResult.value.track || {} : {};
    return {
      source: "api",
      trackTags: tags.map(tag => ({
        name: String(tag.name || "").trim(),
        count: Number(tag.count || 0),
        url: tag.url || ""
      })).filter(tag => tag.name),
      album: info.album && info.album.title ? info.album.title : "",
      url: info.url || "",
      error: tagsResult.status === "rejected"
        ? tagsResult.reason.message
        : (tagsResult.value && tagsResult.value.message || "")
    };
  }

  return {
    source: "not-configured",
    trackTags: [],
    album: "",
    url: `https://www.last.fm/music/${lastFmPathPart(artist)}/_/${lastFmPathPart(title)}`,
    error: "未配置 LASTFM_API_KEY；Last.fm 官方歌曲级标签需要 API key。"
  };
}

async function searchDiscogs(bundle, title, artists, album = "") {
  const token = process.env.DISCOGS_TOKEN || "";
  const headers = token ? { authorization: `Discogs token=${token}` } : {};
  const queries = uniqueBy([
    album ? [artists[0], album].filter(Boolean).join(" ") : "",
    [artists[0], title].filter(Boolean).join(" "),
    [title, artists[0]].filter(Boolean).join(" ")
  ].filter(Boolean), item => normalizeText(item));

  const releases = [];
  const errors = [];
  for (const query of queries.slice(0, 3)) {
    try {
      const params = new URLSearchParams({ q: query, type: "release", per_page: "5" });
      const data = await fetchJson(`https://api.discogs.com/database/search?${params.toString()}`, headers);
      for (const item of data.results || []) {
        const taxonomyTags = filterDiscogsTaxonomyTags(bundle, item.genre, item.style);
        const releaseTitle = item.title || "";
        const albumScore = album ? textMatchScore(releaseTitle, album) : 0;
        const titleScore = textMatchScore(releaseTitle, title);
        const artistScore = anyArtistMatchScore(releaseTitle, artists);
        const matchScore = Math.max(
          album ? Math.round(albumScore * 0.58 + artistScore * 0.42) : 0,
          Math.round(titleScore * 0.5 + artistScore * 0.5)
        );
        releases.push({
          query,
          title: releaseTitle,
          year: item.year || "",
          country: item.country || "",
          genre: taxonomyTags.genre,
          style: taxonomyTags.style,
          label: Array.isArray(item.label) ? item.label.slice(0, 4) : [],
          uri: item.uri ? `https://www.discogs.com${item.uri}` : "",
          resourceUrl: item.resource_url || "",
          matchScore
        });
      }
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
  }

  return {
    releases: uniqueBy(releases, item => `${normalizeText(item.title)}:${item.year}:${item.country}`)
      .filter(item => item.matchScore >= 68)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8),
    error: errors[0] || (releases.length ? "Discogs 有搜索结果，但没有通过艺人/专辑匹配门槛。" : "")
  };
}

// Core metadata lookup shared by the single-track /api/metadata handler and the
// playlist aggregate job. Returns the payload the frontend GenreCore.scoreTrack
// consumes, or throws with a `validationError` flag on bad input.
async function runMetadata(body) {
  const startedAt = process.hrtime.bigint();
  const modelName = resolveRequestModelName(body.model);
  const bundle = getTaxonomyBundle(modelName);
  const title = cleanTerm(body.title);
  const artists = splitArtists(body.artists);
  if (!title && artists.length === 0) {
    const error = new Error("请输入歌名或艺人。");
    error.validationError = true;
    throw error;
  }

  const [itunes, lastfm] = await Promise.allSettled([
    searchITunes(title || artists[0], artists),
    searchLastFm(title, artists)
  ]);
  const lastFmData = lastfm.status === "fulfilled" ? lastfm.value : { trackTags: [], error: lastfm.reason.message };
  const itunesData = itunes.status === "fulfilled" ? itunes.value : [];
  const wantedTitle = normalizeText(title);
  const wantedArtists = artists.map(normalizeText);
  const bestITunesAlbum = (itunesData || []).find(item => {
    const itemTitle = normalizeText(item.trackName);
    const itemArtist = normalizeText(item.artistName);
    const titleMatch = wantedTitle && (itemTitle === wantedTitle || itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle));
    const artistMatch = !wantedArtists.length || wantedArtists.some(name => itemArtist.includes(name) || name.includes(itemArtist));
    return titleMatch && artistMatch && item.collectionName;
  });
  const album = cleanTerm(body.album) || lastFmData.album || (bestITunesAlbum && bestITunesAlbum.collectionName) || "";
  const discogs = await searchDiscogs(bundle, title || artists[0], artists, album).catch(error => ({ releases: [], error: error.message }));

  return {
    query: { title, artists },
    modelKey: modelName,
    elapsedSeconds: elapsedSecondsSince(startedAt),
    sources: {
      itunes: itunesData.length ? itunesData : (itunes.status === "fulfilled" ? itunes.value : { error: itunes.reason.message }),
      lastfm: lastFmData,
      discogs
    }
  };
}

async function handleMetadata(req, res) {
  const startedAt = process.hrtime.bigint();
  try {
    const body = await readBody(req);
    const result = await runMetadata(body);
    sendJson(res, 200, result);
  } catch (error) {
    if (error.validationError) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: error.message, elapsedSeconds: elapsedSecondsSince(startedAt) });
  }
}

function extractNetEaseSongId(value) {
  const text = cleanTerm(value);
  const idMatch = text.match(/[?&#]id=(\d+)/i) || text.match(/\/song\/(\d+)/i) || text.match(/^\d+$/);
  return idMatch ? (idMatch[1] || idMatch[0]) : "";
}

function extractHttpUrl(value) {
  const text = cleanTerm(value);
  const urlMatch = text.match(/https?:\/\/[^\s<>"'，。；、]+/i);
  if (!urlMatch) return "";
  return urlMatch[0].replace(/[)\]）】,，。；;!！?？]+$/g, "");
}

function isAllowedNetEaseLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NETEASE_LINK_HOSTS.has(host) || host.endsWith(".music.163.com");
  } catch {
    return false;
  }
}

function extractQQMusicSongMid(value) {
  const text = cleanTerm(value);
  const midMatch = text.match(/[?&#](?:songmid|song_mid)=([A-Za-z0-9]+)/i)
    || text.match(/\/songDetail\/([A-Za-z0-9]+)/i)
    || text.match(/\/n\/ryqq\/songDetail\/([A-Za-z0-9]+)/i);
  return midMatch ? midMatch[1] : "";
}

function isAllowedQQMusicLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return QQ_MUSIC_LINK_HOSTS.has(host) || host.endsWith(".y.qq.com");
  } catch {
    return false;
  }
}

function extractSpotifyTrackId(value) {
  const text = cleanTerm(value);
  const idMatch = text.match(/\/track\/([A-Za-z0-9]{22})/i)
    || text.match(/spotify:track:([A-Za-z0-9]{22})/i)
    || text.match(/^([A-Za-z0-9]{22})$/);
  return idMatch ? idMatch[1] : "";
}

function isAllowedSpotifyLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SPOTIFY_LINK_HOSTS.has(host) || host.endsWith(".spotify.com");
  } catch {
    return false;
  }
}

function musicPlatformDownloadSource(value) {
  const text = cleanTerm(value);
  const url = extractHttpUrl(text) || text;
  if (!/^https?:\/\//i.test(url)) return null;
  if (isAllowedNetEaseLink(url)) {
    return { url, platform: "netease", label: "网易云" };
  }
  if (isAllowedQQMusicLink(url)) {
    return { url, platform: "qqmusic", label: "QQ音乐" };
  }
  return null;
}

async function resolveQQMusicSongMid(value) {
  const directMid = extractQQMusicSongMid(value);
  if (directMid) return directMid;

  let url = extractHttpUrl(value);
  if (!url || !isAllowedQQMusicLink(url)) return "";

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const songMid = extractQQMusicSongMid(url);
    if (songMid) return songMid;

    const result = await fetchRedirectLocation(url);
    if (result.statusCode < 300 || result.statusCode >= 400 || !result.location) {
      return "";
    }
    if (!isAllowedQQMusicLink(result.location)) {
      return "";
    }
    url = result.location;
  }
  return "";
}

async function resolveNetEaseSongId(value) {
  const directId = extractNetEaseSongId(value);
  if (directId) return directId;

  let url = extractHttpUrl(value);
  if (!url || !isAllowedNetEaseLink(url)) return "";

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const id = extractNetEaseSongId(url);
    if (id) return id;

    const result = await fetchRedirectLocation(url);
    if (result.statusCode < 300 || result.statusCode >= 400 || !result.location) {
      return "";
    }
    if (!isAllowedNetEaseLink(result.location)) {
      return "";
    }
    url = result.location;
  }
  return "";
}

async function fetchQQMusicSong(songMid) {
  const params = new URLSearchParams({
    songmid: songMid,
    tpl: "yqq_song_detail",
    format: "json"
  });
  const data = await fetchJson(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${params.toString()}`, {
    referer: "https://y.qq.com/",
    "user-agent": "Mozilla/5.0 GenreLab/1.0"
  });
  const song = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!song || !song.name) return null;
  return {
    id: String(song.id || ""),
    songMid: String(song.mid || songMid),
    title: song.name,
    artists: (song.singer || []).map(artist => artist.name).filter(Boolean),
    album: song.album && song.album.name ? song.album.name : "",
    sourceUrl: `https://y.qq.com/n/ryqq/songDetail/${song.mid || songMid}`
  };
}

async function handleNetEaseSong(req, res) {
  try {
    const body = await readBody(req);
    const id = await resolveNetEaseSongId(body.url || body.id || "");
    if (!id) {
      sendJson(res, 400, { error: "没有在网易云链接中找到 song id。" });
      return;
    }
    const data = await fetchJson(`https://music.163.com/api/song/detail?ids=${encodeURIComponent(`[${id}]`)}`, {
      "referer": "https://music.163.com/"
    });
    const song = data && data.songs && data.songs[0];
    if (!song || !song.name) {
      sendJson(res, 404, { error: `网易云没有返回 song id ${id} 的歌曲信息。` });
      return;
    }
    sendJson(res, 200, {
      id: String(song.id || id),
      title: song.name,
      artists: (song.artists || []).map(artist => artist.name).filter(Boolean),
      album: song.album && song.album.name ? song.album.name : "",
      sourceUrl: `https://music.163.com/song?id=${id}`
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function extractNetEasePlaylistId(value) {
  const text = cleanTerm(value);
  // A song link (e.g. /song?id=123) also carries an "id=", so reject it here
  // instead of silently treating a single track as a playlist.
  if (/\/song[/?#]/i.test(text) || /\/song$/i.test(text)) return "";
  const idMatch = text.match(/[?&#].*?\bid=(\d+)/i)
    || text.match(/\/playlist\/(\d+)/i)
    || text.match(/^\d+$/);
  return idMatch ? (idMatch[1] || idMatch[0]) : "";
}

async function resolveNetEasePlaylistId(value) {
  const directId = extractNetEasePlaylistId(value);
  if (directId) return directId;

  let url = extractHttpUrl(value);
  if (!url || !isAllowedNetEaseLink(url)) return "";

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const id = extractNetEasePlaylistId(url);
    if (id) return id;

    const result = await fetchRedirectLocation(url);
    if (result.statusCode < 300 || result.statusCode >= 400 || !result.location) {
      return "";
    }
    if (!isAllowedNetEaseLink(result.location)) {
      return "";
    }
    url = result.location;
  }
  return "";
}

// Return a random subset of `size` items from `arr` using a partial
// Fisher-Yates shuffle. Does not mutate the input. If `size` >= length the
// whole array (shuffled copy) is returned.
function sampleArray(arr, size) {
  const copy = arr.slice();
  const n = Math.min(size, copy.length);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Resolve a NetEase playlist link into its metadata and full track list. Shared
// by the single-shot /api/netease-playlist handler and the playlist aggregate
// job. Throws an Error carrying a `statusCode` so callers can map it to the
// right HTTP status.
async function loadNetEasePlaylist(raw) {
  const id = await resolveNetEasePlaylistId(raw);
  if (!id) {
    const isSongLink = /\/song[/?#]/i.test(cleanTerm(raw)) || /\/song$/i.test(cleanTerm(raw));
    const error = new Error(isSongLink
      ? "这是一个单曲链接，不是歌单链接。请粘贴网易云歌单（/playlist）链接。"
      : "没有在网易云链接中找到歌单 id。");
    error.statusCode = 400;
    throw error;
  }
  const data = await fetchJson(`https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}`, {
    "referer": "https://music.163.com/"
  });
  const playlist = data && data.playlist;
  if (!playlist || !Array.isArray(playlist.tracks)) {
    const error = new Error(`网易云没有返回歌单 id ${id} 的曲目信息。`);
    error.statusCode = 404;
    throw error;
  }
  // The v6 playlist/detail endpoint only inlines the first handful of tracks
  // in `playlist.tracks`, but it lists every track's id in
  // `playlist.trackIds`. Fetch the full song details by id so the whole
  // playlist is available, not just the preview slice.
  let rawTracks = playlist.tracks;
  const trackIds = Array.isArray(playlist.trackIds)
    ? playlist.trackIds.map(item => String(item && item.id ? item.id : "")).filter(Boolean)
    : [];
  // Full size of the playlist (every listed track), before any down-sampling.
  const originalCount = Math.max(trackIds.length, rawTracks.length);
  // Big playlists are randomly down-sampled to PLAYLIST_MAX_TRACKS so analysis
  // stays tractable. We sample at the id level (before fetching song names) to
  // avoid pulling details we would only throw away.
  let sampled = false;
  let sampledCount = originalCount;
  if (PLAYLIST_MAX_TRACKS > 0 && trackIds.length > PLAYLIST_MAX_TRACKS) {
    const pickedIds = sampleArray(trackIds, PLAYLIST_MAX_TRACKS);
    const fetched = await fetchNetEaseSongsByIds(pickedIds);
    if (fetched.length) {
      rawTracks = fetched;
      sampled = true;
      sampledCount = fetched.length;
    }
  } else if (trackIds.length > rawTracks.length) {
    const fetched = await fetchNetEaseSongsByIds(trackIds);
    if (fetched.length) rawTracks = fetched;
  }
  const tracks = rawTracks.map(track => ({
    id: String(track.id || ""),
    title: track.name || "",
    artists: ((track.ar || track.artists) || []).map(artist => artist.name).filter(Boolean),
    album: (track.al && track.al.name) || (track.album && track.album.name) || "",
    albumImage: albumImageFromNetEaseTrack(track),
    sourceUrl: `https://music.163.com/song?id=${track.id}`
  })).filter(track => track.title);
  // Fall back to sampling the already-detailed tracks when trackIds was absent
  // but the inlined list still exceeds the cap.
  let finalTracks = tracks;
  if (!sampled && PLAYLIST_MAX_TRACKS > 0 && tracks.length > PLAYLIST_MAX_TRACKS) {
    finalTracks = sampleArray(tracks, PLAYLIST_MAX_TRACKS);
    sampled = true;
    sampledCount = finalTracks.length;
  } else if (sampled) {
    sampledCount = tracks.length;
  }
  return {
    id: String(playlist.id || id),
    name: playlist.name || "",
    coverImgUrl: playlist.coverImgUrl || "",
    trackCount: playlist.trackCount || originalCount,
    // originalCount = playlist size; sampled/sampledCount tell the client when a
    // random subset was analyzed instead of the whole playlist.
    originalCount,
    sampled,
    sampledCount,
    creator: playlist.creator && playlist.creator.nickname ? playlist.creator.nickname : "",
    sourceUrl: `https://music.163.com/playlist?id=${id}`,
    tracks: finalTracks
  };
}

async function handleNetEasePlaylist(req, res) {
  try {
    const body = await readBody(req);
    const raw = body.url || body.id || "";
    const playlist = await loadNetEasePlaylist(raw);
    sendJson(res, 200, playlist);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

// Fetch full song metadata for a list of NetEase track ids. The public
// song/detail endpoint accepts a JSON id array in the query string but caps the
// batch size, so ids are chunked and the results concatenated in order.
async function fetchNetEaseSongsByIds(ids) {
  const BATCH = 100;
  const byId = new Map();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const query = encodeURIComponent(JSON.stringify(chunk.map(id => ({ id }))));
    const data = await fetchJson(`https://music.163.com/api/v3/song/detail?c=${query}`, {
      "referer": "https://music.163.com/"
    });
    for (const song of (data && data.songs) || []) {
      if (song && song.id != null) byId.set(String(song.id), song);
    }
  }
  // Preserve the playlist's original ordering.
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function normalizeAlbumImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url = raw.startsWith("//") ? `https:${raw}` : raw;
  url = url.replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("param")) parsed.searchParams.set("param", "180y180");
    return parsed.toString();
  } catch {
    return url;
  }
}

function albumImageFromNetEaseTrack(track) {
  return normalizeAlbumImageUrl(
    (track.al && (track.al.picUrl || track.al.blurPicUrl))
    || (track.album && (track.album.picUrl || track.album.blurPicUrl))
    || ""
  );
}

async function handleQQMusicSong(req, res) {
  try {
    const body = await readBody(req);
    const songMid = await resolveQQMusicSongMid(body.url || body.id || body.songMid || "");
    if (!songMid) {
      sendJson(res, 400, { error: "没有在 QQ 音乐链接中找到 songmid。" });
      return;
    }

    const song = await fetchQQMusicSong(songMid);
    if (!song) {
      sendJson(res, 404, { error: `QQ 音乐没有返回 songmid ${songMid} 的歌曲信息。` });
      return;
    }
    sendJson(res, 200, song);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function resolveSpotifyTrackId(value) {
  const directId = extractSpotifyTrackId(value);
  if (directId) return directId;

  let url = extractHttpUrl(value);
  if (!url || !isAllowedSpotifyLink(url)) return "";

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const id = extractSpotifyTrackId(url);
    if (id) return id;

    const result = await fetchRedirectLocation(url);
    if (result.statusCode < 300 || result.statusCode >= 400 || !result.location) {
      return "";
    }
    if (!isAllowedSpotifyLink(result.location)) {
      return "";
    }
    url = result.location;
  }
  return "";
}

async function fetchSpotifyTrack(trackId) {
  const html = await fetchText(`https://open.spotify.com/embed/track/${trackId}`, {
    referer: "https://open.spotify.com/"
  });
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  let entity;
  try {
    entity = JSON.parse(match[1]).props.pageProps.state.data.entity;
  } catch {
    return null;
  }
  if (!entity || !(entity.name || entity.title)) return null;

  return {
    id: String(entity.id || trackId),
    title: entity.name || entity.title,
    artists: (entity.artists || []).map(artist => artist.name).filter(Boolean),
    album: entity.album && entity.album.name ? entity.album.name : "",
    sourceUrl: `https://open.spotify.com/track/${trackId}`
  };
}

async function handleSpotifySong(req, res) {
  try {
    const body = await readBody(req);
    const trackId = await resolveSpotifyTrackId(body.url || body.id || "");
    if (!trackId) {
      sendJson(res, 400, { error: "没有在 Spotify 链接中找到 track id。" });
      return;
    }

    const song = await fetchSpotifyTrack(trackId);
    if (!song) {
      sendJson(res, 404, { error: `Spotify 没有返回 track ${trackId} 的歌曲信息。` });
      return;
    }
    sendJson(res, 200, song);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function isAudioUrl(url) {
  return /\.(mp3|wav|m4a|aac|ogg|flac)(?:[?#].*)?$/i.test(url);
}

function safeDownloadName(ext = ".mp3") {
  return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
}

function safeAudioExtension(fileName, fallback = ".mp3") {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return MIME[ext] && /^audio\//.test(MIME[ext]) ? ext : fallback;
}

function localDownloadPath(fileName) {
  const baseName = path.basename(String(fileName || ""));
  if (!baseName) return "";
  const filePath = path.resolve(DOWNLOAD_DIR, baseName);
  const relative = path.relative(DOWNLOAD_DIR, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? filePath : "";
}

async function deleteLocalAudio(filePath) {
  const relative = path.relative(DOWNLOAD_DIR, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`无法删除临时音频 ${path.basename(filePath)}: ${error.message}`);
    }
    return false;
  }
}

function downloadDirectAudio(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const lib = url.startsWith("https:") ? https : http;
    let received = 0;
    const req = lib.get(url, {
      headers: { "user-agent": "GenreLab/1.0" },
      timeout: 20000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(outputPath, () => {});
        downloadDirectAudio(new URL(res.headers.location, url).toString(), outputPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败，HTTP ${res.statusCode}`));
        return;
      }
      res.on("data", chunk => {
        received += chunk.length;
        if (received > MAX_AUDIO_BYTES) {
          req.destroy(new Error("音频超过 90MB，本地分析工具已停止下载。"));
        }
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("timeout", () => req.destroy(new Error("下载超时。")));
    req.on("error", error => {
      file.close();
      fs.unlink(outputPath, () => {});
      reject(error);
    });
  });
}

function downloadWithYtDlp(input) {
  return new Promise((resolve, reject) => {
    const base = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
    const template = path.join(DOWNLOAD_DIR, `${base}.%(ext)s`);
    const args = [
      "--no-update",
      "--no-warnings",
      "--no-playlist",
      "--retries", "2",
      "--fragment-retries", "2",
      "--max-filesize", "90M",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "5"
    ];
    const ffmpegLocation = ytdlpFfmpegLocation();
    if (ffmpegLocation) args.push("--ffmpeg-location", ffmpegLocation);
    args.push("-o", template, input);
    const child = spawn("yt-dlp", args, {
      cwd: ROOT,
      env: { ...process.env, PATH: RUNTIME_PATH },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("yt-dlp 下载超时。"));
    }, 120000);

    child.stderr.on("data", chunk => stderr += chunk.toString());
    child.on("error", error => {
      clearTimeout(timer);
      reject(new Error(`无法启动 yt-dlp：${error.message}`));
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(cleanYtDlpError(stderr, `yt-dlp 退出码 ${code}`)));
        return;
      }
      const file = fs.readdirSync(DOWNLOAD_DIR).find(name => name.startsWith(base + "."));
      if (!file) {
        reject(new Error("yt-dlp 未生成音频文件。"));
        return;
      }
      resolve(path.join(DOWNLOAD_DIR, file));
    });
  });
}

function containsChineseText(value) {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(String(value || ""));
}

function titleSearchVariants(title) {
  const raw = cleanTerm(title);
  const variants = [
    raw,
    raw.replace(/\s*[\(\[（【].*?[\)\]）】]\s*/g, " ").trim()
  ];
  return uniqueNormalized(variants).filter(Boolean);
}

function plainSearchTerm(value) {
  return cleanTerm(value)
    .replace(/['’`´]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artistTitleSearchQuery(target = {}, fallbackQuery = "") {
  const artists = Array.isArray(target.artists) ? target.artists.join(" ") : "";
  const artistText = plainSearchTerm(artists);
  const titleText = plainSearchTerm(target.title || "");
  if (artistText && titleText) return `${artistText} - ${titleText}`;
  return [artistText, titleText].filter(Boolean).join(" ") || fallbackQuery;
}

function selectSearchSources(query, target = {}) {
  const artists = Array.isArray(target.artists) ? target.artists : [];
  const text = [target.title || "", ...artists, query || ""].join(" ");
  const secondary = containsChineseText(text)
    ? YTDLP_SEARCH_SOURCES.bilibili
    : YTDLP_SEARCH_SOURCES.soundcloud;
  return [YTDLP_SEARCH_SOURCES.youtube, secondary];
}

function candidateUrlFromEntry(entry, source) {
  const url = entry.webpage_url || entry.url || "";
  if (/^https?:\/\//i.test(url)) return url;
  if (entry.id && source.name === "youtube") {
    return `https://www.youtube.com/watch?v=${entry.id}`;
  }
  if (entry.id && source.name === "bilibili") {
    return `https://www.bilibili.com/video/${entry.id}`;
  }
  return "";
}

function sourceSearchQuery(source, fallbackQuery, target = {}) {
  if (source.name === "youtube") return artistTitleSearchQuery(target, fallbackQuery);
  if (source.name !== "bilibili") return fallbackQuery;
  const artists = Array.isArray(target.artists) ? target.artists.join(" ") : "";
  return [target.title || "", artists].map(plainSearchTerm).filter(Boolean).join(" ") || fallbackQuery;
}

function parseSearchCandidatesPayload(stdout, source) {
  const data = JSON.parse(stdout);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries
    .filter(Boolean)
    .map(entry => {
      const url = candidateUrlFromEntry(entry, source);
      return {
        title: entry.title || entry.fulltitle || "",
        artistText: [entry.uploader, entry.channel].filter(Boolean).join(" "),
        url,
        source: source.name,
        sourceLabel: source.label,
        sourcePriority: source.priority
      };
    })
    .filter(entry => /^https?:\/\//i.test(entry.url));
}

function listSearchCandidates(source, query) {
  return new Promise((resolve, reject) => {
    const limit = source.limit || SEARCH_RESULT_LIMIT;
    const args = [
      "--no-update",
      "--no-warnings",
      "--dump-single-json",
      `${source.prefix}${limit}:${query}`
    ];
    if (source.flatPlaylist !== false) {
      args.splice(2, 0, "--flat-playlist");
    }
    const child = spawn("yt-dlp", args, {
      cwd: ROOT,
      env: { ...process.env, PATH: RUNTIME_PATH },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("yt-dlp 搜索超时。"));
    }, 45000);

    child.stdout.on("data", chunk => stdout += chunk.toString());
    child.stderr.on("data", chunk => stderr += chunk.toString());
    child.on("error", error => {
      clearTimeout(timer);
      reject(new Error(`无法启动 yt-dlp：${error.message}`));
    });
    child.on("close", code => {
      clearTimeout(timer);
      try {
        const candidates = parseSearchCandidatesPayload(stdout, source);
        if (candidates.length || code === 0) {
          resolve(candidates);
          return;
        }
        reject(new Error(stderr.trim() || `yt-dlp 搜索退出码 ${code}`));
      } catch (error) {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `yt-dlp 搜索退出码 ${code}`));
          return;
        }
        reject(new Error(`无法解析 yt-dlp 搜索结果：${error.message}`));
      }
    });
  });
}

function searchResultSummary(searchResults) {
  return searchResults.map(result => result.error
    ? `${result.source.label} 搜索失败`
    : `${result.source.label} ${result.candidates.length} 个`)
    .join("，");
}

function candidateMatchScore(candidate, title, artists) {
  const candidateText = normalizeText(candidate.title);
  const candidateArtistText = normalizeText(candidate.artistText || "");
  const artistText = normalizeText(artists.join(" "));
  const artistTokens = artistText.split(" ").filter(token => token.length > 1);
  let score = 0;

  const titleScores = titleSearchVariants(title).map(variant => {
    const titleText = normalizeText(variant);
    const titleTokens = titleText.split(" ").filter(token => token.length > 1);
    if (titleText && candidateText.includes(titleText)) return 70;
    if (!titleTokens.length) return 0;
    const hits = titleTokens.filter(token => candidateText.includes(token)).length;
    return Math.round((hits / titleTokens.length) * 46);
  });
  score += titleScores.length ? Math.max(...titleScores) : 0;

  if (artistText && (candidateText.includes(artistText) || candidateArtistText.includes(artistText))) score += 42;
  else if (artistTokens.length) {
    const hits = artistTokens.filter(token => candidateText.includes(token) || candidateArtistText.includes(token)).length;
    score += Math.round((hits / artistTokens.length) * 28);
  }

  if (/\b(official|audio|topic|provided to youtube)\b/i.test(candidate.title)) score += 8;
  if (/\b(cover|karaoke|reaction|instrumental|remix|lyrics?)\b/i.test(candidate.title) || /歌詞|歌词|動態歌詞|动态歌词/.test(candidate.title)) score -= 14;
  return score;
}

function rankSearchCandidates(candidates, target = {}) {
  const artists = Array.isArray(target.artists) ? target.artists : [];
  return uniqueBy(candidates, candidate => candidate.url)
    .map(candidate => ({ ...candidate, matchScore: candidateMatchScore(candidate, target.title || "", artists) }))
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return (a.sourcePriority || 0) - (b.sourcePriority || 0);
    });
}

async function downloadSearchAudio(query, target = {}) {
  const searchSources = selectSearchSources(query, target);
  const results = await Promise.allSettled(searchSources.map(source => listSearchCandidates(source, sourceSearchQuery(source, query, target))));
  const searchResults = results.map((result, index) => ({
    source: searchSources[index],
    candidates: result.status === "fulfilled" ? result.value : [],
    error: result.status === "rejected" ? result.reason.message : ""
  }));
  const candidates = searchResults.flatMap(result => result.candidates);
  const searchErrors = searchResults
    .map(result => result.error ? `${result.source.label}: ${result.error}` : "")
    .filter(Boolean);
  const summary = searchResultSummary(searchResults);
  const ranked = rankSearchCandidates(candidates, target);
  const viable = ranked.filter(candidate => candidate.matchScore >= 45);
  const errors = [];
  for (const candidate of viable) {
    try {
      const filePath = await downloadWithYtDlp(candidate.url);
      return { filePath, candidate };
    } catch (error) {
      errors.push(`${candidate.title || candidate.url}: ${error.message.split("\n").slice(-1)[0]}`);
    }
  }
  if (!candidates.length) {
    const detail = searchErrors.length ? ` 搜索错误：${searchErrors.join("；")}` : "";
    throw new Error(`没有找到可下载的公开视频候选。搜索范围：${summary}。${detail}`);
  }
  if (!viable.length) {
    throw new Error(`找到 ${candidates.length} 个候选（${summary}），但没有标题足够匹配的音频。最佳候选：${ranked[0] ? `${ranked[0].sourceLabel} - ${ranked[0].title}` : "无"}`);
  }
  throw new Error(`找到 ${viable.length} 个匹配候选，但都无法下载：${errors.slice(0, 3).join("；")}`);
}

// Core download logic shared by the single-track /api/download handler and the
// playlist aggregate job. Takes the same fields as the /api/download body and
// returns the response payload (including the resolved local `filePath`), or
// throws when nothing could be downloaded. A `validationError` on the thrown
// error signals a 400-class input problem rather than a 500 failure.
async function runDownload(body) {
  const startedAt = process.hrtime.bigint();
  const url = String(body.url || "").trim();
  const manualUrl = extractHttpUrl(url) || url;
  const platformUrl = String(body.platformUrl || body.sourceUrl || "").trim();
  const manualPlatformSource = musicPlatformDownloadSource(url);
  const platformSource = manualPlatformSource || (!/^https?:\/\//i.test(manualUrl) ? musicPlatformDownloadSource(platformUrl) : null);
  const title = cleanTerm(body.title);
  const artists = splitArtists(body.artists);
  const query = String(body.query || [quoteSearchTerm(title), quoteSearchTerm(artists.join(" "))].filter(Boolean).join(" ")).trim();
  if (!/^https?:\/\//i.test(manualUrl) && !platformSource && !query) {
    const error = new Error("请输入“歌名 - 艺人”，或提供音频/公开视频链接。");
    error.validationError = true;
    throw error;
  }

  let filePath;
  let method;
  let selectedSource = manualUrl || (platformSource && platformSource.url) || query;
  let downloadResult = null;
  let fallbackReason = "";
  if (/^https?:\/\//i.test(manualUrl) && !manualPlatformSource) {
    if (isAudioUrl(manualUrl)) {
      const ext = path.extname(new URL(manualUrl).pathname).toLowerCase() || ".mp3";
      filePath = path.join(DOWNLOAD_DIR, safeDownloadName(ext));
      await downloadDirectAudio(manualUrl, filePath);
      method = "direct";
    } else {
      filePath = await downloadWithYtDlp(manualUrl);
      method = "yt-dlp";
    }
  } else if (platformSource) {
    try {
      filePath = await downloadWithYtDlp(platformSource.url);
      method = "yt-dlp-platform";
      selectedSource = `${platformSource.label}: ${title || platformSource.url}`;
    } catch (error) {
      fallbackReason = `${platformSource.label}下载失败：${conciseErrorMessage(error)}`;
      try {
        downloadResult = await downloadSearchAudio(query, { title, artists });
      } catch (searchError) {
        throw new Error(`${fallbackReason}；回退搜索也失败：${searchError.message}`);
      }
      filePath = downloadResult.filePath;
      method = "yt-dlp-search-fallback";
      selectedSource = downloadResult.candidate.title
        ? `${downloadResult.candidate.sourceLabel}: ${downloadResult.candidate.title}`
        : query;
    }
  } else {
    downloadResult = await downloadSearchAudio(query, { title, artists });
    filePath = downloadResult.filePath;
    method = "yt-dlp-search";
    selectedSource = downloadResult.candidate.title
      ? `${downloadResult.candidate.sourceLabel}: ${downloadResult.candidate.title}`
      : query;
  }

  return {
    method,
    source: selectedSource,
    fallbackReason,
    elapsedSeconds: elapsedSecondsSince(startedAt),
    matchScore: downloadResult && downloadResult.candidate ? downloadResult.candidate.matchScore : null,
    sourcePlatform: downloadResult && downloadResult.candidate
      ? downloadResult.candidate.source
      : (method === "yt-dlp-platform" && platformSource ? platformSource.platform : null),
    audioUrl: `/downloads/${path.basename(filePath)}`,
    fileName: path.basename(filePath),
    filePath
  };
}

async function handleDownload(req, res) {
  const startedAt = process.hrtime.bigint();
  try {
    const body = await readBody(req);
    const result = await runDownload(body);
    // The local filePath is an internal detail; the single-track API only
    // exposes the download-relative audioUrl / fileName.
    const { filePath, ...payload } = result;
    void filePath;
    sendJson(res, 200, payload);
  } catch (error) {
    if (error.validationError) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    sendJson(res, 500, {
      error: error.message,
      elapsedSeconds: elapsedSecondsSince(startedAt),
      hint: "如果是网易云/付费平台，通常不能直接下载受版权保护的完整音频；可以改用本地上传或公开试听/直链音频。"
    });
  }
}

async function handleUploadAudio(req, res) {
  try {
    const ext = safeAudioExtension(req.headers["x-file-name"] || "");
    const fileName = safeDownloadName(ext);
    const filePath = path.join(DOWNLOAD_DIR, fileName);
    const data = await readBinaryBody(req);
    if (!data.length) {
      sendJson(res, 400, { error: "没有收到音频数据。" });
      return;
    }
    fs.writeFileSync(filePath, data);
    sendJson(res, 200, {
      method: "upload",
      source: req.headers["x-file-name"] || fileName,
      audioUrl: `/downloads/${fileName}`,
      fileName
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

// Essentia runs inside a single long-lived Python worker. Spawning Python and
// loading the TensorFlow model graph costs several seconds, so instead of
// starting a fresh process per track we lazily start ONE worker on the first
// request and reuse it for every later analysis. The worker stays alive between
// requests; it is only (re)spawned when it is missing or after a crash/timeout.
//
// A single Python process is CPU/RAM heavy and the worker's stdin loop handles
// one request at a time, so we still serialize every analysis through this FIFO
// async queue: two concurrent playlists interleave track-by-track on the shared
// worker instead of piling up parallel Pythons.
//
// The worker's TensorFlow model stays resident (~1.2GB RSS) for as long as the
// process lives. On small hosts that memory matters, so after ESSENTIA_IDLE_MS
// with no requests we kill the worker to give the memory back to the OS; the
// next analysis simply pays the lazy startup cost again.
const ESSENTIA_REQUEST_TIMEOUT = 180000;
const ESSENTIA_IDLE_MS = Number(process.env.ESSENTIA_IDLE_MS || 60000);
let essentiaWorker = null;
let essentiaQueue = Promise.resolve();
let essentiaRequestId = 0;

function analyzeWithEssentia(filePath, top = 12, modelName = GENRE_MODEL_NAME) {
  const run = essentiaQueue.then(() => runEssentiaOnWorker(filePath, top, modelName));
  // Keep the chain alive regardless of this run's outcome so a failure doesn't
  // wedge the queue for everyone behind it.
  essentiaQueue = run.then(() => {}, () => {});
  return run;
}

// Kill an idle worker so its resident model memory is returned to the OS. Armed
// after each response; disarmed as soon as a new request grabs the worker.
function scheduleEssentiaIdleShutdown(worker) {
  clearTimeout(worker.idleTimer);
  worker.idleTimer = setTimeout(() => {
    if (essentiaWorker === worker) essentiaWorker = null;
    try { worker.child.stdin.end(); } catch (error) { void error; }
    try { worker.child.kill("SIGTERM"); } catch (error) { void error; }
  }, ESSENTIA_IDLE_MS);
  // Don't let this timer keep the Node event loop alive on its own.
  if (typeof worker.idleTimer.unref === "function") worker.idleTimer.unref();
}

// Parse the worker's newline-delimited JSON stdout. Each analysis emits exactly
// one response object; a startup "ready" line and any stray non-JSON noise are
// ignored. Responses are matched to the in-flight request by id.
function handleEssentiaWorkerData(worker, chunk) {
  worker.buffer += chunk;
  let idx;
  while ((idx = worker.buffer.indexOf("\n")) >= 0) {
    const line = worker.buffer.slice(0, idx).trim();
    worker.buffer = worker.buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (error) {
      void error;
      continue;
    }
    if (msg.ready) continue;
    const current = worker.current;
    if (!current || (msg.id != null && msg.id !== current.id)) continue;
    clearTimeout(current.timer);
    worker.current = null;
    // The worker is now idle: start the countdown to free its model memory.
    scheduleEssentiaIdleShutdown(worker);
    if (msg.ok) current.resolve(msg.result);
    else current.reject(new Error(msg.error || "Essentia 分析失败。"));
  }
}

function startEssentiaWorker() {
  if (!fs.existsSync(ESSENTIA_PYTHON)) {
    throw new Error("Essentia Python 环境不存在，请先安装 .venv-essentia。");
  }
  if (!fs.existsSync(ESSENTIA_SCRIPT)) {
    throw new Error("Essentia 分析脚本不存在。");
  }
  const child = spawn(ESSENTIA_PYTHON, [ESSENTIA_SCRIPT, "--serve"], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const worker = { child, buffer: "", stderr: "", current: null, idleTimer: null };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => handleEssentiaWorkerData(worker, chunk));
  child.stderr.on("data", chunk => {
    worker.stderr += chunk.toString();
    // Keep only the tail so long-running workers don't accumulate log memory.
    if (worker.stderr.length > 8192) worker.stderr = worker.stderr.slice(-8192);
  });
  const failWorker = error => {
    clearTimeout(worker.idleTimer);
    if (essentiaWorker === worker) essentiaWorker = null;
    const current = worker.current;
    if (current) {
      clearTimeout(current.timer);
      worker.current = null;
      current.reject(error);
    }
  };
  // A clean idle-shutdown exits with a non-error message; only surface it to a
  // waiting request (there won't be one after an idle kill).
  child.on("error", err => failWorker(new Error(`无法启动 Essentia：${err.message}`)));
  child.on("close", code => failWorker(new Error(worker.stderr.trim() || `Essentia worker 退出码 ${code}`)));
  essentiaWorker = worker;
  return worker;
}

function runEssentiaOnWorker(filePath, top = 12, modelName = GENRE_MODEL_NAME) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = essentiaWorker && essentiaWorker.child.stdin.writable
        ? essentiaWorker
        : startEssentiaWorker();
    } catch (error) {
      reject(error);
      return;
    }
    // A request is arriving: cancel any pending idle shutdown so the worker
    // isn't killed out from under us.
    clearTimeout(worker.idleTimer);
    const id = ++essentiaRequestId;
    const timer = setTimeout(() => {
      // The worker processes one request at a time, so a stuck request means
      // the whole worker is wedged: kill it and let the next call respawn.
      clearTimeout(worker.idleTimer);
      if (essentiaWorker === worker) essentiaWorker = null;
      worker.current = null;
      try { worker.child.kill("SIGTERM"); } catch (error) { void error; }
      reject(new Error("Essentia 曲风分析超时。"));
    }, ESSENTIA_REQUEST_TIMEOUT);
    worker.current = { id, resolve, reject, timer };
    const payload = JSON.stringify({ id, audio: filePath, top, model: modelName }) + "\n";
    try {
      worker.child.stdin.write(payload);
    } catch (error) {
      clearTimeout(timer);
      worker.current = null;
      reject(new Error(`无法向 Essentia worker 写入：${error.message}`));
    }
  });
}

async function handleEssentia(req, res) {
  const startedAt = process.hrtime.bigint();
  let cleanupPath = "";
  try {
    const body = await readBody(req);
    const modelName = resolveRequestModelName(body.model);
    const fileName = body.fileName || String(body.audioUrl || "").replace(/^\/downloads\//, "");
    const filePath = localDownloadPath(fileName);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, { error: "没有找到可供 Essentia 分析的本地音频文件。" });
      return;
    }
    cleanupPath = filePath;
    const result = await analyzeWithEssentia(filePath, Math.max(1, Math.min(30, Number(body.top || 12))), modelName);
    const deletedAudio = await deleteLocalAudio(filePath);
    cleanupPath = "";
    sendJson(res, 200, {
      ...result,
      fileName: path.basename(filePath),
      source: `essentia-${modelName}`,
      modelKey: modelName,
      elapsedSeconds: elapsedSecondsSince(startedAt),
      deletedAudio
    });
  } catch (error) {
    if (cleanupPath) await deleteLocalAudio(cleanupPath);
    sendJson(res, 500, { error: error.message, elapsedSeconds: elapsedSecondsSince(startedAt) });
  }
}

async function handleLog(req, res) {
  try {
    const body = await readBody(req);
    const entry = {
      timePoint: new Date().toISOString(),
      ip: clientIp(req),
      device: requestDevice(req),
      clientTimePoint: body.timePoint || "",
      clientCompletedAt: body.completedAt || "",
      input: body.input || {},
      parsedTrack: body.parsedTrack || {},
      audioDownload: body.audioDownload || {},
      essentia: body.essentia || {},
      workflow: body.workflow || {}
    };
    appendAnalysisLog(entry);
    sendJson(res, 200, {
      ok: true,
      logFile: path.relative(ROOT, ANALYSIS_LOG_FILE)
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Playlist aggregate analysis job
//
// A single POST submits a playlist and returns a jobId immediately; the tracks
// are then analyzed serially in the background. The client polls a status
// endpoint (carrying the jobId in the page URL) so mobile users can background
// the app and resume later. Running jobs are held in memory and mirrored to
// disk (one JSON file per jobId under .runtime/playlist-jobs); a finished job is
// dropped from memory but its file is kept forever. After a restart, requesting
// a jobId whose file was still "running" resumes the run on demand (see getJob),
// with a guard against launching the same run twice concurrently.
// ---------------------------------------------------------------------------
// In-memory map holds only jobs that are still running; a job is dropped from
// memory the moment it finishes (its persisted file remains on disk forever).
const PLAYLIST_JOBS = new Map();

// Persist a job to disk as a single JSON file holding everything the frontend
// needs to render (track list + per-track compositions + progress/state). The
// write is atomic (temp file + rename) because runPlaylistJob rewrites it after
// every completed track, so a restart mid-write must never read a half file.
function jobFilePath(jobId) {
  return path.join(PLAYLIST_JOBS_DIR, `${jobId}.json`);
}

function persistJob(job) {
  try {
    fs.mkdirSync(PLAYLIST_JOBS_DIR, { recursive: true });
    const target = jobFilePath(job.jobId);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job));
    fs.renameSync(tmp, target);
  } catch (error) {
    console.warn(`无法持久化歌单任务 ${job.jobId}: ${error.message}`);
  }
}

// Look up a job by id. Running jobs live in memory; otherwise the persisted
// file is read from disk. If that file shows a job that was still "running"
// when the server stopped, it is resumed on demand here. The in-memory map is
// populated SYNCHRONOUSLY before the async run starts, so a second concurrent
// request for the same jobId finds it in memory and never launches a duplicate
// run (Node's single thread guarantees the sync section is not interleaved).
function getJob(jobId) {
  if (!jobId) return null;
  if (PLAYLIST_JOBS.has(jobId)) return PLAYLIST_JOBS.get(jobId);
  let job;
  try {
    job = JSON.parse(fs.readFileSync(jobFilePath(jobId), "utf8"));
  } catch {
    return null;
  }
  if (job.state === "running") resumeJob(job);
  return job;
}

async function hydratePlaylistAlbumImages(job) {
  const tracks = job && Array.isArray(job.tracks) ? job.tracks : [];
  const missing = tracks
    .filter(track => track && track.id && !track.albumImage)
    .map(track => String(track.id));
  if (!missing.length) return;
  const details = await fetchNetEaseSongsByIds([...new Set(missing)]);
  const imageById = new Map(details.map(track => [String(track.id), albumImageFromNetEaseTrack(track)]));
  let changed = false;
  for (const track of tracks) {
    const image = imageById.get(String(track.id || ""));
    if (image && !track.albumImage) {
      track.albumImage = image;
      changed = true;
    }
  }
  if (changed) persistJob(job);
}

// Register an interrupted job in memory and continue its run from where it
// stopped. Must set the map entry before awaiting anything (see getJob).
function resumeJob(job) {
  PLAYLIST_JOBS.set(job.jobId, job);
  runPlaylistJob(job).catch(error => {
    job.state = "error";
    job.error = error.message;
    job.updatedAt = Date.now();
    persistJob(job);
    PLAYLIST_JOBS.delete(job.jobId);
  });
}

// GenreCore taxonomy bundles (distinct shape from the server's own bundle) are
// built lazily per model and cached for the lifetime of the process.
const GENRE_CORE_BUNDLES = new Map();

function getGenreCoreBundle(modelName) {
  const name = GENRE_MODELS[modelName] ? modelName : GENRE_MODEL_NAME;
  if (!GENRE_CORE_BUNDLES.has(name)) {
    GENRE_CORE_BUNDLES.set(name, GenreCore.buildTaxonomy(loadDiscogsTaxonomy(name)));
  }
  return GENRE_CORE_BUNDLES.get(name);
}

// Analyze a single playlist track: download → Essentia → metadata → score.
// Returns a per-track result record; never throws (failures are captured).
async function analyzePlaylistTrack(track, modelName, bundle) {
  const artists = (track.artists || []).join(" / ");
  let download;
  try {
    download = await runDownload({
      url: "",
      platformUrl: track.sourceUrl || "",
      platform: "netease-url",
      title: track.title,
      artists,
      query: [`"${track.title}"`, artists ? `"${artists}"` : ""].filter(Boolean).join(" ")
    });
  } catch (error) {
    return { status: "failed", stage: "download", error: error.message };
  }

  let essentia;
  try {
    essentia = await analyzeWithEssentia(download.filePath, 12, modelName);
  } catch (error) {
    await deleteLocalAudio(download.filePath);
    return { status: "failed", stage: "essentia", error: error.message };
  }
  await deleteLocalAudio(download.filePath);

  // Metadata is optional: it only boosts styles Essentia already found.
  let metadata = null;
  try {
    metadata = await runMetadata({ title: track.title, artists, album: track.album || "", model: modelName });
  } catch (error) {
    void error;
  }

  const composition = GenreCore.scoreTrack(bundle, {
    essentia,
    metadata,
    track: { title: track.title, artists }
  });

  if (!composition.length) {
    return { status: "failed", stage: "score", error: "没有匹配到曲风。" };
  }
  return { status: "ok", composition };
}

// Background driver: walks the job's tracks serially and records each result,
// persisting the job to disk after every track so a restart can resume from the
// last completed index (already-done tracks are skipped) and finished results
// survive. `completed` is recomputed from results so a resumed job stays
// consistent regardless of how far the previous run got. Once finished the job
// is dropped from memory — its persisted file keeps serving future requests.
async function runPlaylistJob(job) {
  const bundle = getGenreCoreBundle(job.modelName);
  persistJob(job);
  for (let i = 0; i < job.tracks.length; i += 1) {
    if (job.results[i]) continue;
    const result = await analyzePlaylistTrack(job.tracks[i], job.modelName, bundle);
    job.results[i] = { index: i, ...result };
    job.completed = job.results.filter(Boolean).length;
    job.updatedAt = Date.now();
    persistJob(job);
  }
  job.state = "done";
  job.ok = job.results.filter(item => item && item.status === "ok").length;
  job.updatedAt = Date.now();
  persistJob(job);
  PLAYLIST_JOBS.delete(job.jobId);
}

async function handleAnalyzePlaylist(req, res) {
  try {
    const body = await readBody(req);
    const raw = body.url || body.id || "";
    const modelName = resolveRequestModelName(body.model);

    const playlist = await loadNetEasePlaylist(raw);
    const tracks = playlist.tracks || [];
    if (!tracks.length) {
      sendJson(res, 404, { error: "歌单里没有可分析的曲目。" });
      return;
    }

    const jobId = crypto.randomBytes(8).toString("hex");
    const now = Date.now();
    const job = {
      jobId,
      state: "running",
      modelName,
      // Original user input, kept so a resumed page can refill the link box.
      inputUrl: raw,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl,
      creator: playlist.creator,
      sourceUrl: playlist.sourceUrl,
      // Sampling metadata: when a big playlist was down-sampled, originalCount is
      // its full size and `sampled` is true so the client can explain that only a
      // random subset (tracks.length) is being analyzed.
      originalCount: playlist.originalCount || tracks.length,
      sampled: Boolean(playlist.sampled),
      tracks,
      total: tracks.length,
      results: new Array(tracks.length).fill(null),
      completed: 0,
      ok: 0,
      createdAt: now,
      updatedAt: now
    };
    PLAYLIST_JOBS.set(jobId, job);
    persistJob(job);

    // Start analysis in the background; the response returns immediately so the
    // client can render the track cards and begin polling.
    runPlaylistJob(job).catch(error => {
      job.state = "error";
      job.error = error.message;
      job.updatedAt = Date.now();
      persistJob(job);
      PLAYLIST_JOBS.delete(job.jobId);
    });

    sendJson(res, 200, {
      jobId,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl,
      creator: playlist.creator,
      sourceUrl: playlist.sourceUrl,
      total: tracks.length,
      originalCount: playlist.originalCount || tracks.length,
      sampled: Boolean(playlist.sampled),
      modelKey: modelName,
      tracks
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

async function handlePlaylistStatus(req, res, url) {
  const jobId = url.searchParams.get("jobId") || "";
  const job = getJob(jobId);
  if (!job) {
    sendJson(res, 404, { error: "分析任务不存在或已过期，请重新发起。", state: "expired" });
    return;
  }
  try {
    await hydratePlaylistAlbumImages(job);
  } catch (error) {
    console.warn(`无法补全歌单封面 ${jobId}: ${error.message}`);
  }
  // Incremental delivery: the client passes the count it already has so we only
  // ship newly completed results, which keeps mobile polling payloads small.
  const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
  const results = [];
  for (let i = since; i < job.results.length; i += 1) {
    if (job.results[i]) results.push(job.results[i]);
  }
  sendJson(res, 200, {
    jobId: job.jobId,
    state: job.state,
    error: job.error || "",
    inputUrl: job.inputUrl || "",
    name: job.name,
    total: job.total,
    originalCount: job.originalCount || job.total,
    sampled: Boolean(job.sampled),
    completed: job.completed,
    ok: job.ok,
    // The track list lets a resumed page (which never saw the submit response)
    // rebuild the cards. It is small (title/artist strings only).
    tracks: job.tracks,
    since,
    results,
    updatedAt: job.updatedAt
  });
}

async function handleCoverImage(req, res, url) {
  try {
    const raw = url.searchParams.get("url") || "";
    const imageUrl = normalizeAlbumImageUrl(raw);
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" || !/\.music\.126\.net$/i.test(parsed.hostname)) {
      sendJson(res, 400, { error: "Unsupported image host." });
      return;
    }
    const image = await fetchBinary(imageUrl, {
      referer: "https://music.163.com/"
    });
    res.writeHead(200, {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400",
      "content-length": image.data.length
    });
    res.end(image.data);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Per-model config files. taxonomy is a per-model JSON config under
  // data/<model>/. The frontend requests it as a JS global and may pass
  // ?model=<name> to pick a model; without the query it falls back to the
  // active default. The JSON is wrapped into a `window.<VAR> = ...` script on
  // the fly, so there is no separate generated public/*.js to keep in sync.
  const PER_MODEL_CONFIG = {
    "/discogs-taxonomy.js": { json: "discogs-taxonomy.json", global: "DISCOGS_TAXONOMY" }
  };
  if (PER_MODEL_CONFIG[pathname]) {
    const { json, global } = PER_MODEL_CONFIG[pathname];
    const modelName = resolveRequestModelName(url.searchParams.get("model"));
    const modelFile = path.join(ROOT, "data", modelName, json);
    fs.readFile(modelFile, "utf8", (error, raw) => {
      if (error) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[".js"],
        "cache-control": "no-cache, must-revalidate"
      });
      res.end(`window.${global} = ${raw.trim()};\n`);
    });
    return;
  }

  // Shared config files that are model-agnostic (e.g. style profiles). They
  // live under data/ and are served the same way as per-model configs but
  // without a model dimension.
  const SHARED_CONFIG = {
    "/discogs-style-profiles.js": { json: "discogs-style-profiles.json", global: "DISCOGS_STYLE_PROFILES" }
  };
  if (SHARED_CONFIG[pathname]) {
    const { json, global } = SHARED_CONFIG[pathname];
    const sharedFile = path.join(ROOT, "data", json);
    fs.readFile(sharedFile, "utf8", (error, raw) => {
      if (error) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[".js"],
        "cache-control": "no-cache, must-revalidate"
      });
      res.end(`window.${global} = ${raw.trim()};\n`);
    });
    return;
  }

  const baseDir = pathname.startsWith("/downloads/") ? DOWNLOAD_DIR : PUBLIC_DIR;
  const relativePath = pathname.startsWith("/downloads/")
    ? pathname.replace(/^\/downloads\//, "")
    : pathname.replace(/^\//, "");
  const filePath = path.normalize(path.join(baseDir, relativePath));

  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "content-type": MIME[ext] || "application/octet-stream"
    };
    if ([".html", ".css", ".js"].includes(ext)) {
      headers["cache-control"] = "no-cache, must-revalidate";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/models") {
    const available = Object.entries(GENRE_MODELS)
      .filter(([key]) => fs.existsSync(path.join(ROOT, "data", key, "discogs-taxonomy.json")))
      .map(([key, model]) => ({ key, label: model.label }));
    sendJson(res, 200, {
      default: GENRE_MODEL_NAME,
      models: available
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/metadata") {
    handleMetadata(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/netease-song") {
    handleNetEaseSong(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/netease-playlist") {
    handleNetEasePlaylist(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/analyze-playlist") {
    handleAnalyzePlaylist(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/qq-song") {
    handleQQMusicSong(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/spotify-song") {
    handleSpotifySong(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/download") {
    handleDownload(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/upload-audio") {
    handleUploadAudio(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/essentia") {
    handleEssentia(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/log") {
    handleLog(req, res);
    return;
  }
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/analyze-playlist/status") {
      handlePlaylistStatus(req, res, url).catch(error => sendJson(res, 500, { error: error.message }));
      return;
    }
    if (url.pathname === "/api/cover-image") {
      handleCoverImage(req, res, url);
      return;
    }
    serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Genre Lab running at http://${HOST}:${PORT}`);
  });
  // Don't leave the long-lived Essentia worker orphaned when the server stops.
  const stopEssentiaWorker = () => {
    if (essentiaWorker) {
      try { essentiaWorker.child.kill("SIGTERM"); } catch (error) { void error; }
      essentiaWorker = null;
    }
  };
  process.on("exit", stopEssentiaWorker);
  process.on("SIGINT", () => { stopEssentiaWorker(); process.exit(0); });
  process.on("SIGTERM", () => { stopEssentiaWorker(); process.exit(0); });
}

module.exports = {
  candidateMatchScore,
  containsChineseText,
  extractHttpUrl,
  extractNetEaseSongId,
  extractNetEasePlaylistId,
  extractQQMusicSongMid,
  extractSpotifyTrackId,
  musicPlatformDownloadSource,
  parseSearchCandidatesPayload,
  rankSearchCandidates,
  resolveNetEaseSongId,
  resolveNetEasePlaylistId,
  resolveQQMusicSongMid,
  resolveSpotifyTrackId,
  selectSearchSources,
  sourceSearchQuery,
  server
};
