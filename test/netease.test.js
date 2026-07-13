const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractHttpUrl,
  extractNetEaseSongId
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
