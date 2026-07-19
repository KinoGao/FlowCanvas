import { apiUrl } from '@/constant/env';

export type ImageGenerationMode = 'text-to-image' | 'image-to-image' | 'image-edit';
export type VideoGenerationMode = 'text-to-video' | 'all-in-one-reference' | 'image-to-video' | 'first-last-frame' | 'image-reference';

export type ImageModelCapability = {
    id: string;
    provider: string;
    requestAdapter: string;
    modelPatterns: string[];
    modes: ImageGenerationMode[];
    qualities: Array<'low' | 'standard' | 'high' | string>;
    resolutions: string[];
    ratios: string[];
    counts: number[];
    maxImages: number;
    maxOutputs: number;
    maxTotalImages: number;
    sequentialImageGeneration: boolean;
    watermark: boolean;
    documentationUrl: string;
    officialTemplate: string;
};

export type VideoModelCapability = {
    id: string;
    provider: 'agnes' | 'seedance' | 'openai' | string;
    requestAdapter: 'agnes-v2' | 'seedance-v1' | 'seedance-v1.5' | 'seedance-v2' | 'openai' | string;
    modelPatterns: string[];
    modes: VideoGenerationMode[];
    ratios: string[];
    resolutions: string[];
    durations: number[];
    frameRates: number[];
    counts: number[];
    generateAudio: boolean;
    watermark: boolean;
    draft: boolean;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
};

type ApiResponse<T> = { code: number; data: T; msg?: string };

let cachedImageCapabilities: ImageModelCapability[] | null = null;
let loadingImageCapabilities: Promise<ImageModelCapability[]> | null = null;
let cachedVideoCapabilities: VideoModelCapability[] | null = null;
let loadingVideoCapabilities: Promise<VideoModelCapability[]> | null = null;

export function invalidateImageModelCapabilities() {
    cachedImageCapabilities = null;
    loadingImageCapabilities = null;
}

export function invalidateVideoModelCapabilities() {
    cachedVideoCapabilities = null;
    loadingVideoCapabilities = null;
}

export async function fetchImageModelCapabilities() {
    if (cachedImageCapabilities) return cachedImageCapabilities;
    if (loadingImageCapabilities) return loadingImageCapabilities;
    loadingImageCapabilities = fetchCapabilities<ImageModelCapability>('/api/model-capabilities/image', '图片').then((capabilities) => {
        cachedImageCapabilities = capabilities;
        return capabilities;
    }).finally(() => {
        loadingImageCapabilities = null;
    });
    return loadingImageCapabilities;
}

export async function fetchVideoModelCapabilities() {
    if (cachedVideoCapabilities) return cachedVideoCapabilities;
    if (loadingVideoCapabilities) return loadingVideoCapabilities;
    loadingVideoCapabilities = fetchCapabilities<VideoModelCapability>('/api/model-capabilities/video', '视频').then((capabilities) => {
        cachedVideoCapabilities = capabilities;
        return capabilities;
    }).finally(() => {
        loadingVideoCapabilities = null;
    });
    return loadingVideoCapabilities;
}

export function resolveImageModelCapability(capabilities: ImageModelCapability[] | undefined, model: string) {
    return resolveModelCapability(capabilities, model);
}

export function resolveVideoModelCapability(capabilities: VideoModelCapability[] | undefined, model: string) {
    return resolveModelCapability(capabilities, model);
}

export async function resolveImageModelCapabilityForRequest(model: string) {
    try {
        return resolveImageModelCapability(await fetchImageModelCapabilities(), model);
    } catch {
        return null;
    }
}

export async function resolveVideoModelCapabilityForRequest(model: string) {
    try {
        return resolveVideoModelCapability(await fetchVideoModelCapabilities(), model);
    } catch {
        return null;
    }
}

async function fetchCapabilities<T>(endpoint: string, label: string) {
    const response = await fetch(apiUrl(endpoint));
    if (!response.ok) throw new Error(`读取${label}模型能力失败：${response.status}`);
    const body = (await response.json()) as ApiResponse<T[]>;
    if (body.code !== 0) throw new Error(body.msg || `读取${label}模型能力失败`);
    return Array.isArray(body.data) ? body.data : [];
}

function resolveModelCapability<T extends { modelPatterns: string[] }>(capabilities: T[] | undefined, model: string) {
    const normalizedModel = model.trim().toLowerCase();
    if (!normalizedModel) return null;
    return capabilities?.find((capability) => capability.modelPatterns.some((pattern) => wildcardMatches(pattern, normalizedModel))) || null;
}

function wildcardMatches(pattern: string, value: string) {
    const escaped = pattern
        .trim()
        .toLowerCase()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(value);
}
