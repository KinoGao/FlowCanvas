import { useQuery } from '@tanstack/react-query';
import {
    isSeedanceVideoModel,
    seedanceCapabilitiesForModel,
} from '@/lib/seedance-video';
import {
    fetchVideoModelCapabilities,
    resolveVideoModelCapability,
    VIDEO_MODEL_CAPABILITIES_QUERY_KEY,
    type VideoGenerationMode,
    type VideoModelCapability,
} from '@/services/api/model-capabilities';
import { modelOptionName } from '@/stores/use-config-store';

export function useVideoModelCapability(model: string) {
    const query = useQuery({
        queryKey: VIDEO_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchVideoModelCapabilities,
        staleTime: 5 * 60_000,
    });
    const normalizedModel = modelOptionName(model);
    const resolvedCapability = resolveVideoModelCapability(query.data, normalizedModel);
    return {
        ...query,
        capability: resolvedCapability || (query.isError ? seedanceFallbackCapability(normalizedModel) : null),
    };
}

function seedanceFallbackCapability(model: string): VideoModelCapability | null {
    if (!isSeedanceVideoModel(model)) return null;
    const local = seedanceCapabilitiesForModel(model);
    return {
        id: `seedance-fallback:${model}`,
        provider: 'seedance',
        requestAdapter: local.requestAdapter,
        modelPatterns: [model],
        modes: [...local.modes] as VideoGenerationMode[],
        ratios: [...local.ratios],
        resolutions: [...local.resolutions],
        durations: [...local.durations],
        frameRates: [24],
        counts: [1],
        generateAudio: local.generateAudio,
        watermark: local.watermark,
        draft: local.draft,
        maxImages: local.maxImages,
        maxVideos: local.maxVideos,
        maxAudios: local.maxAudios,
    };
}
