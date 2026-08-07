import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

// 重定向流水线持久化目录与 agent 配置到临时目录（必须在导入 config.js / state.js 之前设置）
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-agent-gate-test-"));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

const TEST_TOKEN = "pipeline-gate-test-token";
const TEST_PORT = 19000 + Math.floor(Math.random() * 4000);

// 动态导入：确保 config.js / state.js 在 HOME 重定向后求值
const { pipelineManager } = await import("../src/config.js");
const { detectStageComplete } = await import("../src/pipeline/quality.js");
const { maybeAdvancePipeline } = await import("../src/agents.js");

// ── 预写 agent 配置（固定 token 与端口），startHttpServer 会复用 ──
const configDir = path.join(fakeHome, ".infinite-canvas");
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(
  path.join(configDir, "canvas-agent.json"),
  JSON.stringify({ url: `http://127.0.0.1:${TEST_PORT}`, token: TEST_TOKEN }),
);
process.env.PORT = String(TEST_PORT);

let server: Server | undefined;

async function startServer(): Promise<void> {
  const { startHttpServer } = await import("../src/http-server.js");
  server = startHttpServer();
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
      if (res.ok) return;
    } catch {
      // 尚未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("http server did not start");
}

const jsonHeaders = {
  "content-type": "application/json",
  "x-canvas-agent-token": TEST_TOKEN,
};

// ── ① 跳级拦截：未来阶段 / 无关 slug 不应触发推进 ──
test("跳级拦截：回复含未来阶段 slug 不命中当前阶段", () => {
  // 当前阶段「项目初始化」约定 slug 为 init
  assert.equal(detectStageComplete("项目初始化", "骨架已创建\n[STAGE_COMPLETE:skeleton]"), false);
  assert.equal(detectStageComplete("项目初始化", "[STAGE_COMPLETE:script]"), false);
  // 当前阶段自身 slug 仍应命中
  assert.equal(detectStageComplete("项目初始化", "配置已确认\n[STAGE_COMPLETE:init]"), true);
});

test("跳级拦截：maybeAdvancePipeline 收到未来阶段 slug 不推进", async () => {
  const pm = pipelineManager;
  const state = pm.create("script");
  const events: string[] = [];
  const emit = (type: string) => events.push(type);
  await maybeAdvancePipeline(emit, state.id, "骨架完成\n[STAGE_COMPLETE:skeleton]");
  const after = pm.get(state.id)!;
  assert.equal(after.currentStage, "项目初始化");
  assert.deepEqual(after.completedStages, []);
  assert.ok(!events.includes("pipeline_update"), `events=${JSON.stringify(events)}`);
  assert.ok(!events.includes("pipeline_failed"), `events=${JSON.stringify(events)}`);
});

// ── ② http 手动 advance：质量门拦截 + 404 语义 ──
before(async () => {
  await startServer();
});

after(() => {
  server?.close();
});

test("http 手动 advance：不存在的 pipeline 返回 404 pipeline not found", async () => {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/does-not-exist/advance`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ summary: "x", nodeIds: ["n1"] }),
  });
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(res.status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error, "pipeline not found");
});

test("http 手动 advance：质量门拦截返回 400 带 reason 且不推进", async () => {
  const created = (await (
    await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/create`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ mode: "script" }),
    })
  ).json()) as { pipelineId: string; state: { currentStage: string } };
  assert.equal(created.state.currentStage, "项目初始化");

  // config_confirmed 质量门：summary 为空 → 应被拦截
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/${created.pipelineId}/advance`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ summary: "", nodeIds: [] }),
  });
  const body = (await res.json()) as { ok: boolean; error?: string; reason?: string };
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
  assert.ok(body.reason, `应携带 reason，实际 body=${JSON.stringify(body)}`);

  // 未推进：仍停留在当前阶段
  const after = (await (
    await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/${created.pipelineId}`, { headers: jsonHeaders })
  ).json()) as { state: { currentStage: string } };
  assert.equal(after.state.currentStage, "项目初始化");
});

test("http 手动 advance：质量门通过时推进到下一阶段", async () => {
  const created = (await (
    await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/create`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ mode: "script", config: { totalEpisodes: 12 } }),
    })
  ).json()) as { pipelineId: string };
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/pipeline/${created.pipelineId}/advance`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ summary: "已确认 12 集", nodeIds: ["n1"] }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; state: { currentStage: string; completedStages: string[] } };
  assert.equal(body.ok, true);
  assert.equal(body.state.currentStage, "故事骨架");
  assert.deepEqual(body.state.completedStages, ["项目初始化"]);
});
