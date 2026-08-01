import type { PipelineStage, PipelineState } from "./types.js";

export const SCRIPT_STAGES: PipelineStage[] = [
  {
    name: "项目初始化",
    order: 1,
    mcpTools: ["canvas_get_state", "canvas_create_text_node"],
    qualityChecks: ["config_confirmed"],
    promptContext: `你正在执行短剧剧本改编流水线——第 1/4 阶段：项目初始化。
当前任务：与用户确认项目参数（集数、单集时长、原著范围、平台规格、风格定位）。
在画布上创建文本节点记录确认后的配置。
完成后请输出 [STAGE_COMPLETE:init]。`,
  },
  {
    name: "故事骨架",
    order: 2,
    prerequisite: "项目初始化",
    mcpTools: ["canvas_get_state", "canvas_create_text_node", "canvas_create_text_nodes"],
    qualityChecks: ["stage_output_exists"],
    promptContext: `你正在执行短剧剧本改编流水线——第 2/4 阶段：故事骨架。
当前任务：基于项目配置，进行三幕结构分割、分集拆分、钩子与落点设计。
读取画布上的项目配置节点，创建「故事骨架」文本节点。
按照故事类型叙事手法组织骨架结构，确保情绪曲线有起伏。
完成后请输出 [STAGE_COMPLETE:skeleton]。`,
  },
  {
    name: "改编策略",
    order: 3,
    prerequisite: "故事骨架",
    mcpTools: ["canvas_get_state", "canvas_create_text_node", "canvas_connect_nodes"],
    qualityChecks: ["stage_output_exists"],
    promptContext: `你正在执行短剧剧本改编流水线——第 3/4 阶段：改编策略。
当前任务：基于故事骨架制定改编策略——确定保留/删减/强化的内容、世界观呈现方式、角色弧线调整。
读取画布上的故事骨架节点，创建「改编策略」文本节点并连线。
完成后请输出 [STAGE_COMPLETE:adaptation]。`,
  },
  {
    name: "剧本编写",
    order: 4,
    prerequisite: "改编策略",
    mcpTools: ["canvas_get_state", "canvas_create_text_node", "canvas_create_text_nodes", "canvas_connect_nodes", "canvas_run_generation"],
    qualityChecks: ["stage_output_exists"],
    promptContext: `你正在执行短剧剧本改编流水线——第 4/4 阶段：剧本编写。
当前任务：逐集编写剧本，每集创建独立文本节点「剧本·第N集」，包含场次划分、角色对白、动作描述。
参考已完成的改编策略，确保角色性格一致、情节线连贯。
单次不超过 5 集。
完成后请输出 [STAGE_COMPLETE:script]，并提取角色列表和故事线索。`,
  },
];

export const PRODUCTION_STAGES: PipelineStage[] = [
  {
    name: "导演规划",
    order: 1,
    mcpTools: ["canvas_get_state", "canvas_create_text_node"],
    qualityChecks: ["config_confirmed"],
    promptContext: `你正在执行视频制作流水线——第 1/6 阶段：导演规划。
当前任务：制定导演拍摄计划——确定视觉风格、叙事节奏、镜头语言策略。
完成后请输出 [STAGE_COMPLETE:director_plan]。`,
  },
  {
    name: "衍生资产分析",
    order: 2,
    prerequisite: "导演规划",
    mcpTools: ["canvas_get_state", "canvas_create_text_node"],
    qualityChecks: ["stage_output_exists"],
    promptContext: `你正在执行视频制作流水线——第 2/6 阶段：衍生资产分析。
当前任务：基于导演规划和剧本，分析需要的衍生资产（角色变体、场景变体、道具）。
对于每个资产，记录名称、视觉描述、风格关键词。
完成后请输出 [STAGE_COMPLETE:derive_assets]。`,
  },
  {
    name: "衍生资产生成",
    order: 3,
    prerequisite: "衍生资产分析",
    mcpTools: ["canvas_get_state", "canvas_create_image_prompt_flow", "canvas_run_generation"],
    qualityChecks: ["reference_consistency"],
    promptContext: `你正在执行视频制作流水线——第 3/6 阶段：衍生资产生成。
当前任务：为阶段2分析的衍生资产生成参考图。
使用 canvas_create_image_prompt_flow 创建生图流程，确保 styleAnchor 全局风格锚定词追加到每个 prompt。
完成后请输出 [STAGE_COMPLETE:generate_assets]。`,
  },
  {
    name: "构建分镜表",
    order: 4,
    prerequisite: "衍生资产生成",
    mcpTools: ["canvas_get_state", "canvas_create_text_nodes", "canvas_connect_nodes"],
    qualityChecks: ["stage_output_exists", "character_consistency"],
    promptContext: `你正在执行视频制作流水线——第 4/6 阶段：构建分镜表。
当前任务：基于剧本和资产构建分镜表——每行一个镜头，包含画面描述、景别、运镜、时长、角色、台词。
参考 consistencyAssets 中的角色和场景信息，确保每个镜头的角色描述与角色资产一致。
完成后请输出 [STAGE_COMPLETE:storyboard_table]。`,
  },
  {
    name: "分镜面板写入",
    order: 5,
    prerequisite: "构建分镜表",
    mcpTools: ["canvas_get_state", "canvas_create_text_nodes", "canvas_update_node_text"],
    qualityChecks: ["stage_output_exists"],
    promptContext: `你正在执行视频制作流水线——第 5/6 阶段：分镜面板写入。
当前任务：将分镜表逐组写入分镜面板节点，每组包含画面描述、时长、资产引用。
完成后请输出 [STAGE_COMPLETE:storyboard_panel]。`,
  },
  {
    name: "分镜图生成",
    order: 6,
    prerequisite: "分镜面板写入",
    mcpTools: ["canvas_get_state", "canvas_create_image_prompt_flow", "canvas_run_generation", "canvas_connect_nodes"],
    qualityChecks: ["reference_consistency", "style_consistency"],
    promptContext: `你正在执行视频制作流水线——第 6/6 阶段：分镜图生成。
当前任务：为每个分镜生成图片。
使用 canvas_create_image_prompt_flow，prompt 中必须包含 consistencyAssets.styleAnchor 风格锚定词。
如果 consistencyAssets.characters 中有角色的 referenceImageNodeId，将其作为参考图节点传入。
完成后请输出 [STAGE_COMPLETE:storyboard_gen]。`,
  },
];

export function getStages(mode: string): PipelineStage[] {
  if (mode === "script") return SCRIPT_STAGES;
  if (mode === "production") return PRODUCTION_STAGES;
  return [];
}

/** 客户端进度条消费的阶段信息（含完成标记） */
export type ClientStageInfo = {
  name: string;
  order: number;
  completed: boolean;
};

/** 由 getStages(mode) 生成 {name, order, completed}，供前端 formatPipelineInfo 渲染进度条 */
export function toClientStages(mode: string, completedStages: string[]): ClientStageInfo[] {
  return getStages(mode).map((s) => ({
    name: s.name,
    order: s.order,
    completed: completedStages.includes(s.name),
  }));
}

/** 为 state 附加 stages 数组（保持原有字段不动），用于 HTTP 响应与 pipeline_update 推送 */
export function withClientStages(state: PipelineState): PipelineState & { stages: ClientStageInfo[] } {
  return { ...state, stages: toClientStages(state.mode, state.completedStages) };
}

export function getStage(mode: string, name: string): PipelineStage | undefined {
  return getStages(mode).find((s) => s.name === name);
}

export const EMPTY_ASSETS = {
  characters: [],
  scenes: [],
  props: [],
  storyContext: "",
  styleAnchor: "",
} as const;
