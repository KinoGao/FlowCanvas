import { CanvasNodeType, type CanvasNodeMetadata } from "../types";

export function createDefaultCanvasNodeMetadata(type: CanvasNodeType): CanvasNodeMetadata {
    const base: CanvasNodeMetadata = { content: "", status: "idle" };

    if (type === CanvasNodeType.Text) return { ...base, fontSize: 14 };
    if (type === CanvasNodeType.Config) return { ...base, generationMode: "image" };

    return base;
}

export function createGenerationMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        generationMode: metadata.generationMode,
        generationType: metadata.generationType,
        model: metadata.model,
        size: metadata.size,
        quality: metadata.quality,
        count: metadata.count,
        seconds: metadata.seconds,
        vquality: metadata.vquality,
        generateAudio: metadata.generateAudio,
        watermark: metadata.watermark,
        audioVoice: metadata.audioVoice,
        audioFormat: metadata.audioFormat,
        audioSpeed: metadata.audioSpeed,
        audioInstructions: metadata.audioInstructions,
        comfyWorkflowId: metadata.comfyWorkflowId,
        comfyFieldValues: metadata.comfyFieldValues,
        references: metadata.references,
    };
}

export function createMediaMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        content: metadata.content,
        naturalWidth: metadata.naturalWidth,
        naturalHeight: metadata.naturalHeight,
        storageKey: metadata.storageKey,
        mimeType: metadata.mimeType,
        bytes: metadata.bytes,
        durationMs: metadata.durationMs,
    };
}

export function createDirectorMetadataPatch(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        canvasTool: metadata.canvasTool,
        directorScene: metadata.directorScene,
        directorStyle: metadata.directorStyle,
        directorCast: metadata.directorCast,
        directorProps: metadata.directorProps,
        directorSceneSettings: metadata.directorSceneSettings,
        directorCharacters: metadata.directorCharacters,
        directorPropItems: metadata.directorPropItems,
        directorShots: metadata.directorShots,
        directorCaptures: metadata.directorCaptures,
        directorOutputIds: metadata.directorOutputIds,
    };
}
