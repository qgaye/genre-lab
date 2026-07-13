const test = require("node:test");
const assert = require("node:assert/strict");

const {
  candidateMatchScore,
  containsChineseText,
  extractHttpUrl,
  extractNetEaseSongId,
  extractQQMusicSongMid,
  rankSearchCandidates,
  selectSearchSources,
  sourceSearchQuery
} = require("../server");

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

test("keeps the original query for YouTube searches", () => {
  const [youtube] = selectSearchSources("\"蓝色感觉\" \"红烧鸡翅Wings\"", {
    title: "蓝色感觉",
    artists: ["红烧鸡翅Wings"]
  });

  assert.equal(sourceSearchQuery(youtube, "\"蓝色感觉\" \"红烧鸡翅Wings\"", {
    title: "蓝色感觉",
    artists: ["红烧鸡翅Wings"]
  }), "\"蓝色感觉\" \"红烧鸡翅Wings\"");
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
