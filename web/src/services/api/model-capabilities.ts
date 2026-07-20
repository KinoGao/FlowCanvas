import { apiUrl } from '@/constant/env';
import { queryClient } from '@/lib/query-client';

export type ImageGenerationMode = 'text-to-image' | 'image-to-image' | 'image-edit';
export type VideoGenerationMode = 'text-to-video' | 'all-in-one-reference' | 'image-to-video' | 'first-last-frame' | 'image-reference' | 'multi-frame';

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

export const IMAGE_MODEL_CAPABILITIES_QUERY_KEY = ['image-model-capabilities'] as const;
export const VIDEO_MODEL_CAPABILITIES_QUERY_KEY = ['video-model-capabilities'] as const;

export function invalidateImageModelCapabilities() {
    void queryClient.invalidateQueries({ queryKey: IMAGE_MODEL_CAPABILITIES_QUERY_KEY });
}

export function invalidateVideoModelCapabilities() {
    void queryClient.invalidateQueries({ queryKey: VIDEO_MODEL_CAPABILITIES_QUERY_KEY });
}

export async function fetchImageModelCapabilities() {
    return fetchCapabilities<ImageModelCapability>('/api/model-capabilities/image', '图片');
}

export async function fetchVideoModelCapabilities() {
    return fetchCapabilities<VideoModelCapability>('/api/model-capabilities/video', '视频');
}

export function resolveImageModelCapability(capabilities: ImageModelCapability[] | undefined, model: string) {
    return resolveModelCapability(capabilities, model);
}

export function resolveVideoModelCapability(capabilities: VideoModelCapability[] | undefined, model: string) {
    return resolveModelCapability(capabilities, model);
}

export async function resolveImageModelCapabilityForRequest(model: string) {
    const capabilities = await queryClient.fetchQuery({
        queryKey: IMAGE_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchImageModelCapabilities,
        staleTime: 5 * 60_000,
    });
    return resolveImageModelCapability(capabilities, model);
}

export async function resolveVideoModelCapabilityForRequest(model: string) {
    const capabilities = await queryClient.fetchQuery({
        queryKey: VIDEO_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchVideoModelCapabilities,
        staleTime: 5 * 60_000,
    });
    return resolveVideoModelCapability(capabilities, model);
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
