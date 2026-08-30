import { CanvasNodeType, type CanvasGenerationMode } from "./types";
import type { CanvasNodeMetadata } from "./types";
import { createDefaultCanvasNodeMetadata } from "./utils/canvas-node-metadata";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 500, height: 460, title: "New Generation" },
    [CanvasNodeType.Text]: { width: 384, height: 216, title: "Note" },
    [CanvasNodeType.Script]: { width: 384, height: 216, title: "脚本节点" },
    [CanvasNodeType.Clip]: { width: 220, height: 132, title: "智能剪辑" },
    [CanvasNodeType.Config]: { width: 420, height: 240, title: "生成配置" },
    [CanvasNodeType.ComfyUI]: { width: 384, height: 216, title: "ComfyUI" },
    [CanvasNodeType.Video]: { width: 384, height: 216, title: "Video" },
    [CanvasNodeType.Audio]: { width: 220, height: 96, title: "Audio" },
    [CanvasNodeType.Group]: { width: 360, height: 260, title: "分组" },
    [CanvasNodeType.Annotation]: { width: 320, height: 200, title: "注释" },
    [CanvasNodeType.Whiteboard]: { width: 640, height: 480, title: "白板" },
    [CanvasNodeType.WebPreview]: { width: 560, height: 380, title: "网页预览" },
    [CanvasNodeType.Collage]: { width: 480, height: 360, title: "拼图" },
    [CanvasNodeType.Debug]: { width: 280, height: 160, title: "调试" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export function getConfigNodeHeight(mode?: CanvasGenerationMode) {
    if (mode === "comfyui") return NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI].height;
    return mode === "video" ? 344 : NODE_DEFAULT_SIZE[CanvasNodeType.Config].height;
}

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Image),
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Text),
    },
    [CanvasNodeType.Script]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Script),
    },
    [CanvasNodeType.Clip]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Clip],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Clip),
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Config),
    },
    [CanvasNodeType.ComfyUI]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.ComfyUI),
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Video),
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Audio),
    },
    [CanvasNodeType.Group]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Group],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Group),
    },
    [CanvasNodeType.Annotation]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Annotation],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Annotation),
    },
    [CanvasNodeType.Whiteboard]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Whiteboard],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Whiteboard),
    },
    [CanvasNodeType.WebPreview]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.WebPreview],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.WebPreview),
    },
    [CanvasNodeType.Collage]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Collage],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Collage),
    },
    [CanvasNodeType.Debug]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Debug],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Debug),
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
