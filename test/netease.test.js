const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  candidateMatchScore,
  containsChineseText,
  extractHttpUrl,
  extractNetEaseSongId,
  extractQQMusicPlaylistId,
  extractQQMusicSongMid,
  extractSpotifyTrackId,
  findSongAnalysisRecord,
  detectPlaylistPlatform,
  musicPlatformDownloadSource,
  matchingRunningPlaylistJob,
  normalizeQQMusicPlaylist,
  parseSearchCandidatesPayload,
  playlistIdentityKey,
  rankSearchCandidates,
  readAnalysisLogRecords,
  selectSearchSources,
  sourceSearchQuery,
  summarizeAnalysisLogEntry
} = require("../server");

test("matches only a running playlist job for the same requester and playlist", () => {
  const jobs = [
    { jobId: "done", state: "done", requesterKey: "user-a", playlistKey: "netease:123" },
    { jobId: "other-user", state: "running", requesterKey: "user-b", playlistKey: "netease:123" },
    { jobId: "other-playlist", state: "running", requesterKey: "user-a", playlistKey: "netease:456" },
    { jobId: "existing", state: "running", requesterKey: "user-a", playlistKey: "netease:123" }
  ];

  assert.equal(matchingRunningPlaylistJob(jobs, "user-a", "netease:123").jobId, "existing");
  assert.equal(matchingRunningPlaylistJob(jobs, "user-c", "netease:123"), null);
  assert.equal(matchingRunningPlaylistJob(jobs, "user-a", "netease:999"), null);
});

test("builds playlist identity from normalized platform and playlist id", () => {
  assert.equal(playlistIdentityKey("qq", " 1150140793 "), "qqmusic:1150140793");
  assert.equal(playlistIdentityKey("netease", 13856318070), "netease:13856318070");
  assert.equal(playlistIdentityKey("", "123"), "");
  assert.equal(playlistIdentityKey("netease", ""), "");
});

test("summarizes analysis logs without exposing request-private fields", () => {
  const summary = summarizeAnalysisLogEntry({
    jobId: "summaryjob123",
    schemaVersion: 2,
    timePoint: "2026-07-17T08:00:00.000Z",
    ip: "203.0.113.4",
    userAgent: "private-agent",
    input: { formatLabel: "网易云音乐链接", raw: "sensitive raw input" },
    parsedTrack: {
      title: "测试歌曲",
      artists: "测试艺人",
      album: "测试专辑",
      sourceId: "123",
      sourceUrl: "https://music.163.com/song?id=123"
    },
    audioDownload: { success: true, elapsedSeconds: 2.5, sourcePlatform: "netease" },
    essentia: { success: true, modelKey: "effnet400", predictionCount: 12, elapsedSeconds: 3.5 },
    verdict: { genres: [{ name: "Soul", percent: 72 }] },
    workflow: { allSucceeded: true }
  }, 7);

  assert.equal(summary.title, "测试歌曲");
  assert.equal(summary.status, "done");
  assert.deepEqual(summary.genres, [{ name: "Soul", percent: 72 }]);
  assert.equal(summary.model, "effnet400");
  assert.equal("ip" in summary, false);
  assert.equal("userAgent" in summary, false);
  assert.equal("raw" in summary, false);
});

test("marks snapshot-backed song analysis logs as resumable by job id", () => {
  const summary = summarizeAnalysisLogEntry({
    jobId: "songjob123",
    schemaVersion: 2,
    timePoint: "2026-07-17T08:00:00.000Z",
    parsedTrack: {
      title: "Snapshot Song",
      artists: "Snapshot Artist",
      sourceUrl: "https://music.example/song"
    },
    audioDownload: { success: true },
    essentia: { success: true, modelKey: "discogs400", predictionCount: 2 },
    verdict: { genres: [{ name: "House", percent: 64 }] },
    workflow: { allSucceeded: true },
    renderState: {
      version: 1,
      track: { title: "Snapshot Song", artists: "Snapshot Artist" },
      scoreItems: [{ name: "House", score: 64, reasons: [] }],
      composition: [{ name: "House", percent: 64, color: "#3454e6" }]
    }
  });

  assert.equal(summary.id, "songjob123");
  assert.equal(summary.jobId, "songjob123");
  assert.equal(summary.resumable, true);
  assert.equal(summary.status, "done");
});

test("finds sanitized snapshot song records without private request fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genre-lab-log-"));
  const file = path.join(dir, "song-analysis-log.ndjson");
  const entries = [
    "{bad json",
    JSON.stringify({
      jobId: "privatejob123",
      schemaVersion: 2,
      timePoint: "2026-07-17T08:00:00.000Z",
      ip: "203.0.113.4",
      userAgent: "private-agent",
      input: { format: "link", formatLabel: "链接", raw: "secret pasted text" },
      parsedTrack: {
        title: "Stored Song",
        artists: "Stored Artist",
        sourceUrl: "https://music.example/song"
      },
      metadata: { title: "Stored Song", artists: ["Stored Artist"] },
      audioFeatures: { tempo: 124 },
      audioDownload: {
        success: true,
        method: "yt-dlp",
        sourcePlatform: "youtube",
        fileName: "/private/download.m4a",
        audioUrl: "blob:private"
      },
      essentia: {
        success: true,
        modelKey: "discogs400",
        predictions: [{ display: "Electronic / House", score: 0.72 }]
      },
      verdict: { genres: [{ name: "House", percent: 72 }] },
      workflow: { allSucceeded: true },
      renderState: {
        version: 1,
        modelKey: "discogs400",
        track: { title: "Stored Song", artists: "Stored Artist" },
        scoreItems: [{ name: "House", score: 72, reasons: [] }],
        composition: [{ name: "House", percent: 72, color: "#3454e6" }]
      }
    })
  ];
  fs.writeFileSync(file, `${entries.join("\n")}\n`);

  const record = findSongAnalysisRecord("privatejob123", file);

  assert.equal(record.jobId, "privatejob123");
  assert.equal(record.resumable, true);
  assert.deepEqual(record.input, { format: "link", formatLabel: "链接" });
  assert.equal(record.audioDownload.sourcePlatform, "youtube");
  assert.equal("ip" in record, false);
  assert.equal("userAgent" in record, false);
  assert.equal("raw" in record.input, false);
  assert.equal("fileName" in record.audioDownload, false);
  assert.equal("audioUrl" in record.audioDownload, false);
});

test("deduplicates song analysis log list by latest job id and ignores old log shapes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genre-lab-log-"));
  const file = path.join(dir, "song-analysis-log.ndjson");
  fs.writeFileSync(file, [
    JSON.stringify({
      jobId: "repeatjob123",
      timePoint: "2026-07-17T09:00:00.000Z",
      parsedTrack: { title: "Old Retry" },
      workflow: { allSucceeded: true },
      renderState: {
        version: 1,
        track: { title: "Old Retry" },
        scoreItems: [],
        composition: []
      }
    }),
    JSON.stringify({
      jobId: "repeatjob123",
      timePoint: "2026-07-17T09:00:00.000Z",
      parsedTrack: { title: "Latest Retry" },
      workflow: { allSucceeded: true },
      renderState: {
        version: 1,
        track: { title: "Latest Retry" },
        scoreItems: [],
        composition: []
      }
    }),
    JSON.stringify({
      timePoint: "2026-07-17T10:00:00.000Z",
      parsedTrack: { title: "Old Shape Song" },
      workflow: { allSucceeded: true }
    })
  ].join("\n"));

  const { records, malformed } = readAnalysisLogRecords(file);
  const retry = records.find(record => record.jobId === "repeatjob123");

  assert.equal(records.filter(record => record.jobId === "repeatjob123").length, 1);
  assert.equal(retry.title, "Latest Retry");
  assert.equal(records.some(record => record.title === "Old Shape Song"), false);
  assert.equal(malformed, 1);
});

test("extracts the short link from a NetEase share sentence", () => {
  const input = "分享DJ Seinfeld/Confidence Man的单曲《Now U Do (Edit)》https://163cn.tv/baXyaqMo (@网易云音乐)";
  assert.equal(extractHttpUrl(input), "https://163cn.tv/baXyaqMo");
});

test("extracts song ids from common NetEase URL shapes", () => {
  assert.equal(extractNetEaseSongId("https://music.163.com/#/song?id=38689021&uct2=abc"), "38689021");
  assert.equal(extractNetEaseSongId("https://music.163.com/song/38689021"), "38689021");
  assert.equal(extractNetEaseSongId("38689021"), "38689021");
});

test("extracts QQ Music share links and song mids", () => {
  const input = "周杰伦《搁浅》 https://c6.y.qq.com/base/fcgi-bin/u?__=CawAX8bL58oP @QQ音乐";
  assert.equal(extractHttpUrl(input), "https://c6.y.qq.com/base/fcgi-bin/u?__=CawAX8bL58oP");
  assert.equal(
    extractQQMusicSongMid("https://i.y.qq.com/v8/playsong.html?songmid=001Bbywq2gicae&source=qq"),
    "001Bbywq2gicae"
  );
  assert.equal(extractQQMusicSongMid("https://y.qq.com/n/ryqq/songDetail/001Bbywq2gicae"), "001Bbywq2gicae");
});

test("extracts QQ Music playlist ids from share and desktop URLs", () => {
  assert.equal(
    extractQQMusicPlaylistId("https://i2.y.qq.com/n3/other/pages/details/playlist.html?hosteuin=abc&id=1150140793&appshare=iphone_wx"),
    "1150140793"
  );
  assert.equal(extractQQMusicPlaylistId("https://y.qq.com/n/ryqq/playlist/1150140793"), "1150140793");
  assert.equal(extractQQMusicPlaylistId("https://y.qq.com/n/ryqq/songDetail/001Bbywq2gicae"), "");
});

test("detects playlist platform from supported share-link hosts", () => {
  assert.equal(detectPlaylistPlatform("https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=1150140793"), "qqmusic");
  assert.equal(detectPlaylistPlatform("https://music.163.com/playlist?id=13856318070"), "netease");
  assert.equal(detectPlaylistPlatform("https://example.com/playlist?id=1"), "");
});

test("normalizes QQ Music playlist metadata and tracks", () => {
  const playlist = normalizeQQMusicPlaylist("1150140793", {
    code: 0,
    cdlist: [{
      disstid: "1150140793",
      dissname: "&#127472;&#127479; &amp; chill",
      logo: "http://y.gtimg.cn/cover.jpg",
      nickname: "测试用户",
      total_song_num: 1,
      songlist: [{
        songid: 107702344,
        songmid: "001iQZi24I0JSY",
        songname: "Moon, Moon",
        albumname: "Moon &amp; Moon",
        albummid: "003z3v583A26n3",
        singer: [{ name: "MoonMoon (문문)" }]
      }]
    }]
  });

  assert.equal(playlist.platform, "qqmusic");
  assert.equal(playlist.name, "🇰🇷 & chill");
  assert.equal(playlist.coverImgUrl, "https://y.gtimg.cn/cover.jpg");
  assert.equal(playlist.originalCount, 1);
  assert.deepEqual(playlist.tracks[0], {
    id: "001iQZi24I0JSY",
    title: "Moon, Moon",
    artists: ["MoonMoon (문문)"],
    album: "Moon & Moon",
    albumImage: "https://y.gtimg.cn/music/photo_new/T002R300x300M000003z3v583A26n3.jpg",
    sourceUrl: "https://y.qq.com/n/ryqq/songDetail/001iQZi24I0JSY"
  });
});

test("extracts Spotify track ids from common URL shapes", () => {
  assert.equal(
    extractSpotifyTrackId("https://open.spotify.com/track/7mrEpwmQJ7qK1ik7ZjjcdD?si=1a57xtIMSvK_d7vCui5X_g&utm_source=copy-link"),
    "7mrEpwmQJ7qK1ik7ZjjcdD"
  );
  assert.equal(extractSpotifyTrackId("spotify:track:7mrEpwmQJ7qK1ik7ZjjcdD"), "7mrEpwmQJ7qK1ik7ZjjcdD");
  assert.equal(extractSpotifyTrackId("7mrEpwmQJ7qK1ik7ZjjcdD"), "7mrEpwmQJ7qK1ik7ZjjcdD");
  assert.equal(extractSpotifyTrackId("https://open.spotify.com/album/abc"), "");
});

test("detects platform links for preferred yt-dlp downloads", () => {
  assert.deepEqual(musicPlatformDownloadSource("分享歌曲 https://music.163.com/song?id=2044653738 (@网易云音乐)"), {
    url: "https://music.163.com/song?id=2044653738",
    platform: "netease",
    label: "网易云"
  });
  assert.deepEqual(musicPlatformDownloadSource("周杰伦《搁浅》 https://y.qq.com/n/ryqq/songDetail/001Bbywq2gicae @QQ音乐"), {
    url: "https://y.qq.com/n/ryqq/songDetail/001Bbywq2gicae",
    platform: "qqmusic",
    label: "QQ音乐"
  });
  assert.equal(musicPlatformDownloadSource("https://www.youtube.com/watch?v=abc"), null);
});

test("selects YouTube and Bilibili for Chinese track searches", () => {
  assert.equal(containsChineseText("周杰伦 晴天"), true);
  const sources = selectSearchSources("\"晴天\" \"周杰伦\"", {
    title: "晴天",
    artists: ["周杰伦"]
  });
  assert.deepEqual(sources.map(source => source.name), ["youtube", "bilibili"]);
});

test("uses a merged unquoted query for Bilibili searches", () => {
  const sources = selectSearchSources("\"蓝色感觉\" \"红烧鸡翅Wings\"", {
    title: "蓝色感觉",
    artists: ["红烧鸡翅Wings"]
  });
  const bilibili = sources.find(source => source.name === "bilibili");

  assert.equal(sourceSearchQuery(bilibili, "\"蓝色感觉\" \"红烧鸡翅Wings\"", {
    title: "蓝色感觉",
    artists: ["红烧鸡翅Wings"]
  }), "蓝色感觉 红烧鸡翅Wings");
});

test("uses an artist-title query for YouTube searches", () => {
  const [youtube] = selectSearchSources("\"Us\" \"lofi'chield\"", {
    title: "Us",
    artists: ["lofi'chield"]
  });

  assert.equal(sourceSearchQuery(youtube, "\"Us\" \"lofi'chield\"", {
    title: "Us",
    artists: ["lofi'chield"]
  }), "lofi chield - Us");
});

test("parses usable Bilibili candidates from yt-dlp JSON output", () => {
  const candidates = parseSearchCandidatesPayload(JSON.stringify({
    entries: [
      {
        title: "7145 你的住所-Since TMRW 始于明天",
        webpage_url: "http://www.bilibili.com/video/av113744457761333",
        uploader: "music uploader"
      },
      null
    ]
  }), {
    name: "bilibili",
    label: "Bilibili",
    priority: 1
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, "7145 你的住所-Since TMRW 始于明天");
  assert.equal(candidates[0].source, "bilibili");
});

test("selects YouTube and SoundCloud for non-Chinese track searches", () => {
  assert.equal(containsChineseText("Come As You Are Nirvana"), false);
  const sources = selectSearchSources("\"Come As You Are\" \"Nirvana\"", {
    title: "Come As You Are",
    artists: ["Nirvana"]
  });
  assert.deepEqual(sources.map(source => source.name), ["youtube", "soundcloud"]);
});

test("ranks merged search candidates by match score across sources", () => {
  const ranked = rankSearchCandidates([
    {
      title: "Random live cover",
      url: "https://www.youtube.com/watch?v=cover",
      source: "youtube",
      sourceLabel: "YouTube",
      sourcePriority: 0
    },
    {
      title: "Nirvana - Come As You Are Official Audio",
      url: "https://soundcloud.com/example/come-as-you-are",
      source: "soundcloud",
      sourceLabel: "SoundCloud",
      sourcePriority: 1
    }
  ], {
    title: "Come As You Are",
    artists: ["Nirvana"]
  });

  assert.equal(ranked[0].source, "soundcloud");
  assert.equal(ranked[0].title, "Nirvana - Come As You Are Official Audio");
  assert.ok(ranked[0].matchScore > ranked[1].matchScore);
});

test("matches Chinese tracks across simplified/traditional variants and title aliases", () => {
  const score = candidateMatchScore({
    title: "莫非定律樂團 - 今夜茉莉開『昨夜夢見你 下雨又忘記帶傘』【動態歌詞】"
  }, "今夜茉莉开 (Jasmine Season)", ["莫非定律乐团"]);

  assert.ok(score >= 45);
});

test("uses uploader text to match short YouTube track titles", () => {
  const score = candidateMatchScore({
    title: "Us",
    artistText: "lofi'chield"
  }, "Us", ["lofi'chield"]);

  assert.ok(score >= 100);
});
