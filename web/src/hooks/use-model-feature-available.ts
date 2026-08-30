import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchFeatureCapabilities, FEATURE_CAPABILITIES_QUERY_KEY, type BackendFeatureCapabilityFlags } from "@/services/api/feature-capabilities";
import { readFrontendFeatureOverrides } from "@/constant/feature-flags";
import { mergeFeatureCapabilities, resolveFeatureAvailability, type CapabilityKey, type FeatureAvailability } from "@/app/(user)/canvas/utils/canvas-model-gate";

/**
 * 单个共享的 model-capabilities 查询：把后端标记与前端覆盖合并成一个完整可用集。
 * 后端未实现端点时 fetch 返回 {}，因此永不抛错；`retry:false` 避免 404 后的请求风暴。
 * 设置面板切换前端覆盖后调用 invalidateFeatureCapabilities() → refetch 变更 query.data →
 * 这里重新读取前端覆盖并重算 merged，保证开关即时生效。
 */
export function useFeatureCapabilities() {
    const query = useQuery({
        queryKey: FEATURE_CAPABILITIES_QUERY_KEY,
        queryFn: fetchFeatureCapabilities,
        staleTime: 5 * 60_000,
        retry: false,
        placeholderData: {},
        refetchOnWindowFocus: false,
    });

    const merged = useMemo(
        () => mergeFeatureCapabilities(query.data as BackendFeatureCapabilityFlags | undefined, readFrontendFeatureOverrides()),
        [query.data],
    );

    return { ...query, flags: merged };
}

/** 判定某个功能的可用性（含来源），供 ModelGate / 占位提示使用。 */
export function useModelFeatureAvailable(key: CapabilityKey): FeatureAvailability & { isChecking: boolean } {
    const { data, isLoading, flags } = useFeatureCapabilities();
    const availability = resolveFeatureAvailability(data, readFrontendFeatureOverrides(), key);
    return { available: flags[key] === true, source: availability.source, isChecking: isLoading };
}
