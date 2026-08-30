/**
 * 画布「Model Gate」的后端能力读取层。
 *
 * 本轮后端未暴露 /api/model-capabilities/features，因此 fetcher 必须优雅降级：
 * 状态码 404 / 网络异常 / 空数据 → 返回 {}（全部功能按默认 = 未接入），
 * 避免因端点缺失而让整个画布报错或出现请求风暴。真实接入时后端新增该端点即可。
 */
import { apiUrl } from "@/constant/env";
import { queryClient } from "@/lib/query-client";
import type { FeatureCapabilityFlags } from "@/app/(user)/canvas/utils/canvas-model-gate";

type ApiResponse<T> = { code: number; data: T; msg?: string };

export const FEATURE_CAPABILITIES_QUERY_KEY = ["feature-capabilities"] as const;

/** 后端已接入的模型能力标记（尚未接入时为 {}）。 */
export type BackendFeatureCapabilityFlags = FeatureCapabilityFlags;

export async function fetchFeatureCapabilities(): Promise<FeatureCapabilityFlags> {
    try {
        const response = await fetch(apiUrl("/api/model-capabilities/features"));
        if (!response.ok) return {};
        const body = (await response.json()) as ApiResponse<FeatureCapabilityFlags>;
        if (body.code !== 0) return {};
        return body.data ?? {};
    } catch {
        // 网络 / CORS / 端点未实现：视为未接入
        return {};
    }
}

export function invalidateFeatureCapabilities() {
    void queryClient.invalidateQueries({ queryKey: FEATURE_CAPABILITIES_QUERY_KEY });
}
