import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 重定向流水线持久化目录到临时目录，隔离测试副作用（必须在导入 state.js 之前设置）
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-assets-test-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

// 动态导入：确保 config.js / state.js 在 HOME 重定向后求值
const { pipelineManager } = await import("../src/config.js");
const { maybeAdvancePipeline } = await import("../src/agents.js");

test("buildPrompt：包含 STAGE_ASSETS 输出指示", () => {
  const state = pipelineManager.create("production");
  const prompt = pipelineManager.buildPrompt(state.id);
  assert.ok(prompt.includes("[STAGE_ASSETS:"), `buildPrompt 缺少 STAGE_ASSETS 指示：${prompt}`);
});

test("STAGE_ASSETS 解析：characters/scenes/props/storyContext/styleAnchor 完整 JSON 被合并进资产池", async () => {
  const pm = pipelineManager;
  const state = pm.create("production");
  const events: string[] = [];
  const emit = (type: string) => events.push(type);

  const reply = [
    "导演规划完成：确定赛博朋克视觉风格、快节奏叙事。",
    "[STAGE_COMPLETE:director_plan]",
    "[STAGE_NODES:n1]",
    '[STAGE_ASSETS:{"characters":[{"name":"小美","description":"女主，短发"}],"scenes":[{"name":"雨夜小巷","description":"霓虹雨巷","styleKeywords":["霓虹","赛博朋克"]}],"props":[{"name":"全息腕表","description":"男主装备"}],"storyContext":"2077 年都市","styleAnchor":"赛博朋克霓虹"}]',
  ].join("\n");

  await maybeAdvancePipeline(emit, state.id, reply);
  const after = pm.get(state.id)!;
  assert.equal(after.currentStage, "衍生资产分析");
  assert.equal(after.assets.characters.length, 1);
  assert.equal(after.assets.characters[0].name, "小美");
  assert.equal(after.assets.characters[0].description, "女主，短发");
  assert.equal(after.assets.scenes.length, 1);
  assert.equal(after.assets.scenes[0].name, "雨夜小巷");
  assert.deepEqual(after.assets.scenes[0].styleKeywords, ["霓虹", "赛博朋克"]);
  assert.equal(after.assets.props.length, 1);
  assert.equal(after.assets.props[0].name, "全息腕表");
  assert.equal(after.assets.storyContext, "2077 年都市");
  assert.equal(after.assets.styleAnchor, "赛博朋克霓虹");
  assert.ok(events.includes("pipeline_update"), `events=${JSON.stringify(events)}`);
});

test("STAGE_ASSETS 解析：JSON 内字符串含转义引号与嵌套数组时仍完整解析", async () => {
  const pm = pipelineManager;
  const state = pm.create("production");
  const emit = () => {};

  const reply = [
    "导演规划完成。",
    "[STAGE_COMPLETE:director_plan]",
    "[STAGE_NODES:n1]",
    '[STAGE_ASSETS:{"characters":[{"name":"阿伟","description":"台词「你看吧」\\"的男主"}],"scenes":[{"name":"天台","description":"晚霞","styleKeywords":["黄昏","城市天际线"]}],"styleAnchor":"写实都市"}]',
  ].join("\n");

  await maybeAdvancePipeline(emit, state.id, reply);
  const after = pm.get(state.id)!;
  assert.equal(after.assets.characters.length, 1);
  assert.equal(after.assets.characters[0].name, "阿伟");
  assert.ok(after.assets.characters[0].description.includes("你看吧"), after.assets.characters[0].description);
  assert.equal(after.assets.scenes.length, 1);
  assert.deepEqual(after.assets.scenes[0].styleKeywords, ["黄昏", "城市天际线"]);
  assert.equal(after.assets.styleAnchor, "写实都市");
});

test("无 STAGE_ASSETS：资产池保持空但不报错，流水线正常推进", async () => {
  const pm = pipelineManager;
  const state = pm.create("production");
  const events: string[] = [];
  const emit = (type: string) => events.push(type);

  await maybeAdvancePipeline(emit, state.id, "导演规划完成。\n[STAGE_COMPLETE:director_plan]\n[STAGE_NODES:n1]");
  const after = pm.get(state.id)!;
  assert.equal(after.currentStage, "衍生资产分析");
  assert.deepEqual(after.assets.characters, []);
  assert.deepEqual(after.assets.scenes, []);
  assert.deepEqual(after.assets.props, []);
  assert.equal(after.assets.storyContext, "");
  assert.equal(after.assets.styleAnchor, "");
  assert.ok(events.includes("pipeline_update"), `events=${JSON.stringify(events)}`);
});

test("STAGE_ASSETS Partial 兼容：只输出 characters 时其余字段保持空且不报错", async () => {
  const pm = pipelineManager;
  const state = pm.create("production");
  const emit = () => {};

  const reply = [
    "导演规划完成。",
    "[STAGE_COMPLETE:director_plan]",
    "[STAGE_NODES:n1]",
    '[STAGE_ASSETS:{"characters":[{"name":"小美","description":"女主"}]}]',
  ].join("\n");

  await maybeAdvancePipeline(emit, state.id, reply);
  const after = pm.get(state.id)!;
  assert.equal(after.assets.characters.length, 1);
  assert.equal(after.assets.characters[0].name, "小美");
  assert.equal(after.assets.scenes.length, 0);
  assert.equal(after.assets.props.length, 0);
  assert.equal(after.assets.storyContext, "");
  assert.equal(after.assets.styleAnchor, "");
});
