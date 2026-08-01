import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 重定向流水线持久化目录到临时目录，隔离测试副作用（必须在导入 state.js 之前设置）
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-pipeline-test-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

// 动态导入：确保 state.js 在 HOME 重定向后求值
const { pipelineManager } = await import("../src/config.js");
const { detectStageComplete, runQualityChecks } = await import("../src/pipeline/quality.js");
const { shouldInjectPipelineContext, maybeAdvancePipeline } = await import("../src/agents.js");
const { withClientStages, getStages } = await import("../src/pipeline/stages.js");

test("detectStageComplete 命中英文 slug 标记 [STAGE_COMPLETE:skeleton]", () => {
  // 阶段名是中文「故事骨架」，但 prompt 约定输出 [STAGE_COMPLETE:skeleton]
  assert.equal(detectStageComplete("故事骨架", "骨架已创建\n[STAGE_COMPLETE:skeleton]"), true);
});

test("detectStageComplete 未命中任何标记返回 false", () => {
  assert.equal(detectStageComplete("故事骨架", "还在整理结构，需要更多信息"), false);
});

test("shouldInjectPipelineContext：default 模式绝不被 pipeline 上下文污染", () => {
  assert.equal(shouldInjectPipelineContext("default", "script"), false);
  assert.equal(shouldInjectPipelineContext("default", "production"), false);
  assert.equal(shouldInjectPipelineContext(undefined, "script"), false);
});

test("shouldInjectPipelineContext：模式一致才注入", () => {
  assert.equal(shouldInjectPipelineContext("script", "script"), true);
  assert.equal(shouldInjectPipelineContext("production", "production"), true);
  assert.equal(shouldInjectPipelineContext("script", "production"), false);
});

test("PipelineManager.advance：推进到下一阶段、合并资产、末阶段置 completed", () => {
  const pm = pipelineManager;
  const state = pm.create("script", { totalEpisodes: 12 });
  assert.equal(state.currentStage, "项目初始化");

  const next = pm.advance(state.id, {
    stageName: "项目初始化",
    summary: "已确认 12 集",
    nodeIds: ["n1"],
    assets: { characters: [{ name: "小美", description: "女主" }], storyContext: "现代都市" },
  });
  assert.equal(next.currentStage, "故事骨架");
  assert.deepEqual(next.completedStages, ["项目初始化"]);
  assert.equal(next.assets.characters.length, 1);
  assert.equal(next.assets.storyContext, "现代都市");

  pm.advance(next.id, { stageName: "故事骨架", summary: "骨架", nodeIds: ["n2"] });
  pm.advance(next.id, { stageName: "改编策略", summary: "策略", nodeIds: ["n3"] });
  const done = pm.advance(next.id, { stageName: "剧本编写", summary: "剧本", nodeIds: ["n4"] });
  assert.equal(done.status, "completed");
});

test("runQualityChecks：reference_consistency 拦截未注册的引用资产", () => {
  const stage = {
    name: "衍生资产生成",
    order: 3,
    mcpTools: [],
    qualityChecks: ["reference_consistency"],
    promptContext: "",
  };
  const ok = runQualityChecks(stage, { stageName: "衍生资产生成", summary: "s", nodeIds: ["n1"], assets: { characters: [{ name: "小美", description: "女主" }] } }, {
    characters: [{ name: "小美", description: "女主" }],
    scenes: [],
    props: [],
    storyContext: "",
    styleAnchor: "赛博朋克",
  });
  assert.equal(ok.pass, true);

  const bad = runQualityChecks(stage, { stageName: "衍生资产生成", summary: "s", nodeIds: ["n1"], assets: { characters: [{ name: "路人甲", description: "未注册" }] } }, {
    characters: [{ name: "小美", description: "女主" }],
    scenes: [],
    props: [],
    storyContext: "",
    styleAnchor: "",
  });
  assert.equal(bad.pass, false);
});

test("自动推进链路：质量门拦截时（无产出节点）不推进并 emit pipeline_failed", async () => {
  const pm = pipelineManager;
  const state = pm.create("script");
  pm.advance(state.id, { stageName: "项目初始化", summary: "ok", nodeIds: ["n1"] });
  const events: string[] = [];
  const emit = (type: string) => events.push(type);

  // 命中完成标记但未声明任何节点 → 质量门失败，不推进
  await maybeAdvancePipeline(emit, state.id, "骨架完成\n[STAGE_COMPLETE:skeleton]");
  const after = pm.get(state.id)!;
  assert.equal(after.currentStage, "故事骨架"); // 仍在原阶段
  assert.ok(events.includes("pipeline_failed"), `events=${JSON.stringify(events)}`);
  assert.ok(!events.includes("pipeline_update"), `events=${JSON.stringify(events)}`);
});

test("自动推进链路：命中标记且产出有效时 advance 并 emit pipeline_update", async () => {
  const pm = pipelineManager;
  const state = pm.create("script");
  const events: string[] = [];
  const emit = (type: string) => events.push(type);

  await maybeAdvancePipeline(emit, state.id, "配置已确认\n[STAGE_COMPLETE:init]\n[STAGE_NODES:n10,n11]\n[STAGE_SUMMARY:确认 12 集 都市题材]");
  const after = pm.get(state.id)!;
  assert.equal(after.currentStage, "故事骨架");
  assert.deepEqual(after.completedStages, ["项目初始化"]);
  assert.deepEqual(after.stageOutputs["项目初始化"].nodeIds, ["n10", "n11"]);
  assert.ok(events.includes("pipeline_update"), `events=${JSON.stringify(events)}`);
});

test("withClientStages：state 附带 stages 数组，长度=阶段数、completed 标记正确", () => {
  const pm = pipelineManager;
  const state = pm.create("script");
  pm.advance(state.id, { stageName: "项目初始化", summary: "已确认 12 集", nodeIds: ["n1"] });

  const serialized = withClientStages(state);
  const stages = serialized.stages as Array<{ name: string; order: number; completed: boolean }>;
  assert.equal(stages.length, getStages("script").length, `stages=${JSON.stringify(stages)}`);
  assert.deepEqual(stages.map((s) => s.order), [1, 2, 3, 4]);
  assert.equal(stages.find((s) => s.name === "项目初始化")!.completed, true);
  assert.equal(stages.find((s) => s.name === "故事骨架")!.completed, false);
  assert.equal(stages.find((s) => s.name === "剧本编写")!.completed, false);
});

test("maybeAdvancePipeline：pipeline_update 推送的 state 附带 stages，供前端进度条消费", async () => {
  const pm = pipelineManager;
  const state = pm.create("script");
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const emit = (type: string, payload?: unknown) => events.push({ type, payload: (payload || {}) as Record<string, unknown> });

  await maybeAdvancePipeline(emit, state.id, "配置已确认\n[STAGE_COMPLETE:init]\n[STAGE_NODES:n1]\n[STAGE_SUMMARY:ok]");
  const update = events.find((e) => e.type === "pipeline_update");
  assert.ok(update, `events=${JSON.stringify(events)}`);
  const s = update!.payload.state as { stages?: Array<{ name: string; order: number; completed: boolean }>; completedStages: string[] };
  assert.ok(Array.isArray(s.stages), `state.stages 缺失：${JSON.stringify(s)}`);
  assert.equal(s.stages!.length, getStages("script").length);
  assert.equal(s.stages![0].name, "项目初始化");
  assert.equal(s.stages![0].completed, true);
  assert.equal(s.stages![1].name, "故事骨架");
  assert.equal(s.stages![1].completed, false);
  assert.deepEqual(s.completedStages, ["项目初始化"]);
});
