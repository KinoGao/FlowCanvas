import { apiUrl } from '@/constant/env';

export type VideoGenerationMode = 'text-to-video' | 'all-in-one-reference' | 'image-to-video' | 'first-last-frame' | 'image-reference';

export type VideoModelCapability = {
    id: string;
    provider: 'agnes' | 'seedance' | 'openai' | string;
    requestAdapter: 'agnes-v2' | 'seedance-v1' | 'seedance-v1.5' | 'seedance-v2' | 'openai' | string;
    modelPatterns: string[];
    modes: VideoGenerationMode[];
    ratios: string[];
    resolutions: string[];
    durations: number[];
    counts: number[];
    generateAudio: boolean;
    watermark: boolean;
    draft: boolean;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
};

type ApiResponse<T> = { code: number; data: T; msg?: string };

let cachedVideoCapabilities: VideoModelCapability[] | null = null;
let loadingVideoCapabilities: Promise<VideoModelCapability[]> | null = null;

export function invalidateVideoModelCapabilities() {
    cachedVideoCapabilities = null;
    loadingVideoCapabilities = null;
}

export async function fetchVideoModelCapabilities() {
    if (cachedVideoCapabilities) return cachedVideoCapabilities;
    if (loadingVideoCapabilities) return loadingVideoCapabilities;
    loadingVideoCapabilities = fetch(apiUrl('/api/model-capabilities/video'))
        .then(async (response) => {
            if (!response.ok) throw new Error(`读取视频模型能力失败：${response.status}`);
            const body = (await response.json()) as ApiResponse<VideoModelCapability[]>;
            if (body.code !== 0) throw new Error(body.msg || '读取视频模型能力失败');
            cachedVideoCapabilities = Array.isArray(body.data) ? body.data : [];
            return cachedVideoCapabilities;
        })
        .finally(() => {
            loadingVideoCapabilities = null;
        });
    return loadingVideoCapabilities;
}

export function resolveVideoModelCapability(capabilities: VideoModelCapability[] | undefined, model: string) {
    const normalizedModel = model.trim().toLowerCase();
    if (!normalizedModel) return null;
    return capabilities?.find((capability) => capability.modelPatterns.some((pattern) => wildcardMatches(pattern, normalizedModel))) || null;
}

export async function resolveVideoModelCapabilityForRequest(model: string) {
    try {
        return resolveVideoModelCapability(await fetchVideoModelCapabilities(), model);
    } catch {
        return null;
    }
}

function wildcardMatches(pattern: string, value: string) {
    const escaped = pattern
        .trim()
        .toLowerCase()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(value);
}
