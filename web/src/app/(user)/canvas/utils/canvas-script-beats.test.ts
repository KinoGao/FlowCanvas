import assert from "node:assert/strict";
import test from "node:test";

import { buildGridBeatPrompt, buildScriptBeats, GRID_SHOT_DESCRIPTIONS, inferScriptDuration, inferScriptShotType } from "./canvas-script-beats";

test("buildScriptBeats splits a multi-line script into one beat per line", () => {
    const beats = buildScriptBeats("第一幕：主角进入陌生空间。\n特写：发现关键道具。\n中景：推门前行。");

    assert.equal(beats.length, 3);
    assert.deepEqual(
        beats.map((beat) => beat.title),
        ["第一幕", "特写", "中景"],
    );
    assert.equal(beats[0].prompt.includes("主角进入陌生空间"), true);
    assert.equal(beats[0].id, "beat-1");
});

test("buildScriptBeats caps at six beats and prefers line breaks over sentences", () => {
    const beats = buildScriptBeats("1\n2\n3\n4\n5\n6\n7\n8\n9");

    assert.equal(beats.length, 6);
    assert.equal(beats[0].id, "beat-1");
    assert.equal(beats[5].id, "beat-6");
});

test("buildScriptBeats uses the default skeleton for an empty body", () => {
    const beats = buildScriptBeats("   \n  ");

    assert.deepEqual(
        beats.map((beat) => beat.content),
        ["建立场景", "角色行动", "情绪高潮"],
    );
    assert.deepEqual(
        beats.map((beat) => beat.title),
        ["分镜 1", "分镜 2", "分镜 3"],
    );
});

test("inferScriptShotType detects the shot keyword from content", () => {
    assert.equal(inferScriptShotType("特写：角色的眼睛"), "特写");
    assert.equal(inferScriptShotType("全景：街道全景"), "全景");
    assert.equal(inferScriptShotType("大远景：航拍城市"), "大远景");
    assert.equal(inferScriptShotType("角色走进房间"), undefined);
});

test("inferScriptDuration reads explicit seconds and defaults to 3s", () => {
    assert.equal(inferScriptDuration("镜头持续 5 秒"), "5s");
    assert.equal(inferScriptDuration("普通镜头"), "3s");
});

test("buildGridBeatPrompt cycles shot descriptions and keeps source text", () => {
    const prompt = buildGridBeatPrompt("正文", { title: "分镜 1", content: "主角奔跑" }, 0, 9);

    assert.ok(prompt.includes("第 1/9 格"));
    assert.ok(prompt.includes(GRID_SHOT_DESCRIPTIONS[0]));
    assert.ok(prompt.includes("主角奔跑"));

    const wrapped = buildGridBeatPrompt("正文", { title: "分镜 1", content: "主角奔跑" }, GRID_SHOT_DESCRIPTIONS.length, 9);
    assert.ok(wrapped.includes(GRID_SHOT_DESCRIPTIONS[0]), "shot description cycles after exhausting the list");
});

test("buildGridBeatPrompt falls back to body prefix when beat content is empty", () => {
    const prompt = buildGridBeatPrompt("  一段很长的正文描述  ", undefined, 0, 4);

    assert.ok(prompt.includes("一段很长的正文描述"));
});
