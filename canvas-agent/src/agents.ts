import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { AGENT_PROMPT, buildAgentPrompt, pipelineManager, VERSION } from "./config.js";
import type { AgentMode, PromptBuildOptions } from "./prompts/builder.js";
import type { AgentAttachment, AgentEmit } from "./types.js";
import { detectStageComplete, runQualityChecks } from "./pipeline/quality.js";
import { getStages, withClientStages } from "./pipeline/stages.js";
import type { ConsistencyAssets, StageOutput } from "./pipeline/types.js";

type Json = Record<string, unknown>;
type AgentEvent = Json & { type: string; usage?: unknown };
type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type CodexRunOptions = { mode?: AgentMode; storySkill?: string; artSkill?: string; directorSkill?: string; pipelineId?: string };
type AgentHistoryMessage = { id: string; role: "user" | "assistant" | "tool" | "error"; title?: string; text: string; detail?: unknown; streamId?: string };

let codexQueue: Promise<unknown> = Promise.resolve();
let codexApp: CodexAppClient | null = null;
let currentSystemPrompt = AGENT_PROMPT;
const canvasAgentMcp = canvasAgentMcpCommand();
const require = createRequire(import.meta.url);

export function withAgentPrompt(prompt: string, mode?: AgentMode, skillOptions?: PromptBuildOptions) {
    return prompt.trim() ? `${mode ? buildAgentPrompt(mode, skillOptions) : AGENT_PROMPT}\n\n用户请求：${prompt}` : "";
}

export async function runCodexTurn(prompt: string, emit: AgentEmit, attachments: AgentAttachment[] = [], options: CodexRunOptions = {}) {
    if (!prompt.trim()) return;
    codexQueue = codexQueue.catch(() => undefined).then(() => runCodexTurnNow(prompt, emit, attachments, options));
    await codexQueue;
}

async function runCodexTurnNow(prompt: string, emit: AgentEmit, attachments: AgentAttachment[], options: CodexRunOptions) {
    let files: string[] = [];
    try {
        const skillOptions: PromptBuildOptions = {
            storySkill: options.storySkill as PromptBuildOptions["storySkill"],
            artSkill: options.artSkill as PromptBuildOptions["artSkill"],
            directorSkill: options.directorSkill as PromptBuildOptions["directorSkill"],
        };
        let fullPrompt = withAgentPrompt(prompt, options.mode, skillOptions);
        currentSystemPrompt = options.mode ? buildAgentPrompt(options.mode, skillOptions) : AGENT_PROMPT;

        // 注入流水线上下文（校验 turn 模式与流水线模式一致；不一致不注入，default 绝不被 pipeline 上下文污染）
        if (options.pipelineId) {
            const pipelineState = pipelineManager.get(options.pipelineId);
            if (pipelineState && shouldInjectPipelineContext(options.mode, pipelineState.mode)) {
                const pipelinePrompt = pipelineManager.buildPrompt(options.pipelineId);
                if (pipelinePrompt) {
                    fullPrompt = `${pipelinePrompt}\n\n${fullPrompt}`;
                }
            }
        }

        files = await writeAttachmentFiles(attachments);
        codexApp ||= await CodexAppClient.start(emit);
        // 独立画布助手：不维护 Codex 线程/工作空间，每次 turn 使用一次性线程，画布状态即上下文
        const thread = await codexApp.startThread();
        const threadId = String(field(thread, "id") || "");
        if (!threadId) throw new Error("Codex app-server 没有返回 thread id");
        const result = await codexApp.startTurn(threadId, fullPrompt, files);
        // 自动推进链路：turn 完成后聚合全文，检测 [STAGE_COMPLETE:xxx] 标记并推进流水线
        await maybeAdvancePipeline(emit, options.pipelineId, result.replyText);
    } catch (error) {
        emit("agent_error", { message: errorMessage(error) });
    } finally {
        await Promise.all(files.map((file) => fs.unlink(file).catch(() => undefined)));
    }
}

/** turn 模式与流水线模式一致时才注入流水线上下文；default/未指定模式绝不被 pipeline 上下文污染 */
export function shouldInjectPipelineContext(mode: AgentMode | undefined, pipelineMode: AgentMode | undefined): boolean {
    if (!mode || !pipelineMode) return false;
    return mode === pipelineMode;
}

/**
 * 自动推进链路：Agent turn 完成后，聚合该 turn 的 agent_message 全文，
 * 用 detectStageComplete 检测 [STAGE_COMPLETE:xxx] 标记；命中则提取产出，
 * 经质量门校验后调用 pipelineManager.advance 推进，并通过 emit 推送 pipeline_update。
 */
export async function maybeAdvancePipeline(emit: AgentEmit, pipelineId: string | undefined, replyText: string): Promise<void> {
    if (!pipelineId || !replyText.trim()) return;
    const state = pipelineManager.get(pipelineId);
    if (!state || state.status === "paused" || state.status === "completed" || state.status === "failed") return;
    const stage = getStages(state.mode).find((s) => s.name === state.currentStage);
    if (!stage) return;
    if (!detectStageComplete(stage.name, replyText)) return;

    const output = extractStageOutput(stage.name, replyText);
    const check = runQualityChecks(stage, output, state.assets);
    if (!check.pass) {
        const reason = check.reason || "质量门未通过";
        emit("pipeline_failed", { pipelineId, state, reason });
        emit("agent_error", { message: `流水线阶段「${stage.name}」质量门未通过：${reason}，未推进。` });
        return;
    }
    const next = pipelineManager.advance(pipelineId, output);
    emit("pipeline_update", { pipelineId, state: withClientStages(next) });
}

/** 从回复文本提取阶段产出：支持 [STAGE_SUMMARY:...] / [STAGE_NODES:...] / [STAGE_ASSETS:{json}]，缺省用全文兜底。 */
function extractStageOutput(stageName: string, replyText: string): StageOutput {
    const summary = markerValue(replyText, "STAGE_SUMMARY") ?? replyText.trim();
    const nodeIds = (markerValue(replyText, "STAGE_NODES") || "")
        .split(/[,，\s]+/)
        .map((id) => id.trim())
        .filter(Boolean);
    const assets = parseStageAssets(replyText);
    return { stageName, summary, nodeIds, assets };
}

function markerValue(text: string, key: string): string | undefined {
    const match = text.match(new RegExp(`\\[${key}:([^\\]]*)\\]`));
    return match?.[1]?.trim() || undefined;
}

/**
 * 从回复文本中提取 [STAGE_ASSETS:{...}] 的资产声明 JSON。
 * 资产 JSON 内含嵌套数组（characters/scenes/props）与字符串转义，
 * 不能用「直到第一个 ] 为止」的正则截取（会在数组结束符处截断导致 JSON.parse 失败），
 * 这里按花括号深度 + 字符串状态扫描，取与起始 { 配对的完整 JSON 再解析。
 */
function parseStageAssets(raw: string | undefined): Partial<ConsistencyAssets> | undefined {
    if (!raw) return undefined;
    const marker = "[STAGE_ASSETS:";
    const start = raw.indexOf(marker);
    if (start < 0) return undefined;
    const braceStart = start + marker.length;
    if (raw[braceStart] !== "{") return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = braceStart; i < raw.length; i++) {
        const ch = raw[i];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === "\\") { escaped = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") { depth++; continue; }
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                try {
                    const value = JSON.parse(raw.slice(braceStart, i + 1)) as Partial<ConsistencyAssets>;
                    return value && typeof value === "object" ? value : undefined;
                } catch {
                    return undefined;
                }
            }
        }
    }
    return undefined;
}

export function runClaudeTurn(prompt: string, emit: AgentEmit) {
    if (!prompt.trim()) return;
    const child = spawnAgent("claude", ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--allowedTools", "mcp__infinite-canvas__*", prompt], ["ignore", "pipe", "pipe"], emit);
    if (!child) return;
    pipeJsonLines(child, emit, "claude");
}

class CodexAppClient {
    private nextId = 1;
    private buffer = "";
    private textByItem = new Map<string, string>();
    private deltaCount = 0;
    private lastUsage: unknown = null;
    private pending = new Map<number, PendingRequest>();
    private activeTurns = new Map<string, PendingRequest>();
    private completedTurns = new Map<string, { error: Error | null; replyText: string }>();
    private turnItemIds = new Set<string>();

    private constructor(private child: ChildProcess, private emit: AgentEmit) {}

    static async start(emit: AgentEmit) {
        const child = spawn(process.execPath, [codexBin(), "app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        const client = new CodexAppClient(child, emit);
        child.stdout?.on("data", (chunk) => client.read(chunk.toString()));
        child.stderr?.on("data", (chunk) => emit("agent_log", { text: chunk.toString() }));
        child.on("error", (error) => emit("agent_error", { message: error.message }));
        child.on("exit", (code) => {
            client.failAll(`Codex app-server exited: ${code ?? 0}`);
            codexApp = null;
            emit("agent_log", { text: `Codex app-server exited: ${code ?? 0}` });
        });
        await client.request("initialize", { clientInfo: { name: "canvas-agent", title: "Infinite Canvas Agent", version: VERSION }, capabilities: { experimentalApi: true, requestAttestation: false } });
        client.notify("initialized");
        return client;
    }

    async startThread() {
        const result = await this.request("thread/start", { approvalPolicy: "never", sandbox: "workspace-write", config: codexConfig(), threadSource: "user" });
        const thread = field(result, "thread") as Json | undefined;
        const id = String(field(thread, "id") || "");
        if (!id) throw new Error("Codex app-server 没有返回 thread id");
        return thread || {};
    }

    async startTurn(threadId: string, prompt: string, images: string[]): Promise<{ replyText: string }> {
        const result = await this.request("turn/start", { threadId, input: codexInput(prompt, images), approvalPolicy: "never" });
        const turnId = String(field(field(result, "turn"), "id") || "");
        if (!turnId) throw new Error("Codex app-server 没有返回 turn id");
        const completed = this.completedTurns.get(turnId);
        if (this.completedTurns.has(turnId)) {
            this.completedTurns.delete(turnId);
            if (completed?.error) throw completed.error;
            return { replyText: completed?.replyText || "" };
        }
        const value = await new Promise<unknown>((resolve, reject) => this.activeTurns.set(turnId, { resolve, reject }));
        const replyText = value && typeof value === "object" ? String((value as { replyText?: unknown }).replyText || "") : "";
        return { replyText };
    }

    private request(method: string, params: unknown) {
        const id = this.nextId++;
        this.write({ id, method, params });
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    private notify(method: string, params?: unknown) {
        this.write(params === undefined ? { method } : { method, params });
    }

    private write(value: unknown) {
        this.child.stdin?.write(`${JSON.stringify(value)}\n`);
    }

    private read(chunk: string) {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || "";
        lines.filter(Boolean).forEach((line) => {
            try {
                this.handle(JSON.parse(line) as Json);
            } catch {
                this.emit("agent_log", { text: line });
            }
        });
    }

    private handle(message: Json) {
        const id = Number(message.id);
        if (message.error && this.pending.has(id)) return this.reject(id, String(field(message.error, "message") || "Codex request failed"));
        if (this.pending.has(id)) return this.resolve(id, message.result);
        if (typeof message.method === "string" && "id" in message) return this.answerServerRequest(message);
        if (typeof message.method === "string") this.handleNotification(message.method, (message.params || {}) as Json);
    }

    private handleNotification(method: string, params: Json) {
        if (method === "item/agentMessage/delta") {
            this.emitDelta(params);
            const itemId = String(field(params, "itemId") || "");
            if (itemId) this.turnItemIds.add(itemId);
            return;
        }
        if (method === "thread/tokenUsage/updated") this.lastUsage = normalizeUsage(params);
        if (method === "turn/started") this.turnItemIds = new Set();
        const event = normalizeCodexNotification(method, params);
        if (!event) return;
        if (event.type === "turn.completed") event.usage = this.lastUsage;
        this.emit("agent_event", { agent: "codex", ...event });
        if (event.type === "turn.completed") {
            const turnId = String(field(params, "turnId") || field(field(params, "turn"), "id") || "");
            const pending = this.activeTurns.get(turnId);
            const error = field(field(params, "turn"), "error");
            const replyText = this.turnReplyText(params);
            this.pruneTurnTexts();
            if (pending) {
                this.activeTurns.delete(turnId);
                if (error) pending.reject(new Error(String(field(error, "message") || "Codex turn failed")));
                else pending.resolve({ replyText });
            } else if (turnId) {
                this.completedTurns.set(turnId, {
                    error: error ? new Error(String(field(error, "message") || "Codex turn failed")) : null,
                    replyText,
                });
            }
            this.emit("agent_event", { agent: "codex", type: "stream.summary", delta_count: this.deltaCount });
            this.deltaCount = 0;
            this.emit("agent_done", { agent: "codex", usage: event.usage });
        }
    }

    /** 聚合当前 turn 的 agent_message 全文：优先 turn items，兜底 delta 聚合的 textByItem。 */
    private turnReplyText(params: Json): string {
        const turn = field(params, "turn") as Json | undefined;
        const texts: string[] = [];
        for (const item of arrayValue(field(turn, "items"))) {
            if (String(field(item, "type") || "") === "agentMessage") {
                const text = String(field(item, "text") || "").trim();
                if (text) texts.push(text);
            }
        }
        if (texts.length) return texts.join("\n");
        return [...this.turnItemIds]
            .map((id) => this.textByItem.get(id) || "")
            .filter((text) => text.trim())
            .join("\n");
    }

    private pruneTurnTexts() {
        for (const id of this.turnItemIds) this.textByItem.delete(id);
        this.turnItemIds = new Set();
    }

    private emitDelta(params: Json) {
        const id = String(field(params, "itemId") || "");
        const text = `${this.textByItem.get(id) || ""}${String(field(params, "delta") || "")}`;
        this.deltaCount += 1;
        this.textByItem.set(id, text);
        this.emit("agent_event", { agent: "codex", type: "item.updated", item: { id, type: "agent_message", text } });
    }

    private answerServerRequest(message: Json) {
        const method = String(message.method);
        const result = method === "mcpServer/elicitation/request" ? { action: "accept", content: {}, _meta: null } : { decision: "decline" };
        this.write({ id: message.id, result });
        this.emit("agent_event", { agent: "codex", type: "server.request", method, params: message.params, result });
    }

    private resolve(id: number, result: unknown) {
        const pending = this.pending.get(id);
        if (pending) (this.pending.delete(id), pending.resolve(result));
    }

    private reject(id: number, message: string) {
        const pending = this.pending.get(id);
        if (pending) (this.pending.delete(id), pending.reject(new Error(message)));
    }

    failAll(message: string) {
        [...this.pending.values(), ...this.activeTurns.values()].forEach((item) => item.reject(new Error(message)));
        this.pending.clear();
        this.activeTurns.clear();
    }
}

function canvasAgentMcpCommand() {
    const current = process.argv.find((arg) => /index\.(t|j)s$/.test(arg)) || "";
    const entry = path.resolve(current || fileURLToPath(new URL("./index.js", import.meta.url)));
    const tsx = path.join(path.dirname(entry), "..", "node_modules", "tsx", "dist", "cli.mjs");
    return entry.endsWith(".ts") ? { command: process.execPath, args: [tsx, entry, "mcp"] } : { command: process.execPath, args: [entry, "mcp"] };
}

function codexConfig() {
    return { mcp_servers: { "infinite-canvas": { command: canvasAgentMcp.command, args: canvasAgentMcp.args, default_tools_approval_mode: "approve", startup_timeout_sec: 20, tool_timeout_sec: 90 } } };
}

function codexInput(prompt: string, images: string[]) {
    return [{ type: "text", text: prompt, text_elements: [] }, ...images.map((file) => ({ type: "localImage", path: file }))];
}

function arrayValue(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function normalizeItem(item: unknown) {
    const value = item && typeof item === "object" ? { ...(item as Json) } : {};
    if (value.type === "agentMessage") value.type = "agent_message";
    if (value.type === "mcpToolCall") value.type = "mcp_tool_call";
    if (value.type === "agent_message" && typeof value.id === "string") value.text = String(value.text || "");
    if ("arguments" in value) value.arguments = parseMaybeJson(value.arguments);
    return value;
}

function normalizeCodexNotification(method: string, params: Json): AgentEvent | null {
    if (method === "thread/started") return { type: "thread.started", thread_id: field(field(params, "thread"), "id") };
    if (method === "turn/started") return { type: "turn.started" };
    if (method === "turn/completed") return { type: "turn.completed", usage: null };
    if (method === "item/started") return { type: "item.started", item: normalizeItem(field(params, "item")) };
    if (method === "item/completed") return { type: "item.completed", item: normalizeItem(field(params, "item")) };
    if (method === "error") return { type: "error", message: field(params, "message") };
    return null;
}

function normalizeUsage(params: Json) {
    const total = field(field(params, "tokenUsage"), "total") as Json | undefined;
    return {
        input_tokens: field(total, "inputTokens"),
        cached_input_tokens: field(total, "cachedInputTokens"),
        output_tokens: field(total, "outputTokens"),
        reasoning_output_tokens: field(total, "reasoningOutputTokens"),
    };
}

function parseMaybeJson(value: unknown) {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Json)[key] : undefined;
}

async function writeAttachmentFiles(attachments: AgentAttachment[]) {
    return await Promise.all(attachments.filter((item) => item.dataUrl?.startsWith("data:image/")).map(writeAttachmentFile));
}

async function writeAttachmentFile(item: AgentAttachment) {
    const [, meta = "", data = ""] = item.dataUrl?.match(/^data:([^;]+);base64,(.+)$/) || [];
    if (!data) throw new Error(`图片附件无效：${item.name || "未命名图片"}`);
    const file = path.join(os.tmpdir(), `infinite-canvas-${Date.now()}-${Math.random().toString(16).slice(2)}.${imageExt(meta || item.type)}`);
    await fs.writeFile(file, Buffer.from(data, "base64"));
    return file;
}

function imageExt(type = "") {
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    return "jpg";
}

function codexBin() {
    return path.join(path.dirname(require.resolve("@openai/codex/package.json")), "bin", "codex.js");
}

function pipeJsonLines(child: ReturnType<typeof spawn>, emit: AgentEmit, agent: string) {
    let out = "";
    child.stdout?.on("data", (chunk) => {
        out += chunk.toString();
        const lines = out.split(/\r?\n/);
        out = lines.pop() || "";
        lines.filter(Boolean).forEach((line) => {
            try {
                emit("agent_event", { agent, ...JSON.parse(line) });
            } catch {
                emit("agent_event", { agent, type: "raw", text: line });
            }
        });
    });
    child.stderr?.on("data", (chunk) => emit("agent_log", { text: chunk.toString() }));
    child.on("error", (error) => emit("agent_error", { message: error.message }));
    child.on("close", (code) => emit("agent_done", { agent, code }));
}

function spawnAgent(name: string, args: string[], stdio: StdioOptions, emit: AgentEmit) {
    try {
        return spawn(name, args, { stdio, shell: process.platform === "win32", windowsHide: true });
    } catch (error) {
        emit("agent_error", { message: errorMessage(error) });
        return null;
    }
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
