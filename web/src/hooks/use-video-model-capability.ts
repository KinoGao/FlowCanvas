import { useQuery } from '@tanstack/react-query';

import {
    isSeedanceNewModel,
    isSeedanceVideoModel,
    seedanceCapabilitiesForModel,
    seedanceDurationOptions,
    seedanceRatioOptions,
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
    const modes: VideoGenerationMode[] = [];
    if (local.textToVideo) modes.push('text-to-video');
    if (local.imageToVideoFirst) modes.push('image-to-video');
    if (local.imageToVideoFirstLast) modes.push('first-last-frame');
    const maxImages = local.imageToVideoFirstLast ? 2 : local.imageToVideoFirst ? 1 : 0;
    return {
        id: `seedance-fallback:${model}`,
        provider: 'seedance',
        requestAdapter: isSeedanceNewModel(model) ? 'seedance-v1.5' : 'seedance-v1',
        modelPatterns: [model],
        modes,
        ratios: seedanceRatioOptions.map((item) => item.value),
        resolutions: [...local.resolutions],
        durations: [...seedanceDurationOptions],
        frameRates: [24],
        counts: [1],
        generateAudio: local.generateAudio,
        watermark: false,
        draft: false,
        maxImages,
        maxVideos: 0,
        maxAudios: 0,
    };
}
