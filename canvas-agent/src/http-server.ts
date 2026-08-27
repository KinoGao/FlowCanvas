import express, { type NextFunction, type Request, type Response } from "express";

import { DEFAULT_PORT, loadConfig, pipelineManager, saveConfig, type CanvasAgentConfig } from "./config.js";
import { CanvasSession } from "./canvas-session.js";
import { runClaudeTurn, runCodexTurn, withAgentPrompt } from "./agents.js";
import type { AgentAttachment } from "./types.js";
import { getStages } from "./pipeline/stages.js";
import { runQualityChecks } from "./pipeline/quality.js";
import type { StageOutput } from "./pipeline/types.js";
import { withClientStages } from "./pipeline/stages.js";

export function startHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    config.url = `http://127.0.0.1:${port}`;
    saveConfig(config);

    const session = new CanvasSession();
    const emit = (type: string, payload: unknown) => session.emitAll(type, payload);
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "30mb" }));
    app.use((req, res, next) => {
        const url = requestUrl(req, config);
        if (!setCors(req, res, url, config)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (req.method === "OPTIONS") return void res.json({});
        next();
    });
    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (_req, res) => res.json({ ok: true, url: config.url, hasToken: true }));
    app.use((req, res, next) => {
        if (validToken(req, requestUrl(req, config), config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.get("/events", (req, res) => session.openEvents(requestUrl(req, config), res));
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, String(req.query.clientId || "") || undefined);
        res.json({ ok: true });
    });
    app.post("/canvas/result", (req, res) => {
        session.resolveResult(req.body);
        res.json({ ok: true });
    });
    app.post("/api/tools", route(async (req, res) => res.json({ ok: true, result: await session.callTool(req.body?.name, req.body?.input || {}) })));
    // 独立画布助手：无线程/工作空间概念，每次 turn 使用一次性 Codex 线程，画布状态即上下文
    app.post("/agent/codex/turn", route(async (req, res) => {
        const attachments = Array.isArray(req.body?.attachments) ? (req.body.attachments as AgentAttachment[]) : [];
        const mode = validateMode(req.body?.mode);
        const storySkill = String(req.body?.storySkill || "") || undefined;
        const artSkill = String(req.body?.artSkill || "") || undefined;
        const directorSkill = String(req.body?.directorSkill || "") || undefined;
        const pipelineId = String(req.body?.pipelineId || "") || undefined;
        void runCodexTurn(String(req.body?.prompt || ""), emit, attachments, { mode, storySkill, artSkill, directorSkill, pipelineId });
        res.json({ ok: true });
    }));
    app.post("/agent/claude/turn", (req, res) => {
        runClaudeTurn(withAgentPrompt(String(req.body?.prompt || "")), emit);
        res.json({ ok: true });
    });
    app.post("/pipeline/create", route(async (req, res) => {
        const mode = validateMode(req.body?.mode);
        const config = (req.body?.config || {}) as Record<string, unknown>;
        const state = pipelineManager.create(mode, config);
        const serialized = withClientStages(state);
        session.emitAll("pipeline_update", { pipelineId: state.id, state: serialized });
        res.json({ ok: true, pipelineId: state.id, state: serialized });
    }));
    app.get("/pipeline/:id", route(async (req, res) => {
        const id = routeParam(req.params.id);
        const state = pipelineManager.get(id);
        if (!state) return res.status(404).json({ ok: false, error: "pipeline not found" });
        res.json({ ok: true, state: withClientStages(state) });
    }));
    app.post("/pipeline/:id/advance", route(async (req, res) => {
        const id = routeParam(req.params.id);
        const state = pipelineManager.get(id);
        if (!state) return res.status(404).json({ ok: false, error: "pipeline not found" });
        if (state.status === "completed" || state.status === "failed" || state.status === "paused") {
            return res.status(400).json({ ok: false, error: `pipeline is ${state.status}` });
        }
        const stage = getStages(state.mode).find((s) => s.name === state.currentStage);
        if (!stage) return res.status(400).json({ ok: false, error: `unknown stage: ${state.currentStage}` });
        const summary = String(req.body?.summary || "");
        const nodeIds = Array.isArray(req.body?.nodeIds) ? req.body.nodeIds : [];
        const output: StageOutput = { stageName: state.currentStage, summary, nodeIds };
        const check = runQualityChecks(stage, output, state.assets);
        if (!check.pass) {
            const reason = check.reason || "质量门未通过";
            return res.status(400).json({ ok: false, error: `quality gate failed: ${reason}`, reason });
        }
        const next = pipelineManager.advance(id, output);
        const serialized = withClientStages(next);
        session.emitAll("pipeline_update", { pipelineId: id, state: serialized });
        res.json({ ok: true, state: serialized });
    }));
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ ok: false, error: error.message }));

    return app.listen(port, "127.0.0.1", () => {
        console.log("Infinite Canvas Agent");
        console.log(`Local URL: ${config.url}`);
        console.log(`Connect token: ${config.token}`);
        console.log("Codex MCP: codex mcp add infinite-canvas -- npx -y @basketikun/canvas-agent mcp");
    });
}

function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function requestUrl(req: Request, config: CanvasAgentConfig) {
    return new URL(req.originalUrl || req.url || "/", config.url);
}

function setCors(req: Request, res: Response, url: URL, config: CanvasAgentConfig) {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type,x-canvas-agent-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (!origin || req.method === "OPTIONS" || url.pathname === "/health" || url.pathname === "/config") return true;
    config.origins ||= [];
    if (validToken(req, url, config.token) && !config.origins.includes(origin)) {
        config.origins.push(origin);
        saveConfig(config);
    }
    res.setHeader("Vary", "Origin");
    return config.origins.includes(origin);
}

function validToken(req: Request, url: URL, token: string) {
    const header = req.headers["x-canvas-agent-token"];
    return url.searchParams.get("token") === token || header === token || (Array.isArray(header) && header.includes(token));
}

function validateMode(value: unknown): "default" | "script" | "production" {
    if (value === "script" || value === "production") return value;
    return "default";
}
