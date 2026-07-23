import type {
    ImageCapabilities,
    AudioCapabilities,
    ModelCategory,
    PlatformComfyUi,
    PlatformConfigDocument,
    PlatformModel,
    PlatformProvider,
    TextCapabilities,
    VideoCapabilities,
} from "@/services/api/platform-admin";

export const IMAGE_RATIOS = ["1:1", "3:4", "4:5", "1:2", "4:3", "21:9", "2:1", "3:2", "9:21", "9:16", "2:3", "16:9", "5:4"];

export const emptyComfyUi: PlatformComfyUi = {
    enabled: true,
    baseUrl: "http://127.0.0.1:8188",
    clientId: "flow-canvas",
    defaultWorkflowId: "",
    timeoutSeconds: 300,
    pollIntervalMs: 1200,
};

export function normalizePlatformConfig(config: PlatformConfigDocument): PlatformConfigDocument {
    return {
        providers: Array.isArray(config.providers) ? config.providers : [],
        models: Array.isArray(config.models) ? config.models.map(normalizeModel) : [],
        comfyui: { ...emptyComfyUi, ...(config.comfyui || {}) },
    };
}

export function emptyProvider(): PlatformProvider {
    return { id: "", name: "", baseUrl: "", apiKey: "", apiFormat: "openai", modelsPath: "/models", enabled: true };
}

export function defaultTextCapabilities(): TextCapabilities {
    return { modes: ["text"] };
}

export function defaultImageCapabilities(): ImageCapabilities {
    return {
        modes: ["text-to-image"],
        qualities: ["standard"],
        resolutions: ["1k"],
        ratios: ["1:1", "16:9", "9:16"],
        counts: [1],
        maxImages: 0,
        maxOutputs: 1,
        maxTotalImages: 0,
        sequentialImageGeneration: false,
        interactiveEdit: false,
        watermark: false,
        documentationUrl: "",
        officialTemplate: "",
    };
}

export function defaultVideoCapabilities(): VideoCapabilities {
    return {
        modes: ["text-to-video"],
        ratios: ["16:9", "9:16"],
        resolutions: ["720p", "1080p"],
        durations: [5],
        frameRates: [],
        counts: [1],
        generateAudio: false,
        watermark: false,
        draft: false,
        maxImages: 0,
        maxVideos: 0,
        maxAudios: 0,
    };
}

export function defaultAudioCapabilities(): AudioCapabilities {
    return { modes: ["text-to-speech"], voices: ["alloy"], formats: ["mp3"], speeds: [1], instructions: true };
}

export function emptyModel(providerId: string, category: ModelCategory = "image", requestModel = ""): PlatformModel {
    return applyModelCategory({
        id: stableModelId([providerId, requestModel].filter(Boolean).join("-")),
        providerId,
        displayName: requestModel,
        requestModel,
        category,
        requestAdapter: "openai",
        enabled: true,
        published: false,
        modelPatterns: requestModel ? [requestModel] : [],
        verificationStatus: "unverified",
        verifiedAt: "",
        verificationMessage: "",
        textCapabilities: null,
        imageCapabilities: null,
        videoCapabilities: null,
        audioCapabilities: null,
    }, category);
}

export function applyModelCategory(model: PlatformModel, category: ModelCategory): PlatformModel {
    return {
        ...model,
        category,
        textCapabilities: category === "text" ? cloneText(model.textCapabilities || defaultTextCapabilities()) : null,
        imageCapabilities: category === "image" ? cloneImage(model.imageCapabilities || defaultImageCapabilities()) : null,
        videoCapabilities: category === "video" ? cloneVideo(model.videoCapabilities || defaultVideoCapabilities()) : null,
        audioCapabilities: category === "audio" ? cloneAudio(model.audioCapabilities || defaultAudioCapabilities()) : null,
    };
}

export function cloneModel(model: PlatformModel): PlatformModel {
    return {
        ...model,
        modelPatterns: [...(model.modelPatterns || [])],
        textCapabilities: model.textCapabilities ? cloneText(model.textCapabilities) : null,
        imageCapabilities: model.imageCapabilities ? cloneImage(model.imageCapabilities) : null,
        videoCapabilities: model.videoCapabilities ? cloneVideo(model.videoCapabilities) : null,
        audioCapabilities: model.audioCapabilities ? cloneAudio(model.audioCapabilities) : null,
    };
}

export function normalizeModel(model: PlatformModel): PlatformModel {
    const category: ModelCategory = ["text", "image", "video", "audio"].includes(model.category) ? model.category : "image";
    const normalized = applyModelCategory(cloneModel(model), category);
    const verificationStatus = ["unverified", "verified", "failed"].includes(normalized.verificationStatus) ? normalized.verificationStatus : "unverified";
    return {
        ...normalized,
        id: stableModelId(normalized.id),
        providerId: normalized.providerId.trim().toLowerCase(),
        displayName: normalized.displayName.trim(),
        requestModel: normalized.requestModel.trim(),
        requestAdapter: normalized.requestAdapter.trim() || "openai",
        published: Boolean(normalized.published) && verificationStatus === "verified",
        modelPatterns: cleanStrings(normalized.modelPatterns),
        verificationStatus,
        verifiedAt: normalized.verifiedAt || "",
        verificationMessage: normalized.verificationMessage || "",
        textCapabilities: normalized.textCapabilities ? { modes: cleanStrings(normalized.textCapabilities.modes) as TextCapabilities["modes"] } : null,
        imageCapabilities: normalized.imageCapabilities ? {
            ...normalized.imageCapabilities,
            modes: cleanStrings(normalized.imageCapabilities.modes) as ImageCapabilities["modes"],
            qualities: cleanStrings(normalized.imageCapabilities.qualities) as ImageCapabilities["qualities"],
            resolutions: cleanStrings(normalized.imageCapabilities.resolutions.map((value) => value.toLowerCase())) as ImageCapabilities["resolutions"],
            ratios: cleanStrings(normalized.imageCapabilities.ratios),
            counts: cleanNumbers(normalized.imageCapabilities.counts),
            maxImages: Math.max(0, normalized.imageCapabilities.maxImages || 0),
            maxOutputs: Math.max(0, normalized.imageCapabilities.maxOutputs || 0),
            maxTotalImages: Math.max(0, normalized.imageCapabilities.maxTotalImages || 0),
            interactiveEdit: Boolean(normalized.imageCapabilities.interactiveEdit),
            documentationUrl: normalized.imageCapabilities.documentationUrl.trim(),
            officialTemplate: normalized.imageCapabilities.officialTemplate.trim(),
        } : null,
        videoCapabilities: normalized.videoCapabilities ? {
            ...normalized.videoCapabilities,
            modes: cleanStrings(normalized.videoCapabilities.modes) as VideoCapabilities["modes"],
            ratios: cleanStrings(normalized.videoCapabilities.ratios),
            resolutions: cleanStrings(normalized.videoCapabilities.resolutions),
            durations: cleanNumbers(normalized.videoCapabilities.durations),
            frameRates: cleanNumbers(normalized.videoCapabilities.frameRates || []),
            counts: cleanNumbers(normalized.videoCapabilities.counts),
            maxImages: Math.max(0, normalized.videoCapabilities.maxImages || 0),
            maxVideos: Math.max(0, normalized.videoCapabilities.maxVideos || 0),
            maxAudios: Math.max(0, normalized.videoCapabilities.maxAudios || 0),
        } : null,
        audioCapabilities: normalized.audioCapabilities ? {
            ...normalized.audioCapabilities,
            modes: normalized.audioCapabilities.modes.includes("text-to-speech") ? ["text-to-speech"] : [],
            voices: cleanStrings(normalized.audioCapabilities.voices),
            formats: cleanStrings(normalized.audioCapabilities.formats.map((value) => value.toLowerCase())),
            speeds: cleanDecimals(normalized.audioCapabilities.speeds),
        } : null,
    };
}

export function replaceById<T extends { id: string }>(items: T[], originalId: string, item: T) {
    const index = items.findIndex((next) => next.id === originalId);
    if (index < 0) return [...items, item];
    const next = [...items];
    next[index] = item;
    return next;
}

export function numberOr(value: string | number | null | undefined, fallback: number) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

function stableModelId(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function cloneText(value: TextCapabilities): TextCapabilities {
    return { modes: [...value.modes] };
}

function cloneImage(value: ImageCapabilities): ImageCapabilities {
    return { ...value, modes: [...value.modes], qualities: [...value.qualities], resolutions: [...value.resolutions], ratios: [...value.ratios], counts: [...value.counts] };
}

function cloneVideo(value: VideoCapabilities): VideoCapabilities {
    return { ...value, modes: [...value.modes], ratios: [...value.ratios], resolutions: [...value.resolutions], durations: [...value.durations], frameRates: [...(value.frameRates || [])], counts: [...value.counts] };
}

function cloneAudio(value: AudioCapabilities): AudioCapabilities {
    return { ...value, modes: [...value.modes], voices: [...value.voices], formats: [...value.formats], speeds: [...value.speeds] };
}

function cleanStrings(values: readonly string[]) {
    return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];
}

function cleanNumbers(values: readonly number[]) {
    return [...new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

function cleanDecimals(values: readonly number[]) {
    return [...new Set((values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 4))].sort((a, b) => a - b);
}
