import type { StageOutput, ConsistencyAssets, QualityCheckResult, PipelineStage } from "./types.js";

/**
 * 检查阶段产出是否满足质量门。
 * 初期策略：只做存在性检查（产出物是否已创建），内容质量留给用户审核。
 */
export function checkStageOutput(
  stageName: string,
  output: StageOutput,
  _assets: ConsistencyAssets,
): QualityCheckResult {
  if (!output.summary && !output.nodeIds.length) {
    return { pass: false, reason: "阶段未产出任何内容" };
  }

  // 存在性检查：是否有产出节点
  if (!output.nodeIds.length) {
    return { pass: false, reason: "未创建任何画布节点" };
  }

  return { pass: true };
}

/**
 * 阶段中文名 → prompt 约定 slug 的映射（与 stages.ts 各阶段 promptContext 中
 * 约定的 [STAGE_COMPLETE:xxx] 保持一致）。完成标记仅按当前阶段 slug 精确匹配，
 * 防止回复中任意完成标记（含未来阶段/无关 slug）触发跳级推进。
 */
const STAGE_SLUGS: Record<string, string> = {
  项目初始化: "init",
  故事骨架: "skeleton",
  改编策略: "adaptation",
  剧本编写: "script",
  导演规划: "director_plan",
  衍生资产分析: "derive_assets",
  衍生资产生成: "generate_assets",
  构建分镜表: "storyboard_table",
  分镜面板写入: "storyboard_panel",
  分镜图生成: "storyboard_gen",
};

/**
 * 从 Agent 的回复文本中检测阶段完成标记。
 * Agent 应输出 `[STAGE_COMPLETE:<当前阶段 slug>]` 来声明阶段完成；
 * 仅当 slug 与当前阶段约定的英文 slug 完全一致才命中，任意其他标记不触发推进。
 */
export function detectStageComplete(
  stageName: string,
  agentResponse: string,
): boolean {
  const slug = STAGE_SLUGS[stageName];
  if (slug) {
    return agentResponse.includes(`[STAGE_COMPLETE:${slug}]`);
  }
  // 未注册 slug 的阶段：退化为精确匹配中文名标记，绝不匹配任意 slug
  return agentResponse.includes(`[STAGE_COMPLETE:${stageName}]`);
}

/**
 * 依次执行阶段配置的所有质量检查，任一失败即返回该失败结果。
 * 推进流水线前调用：失败则不应推进。
 */
export function runQualityChecks(
  stage: PipelineStage,
  output: StageOutput,
  assets: ConsistencyAssets,
): QualityCheckResult {
  for (const check of stage.qualityChecks) {
    const result = runQualityCheck(check, output, assets);
    if (!result.pass) return result;
  }
  return { pass: true };
}

function runQualityCheck(
  check: string,
  output: StageOutput,
  assets: ConsistencyAssets,
): QualityCheckResult {
  switch (check) {
    case "config_confirmed":
      return output.summary.trim()
        ? { pass: true }
        : { pass: false, reason: "配置未确认：产出缺少摘要" };
    case "stage_output_exists":
      return checkStageOutput(output.stageName, output, assets);
    case "reference_consistency":
      return referenceConsistencyCheck(output, assets);
    case "character_consistency":
      return assets.characters.length > 0
        ? { pass: true }
        : { pass: false, reason: "缺少角色资产，无法保证角色一致性" };
    case "style_consistency":
      return assets.styleAnchor
        ? { pass: true }
        : { pass: false, reason: "缺少全局风格锚定，无法保证风格一致性" };
    default:
      return { pass: true };
  }
}

/** reference_consistency：产出引用的资产必须已在一致性资产池中注册。 */
function referenceConsistencyCheck(
  output: StageOutput,
  assets: ConsistencyAssets,
): QualityCheckResult {
  const refs = output.assets;
  if (!refs) return { pass: true };
  const known = new Set([
    ...assets.characters.map((c) => c.name),
    ...assets.scenes.map((s) => s.name),
    ...assets.props.map((p) => p.name),
  ]);
  for (const c of refs.characters ?? []) {
    if (!known.has(c.name)) {
      return { pass: false, reason: `角色「${c.name}」未在一致性资产池中注册` };
    }
  }
  for (const s of refs.scenes ?? []) {
    if (!known.has(s.name)) {
      return { pass: false, reason: `场景「${s.name}」未在一致性资产池中注册` };
    }
  }
  return { pass: true };
}

/**
 * 从阶段产出中提取一致性资产。
 * 目前依赖 Agent 在 reply 中输出结构化摘要，
 * 后续可改为解析画布节点内容。
 */
export function extractAssets(
  _stageName: string,
  output: StageOutput,
): Partial<ConsistencyAssets> {
  // 直接返回产出中已附带的资产
  return output.assets || {};
}
