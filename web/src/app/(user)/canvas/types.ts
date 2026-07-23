import type { VideoGenerationMode } from "@/services/api/model-capabilities";
import type { DirectorProject } from "./director/storyai/editor/schema/directorProject";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    ComfyUI = "comfyui",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio" | "comfyui";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasNodeActionIntent =
    | "text-to-video"
    | "text-to-audio"
    | "image-to-panorama"
    | "script-edit"
    | "script-to-storyboard"
    | "script-to-video"
    | "script-to-audio";
export type CanvasBaseMetadata = {
    typeSequence?: number;
    content?: string;
    composerContent?: string;
    canvasTool?: "script" | "videoComposition" | "director" | "panorama360";
    prompt?: string;
    requestPrompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
};

export type CanvasScriptMetadata = {
    scriptTitle?: string;
    scriptLogline?: string;
    scriptBody?: string;
    scriptBeats?: Array<{ id: string; title: string; content: string; prompt: string }>;
    scriptOutputIds?: string[];
};

export type CanvasDirectorMetadata = {
    directorProject?: DirectorProject;
    directorOutputIds?: string[];
};

export type CanvasGenerationMetadata = {
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    resolution?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    draft?: string;
    videoGenerationMode?: VideoGenerationMode;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    comfyWorkflowId?: string;
    comfyFieldValues?: Record<string, unknown>;
    references?: string[];
};

export type CanvasBatchMetadata = {
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
};

export type CanvasGroupMetadata = {
    groupChildIds?: string[];
    groupVariant?: "normal" | "storyboard";
};

export type CanvasMediaMetadata = {
    naturalWidth?: number;
    naturalHeight?: number;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
};

export type CanvasNodeMetadata = CanvasBaseMetadata & CanvasScriptMetadata & CanvasDirectorMetadata & CanvasGenerationMetadata & CanvasBatchMetadata & CanvasGroupMetadata & CanvasMediaMetadata;

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    referenceOrder?: number;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      }
    | {
          type: "canvas";
          x: number;
          y: number;
          canvasPosition: Position;
      };
