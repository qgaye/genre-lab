const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DOWNLOAD_DIR = path.join(ROOT, "downloads");
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
const SEARCH_RESULT_LIMIT = 5;
const YTDLP_SEARCH_SOURCES = {
  youtube: { name: "youtube", label: "YouTube", prefix: "ytsearch", priority: 0 },
  bilibili: { name: "bilibili", label: "Bilibili", prefix: "bilisearch", priority: 1, flatPlaylist: false, limit: 20 },
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]/gu, char => CJK_VARIANT_MAP.get(char) || char)
    .replace(/[^\p{L}\p{N}$!]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadDiscogsTaxonomy() {
  const taxonomyPath = path.join(ROOT, "data", "discogs-taxonomy.json");
  if (fs.existsSync(taxonomyPath)) {
    return JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
  }

  const modelPath = path.join(ROOT, "models", "genre_discogs400-discogs-effnet-1.json");
  const metadata = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const byGenre = new Map();
  for (const label of metadata.classes || []) {
    const [genre, style] = String(label).split("---");
    if (!genre || !style) continue;
    if (!byGenre.has(genre)) byGenre.set(genre, []);
    byGenre.get(genre).push(style);
  }
  return {
    name: "Discogs Genre/Style Taxonomy",
    version: "discogs400-local-fallback",
    classes: metadata.classes || [],
    genres: [...byGenre.entries()].map(([name, styles]) => ({ name, styles })),
    aliases: {}
  };
}

const DISCOGS_TAXONOMY = loadDiscogsTaxonomy();
const DISCOGS_GENRES_BY_KEY = new Map();
const DISCOGS_STYLES_BY_GENRE = new Map();
const DISCOGS_STYLE_CANDIDATES = new Map();

for (const genre of DISCOGS_TAXONOMY.genres || []) {
  const genreKey = normalizeText(genre.name);
  DISCOGS_GENRES_BY_KEY.set(genreKey, genre.name);
  const styleMap = new Map();
  for (const style of genre.styles || []) {
    const styleKey = normalizeText(style);
    styleMap.set(styleKey, style);
    const candidates = DISCOGS_STYLE_CANDIDATES.get(styleKey) || [];
    candidates.push({ genre: genre.name, style });
    DISCOGS_STYLE_CANDIDATES.set(styleKey, candidates);
  }
  DISCOGS_STYLES_BY_GENRE.set(genre.name, styleMap);
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

function canonicalDiscogsGenre(value) {
  return DISCOGS_GENRES_BY_KEY.get(normalizeText(value)) || "";
}

function canonicalDiscogsStyle(value, genreHints = []) {
  const styleKey = normalizeText(value);
  if (!styleKey) return "";
  for (const genre of genreHints) {
    const styles = DISCOGS_STYLES_BY_GENRE.get(genre);
    if (styles && styles.has(styleKey)) return styles.get(styleKey);
  }
  const candidates = DISCOGS_STYLE_CANDIDATES.get(styleKey) || [];
  return candidates[0] ? candidates[0].style : "";
}

function filterDiscogsTaxonomyTags(genres, styles) {
  const canonicalGenres = uniqueNormalized((genres || []).map(canonicalDiscogsGenre).filter(Boolean));
  const canonicalStyles = uniqueNormalized((styles || [])
    .map(style => canonicalDiscogsStyle(style, canonicalGenres))
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

async function searchDiscogs(title, artists, album = "") {
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
        const taxonomyTags = filterDiscogsTaxonomyTags(item.genre, item.style);
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

async function handleMetadata(req, res) {
  try {
    const body = await readBody(req);
    const title = cleanTerm(body.title);
    const artists = splitArtists(body.artists);
    if (!title && artists.length === 0) {
      sendJson(res, 400, { error: "请输入歌名或艺人。" });
      return;
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
    const discogs = await searchDiscogs(title || artists[0], artists, album).catch(error => ({ releases: [], error: error.message }));

    sendJson(res, 200, {
      query: { title, artists },
      sources: {
        itunes: itunesData.length ? itunesData : (itunes.status === "fulfilled" ? itunes.value : { error: itunes.reason.message }),
        lastfm: lastFmData,
        discogs
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
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
  if (source.name !== "bilibili") return fallbackQuery;
  const artists = Array.isArray(target.artists) ? target.artists.join(" ") : "";
  return [target.title || "", artists].map(cleanTerm).filter(Boolean).join(" ") || fallbackQuery;
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
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp 搜索退出码 ${code}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const entries = Array.isArray(data.entries) ? data.entries : [];
        resolve(entries
          .filter(Boolean)
          .map(entry => {
            const url = candidateUrlFromEntry(entry, source);
            return {
              title: entry.title || entry.fulltitle || "",
              url,
              source: source.name,
              sourceLabel: source.label,
              sourcePriority: source.priority
            };
          })
          .filter(entry => /^https?:\/\//i.test(entry.url)));
      } catch (error) {
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

  if (artistText && candidateText.includes(artistText)) score += 42;
  else if (artistTokens.length) {
    const hits = artistTokens.filter(token => candidateText.includes(token)).length;
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

async function handleDownload(req, res) {
  try {
    const body = await readBody(req);
    const url = String(body.url || "").trim();
    const title = cleanTerm(body.title);
    const artists = splitArtists(body.artists);
    const query = String(body.query || [quoteSearchTerm(title), quoteSearchTerm(artists.join(" "))].filter(Boolean).join(" ")).trim();
    if (!/^https?:\/\//i.test(url) && !query) {
      sendJson(res, 400, { error: "请输入“歌名 - 艺人”，或提供音频/公开视频链接。" });
      return;
    }

    let filePath;
    let method;
    let selectedSource = url || query;
    let downloadResult = null;
    if (isAudioUrl(url)) {
      const ext = path.extname(new URL(url).pathname).toLowerCase() || ".mp3";
      filePath = path.join(DOWNLOAD_DIR, safeDownloadName(ext));
      await downloadDirectAudio(url, filePath);
      method = "direct";
    } else if (url) {
      filePath = await downloadWithYtDlp(url);
      method = "yt-dlp";
    } else {
      downloadResult = await downloadSearchAudio(query, { title, artists });
      filePath = downloadResult.filePath;
      method = "yt-dlp-search";
      selectedSource = downloadResult.candidate.title
        ? `${downloadResult.candidate.sourceLabel}: ${downloadResult.candidate.title}`
        : query;
    }

    sendJson(res, 200, {
      method,
      source: selectedSource,
      matchScore: downloadResult && downloadResult.candidate ? downloadResult.candidate.matchScore : null,
      sourcePlatform: downloadResult && downloadResult.candidate ? downloadResult.candidate.source : null,
      audioUrl: `/downloads/${path.basename(filePath)}`,
      fileName: path.basename(filePath)
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message,
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

function analyzeWithEssentia(filePath, top = 12) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ESSENTIA_PYTHON)) {
      reject(new Error("Essentia Python 环境不存在，请先安装 .venv-essentia。"));
      return;
    }
    if (!fs.existsSync(ESSENTIA_SCRIPT)) {
      reject(new Error("Essentia 分析脚本不存在。"));
      return;
    }

    const child = spawn(ESSENTIA_PYTHON, [
      ESSENTIA_SCRIPT,
      filePath,
      "--top",
      String(top),
      "--json"
    ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Essentia 曲风分析超时。"));
    }, 180000);

    child.stdout.on("data", chunk => stdout += chunk.toString());
    child.stderr.on("data", chunk => stderr += chunk.toString());
    child.on("error", error => {
      clearTimeout(timer);
      reject(new Error(`无法启动 Essentia：${error.message}`));
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Essentia 退出码 ${code}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error(`无法解析 Essentia 输出：${error.message}`));
      }
    });
  });
}

async function handleEssentia(req, res) {
  let cleanupPath = "";
  try {
    const body = await readBody(req);
    const fileName = body.fileName || String(body.audioUrl || "").replace(/^\/downloads\//, "");
    const filePath = localDownloadPath(fileName);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, { error: "没有找到可供 Essentia 分析的本地音频文件。" });
      return;
    }
    cleanupPath = filePath;
    const result = await analyzeWithEssentia(filePath, Math.max(1, Math.min(30, Number(body.top || 12))));
    const deletedAudio = await deleteLocalAudio(filePath);
    cleanupPath = "";
    sendJson(res, 200, {
      ...result,
      fileName: path.basename(filePath),
      source: "essentia-discogs400",
      deletedAudio
    });
  } catch (error) {
    if (cleanupPath) await deleteLocalAudio(cleanupPath);
    sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

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
  if (req.method === "POST" && req.url === "/api/metadata") {
    handleMetadata(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/netease-song") {
    handleNetEaseSong(req, res);
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
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Genre Lab running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  candidateMatchScore,
  containsChineseText,
  extractHttpUrl,
  extractNetEaseSongId,
  rankSearchCandidates,
  resolveNetEaseSongId,
  selectSearchSources,
  sourceSearchQuery,
  server
};
