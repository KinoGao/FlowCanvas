import type { StageOutput, ConsistencyAssets, QualityCheckResult } from "./types.js";

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
 * 从 Agent 的回复文本中检测阶段完成标记。
 * Agent 应输出 `[STAGE_COMPLETE: stageName]` 来声明阶段完成。
 */
export function detectStageComplete(
  stageName: string,
  agentResponse: string,
): boolean {
  const marker = `[STAGE_COMPLETE:${stageName}]`;
  if (agentResponse.includes(marker)) return true;

  // 兜底：检查通用完成标记
  if (agentResponse.includes("[STAGE_COMPLETE]")) return true;

  return false;
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
