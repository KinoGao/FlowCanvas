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

export type CanvasAlignmentGuides = {
    vertical?: number;
    horizontal?: number;
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
export type CanvasGenerationRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type CanvasGenerationRun = {
    id: string;
    status: CanvasGenerationRunStatus;
    startedAt: number;
    updatedAt: number;
    prompt?: string;
    model?: string;
    mode?: CanvasGenerationMode;
    errorDetails?: string;
};
export type CanvasNodeActionIntent =
    | "text-to-video"
    | "text-to-audio"
    | "image-to-panorama"
    | "script-edit"
    | "script-to-storyboard"
    | "script-to-video"
    | "script-to-audio"
    | "composition-timeline";
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
    /** 文本节点选中态工具栏使用的轻量富文本样式。正文仍保持纯文本，便于跨节点引用。 */
    textFormat?: {
        heading?: 1 | 2 | 3;
        quote?: boolean;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        list?: "unordered" | "ordered";
        link?: boolean;
    };
};

export type CanvasScriptBeat = {
    id: string;
    title: string;
    content: string;
    prompt: string;
    /** 镜头景别：远景/全景/中景/近景/特写 等，由脚本正文推断或手动指定 */
    shotType?: string;
    /** 分镜时长（秒），默认 3s */
    duration?: string;
    /** 本镜主要角色（引用资产名，可为空） */
    character?: string;
    /** 本镜场景（引用资产名，可为空） */
    scene?: string;
    /** 机位/运镜，如「中景跟拍」「特写推近」 */
    camera?: string;
    /** 本镜台词/对白，无则空 */
    dialogue?: string;
};

/** 脚本拆解出的可复用资产（角色/场景/道具），生成提示词时引用其描述 */
export type CanvasScriptAsset = {
    id: string;
    kind: "character" | "scene" | "prop";
    name: string;
    description: string;
};

export type CanvasScriptMetadata = {
    scriptTitle?: string;
    scriptLogline?: string;
    scriptBody?: string;
    scriptBeats?: CanvasScriptBeat[];
    scriptAssets?: CanvasScriptAsset[];
    scriptOutputIds?: string[];
    /** 分镜 id → 输出节点 id（脚本工作台生成状态回显） */
    scriptBeatOutputs?: Record<string, string>;
    /** 资产 id → 输出节点 id（资产生成状态回显） */
    scriptAssetOutputs?: Record<string, string>;
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
    videoStylePreset?: string;
    videoCameraPreset?: string;
    /** 视频主体库选中的主体 id（账号配置 videoSubjects） */
    videoSubjectId?: string;
    imageStylePreset?: string;
    imageCameraBody?: string;
    imageCameraLens?: string;
    imageCameraFocalLength?: string;
    imageCameraAperture?: string;
    videoTask?: { id: string; provider: "openai" | "agnes"; model: string };
    videoTaskStartedAt?: number;
    generationJobId?: string;
    generationRuns?: CanvasGenerationRun[];
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    comfyWorkflowId?: string;
    /** ComfyUI 工作流能力：反推提示词 / 文生图 / 参考图生图 / 图生视频 */
    comfyCapability?: "image-to-text" | "text-to-image" | "image-to-image" | "image-to-video";
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
    /** TapNow: 节点 Pin 颜色标记（右上角色点），值为 canvas-pin-utils 色板内 id。 */
    pinColor?: string;
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
    mediaUrl?: string;
    storageKey?: string;
    mimeType?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
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
