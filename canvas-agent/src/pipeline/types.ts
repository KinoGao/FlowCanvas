import type { AgentMode } from "../prompts/builder.js";

export type PipelineId = string;
export type PipelineStatus = "init" | "running" | "paused" | "completed" | "failed";

export type CharacterAsset = {
  name: string;
  description: string;
  referenceImageNodeId?: string;
};

export type SceneAsset = {
  name: string;
  description: string;
  styleKeywords: string[];
};

export type ConsistencyAssets = {
  characters: CharacterAsset[];
  scenes: SceneAsset[];
  props: Array<{ name: string; description: string }>;
  storyContext: string;
  styleAnchor: string;
};

export type ProjectConfig = {
  totalEpisodes?: number;
  episodeDuration?: number;
  platform?: string;
  style?: string;
};

export type StageOutput = {
  stageName: string;
  summary: string;
  nodeIds: string[];
  assets?: Partial<ConsistencyAssets>;
};

export type PipelineState = {
  id: PipelineId;
  mode: AgentMode;
  config: ProjectConfig;
  currentStage: string;
  completedStages: string[];
  stageOutputs: Record<string, StageOutput>;
  assets: ConsistencyAssets;
  status: PipelineStatus;
  createdAt: number;
  updatedAt: number;
};

export type QualityCheckResult = { pass: boolean; reason?: string };

export type PipelineStage = {
  name: string;
  order: number;
  prerequisite?: string;
  mcpTools: string[];
  qualityChecks: string[];
  promptContext: string;
};
