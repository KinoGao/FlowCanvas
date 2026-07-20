import { normalizeResolutionToken, normalizeSeedanceRatio } from "@/lib/seedance-video";
import type { VideoGenerationMode, VideoModelCapability } from "@/services/api/model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";

import type { CanvasNodeMetadata } from "../types";

export type ActiveVideoReferenceCounts = { image: number; video: number; audio: number };

export const VIDEO_GENERATION_MODE_LABELS: Record<VideoGenerationMode, string> = {
    "text-to-video": "文生视频",
    "all-in-one-reference": "全能参考",
    "image-to-video": "图生视频",
    "first-last-frame": "首尾帧",
    "image-reference": "图片参考",
    "multi-frame": "智能多帧",
};

export function validateVideoReferenceCounts(mode: VideoGenerationMode, capability: VideoModelCapability, counts: ActiveVideoReferenceCounts) {
    const mediaCount = counts.image + counts.video + counts.audio;
    if (mode === "text-to-video") return mediaCount > 0 ? "文生视频不能携带图片、视频或音频参考素材" : "";
    if (mode !== "all-in-one-reference" && (counts.video > 0 || counts.audio > 0)) return `${VIDEO_GENERATION_MODE_LABELS[mode]}仅支持图片参考素材`;
    if (mode === "image-to-video" && counts.image !== 1) return "图生视频需要且仅支持 1 张参考图片";
    if (mode === "first-last-frame" && counts.image !== 2) return "首尾帧视频需要按顺序连接首帧和尾帧两张图片";
    if (mode === "image-reference" && counts.image < 1) return "图片参考模式至少需要连接 1 张参考图片";
    if (mode === "multi-frame" && counts.image < 3) return "智能多帧至少需要按顺序连接 3 张参考图片";
    if ((mode === "image-reference" || mode === "multi-frame" || mode === "all-in-one-reference") && counts.image > capability.maxImages) {
        return `当前模型最多支持 ${capability.maxImages} 个参考图片`;
    }
    if (mode === "all-in-one-reference" && counts.video > capability.maxVideos) return `当前模型最多支持 ${capability.maxVideos} 个参考视频`;
    if (mode === "all-in-one-reference" && counts.audio > capability.maxAudios) return `当前模型最多支持 ${capability.maxAudios} 个参考音频`;
    if (mode === "all-in-one-reference" && mediaCount === 0) return "全能参考模式至少需要连接一项图片、视频或音频素材";
    if (mode === "all-in-one-reference" && counts.audio > 0 && counts.image + counts.video === 0) return "参考音频不能单独使用，请同时连接参考图片或视频";
    return "";
}

export function supportedVideoMode(value: VideoGenerationMode | undefined, modes: VideoGenerationMode[] | undefined): VideoGenerationMode | undefined {
    if (!modes?.length) return undefined;
    return value && modes.includes(value) ? value : modes[0];
}

export function videoCapabilitySignature(capability: VideoModelCapability | null | undefined) {
    if (!capability) return "";
    return [
        capability.id,
        capability.modelPatterns.join(","),
        capability.modes.join(","),
        capability.ratios.join(","),
        capability.resolutions.join(","),
        capability.durations.join(","),
        capability.counts.join(","),
        capability.generateAudio ? "1" : "0",
        capability.watermark ? "1" : "0",
        capability.draft ? "1" : "0",
    ].join("\u001f");
}

export function normalizeVideoConfig(currentMode: VideoGenerationMode | undefined, config: AiConfig, capability: VideoModelCapability): Partial<CanvasNodeMetadata> {
    const patch: Partial<CanvasNodeMetadata> = {};
    if (!currentMode || !capability.modes.includes(currentMode)) patch.videoGenerationMode = capability.modes[0];

    const ratio = normalizeSeedanceRatio(config.size);
    if (capability.ratios.length && !capability.ratios.includes(ratio)) patch.size = capability.ratios[0];

    const resolutions = capability.resolutions.map(normalizeResolutionToken);
    const draft = capability.draft && config.videoDraft === "true";
    const resolution = normalizeResolutionToken(config.vquality);
    const forcedDraftResolution = draft && resolutions.includes("480p") ? "480p" : undefined;
    if (forcedDraftResolution && resolution !== forcedDraftResolution) patch.vquality = forcedDraftResolution;
    else if (resolutions.length && !resolutions.includes(resolution)) patch.vquality = resolutions[0];

    const seconds = Number(config.videoSeconds);
    if (capability.durations.length && !capability.durations.includes(seconds)) patch.seconds = String(capability.durations[0]);

    const count = Number(config.count);
    if (capability.counts.length && !capability.counts.includes(count)) patch.count = capability.counts[0];

    if (!capability.generateAudio && config.videoGenerateAudio !== "false") patch.generateAudio = "false";
    if (!capability.watermark && config.videoWatermark !== "false") patch.watermark = "false";
    if (!capability.draft && config.videoDraft !== "false") patch.draft = "false";
    return patch;
}
