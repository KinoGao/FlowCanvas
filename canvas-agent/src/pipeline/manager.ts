import crypto from "node:crypto";
import type { AgentMode } from "../prompts/builder.js";
import {
  type ConsistencyAssets,
  type PipelineId,
  type PipelineState,
  type PipelineStatus,
  type ProjectConfig,
  type StageOutput,
} from "./types.js";
import { getStages } from "./stages.js";
import type { PipelineStage } from "./types.js";
import { emptyAssets, loadPipeline, savePipeline } from "./state.js";

export class PipelineManager {
  private active = new Map<PipelineId, PipelineState>();

  create(mode: AgentMode, config: ProjectConfig = {}): PipelineState {
    const stages = getStages(mode);
    const state: PipelineState = {
      id: crypto.randomUUID(),
      mode,
      config,
      currentStage: stages[0]?.name || "init",
      completedStages: [],
      stageOutputs: {},
      assets: emptyAssets(),
      status: "init",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.active.set(state.id, state);
    savePipeline(state);
    return state;
  }

  get(pipelineId: PipelineId): PipelineState | null {
    const cached = this.active.get(pipelineId);
    if (cached) return cached;
    const loaded = loadPipeline(pipelineId);
    if (loaded) this.active.set(pipelineId, loaded);
    return loaded;
  }

  advance(pipelineId: PipelineId, output: StageOutput): PipelineState {
    const state = this.mustGet(pipelineId);
    const stages = getStages(state.mode);
    const currentIndex = stages.findIndex((s) => s.name === state.currentStage);
    if (currentIndex < 0) throw new Error(`未知阶段：${state.currentStage}`);

    state.completedStages = [...new Set([...state.completedStages, state.currentStage])];
    state.stageOutputs[state.currentStage] = output;

    // 提取一致性资产
    if (output.assets) {
      this.mergeAssets(state.assets, output.assets);
    }

    const next = stages[currentIndex + 1];
    if (next) {
      state.currentStage = next.name;
      state.status = "running";
    } else {
      state.status = "completed";
    }
    state.updatedAt = Date.now();
    savePipeline(state);
    return state;
  }

  pause(pipelineId: PipelineId): PipelineState {
    const state = this.mustGet(pipelineId);
    state.status = "paused";
    state.updatedAt = Date.now();
    savePipeline(state);
    return state;
  }

  resume(pipelineId: PipelineId): PipelineState {
    const state = this.mustGet(pipelineId);
    state.status = "running";
    state.updatedAt = Date.now();
    savePipeline(state);
    return state;
  }

  fail(pipelineId: PipelineId, error: string): PipelineState {
    const state = this.mustGet(pipelineId);
    state.status = "failed";
    state.stageOutputs[state.currentStage] = {
      stageName: state.currentStage,
      summary: error,
      nodeIds: [],
    };
    state.updatedAt = Date.now();
    savePipeline(state);
    return state;
  }

  buildPrompt(pipelineId: PipelineId): string {
    const state = this.mustGet(pipelineId);
    const stages = getStages(state.mode);
    const current = stages.find((s) => s.name === state.currentStage);
    if (!current) return "";

    const completedList = state.completedStages.map((s) => `  ✅ ${s}`).join("\n");
    const remainingStages = stages.filter((s) => s.order > (current.order || 0));
    const remainingList = remainingStages.map((s) => `  ⏳ ${s.name}`).join("\n");

    return [
      "【当前制作流水线】",
      `模式：${state.mode === "script" ? "剧本改编" : "视频制作"}`,
      state.config.totalEpisodes ? `集数：${state.config.totalEpisodes}集` : "",
      state.config.episodeDuration ? `单集时长：${state.config.episodeDuration}分钟` : "",
      state.config.style ? `风格：${state.config.style}` : "",
      "",
      "进度：",
      `  🔵 当前阶段：${current.name}`,
      completedList ? `已完成：\n${completedList}` : "",
      remainingList ? `待完成：\n${remainingList}` : "",
      "",
      `当前任务：${current.promptContext}`,
      state.assets.styleAnchor ? `\n全局风格锚定：${state.assets.styleAnchor}` : "",
      state.assets.storyContext ? `\n故事上下文：${state.assets.storyContext}` : "",
      state.assets.characters.length
        ? `\n角色资产：\n${state.assets.characters.map((c) => `  - ${c.name}：${c.description}`).join("\n")}`
        : "",
      state.assets.scenes.length
        ? `\n场景资产：\n${state.assets.scenes.map((s) => `  - ${s.name}：${s.description}`).join("\n")}`
        : "",
      "",
      "完成后请在回复末尾添加 [STAGE_COMPLETE:xxx] 标记，并用 [STAGE_NODES:节点ID,节点ID] 声明本阶段创建的画布节点，可用 [STAGE_SUMMARY:阶段摘要] 说明产出。",
      '当本阶段产出提炼出角色/场景/道具等一致性资产时，请用 [STAGE_ASSETS:{"characters":[{"name":"角色名","description":"角色描述"}],"scenes":[{"name":"场景名","description":"场景描述","styleKeywords":["关键词"]}],"props":[{"name":"道具名","description":"道具描述"}],"storyContext":"故事背景","styleAnchor":"全局风格锚定词"}] 声明（JSON 格式，可只含实际产出的字段，无产出的字段可省略）。',
    ]
      .filter(Boolean)
      .join("\n");
  }

  private mergeAssets(target: ConsistencyAssets, source: Partial<ConsistencyAssets>): void {
    if (source.characters?.length) {
      const existing = new Set(target.characters.map((c) => c.name));
      for (const c of source.characters) {
        if (!existing.has(c.name)) {
          target.characters.push(c);
          existing.add(c.name);
        } else {
          const idx = target.characters.findIndex((x) => x.name === c.name);
          if (idx >= 0) target.characters[idx] = { ...target.characters[idx], ...c };
        }
      }
    }
    if (source.scenes?.length) {
      const existing = new Set(target.scenes.map((s) => s.name));
      for (const s of source.scenes) {
        if (!existing.has(s.name)) {
          target.scenes.push(s);
          existing.add(s.name);
        }
      }
    }
    if (source.props?.length) {
      const existing = new Set(target.props.map((p) => p.name));
      for (const p of source.props) {
        if (!existing.has(p.name)) {
          target.props.push(p);
          existing.add(p.name);
        }
      }
    }
    if (source.storyContext) target.storyContext = source.storyContext;
    if (source.styleAnchor) target.styleAnchor = source.styleAnchor;
  }

  private mustGet(pipelineId: PipelineId): PipelineState {
    const state = this.get(pipelineId);
    if (!state) throw new Error(`流水线不存在：${pipelineId}`);
    return state;
  }
}
