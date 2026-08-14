import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgentPromptBuilder, type AgentMode, type PromptBuildOptions } from "./prompts/builder.js";
import { PipelineManager } from "./pipeline/manager.js";

export const DEFAULT_PORT = 17371;
export const CONFIG_DIR = path.join(os.homedir(), ".infinite-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();

const SKILLS_DIR = resolveSkillsDir();
const promptBuilder = new AgentPromptBuilder(SKILLS_DIR);
export const pipelineManager = new PipelineManager();

export function buildAgentPrompt(mode: AgentMode = "default", options: PromptBuildOptions = {}): string {
  return promptBuilder.build(mode, options);
}

/** 保持向后兼容：默认模式 prompt */
export const AGENT_PROMPT = buildAgentPrompt("default");

function resolveSkillsDir(): string {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(srcDir, "prompts", "skills");
}

export type CanvasAgentConfig = { url: string; token: string; origins?: string[] };

export function loadConfig(create = false): CanvasAgentConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") };
        if (create) saveConfig(config);
        return config;
    }
}

export function saveConfig(config: CanvasAgentConfig) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
