import assert from "node:assert/strict";
import { test } from "vitest";

import { extractWebPageInfo, extractImages, extractVideos } from "./web-media-extraction";

const sampleHtml = `
<html>
  <head>
    <title>测试页面 &amp; 标题</title>
    <meta name="description" content="这是一段描述文字" />
    <meta property="og:title" content="OG 标题" />
  </head>
  <body>
    <img src="https://cdn.example.com/a.jpg" />
    <img data-src="https://cdn.example.com/b.jpg" />
    <video src="https://cdn.example.com/v.mp4"></video>
    <iframe src="https://player.bilibili.com/video/BV1xx"></iframe>
  </body>
</html>`;

test("extracts title with entities decoded and falls back to og:title", () => {
    const info = extractWebPageInfo(sampleHtml);
    assert.equal(info.title, "测试页面 & 标题");
});

test("extracts meta description", () => {
    const info = extractWebPageInfo(sampleHtml);
    assert.equal(info.description, "这是一段描述文字");
});

test("collects image and video urls, ignoring data/blob", () => {
    const images = extractImages(sampleHtml);
    assert.deepEqual(images, ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]);

    const videos = extractVideos(sampleHtml);
    assert.ok(videos.includes("https://cdn.example.com/v.mp4"));
    assert.ok(videos.some((url) => url.includes("bilibili")));
});

test("empty/garbage html yields empty extraction without throwing", () => {
    const info = extractWebPageInfo("");
    assert.deepEqual(info, { title: "", description: "", images: [], videos: [] });
});
