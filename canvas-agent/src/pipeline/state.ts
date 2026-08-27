import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PipelineId, PipelineState } from "./types.js";

const PIPELINES_DIR = path.join(os.homedir(), ".infinite-canvas", "pipelines");

function ensureDir(): void {
  fs.mkdirSync(PIPELINES_DIR, { recursive: true });
}

function filePath(pipelineId: PipelineId): string {
  return path.join(PIPELINES_DIR, `${pipelineId}.json`);
}

export function savePipeline(state: PipelineState): void {
  ensureDir();
  fs.writeFileSync(filePath(state.id), JSON.stringify({ ...state, updatedAt: Date.now() }, null, 2));
}

export function loadPipeline(pipelineId: PipelineId): PipelineState | null {
  try {
    const raw = fs.readFileSync(filePath(pipelineId), "utf8");
    return JSON.parse(raw) as PipelineState;
  } catch {
    return null;
  }
}

export function deletePipeline(pipelineId: PipelineId): void {
  try {
    fs.unlinkSync(filePath(pipelineId));
  } catch {
    // ignore
  }
}

export function listPipelines(): PipelineState[] {
  ensureDir();
  try {
    return fs
      .readdirSync(PIPELINES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(PIPELINES_DIR, f), "utf8")) as PipelineState;
        } catch {
          return null;
        }
      })
      .filter((p): p is PipelineState => p !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function emptyAssets() {
  return {
    characters: [],
    scenes: [],
    props: [],
    storyContext: "",
    styleAnchor: "",
  };
}
