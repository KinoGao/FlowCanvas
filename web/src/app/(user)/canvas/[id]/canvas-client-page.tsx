"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { Connection, Edge, EdgeMouseHandler, EdgeTypes, NodeChange, NodeTypes, OnConnectEnd, OnConnectStart, OnNodeDrag, OnSelectionChangeFunc } from "@xyflow/react";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, Box, ChevronDown, FileText, FolderOpen, Home, ImageIcon, Images, Link2, List, Menu, Music2, Plus, Search, Settings2, Share2, Trash2, Upload, Video, X, Zap } from "lucide-react";
import * as THREE from "three";

const REACT_FLOW_NODE_TYPES: NodeTypes = { [CANVAS_NODE_TYPE]: ReactFlowCanvasNode };
const REACT_FLOW_EDGE_TYPES: EdgeTypes = reactFlowCanvasEdgeTypes;

import { saveAs } from "file-saver";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { requestVideoGeneration, storeGeneratedVideo } from "@/services/api/video";
import { runComfyWorkflow, uploadComfyFile } from "@/services/api/comfyui";
import { applyComfyWorkflowFields, getComfyWorkflow, type ComfyWorkflow, type ComfyWorkflowField } from "@/services/comfyui-workflows";
import { defaultConfig, type AiConfig, type ComfyUiConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { imageToDataUrl, resolveImageUrl, uploadImage, type UploadedImage } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { nanoid } from "nanoid";
import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal, message } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import type { CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { ReactFlowCanvas } from "../components/react-flow-canvas";
import { ReactFlowCanvasNode, type ReactFlowCanvasNodeType } from "../components/react-flow-canvas-node";
import { reactFlowCanvasEdgeTypes, type ReactFlowCanvasEdgeData } from "../components/react-flow-canvas-edge";
import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import type { InsertAssetPayload } from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { useCanvasStore } from "../stores/use-canvas-store";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { buildBatchVisibilityIndex, buildConnectionAdjacency, buildNodeById, normalizeConnectionWithNodeMap, setsEqual } from "../utils/canvas-derived-indexes";
import { CANVAS_EDGE_TYPE, CANVAS_NODE_TYPE, CANVAS_SOURCE_HANDLE, CANVAS_TARGET_HANDLE } from "../utils/react-flow-adapter";
import { buildSpatialIndex, querySpatialIndex, type CanvasSpatialRect } from "../utils/canvas-spatial-index";
import { buildCanvasResourceReferences, buildNodeMentionReferences, createCanvasResourceGraph } from "../utils/canvas-resource-references";
import { DirectorThreeStage } from "../director/director-three-stage";
import type { CanvasAgentMode } from "../components/canvas-agent-chat-ui";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasImageGenerationType,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
};

type CanvasGenerationRequest = {
    targetNodeId: string;
    originNodeId: string;
    runningNodeId: string;
    controller: AbortController;
};

function defaultGenerationMode(type?: CanvasNodeType): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const CANVAS_AGENT_PANEL_MOTION_MS = 500;
const CANVAS_OVERVIEW_SCALE = 0.24;

const CanvasConfigNodePanel = lazy(() => import("../components/canvas-config-node-panel").then((mod) => ({ default: mod.CanvasConfigNodePanel })));
const CanvasAssistantPanel = lazy(() => import("../components/canvas-assistant-panel").then((mod) => ({ default: mod.CanvasAssistantPanel })));
const CanvasNodeContextMenu = lazy(() => import("../components/canvas-context-menu").then((mod) => ({ default: mod.CanvasNodeContextMenu })));
const CanvasNodeAngleDialog = lazy(() => import("../components/canvas-node-angle-dialog").then((mod) => ({ default: mod.CanvasNodeAngleDialog })));
const CanvasNodeCropDialog = lazy(() => import("../components/canvas-node-crop-dialog").then((mod) => ({ default: mod.CanvasNodeCropDialog })));
const CanvasNodeMaskEditDialog = lazy(() => import("../components/canvas-node-mask-edit-dialog").then((mod) => ({ default: mod.CanvasNodeMaskEditDialog })));
const CanvasNodeSplitDialog = lazy(() => import("../components/canvas-node-split-dialog").then((mod) => ({ default: mod.CanvasNodeSplitDialog })));
const CanvasNodeUpscaleDialog = lazy(() => import("../components/canvas-node-upscale-dialog").then((mod) => ({ default: mod.CanvasNodeUpscaleDialog })));
const CanvasNodeHoverToolbar = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeHoverToolbar })));
const CanvasNodeInfoModal = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeInfoModal })));
const CanvasNodePromptPanel = lazy(() => import("../components/canvas-node-prompt-panel").then((mod) => ({ default: mod.CanvasNodePromptPanel })));
const AssetPickerModal = lazy(() => import("../components/asset-picker-modal").then((mod) => ({ default: mod.AssetPickerModal })));
const LazyCanvasFallback = <div className="pointer-events-none absolute inset-0" />;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const EMPTY_INPUT_SUMMARY = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0 };
const DEFAULT_DIRECTOR_SCENE_SETTINGS = {
    scale: 300,
    translate: { x: 0, y: 0, z: 0 },
    rotate: { x: 0, y: 0, z: 0 },
    skyColor: "#060608",
    panoramaRotation: 0,
    panoramaRadius: 60,
    characterLabels: true,
    gridSnap: false,
    groundVisible: true,
    groundOpacity: 0.4,
    groundHeight: 0,
};
type DirectorCharacterData = NonNullable<CanvasNodeMetadata["directorCharacters"]>[number];
type DirectorPoseData = NonNullable<DirectorCharacterData["pose"]>;

const DEFAULT_DIRECTOR_POSE = {
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    torsoTwist: 0,
    torsoLean: 0,
    torsoBend: 0,
    leftArm: 0,
    leftArmFwd: 0,
    leftElbow: 0,
    rightArm: 0,
    rightArmFwd: 0,
    rightElbow: 0,
    leftLeg: 0,
    leftHipSpread: 0,
    leftKnee: 0,
    rightLeg: 0,
    rightHipSpread: 0,
    rightKnee: 0,
};
// 20 个预设姿势（对标 LibTV 导演台）。角度符号基于 Xbot Mixamo 骨骼朝向推导，可能需可视化微调。
const DIRECTOR_POSE_PRESETS: Array<{ id: string; name: string; pose: Partial<DirectorPoseData> }> = [
    { id: "stand", name: "站立", pose: {} },
    { id: "tpose", name: "T型", pose: { leftArm: 90, rightArm: 90 } },
    { id: "walk", name: "行走", pose: { leftArm: 25, rightArm: -25, leftLeg: 20, rightLeg: -20, torsoTwist: 8 } },
    { id: "run", name: "跑步", pose: { leftArm: 45, rightArm: -45, leftLeg: 35, rightLeg: -35, torsoLean: 10, torsoTwist: 12 } },
    { id: "sit", name: "坐姿", pose: { leftLeg: 85, rightLeg: 85, leftKnee: 85, rightKnee: 85, torsoLean: -5 } },
    { id: "squat", name: "蹲下", pose: { leftLeg: 70, rightLeg: 70, leftKnee: 90, rightKnee: 90, torsoLean: 20 } },
    { id: "kneel1", name: "单膝跪", pose: { leftLeg: 80, leftKnee: 90, rightLeg: 30, rightKnee: 60, torsoLean: 10 } },
    { id: "kneel2", name: "双膝跪", pose: { leftLeg: 90, rightLeg: 90, leftKnee: 90, rightKnee: 90, torsoLean: 25 } },
    { id: "akimbo", name: "叉腰", pose: { leftArm: 35, rightArm: 35, leftElbow: -60, rightElbow: -60, leftArmFwd: 25, rightArmFwd: 25 } },
    { id: "lean", name: "倚靠", pose: { torsoLean: -10, torsoBend: 8, leftArm: 10, rightArm: -5, headPitch: -5 } },
    { id: "bow", name: "鞠躬", pose: { torsoLean: 35, headPitch: 10, leftArm: 5, rightArm: 5 } },
    { id: "think", name: "思考", pose: { headRoll: 15, headPitch: -10, leftArm: 25, leftElbow: -80, leftArmFwd: 35 } },
    { id: "fight", name: "格斗", pose: { leftArm: 50, rightArm: 40, leftElbow: -50, rightElbow: -50, leftArmFwd: 35, rightArmFwd: 35, torsoTwist: 15, leftLeg: 15, rightLeg: -10, torsoLean: 5 } },
    { id: "kick", name: "踢球", pose: { rightLeg: 60, leftLeg: -5, torsoLean: -10, leftArm: -20, rightArm: 30, torsoTwist: -10 } },
    { id: "throw", name: "投掷", pose: { rightArm: 80, rightElbow: -40, rightArmFwd: 45, torsoTwist: 20, leftArm: -15, leftLeg: 10, rightLeg: -15 } },
    { id: "push", name: "推进", pose: { leftArm: 40, rightArm: 40, leftArmFwd: 55, rightArmFwd: 55, leftElbow: -30, rightElbow: -30, torsoLean: 10, leftLeg: 10, rightLeg: -10 } },
    { id: "wave", name: "招手", pose: { rightArm: 70, rightElbow: -30, rightArmFwd: 25, headYaw: 10 } },
    { id: "reach", name: "伸手", pose: { rightArm: 60, rightArmFwd: 65, rightElbow: -10, torsoLean: 5 } },
    { id: "cross", name: "抱臂", pose: { leftArm: 40, rightArm: 40, leftElbow: -75, rightElbow: -75, leftArmFwd: 35, rightArmFwd: 35, torsoLean: -5 } },
    { id: "phone", name: "看手机", pose: { headPitch: 25, leftArm: 30, leftElbow: -85, leftArmFwd: 45, rightArm: 10, rightElbow: -20 } },
];

const DIRECTOR_CHARACTER_COLORS = ["#4f8ef7", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#f97316"];
const DIRECTOR_TYPE_LABELS: Record<NonNullable<DirectorCharacterData["type"]>, string> = { male: "男", female: "女", child: "儿童", tall: "高个", short: "矮个", heavy: "壮硕", slim: "苗条" };

const DEFAULT_DIRECTOR_CHARACTERS: DirectorCharacterData[] = [{ id: "char-a", name: "角色A", color: "#4f8ef7", type: "male", position: { x: 0, y: 0, z: 0 }, rotation: 0, scale: 1, pose: { ...DEFAULT_DIRECTOR_POSE }, visible: true, locked: false }];

function makeDirectorCharacter(index: number): DirectorCharacterData {
    return {
        id: `char-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        name: `角色${String.fromCharCode(65 + (index % 26))}`,
        color: DIRECTOR_CHARACTER_COLORS[index % DIRECTOR_CHARACTER_COLORS.length],
        type: "male",
        position: { x: (index - 1) * 1.8, y: 0, z: 0 },
        rotation: 0,
        scale: 1,
        pose: { ...DEFAULT_DIRECTOR_POSE },
        visible: true,
        locked: false,
    };
}
const DEFAULT_DIRECTOR_SHOTS = [
    {
        id: "camera-1",
        name: "机位1",
        camera: "35mm 标准镜头 / 平视横移",
        prompt: "捕捉角色A在场景中的站位、动作和空间关系",
        fov: 50,
        position: { x: 0, y: 2.2, z: 10 },
        target: { x: 0, y: 1.2, z: 0 },
        targetMode: "manual" as const,
        visible: true,
        locked: false,
    },
    {
        id: "camera-2",
        name: "机位2",
        camera: "50mm 标准镜头 / 正面构图",
        prompt: "记录角色A的主体画面，保持画面稳定清晰",
        fov: 45,
        position: { x: 3, y: 2.4, z: 8 },
        target: { x: 0, y: 1.2, z: 0 },
        targetMode: "manual" as const,
        visible: true,
        locked: false,
    },
];
const DEFAULT_SCRIPT_BODY = `第一幕：主角进入一个陌生空间，发现关键道具。
第二幕：角色做出选择，环境开始发生变化。
第三幕：情绪抵达高潮，画面停在最有记忆点的动作上。`;
const DEFAULT_PANORAMA_360_PROMPT = `生成一张真实可用于 Three.js 球形内壁贴图的 360 度室内全景图。
要求：2:1 equirectangular panorama，完整无缝环绕，左右边缘可无缝拼接，相机位于房间中心，超广角但不要鱼眼边框，水平视线，现代明亮室内空间，自然阳光，真实材质，高清细节。
禁止：普通单向照片、透视断裂、文字、水印、人物、黑边、局部裁切。`;
const MATERIAL_LIBRARY_PRESETS = {
    styles: [
        { title: "电影冷暖对比", prompt: "cinematic lighting, teal and warm contrast, realistic lens, rich shadows" },
        { title: "日系清透广告", prompt: "bright japanese commercial style, soft daylight, clean composition, airy colors" },
        { title: "暗黑科幻棚拍", prompt: "dark sci-fi studio, rim light, metal texture, controlled haze, dramatic mood" },
    ],
    effects: [
        { title: "快速推进镜头", prompt: "fast dolly in, dynamic motion, strong parallax, energetic camera movement" },
        { title: "产品环绕展示", prompt: "360 degree orbit shot, centered product, smooth turntable motion, premium lighting" },
        { title: "手持纪录片感", prompt: "subtle handheld camera, documentary realism, natural imperfection, intimate framing" },
    ],
};
const EMPTY_NODE_INPUTS: NodeGenerationInput[] = [];
const EMPTY_MENTION_REFERENCES: ReturnType<typeof buildNodeMentionReferences> = [];
const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

function createCanvasNode(type: CanvasNodeType, position: Position, metadata?: CanvasNodeMetadata): CanvasNodeData {
    const spec = getNodeSpec(type);
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
        },
        width: spec.width,
        height: spec.height,
        metadata: { ...spec.metadata, ...metadata },
    };
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return (
        <Suspense fallback={LazyCanvasFallback}>
            <ReactFlowCanvasPage />
        </Suspense>
    );
}

function CanvasRefreshShell() {
    return (
        <main className="relative h-full min-h-0 overflow-hidden bg-background text-foreground">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />

            <div className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="size-8 rounded-md bg-current opacity-10" />
                ))}
            </div>

            <div className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
                <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
                <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
                <div className="absolute inset-5 rounded border border-current opacity-15" />
            </div>

            <div className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ background: "var(--background)", borderColor: "var(--border)" }} aria-hidden="true">
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
                <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
                <div className="h-4 w-10 rounded bg-current opacity-10" />
                <div className="size-8 rounded-md bg-current opacity-10" />
            </div>
        </main>
    );
}

function ConnectionCreateMenu({
    pending,
    position,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    position: Position;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div
            className="nodrag nopan absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: position.x, top: position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    引用该节点生成
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭">
                    ×
                </button>
            </div>
            <div className="grid gap-1">
                <ConnectionCreateOption theme={theme} icon={<List className="size-5" />} title="文本生成" description="脚本、广告词、品牌文案" onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-5" />} title="图片生成" onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-5" />} title="视频生成" onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-5" />} title="音频参考" onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-5" />} title="配置节点" description="模型、尺寸、数量和输入顺序" onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition"
            style={{ color: theme.node.text }}
            onPointerDownCapture={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                onClick?.();
            }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.node.fill)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: theme.node.fill, color: theme.node.muted }}>
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-base font-semibold leading-5">{title}</span>
                {description ? (
                    <span className="mt-1 block truncate text-sm" style={{ color: theme.node.muted }}>
                        {description}
                    </span>
                ) : null}
            </span>
        </button>
    );
}

function ReactFlowCanvasPage() {
    const { message, modal } = App.useApp();
    const params = useParams<{ id: string }>();
    const navigate = useNavigate();
    const projectId = params.id ?? "";
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nodeDraggingRef = useRef(false);

    const config = useConfigStore((state) => state.config);
    const comfyui = useConfigStore((state) => state.comfyui);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const projectTitle = useCanvasStore((state) => {
        const p = state.projects.find((project) => project.id === projectId);
        return p?.title || "";
    });
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [canvasAssetPanelOpen, setCanvasAssetPanelOpen] = useState(false);
    const [canvasAssetPanelInitialTab, setCanvasAssetPanelInitialTab] = useState<"canvas" | "assets">("canvas");
    const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);
    const [materialLibraryOpen, setMaterialLibraryOpen] = useState(false);
    const [materialLibraryTab, setMaterialLibraryTab] = useState<"styles" | "effects" | "assets">("styles");
    const [directorStudioNodeId, setDirectorStudioNodeId] = useState<string | null>(null);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editRequestNonce, setEditRequestNonce] = useState(0);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [assistantCollapsed, setAssistantCollapsed] = useState(true);
    const [assistantMounted, setAssistantMounted] = useState(false);
    const [assistantClosing, setAssistantClosing] = useState(false);
    const [agentMode, setAgentMode] = useState<CanvasAgentMode>("online");
    const [agentUndoSnapshot, setAgentUndoSnapshot] = useState<CanvasAgentSnapshot | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const selectedConnectionIdRef = useRef(selectedConnectionId);
    const nodeByIdRef = useRef<Map<string, CanvasNodeData>>(new Map());
    const hiddenBatchChildIdsRef = useRef<Set<string>>(new Set());
    const viewportRef = useRef(viewport);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const agentCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
    const generationRequestsRef = useRef(new Map<string, CanvasGenerationRequest>());

    const createHistoryEntry = useCallback(
        (): CanvasHistoryEntry => ({
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            chatSessions,
            activeChatId,
            backgroundMode,
            showImageInfo,
        }),
        [activeChatId, backgroundMode, chatSessions, showImageInfo],
    );

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [cleanupAssetImages],
    );

    const startGenerationRequest = useCallback((targetNodeId: string, originNodeId: string, runningId = originNodeId, controller = new AbortController()) => {
        const previous = generationRequestsRef.current.get(targetNodeId);
        if (previous?.controller !== controller) previous?.controller.abort();
        generationRequestsRef.current.set(targetNodeId, { targetNodeId, originNodeId, runningNodeId: runningId, controller });
        return controller;
    }, []);

    const finishGenerationRequest = useCallback((targetNodeId: string, controller: AbortController) => {
        const request = generationRequestsRef.current.get(targetNodeId);
        if (request?.controller === controller) generationRequestsRef.current.delete(targetNodeId);
    }, []);

    const stopGenerationByRunningId = useCallback((runningId: string) => {
        const affectedNodeIds = new Set<string>();
        generationRequestsRef.current.forEach((request) => {
            if (request.runningNodeId !== runningId) return;
            request.controller.abort();
            generationRequestsRef.current.delete(request.targetNodeId);
            affectedNodeIds.add(request.targetNodeId);
            affectedNodeIds.add(request.originNodeId);
        });
        setRunningNodeId((current) => (current === runningId ? null : current));
        if (!affectedNodeIds.size) return;
        setNodes((prev) => prev.map((node) => (affectedNodeIds.has(node.id) && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
    }, []);

    const confirmStopGeneration = useCallback(
        (nodeId: string) => {
            modal.confirm({
                title: "停止生成？",
                content: "当前生成请求会被中断，已经生成完成的内容会保留。",
                okText: "停止",
                cancelText: "继续生成",
                okButtonProps: { danger: true },
                onOk: () => stopGenerationByRunningId(nodeId),
            });
        },
        [modal, stopGenerationByRunningId],
    );

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!generationRequestsRef.current.size) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        const restore = async () => {
            const currentGenerationNodeIds = new Set<string>();
            generationRequestsRef.current.forEach((request) => {
                currentGenerationNodeIds.add(request.targetNodeId);
                currentGenerationNodeIds.add(request.originNodeId);
            });
            const sourceNodes = currentGenerationNodeIds.size ? project.nodes : resetInterruptedGeneration(project.nodes);
            const restoredNodes = await hydrateCanvasImages(sourceNodes).then((items) => (currentGenerationNodeIds.size ? mergeActiveGenerationNodes(items, nodesRef.current, currentGenerationNodeIds) : items));
            const restoredSessions = await hydrateAssistantImages(project.chatSessions || []);
            setNodes(restoredNodes);
            setConnections(project.connections);
            setChatSessions(restoredSessions);
            setActiveChatId(project.activeChatId || null);
            setBackgroundMode(project.backgroundMode);
            setShowImageInfo(project.showImageInfo || false);
            setViewport(project.viewport);
            historyRef.current = { past: [], future: [] };
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
            lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: project.connections,
                chatSessions: restoredSessions,
                activeChatId: project.activeChatId || null,
                backgroundMode: project.backgroundMode,
                showImageInfo: project.showImageInfo || false,
            };
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, navigate, openProject, projectId]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current || historyPausedRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, projectLoaded, showImageInfo]);

    useEffect(
        () => () => {
            if (agentCloseTimerRef.current) clearTimeout(agentCloseTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        if (projectSaveTimerRef.current) clearTimeout(projectSaveTimerRef.current);
        projectSaveTimerRef.current = setTimeout(() => {
            projectSaveTimerRef.current = null;
            updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
        }, 300);
    }, [activeChatId, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        selectedConnectionIdRef.current = selectedConnectionId;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, selectedConnectionId, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport((current) => {
                    const next = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    return current.x === next.x && current.y === next.y && current.k === next.k ? current : next;
                });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const canvasToScreen = useCallback((position: Position) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        return {
            x: (rect?.left || 0) + position.x * currentViewport.k + currentViewport.x,
            y: (rect?.top || 0) + position.y * currentViewport.k + currentViewport.y,
        };
    }, []);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, 120);
    }, []);

    const nodeById = useMemo(() => buildNodeById(nodes), [nodes]);
    const batchVisibilityIndex = useMemo(() => buildBatchVisibilityIndex(nodes, nodeById, collapsingBatchIds), [collapsingBatchIds, nodeById, nodes]);
    const connectionAdjacency = useMemo(() => buildConnectionAdjacency(connections), [connections]);
    const visibleNodeItems = useMemo(() => nodes.filter((node) => !batchVisibilityIndex.hiddenBatchChildIds.has(node.id)), [batchVisibilityIndex, nodes]);
    const nodeSpatialIndex = useMemo(() => buildSpatialIndex(visibleNodeItems, nodeSpatialRect), [visibleNodeItems]);
    const canvasGraph = useMemo(() => createCanvasResourceGraph(nodes, connections, nodeById), [connections, nodeById, nodes]);

    useLayoutEffect(() => {
        nodeByIdRef.current = nodeById;
        hiddenBatchChildIdsRef.current = batchVisibilityIndex.hiddenBatchChildIds;
    }, [batchVisibilityIndex, nodeById]);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnectionWithNodeMap(current.nodeId, targetNodeId, nodeByIdRef.current, current.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId, toNodeId }]);
            }
            connectingParamsRef.current = null;
            setConnecting(null);
            setPendingConnectionCreate(null);
            setConnectionTargetNodeId(null);
            connectionTargetNodeIdRef.current = null;
            setContextMenu(null);
        },
        [message, setConnecting],
    );

    const handleReactFlowConnect = useCallback(
        (connection: Connection) => {
            if (!connection.source || !connection.target) return;
            const startedFrom = connectingParamsRef.current;
            if (startedFrom) {
                const targetNodeId = connection.source === startedFrom.nodeId ? connection.target : connection.source;
                connectNodes(startedFrom, targetNodeId);
                return;
            }
            const startsFromTargetHandle = connection.sourceHandle === CANVAS_TARGET_HANDLE;
            const startNodeId = startsFromTargetHandle ? connection.target : connection.source;
            const endNodeId = startsFromTargetHandle ? connection.source : connection.target;
            connectNodes({ nodeId: startNodeId, handleType: startsFromTargetHandle ? "target" : "source" }, endNodeId);
        },
        [connectNodes],
    );

    const handleReactFlowConnectStart = useCallback<OnConnectStart>(
        (_, params) => {
            if (!params.nodeId || (params.handleType !== "source" && params.handleType !== "target")) return;
            const nextConnection = { nodeId: params.nodeId, handleType: params.handleType };
            connectingParamsRef.current = nextConnection;
            setConnecting(nextConnection);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
            setPendingConnectionCreate(null);
        },
        [setConnecting],
    );

    const handleReactFlowConnectEnd = useCallback<OnConnectEnd>(
        (event, connectionState) => {
            const currentConnection = connectingParamsRef.current;
            if (!currentConnection) return;
            if (connectionState.isValid || connectionState.toNode) {
                connectingParamsRef.current = null;
                setConnecting(null);
                return;
            }
            if (!(event instanceof MouseEvent)) {
                connectingParamsRef.current = null;
                setConnecting(null);
                return;
            }
            const position = screenToCanvas(event.clientX, event.clientY);
            setMouseWorld(position);
            setPendingConnectionCreate({ connection: currentConnection, position });
            connectingParamsRef.current = null;
            setConnecting(null);
        },
        [screenToCanvas, setConnecting],
    );

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnectionWithNodeMap(pending.connection.nodeId, newNode.id, buildNodeById([...nodesRef.current, newNode]), pending.connection.handleType);
            if (!connection) {
                message.warning("配置节点之间不能连接");
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(newNode.id);
            setPendingConnectionCreate(null);
            connectingParamsRef.current = null;
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        connectingParamsRef.current = null;
        setConnecting(null);
    }, [setConnecting]);

    const visibleNodes = useMemo(() => {
        const padding = isNodeDragging ? 2000 : 280;
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const viewRect = viewportSpatialRect(viewport, width, height, padding);

        return querySpatialIndex(nodeSpatialIndex, viewRect).map((entry) => entry.item);
    }, [isNodeDragging, nodeSpatialIndex, size.height, size.width, viewport]);

    const toolbarNode = toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null;
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;
    const superResolveNode = superResolveNodeId ? nodeById.get(superResolveNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const { batchChildCountById, batchMotionById, configInputsById, configInputSummaryById } = useMemo(() => {
        const batchChildCountById = new Map<string, number>();
        const batchMotionById = new Map<string, { x: number; y: number; index: number }>();
        const configInputsById = new Map<string, NodeGenerationInput[]>();
        const configInputSummaryById = new Map<string, ReturnType<typeof getInputSummary>>();
        for (const node of nodes) {
            if (node.metadata?.isBatchRoot) batchChildCountById.set(node.id, node.metadata.batchChildIds?.length || 0);
            const rootId = node.metadata?.batchRootId;
            if (rootId) {
                const root = nodeById.get(rootId);
                const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
                const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
                const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
                batchMotionById.set(node.id, { x: stackX - node.position.x, y: stackY - node.position.y, index: Math.max(index, 0) });
            }
            if (node.type === CanvasNodeType.Config) {
                const inputs = buildNodeGenerationInputs(node.id, canvasGraph);
                configInputsById.set(node.id, inputs);
                configInputSummaryById.set(node.id, getInputSummary(inputs));
            }
        }
        return { batchChildCountById, batchMotionById, configInputsById, configInputSummaryById };
    }, [canvasGraph, nodeById, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const targetNodeIds = new Set<string>();
        visibleNodes.forEach((node) => {
            if (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Config) targetNodeIds.add(node.id);
        });
        [dialogNodeId, activeNodeId, editingNodeId, toolbarNodeId].forEach((nodeId) => {
            if (nodeId) targetNodeIds.add(nodeId);
        });

        const mentionReferencesByNodeId = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        targetNodeIds.forEach((nodeId) => {
            const node = nodeById.get(nodeId);
            if (node) mentionReferencesByNodeId.set(nodeId, buildNodeMentionReferences(node, canvasGraph));
        });
        return mentionReferencesByNodeId;
    }, [activeNodeId, canvasGraph, dialogNodeId, editingNodeId, nodeById, toolbarNodeId, visibleNodes]);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        nodeIds.add(activeNodeId);
        const relatedConnections = [...(connectionAdjacency.incomingByNodeId.get(activeNodeId) || []), ...(connectionAdjacency.outgoingByNodeId.get(activeNodeId) || [])];
        relatedConnections.forEach((connection) => {
            connectionIds.add(connection.id);
            nodeIds.add(connection.fromNodeId);
            nodeIds.add(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connectionAdjacency]);

    const isOverviewCanvas = viewport.k < CANVAS_OVERVIEW_SCALE;

    const resourceContextNodeId = dialogNodeId || activeNodeId;
    const canvasResourceReferences = useMemo(() => buildCanvasResourceReferences(canvasGraph, resourceContextNodeId), [canvasGraph, resourceContextNodeId]);
    const resourceReferenceByNodeId = useMemo(() => new Map(canvasResourceReferences.map((reference) => [reference.nodeId, reference])), [canvasResourceReferences]);
    const agentSnapshot = useMemo<CanvasAgentSnapshot>(
        () => ({ projectId, title: projectTitle || "未命名画布", nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport }),
        [connections, projectTitle, nodes, projectId, selectedNodeIds, viewport],
    );
    const applyAgentOps = useCallback(
        (ops?: CanvasAgentOp[]) => {
            const safeOps = Array.isArray(ops) ? ops.filter((op) => op?.type) : [];
            const before = { projectId, title: projectTitle || "未命名画布", nodes: nodesRef.current, connections: connectionsRef.current, selectedNodeIds: Array.from(selectedNodeIdsRef.current), viewport: viewportRef.current };
            const generationOps = safeOps.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation" && Boolean(op.nodeId));
            const next = applyCanvasAgentOps(
                before,
                safeOps.filter((op) => op.type !== "run_generation"),
            );
            nodesRef.current = next.nodes;
            connectionsRef.current = next.connections;
            selectedNodeIdsRef.current = new Set(next.selectedNodeIds);
            viewportRef.current = next.viewport;
            setAgentUndoSnapshot(before);
            setNodes(next.nodes);
            setConnections(next.connections);
            setSelectedNodeIds(new Set(next.selectedNodeIds));
            setSelectedConnectionId(null);
            setViewport(next.viewport);
            setContextMenu(null);
            if (generationOps.length) {
                queueMicrotask(() =>
                    generationOps.forEach((op) => {
                        const target = nodesRef.current.find((node) => node.id === op.nodeId);
                        const prompt = op.prompt?.trim() ? op.prompt : (target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                        void generateNodeRef.current?.(op.nodeId, op.mode || target?.metadata?.generationMode || defaultGenerationMode(target?.type), prompt);
                    }),
                );
            }
            return { ...next, projectId, title: projectTitle || "未命名画布" };
        },
        [projectTitle, projectId],
    );
    const undoAgentOps = useCallback(() => {
        if (!agentUndoSnapshot) return null;
        nodesRef.current = agentUndoSnapshot.nodes;
        connectionsRef.current = agentUndoSnapshot.connections;
        selectedNodeIdsRef.current = new Set(agentUndoSnapshot.selectedNodeIds);
        viewportRef.current = agentUndoSnapshot.viewport;
        setNodes(agentUndoSnapshot.nodes);
        setConnections(agentUndoSnapshot.connections);
        setSelectedNodeIds(new Set(agentUndoSnapshot.selectedNodeIds));
        setSelectedConnectionId(null);
        setViewport(agentUndoSnapshot.viewport);
        setContextMenu(null);
        setAgentUndoSnapshot(null);
        return { ...agentUndoSnapshot, projectId, title: projectTitle || "未命名画布" };
    }, [agentUndoSnapshot, projectTitle, projectId]);
    const createNode = useCallback(
        (
            type: CanvasNodeType,
            options: {
                position?: Position;
                title?: string;
                width?: number;
                height?: number;
                metadata?: CanvasNodeMetadata;
            } = {},
        ) => {
            const targetPosition = options.position || getCanvasCenter();
            const configMetadata =
                type === CanvasNodeType.Config
                    ? {
                          model: effectiveConfig.imageModel || effectiveConfig.model,
                          size: effectiveConfig.size,
                          count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                      }
                    : undefined;
            const newNode = {
                ...createCanvasNode(type, targetPosition, { ...configMetadata, ...options.metadata }),
                ...(options.title ? { title: options.title } : null),
                ...(options.width ? { width: options.width } : null),
                ...(options.height ? { height: options.height } : null),
            };

            setNodes((prev) => [...prev, newNode]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(newNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, getCanvasCenter],
    );

    const createScriptNode = useCallback(() => {
        createNode(CanvasNodeType.Text, {
            title: "脚本",
            width: 220,
            height: 160,
            metadata: {
                canvasTool: "script",
                content: DEFAULT_SCRIPT_BODY,
                scriptTitle: "未命名脚本",
                scriptLogline: "一句话描述故事目标、角色和转折",
                scriptBody: DEFAULT_SCRIPT_BODY,
                status: NODE_STATUS_SUCCESS,
                fontSize: 13,
                generationMode: "text",
            },
        });
    }, [createNode]);

    const createVideoCompositionNode = useCallback(() => {
        createNode(CanvasNodeType.Config, {
            title: "视频合成",
            width: 220,
            height: 132,
            metadata: { canvasTool: "videoComposition", generationMode: "video", status: NODE_STATUS_IDLE, count: 1 },
        });
    }, [createNode]);

    const createDirectorNode = useCallback(() => {
        createNode(CanvasNodeType.Config, {
            title: "导演台",
            width: 220,
            height: 160,
            metadata: {
                canvasTool: "director",
                generationMode: "image",
                status: NODE_STATUS_IDLE,
                count: DEFAULT_DIRECTOR_SHOTS.length,
                directorScene: "黑色摄影棚内，一位主角站在可移动布景中央，周围有可控灯光和关键道具。",
                directorStyle: "电影感，低调布光，真实镜头语言",
                directorCast: "主角、摄影助理",
                directorProps: "主光灯、反光板、桌面道具",
                directorSceneSettings: DEFAULT_DIRECTOR_SCENE_SETTINGS,
                directorCharacters: DEFAULT_DIRECTOR_CHARACTERS,
                directorShots: DEFAULT_DIRECTOR_SHOTS,
            },
        });
    }, [createNode]);

    const createPanorama360Node = useCallback(() => {
        createNode(CanvasNodeType.Image, {
            title: "360场景",
            width: 320,
            height: 180,
            metadata: {
                canvasTool: "panorama360",
                prompt: DEFAULT_PANORAMA_360_PROMPT,
                composerContent: DEFAULT_PANORAMA_360_PROMPT,
                generationMode: "image",
                status: NODE_STATUS_IDLE,
                count: 1,
                size: "2048x1024",
                freeResize: true,
            },
        });
    }, [createNode]);

    const deleteNodes = useCallback(
        (ids: Set<string>) => {
            if (!ids.size) return;
            const allIds = new Set(ids);
            nodesRef.current.forEach((node) => {
                if (ids.has(node.id)) node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
            });
            const nextNodes = nodesRef.current.filter((node) => !allIds.has(node.id));
            const remainingNodes = nextNodes.map((node) => {
                const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                if (!node.metadata?.isBatchRoot || childIds?.length === node.metadata.batchChildIds?.length) return node;
                const primaryImageId = childIds?.includes(node.metadata.primaryImageId || "") ? node.metadata.primaryImageId : childIds?.[0];
                const primaryNode = nextNodes.find((item) => item.id === primaryImageId);
                return {
                    ...node,
                    metadata: {
                        ...promoteImageMetadata(node.metadata, primaryNode?.metadata),
                        batchChildIds: childIds,
                        primaryImageId,
                    },
                };
            });
            nodesRef.current = remainingNodes;
            setNodes(remainingNodes);
            setConnections((prev) => prev.filter((conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId)));
            setSelectedNodeIds(new Set());
            setSelectedConnectionId(null);
            setHoveredNodeId((current) => (current && allIds.has(current) ? null : current));
            setToolbarNodeId((current) => (current && allIds.has(current) ? null : current));
            setDialogNodeId((current) => (current && allIds.has(current) ? null : current));
            setEditingNodeId((current) => (current && allIds.has(current) ? null : current));
            setInfoNodeId((current) => (current && allIds.has(current) ? null : current));
            setCropNodeId((current) => (current && allIds.has(current) ? null : current));
            setMaskEditNodeId((current) => (current && allIds.has(current) ? null : current));
            setAngleNodeId((current) => (current && allIds.has(current) ? null : current));
            setPreviewNodeId((current) => (current && allIds.has(current) ? null : current));
            setRunningNodeId((current) => (current && allIds.has(current) ? null : current));
            setContextMenu((current) => (current?.type === "node" && allIds.has(current.nodeId) ? null : current));
            cleanupCanvasFiles({ projectId, nodes: remainingNodes, chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, projectId],
    );

    const deleteConnection = useCallback((connectionId: string) => {
        setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
        setSelectedConnectionId((current) => (current === connectionId ? null : current));
        setContextMenu((current) => (current?.type === "connection" && current.connectionId === connectionId ? null : current));
    }, []);

    const selectConnection = useCallback((connectionId: string) => {
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
        setDialogNodeId(null);
    }, []);

    const openConnectionContextMenu = useCallback((event: ReactMouseEvent<Element>, connectionId: string) => {
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setDialogNodeId(null);
        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
    }, []);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = null;
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate]);

    const clearCanvas = useCallback(() => {
        setNodes([]);
        setConnections([]);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAngleNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
    }, [cleanupCanvasFiles, deselectCanvas, projectId]);

    const duplicateNode = useCallback((nodeId: string) => {
        const source = nodesRef.current.find((node) => node.id === nodeId);
        if (!source) return;

        const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const next: CanvasNodeData = {
            ...source,
            id,
            title: `${source.title} Copy`,
            position: { x: source.position.x + 36, y: source.position.y + 36 },
        };

        setNodes((prev) => [...prev, next]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const copySelectedNodes = useCallback(() => {
        const selectedIds = selectedNodeIdsRef.current;
        if (!selectedIds.size) return;

        const copiedNodes = nodesRef.current
            .filter((node) => selectedIds.has(node.id))
            .map((node) => ({
                ...node,
                position: { ...node.position },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            }));

        if (!copiedNodes.length) return;

        clipboardRef.current = {
            nodes: copiedNodes,
            connections: connectionsRef.current.filter((connection) => selectedIds.has(connection.fromNodeId) && selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection })),
        };
    }, []);

    const pasteCopiedNodes = useCallback(() => {
        const clipboard = clipboardRef.current;
        if (!clipboard?.nodes.length) return false;

        const center = getCanvasCenter();
        const bounds = clipboard.nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const dx = center.x - (bounds.left + bounds.right) / 2;
        const dy = center.y - (bounds.top + bounds.bottom) / 2;
        const idMap = new Map<string, string>();
        const nextNodes = clipboard.nodes.map((node, index) => {
            const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
            idMap.set(node.id, id);
            return {
                ...node,
                id,
                title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
                position: {
                    x: node.position.x + dx,
                    y: node.position.y + dy,
                },
                metadata: node.metadata ? { ...node.metadata } : undefined,
            };
        });

        const nextConnections = clipboard.connections.flatMap((connection, index) => {
            const fromNodeId = idMap.get(connection.fromNodeId);
            const toNodeId = idMap.get(connection.toNodeId);
            if (!fromNodeId || !toNodeId) return [];
            return [
                {
                    ...connection,
                    id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
                    fromNodeId,
                    toNodeId,
                },
            ];
        });

        setNodes((prev) => [...prev, ...nextNodes]);
        setConnections((prev) => [...prev, ...nextConnections]);
        setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(nextNodes[0]?.id || null);
        return true;
    }, [getCanvasCenter]);

    const resetViewport = useCallback(() => {
        setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
        setContextMenu(null);
    }, [size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            setViewport((prev) => ({
                x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
                y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
                k: nextScale,
            }));
            setContextMenu(null);
        },
        [size.height, size.width],
    );

    const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
        if (historyCommitTimerRef.current) {
            clearTimeout(historyCommitTimerRef.current);
            historyCommitTimerRef.current = null;
        }
        applyingHistoryRef.current = true;
        setNodes(entry.nodes);
        setConnections(entry.connections);
        setChatSessions(entry.chatSessions);
        setActiveChatId(entry.activeChatId);
        setBackgroundMode(entry.backgroundMode);
        setShowImageInfo(entry.showImageInfo);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setTimeout(() => {
            lastHistoryRef.current = entry;
            applyingHistoryRef.current = false;
            setHistoryState({ canUndo: historyRef.current.past.length > 0, canRedo: historyRef.current.future.length > 0 });
        });
    }, []);

    const undoCanvas = useCallback(() => {
        const previous = historyRef.current.past.pop();
        const current = lastHistoryRef.current;
        if (!previous || !current) return;
        historyRef.current.future.push(current);
        applyHistory(previous);
    }, [applyHistory]);

    const redoCanvas = useCallback(() => {
        const next = historyRef.current.future.pop();
        const current = lastHistoryRef.current;
        if (!next || !current) return;
        historyRef.current.past.push(current);
        applyHistory(next);
    }, [applyHistory]);

    const createAndOpenProject = useCallback(() => {
        const id = createProject(`无限画布 ${useCanvasStore.getState().projects.length + 1}`);
        navigate(`/canvas/${id}`);
    }, [createProject, navigate]);

    const deleteCurrentProject = useCallback(() => {
        deleteProjects([projectId]);
        cleanupAssetImages();
        navigate("/canvas");
    }, [cleanupAssetImages, deleteProjects, navigate, projectId]);

    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setContextMenu(null);
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
            if (event.button !== 0) return;

            if (!event.ctrlKey && !event.metaKey) {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
            }
        },
        [cancelPendingConnectionCreate],
    );

    const createImageFileNode = useCallback(async (file: File, position: Position) => {
        const image = await uploadImage(file);
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: { ...imageMetadata(image), freeResize: true },
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createVideoFileNode = useCallback(async (file: File, position: Position) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createTextFileNode = useCallback(
        async (file: File, position: Position) => {
            const content = await file.text();
            const trimmed = content.trim();
            if (!trimmed) {
                message.warning("文本文件为空");
                return;
            }
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const isScript = isScriptTextFile(file);
            const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Text,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: isScript ? 220 : spec.width,
                height: isScript ? 160 : spec.height,
                metadata: {
                    content: trimmed,
                    status: NODE_STATUS_SUCCESS,
                    fontSize: isScript ? 13 : 14,
                    generationMode: "text",
                    ...(isScript
                        ? {
                              canvasTool: "script" as const,
                              scriptTitle: file.name.replace(/\.[^.]+$/, ""),
                              scriptLogline: "",
                              scriptBody: trimmed,
                          }
                        : null),
                },
            };
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [message],
    );

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const pasteSystemClipboard = useCallback(async () => {
        if (!navigator.clipboard) return;

        const items = await navigator.clipboard.read();
        const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")));
        if (imageItem) {
            const imageType = imageItem.types.find((type) => type.startsWith("image/"));
            if (!imageType) return;
            const blob = await imageItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            void createImageFileNode(file, getCanvasCenter());
            message.success("已从剪切板添加图片");
            return;
        }

        const text = await navigator.clipboard.readText();
        if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                const selectedIds = selectedNodeIdsRef.current;
                const selectedConnection = selectedConnectionIdRef.current;
                if (!selectedIds.size && !selectedConnection) return;
                event.preventDefault();
                event.stopPropagation();
                if (selectedIds.size) {
                    deleteNodes(new Set(selectedIds));
                } else if (selectedConnection) {
                    deleteConnection(selectedConnection);
                }
                return;
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                connectingParamsRef.current = null;
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [copySelectedNodes, deleteConnection, deleteNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (nodeId: string, handleType: "source" | "target") => {
            const nextConnection = { nodeId, handleType };
            connectingParamsRef.current = nextConnection;
            setConnecting(nextConnection);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [setConnecting],
    );

    const updateReactFlowNodePosition = useCallback((nodeId: string, position: Position) => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.position.x === position.x && node.position.y === position.y) return node;
                changed = true;
                return { ...node, position };
            });
            return changed ? next : prev;
        });
    }, []);

    const handleReactFlowNodesChange = useCallback((changes: NodeChange<ReactFlowCanvasNodeType>[]) => {
        let dragging = false;
        let dragStopped = false;
        const committedPositionChanges = new Map<string, Position>();

        changes.forEach((change) => {
            if (change.type !== "position") return;
            if (change.dragging) {
                dragging = true;
                return;
            }
            if (change.dragging === false) dragStopped = true;
            if (change.position) committedPositionChanges.set(change.id, change.position);
        });

        if (committedPositionChanges.size) {
            setNodes((prev) => {
                let changed = false;
                const next = prev.map((node) => {
                    const position = committedPositionChanges.get(node.id);
                    if (!position) return node;
                    if (node.position.x === position.x && node.position.y === position.y) return node;
                    changed = true;
                    return { ...node, position };
                });
                return changed ? next : prev;
            });
        }

        if (dragging) {
            historyPausedRef.current = true;
            nodeDraggingRef.current = true;
            setIsNodeDragging((current) => (current ? current : true));
        } else if (dragStopped) {
            historyPausedRef.current = false;
            nodeDraggingRef.current = false;
            setIsNodeDragging((current) => (current ? false : current));
        }
    }, []);

    const handleReactFlowNodeDragStart = useCallback(() => {
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
    }, []);

    const handleReactFlowNodeDrag = useCallback<OnNodeDrag<ReactFlowCanvasNodeType>>(() => {}, []);

    const handleReactFlowSelectionChange = useCallback<OnSelectionChangeFunc<ReactFlowCanvasNodeType, Edge>>(({ nodes: selectedNodes, edges: selectedEdges }) => {
        const nextNodeIds = new Set(selectedNodes.map((node) => node.id));
        if (!setsEqual(selectedNodeIdsRef.current, nextNodeIds)) {
            selectedNodeIdsRef.current = nextNodeIds;
            setSelectedNodeIds(nextNodeIds);
        }
        const nextConnectionId = selectedEdges[0]?.id ?? null;
        selectedConnectionIdRef.current = nextConnectionId;
        setSelectedConnectionId((current) => (current === nextConnectionId ? current : nextConnectionId));
        if (nextNodeIds.size || nextConnectionId) setContextMenu(null);
        if (nextConnectionId || nextNodeIds.size > 1) {
            setDialogNodeId(null);
            return;
        }
        if (!nextNodeIds.size) return;
        const nextDialogNodeId = selectedNodes[0]?.id ?? null;
        setDialogNodeId((current) => (current === nextDialogNodeId ? current : nextDialogNodeId));
    }, []);

    const handleReactFlowEdgeClick = useCallback<EdgeMouseHandler>(
        (event, edge) => {
            event.stopPropagation();
            selectConnection(edge.id);
        },
        [selectConnection],
    );

    const handleReactFlowNodeDragStop = useCallback<OnNodeDrag<ReactFlowCanvasNodeType>>(
        (_, node) => {
            updateReactFlowNodePosition(node.id, node.position);
            historyPausedRef.current = false;
            nodeDraggingRef.current = false;
            setIsNodeDragging(false);
        },
        [updateReactFlowNodePosition],
    );

    const handleReactFlowNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setSelectedConnectionId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const nextSelected = new Set(currentSelected);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) {
                nextSelected.delete(nodeId);
            } else {
                nextSelected.add(nodeId);
            }
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }

        if (!setsEqual(currentSelected, nextSelected)) {
            selectedNodeIdsRef.current = nextSelected;
            setSelectedNodeIds(nextSelected);
        }
        if (nextSelected.size === 1) {
            const nextDialogNodeId = nextSelected.values().next().value as string | undefined;
            setDialogNodeId(nextDialogNodeId ?? null);
        } else {
            setDialogNodeId(null);
        }
    }, []);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                if (node.id !== nodeId) return node;
                const nextPosition = position || node.position;
                if (node.width === width && node.height === height && node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
                changed = true;
                return { ...node, width, height, position: nextPosition };
            });
            return changed ? next : prev;
        });
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const markNodeAsPanorama360 = useCallback(
        (nodeId: string) => {
            let changed = false;
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== nodeId || node.type !== CanvasNodeType.Image) return node;
                    if (node.metadata?.canvasTool === "panorama360") return node;
                    changed = true;
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            canvasTool: "panorama360",
                            generationMode: "image",
                            size: node.metadata?.size || "2048x1024",
                            freeResize: true,
                        },
                    };
                }),
            );
            message.success(changed ? "已标记为360场景，三击图片可进入全景预览" : "当前图片已经是360场景");
        },
        [message],
    );

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content } } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const isExpanded = Boolean(nodesRef.current.find((node) => node.id === nodeId)?.metadata?.imageBatchExpanded);
        if (isExpanded) {
            setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setCollapsingBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 320);
        } else {
            setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
            window.setTimeout(() => {
                setOpeningBatchIds((prev) => {
                    const next = new Set(prev);
                    next.delete(nodeId);
                    return next;
                });
            }, 260);
        }
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                return { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } };
            }),
        );
    }, []);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((prev) =>
            prev.map((node) =>
                node.id === rootId
                    ? {
                          ...node,
                          width: child.width,
                          height: child.height,
                          metadata: {
                              ...promoteImageMetadata(node.metadata, child.metadata),
                              primaryImageId: child.id,
                          },
                      }
                    : node,
            ),
        );
    }, []);

    const openTextEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setDialogNodeId(node.id);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const handleNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            keepNodeToolbar(nodeId);
        },
        [keepNodeToolbar],
    );

    const handleNodeHoverEnd = useCallback(() => {
        hideNodeToolbar();
    }, [hideNodeToolbar]);

    const handleNodeContextMenu = useCallback((event: ReactMouseEvent, id: string) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
    }, []);

    const downloadNodeImage = useCallback(async (node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        const url = await resolveNodeContent(node);
        saveAs(url, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(url)}`);
    }, []);

    const saveNodeAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text) {
                const content = node.metadata?.content?.trim();
                if (!content) return message.error("没有可保存的文本");
                addAsset({ kind: "text", title: node.metadata?.prompt?.slice(0, 24) || "画布文本", coverUrl: "", tags: [], source: "Canvas", data: { content }, metadata: { source: "canvas", nodeId: node.id } });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Video) {
                if (!node.metadata?.content) return message.error("没有可保存的视频");
                addAsset({
                    kind: "video",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, width: node.width, height: node.height, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "video/mp4" },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (node.type === CanvasNodeType.Audio) {
                if (!node.metadata?.content) return message.error("没有可保存的音频");
                addAsset({
                    kind: "audio",
                    title: node.metadata?.prompt?.slice(0, 24) || "画布音频",
                    coverUrl: "",
                    tags: [],
                    source: "Canvas",
                    data: { url: node.metadata.content, storageKey: node.metadata.storageKey, bytes: node.metadata.bytes || 0, mimeType: node.metadata.mimeType || "audio/mpeg", durationMs: node.metadata.durationMs },
                    metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
                });
                message.success("已加入我的素材");
                return;
            }
            if (!node.metadata?.content) return message.error("没有可保存的图片");
            const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
            addAsset({
                kind: "image",
                title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
                coverUrl: node.metadata.content,
                tags: [],
                source: "Canvas",
                data: {
                    dataUrl,
                    storageKey: node.metadata.storageKey,
                    width: node.metadata.naturalWidth || node.width,
                    height: node.metadata.naturalHeight || node.height,
                    bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
                    mimeType: node.metadata.mimeType || "image/png",
                },
                metadata: { source: "canvas", nodeId: node.id, prompt: node.metadata?.prompt },
            });
            message.success("已加入我的素材");
        },
        [addAsset, message],
    );

    const createImageReversePromptNodes = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("图片节点为空，无法反推提示词");
                return;
            }

            const gap = 96;
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const centerY = node.position.y + node.height / 2;
            const textNode = {
                ...createCanvasNode(CanvasNodeType.Text, { x: node.position.x + node.width + gap + textSpec.width / 2, y: centerY }, { content: IMAGE_PROMPT_REVERSE_PRESET, prompt: IMAGE_PROMPT_REVERSE_PRESET, status: NODE_STATUS_SUCCESS, fontSize: 14 }),
                title: "反推提示词",
            };
            const configNode = {
                ...createCanvasNode(
                    CanvasNodeType.Config,
                    { x: textNode.position.x + textNode.width + gap + configSpec.width / 2, y: centerY },
                    {
                        generationMode: "text",
                        model: effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel,
                        count: 1,
                        composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
                    },
                ),
                title: "反推提示词配置",
            };

            setNodes((prev) => [...prev, textNode, configNode]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id }, { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id }]);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
            setContextMenu(null);
        },
        [effectiveConfig.model, effectiveConfig.textModel, message],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content && !node.metadata?.storageKey) return;
        const url = await resolveNodeContent(node);
        const cropped = await cropDataUrl(url, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Cropped Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width,
            height: width * (image.height / image.width),
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
        setCropNodeId(null);
    }, []);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content && !node.metadata?.storageKey) return;
            setSplitNodeId(null);
            const url = await resolveNodeContent(node);
            const pieces = await splitDataUrl(url, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const childNodes = await Promise.all(
                pieces.map(async (piece) => {
                    const image = await uploadImage(piece.dataUrl);
                    const id = nanoid();
                    return {
                        id,
                        type: CanvasNodeType.Image,
                        title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        width: cellWidth,
                        height: cellHeight,
                        metadata: {
                            ...imageMetadata(image),
                            prompt: node.metadata?.prompt,
                        },
                    } satisfies CanvasNodeData;
                }),
            );
            setNodes((prev) => [...prev, ...childNodes]);
            setConnections((prev) => [...prev, ...childNodes.map((child) => ({ id: nanoid(), fromNodeId: node.id, toNodeId: child.id }))]);
            setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已切分为 ${childNodes.length} 个子节点`);
        },
        [message],
    );

    const maskEditImageNode = useCallback(
        async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const userPrompt = payload.prompt.trim();
            const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
            const childId = nanoid();
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [source]);
            setMaskEditNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title: userPrompt.slice(0, 32) || "局部编辑结果",
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: node.width,
                    height: node.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setSelectedConnectionId(null);
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(generationConfig, prompt, [source], { id: `${node.id}-mask`, name: "mask.png", type: "image/png", dataUrl: payload.maskDataUrl }, { signal: controller.signal }).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, node.width, node.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "局部修改失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
        if (!node.metadata?.content && !node.metadata?.storageKey) return;
        setUpscaleNodeId(null);
        const url = await resolveNodeContent(node);
        const upscaled = await upscaleDataUrl(url, params);
        const image = await uploadImage(upscaled);
        const size = fitNodeSize(image.width, image.height);
        const childId = nanoid();
        const child: CanvasNodeData = {
            id: childId,
            type: CanvasNodeType.Image,
            title: "Upscaled Image",
            position: { x: node.position.x + node.width + 96, y: node.position.y },
            width: size.width,
            height: size.height,
            metadata: {
                ...imageMetadata(image),
                prompt: node.metadata?.prompt,
            },
        };
        setNodes((prev) => [...prev, child]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
        setSelectedNodeIds(new Set([childId]));
        setDialogNodeId(childId);
    }, []);

    const generateAngleNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
            if (!node.metadata?.content) return;
            const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }
            const childId = nanoid();
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const title = buildAngleLabel(params);
            const prompt = buildAnglePrompt(params);
            const generationMetadata = buildImageGenerationMetadata("edit", generationConfig, 1, [
                { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey },
            ]);
            setAngleNodeId(null);
            setRunningNodeId(childId);
            setNodes((prev) => [
                ...prev,
                {
                    id: childId,
                    type: CanvasNodeType.Image,
                    title,
                    position: { x: node.position.x + node.width + 96, y: node.position.y },
                    width: imageConfig.width,
                    height: imageConfig.height,
                    metadata: { prompt, status: NODE_STATUS_LOADING, ...generationMetadata },
                },
            ]);
            setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: node.id, toNodeId: childId }]);
            setSelectedNodeIds(new Set([childId]));
            setDialogNodeId(childId);
            const controller = startGenerationRequest(childId, node.id, childId);
            try {
                const image = await requestEdit(
                    generationConfig,
                    prompt,
                    [{ id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }],
                    undefined,
                    { signal: controller.signal },
                ).then((items) => items[0]);
                const uploaded = await uploadImage(image.dataUrl);
                const size = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, width: size.width, height: size.height, metadata: { ...item.metadata, ...imageMetadata(uploaded), prompt, ...generationMetadata } } : item)));
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                setNodes((prev) => prev.map((item) => (item.id === childId ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(childId, controller);
                setRunningNodeId(null);
            }
        },
        [effectiveConfig, finishGenerationRequest, openConfigDialog, startGenerationRequest],
    );

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);

    const handleUploadRequest = useCallback((nodeId?: string, position?: Position) => {
        uploadTargetRef.current = { nodeId, position };
        imageInputRef.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        async (event: ReactChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            const target = uploadTargetRef.current;
            if (!file || (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !isAudioFile(file) && !isTextFile(file))) return;
            const targetNode = target?.nodeId ? nodesRef.current.find((node) => node.id === target.nodeId) : undefined;
            if (targetNode?.metadata?.canvasTool === "panorama360" && !file.type.startsWith("image/")) {
                message.warning("360场景只能上传图片文件");
                uploadTargetRef.current = null;
                event.target.value = "";
                return;
            }

            if (target?.nodeId) {
                if (isTextFile(file)) {
                    const content = (await file.text()).trim();
                    if (!content) {
                        message.warning("文本文件为空");
                        uploadTargetRef.current = null;
                        event.target.value = "";
                        return;
                    }
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                    const script = isScriptTextFile(file);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Text,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - (script ? 220 : spec.width) / 2, y: node.position.y + node.height / 2 - (script ? 160 : spec.height) / 2 },
                                      width: script ? 220 : spec.width,
                                      height: script ? 160 : spec.height,
                                      metadata: {
                                          ...node.metadata,
                                          content,
                                          status: NODE_STATUS_SUCCESS,
                                          errorDetails: undefined,
                                          generationMode: "text",
                                          ...(script
                                              ? {
                                                    canvasTool: "script" as const,
                                                    scriptTitle: file.name.replace(/\.[^.]+$/, ""),
                                                    scriptBody: content,
                                                }
                                              : { canvasTool: undefined, scriptTitle: undefined, scriptBody: undefined }),
                                      },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (isAudioFile(file)) {
                    const audio = await uploadMediaFile(file, "audio");
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Audio,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - spec.width / 2, y: node.position.y + node.height / 2 - spec.height / 2 },
                                      width: spec.width,
                                      height: spec.height,
                                      metadata: { ...node.metadata, ...audioMetadata(audio), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                if (file.type.startsWith("video/")) {
                    const video = await uploadMediaFile(file, "video");
                    const nextSize = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === target.nodeId
                                ? {
                                      ...node,
                                      type: CanvasNodeType.Video,
                                      title: file.name,
                                      position: { x: node.position.x + node.width / 2 - nextSize.width / 2, y: node.position.y + node.height / 2 - nextSize.height / 2 },
                                      width: nextSize.width,
                                      height: nextSize.height,
                                      metadata: { ...node.metadata, ...videoMetadata(video), errorDetails: undefined },
                                  }
                                : node,
                        ),
                    );
                    setSelectedNodeIds(new Set([target.nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(target.nodeId);
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
                const image = await uploadImage(file);
                const size = fitNodeSize(image.width, image.height);
                setNodes((prev) =>
                    prev.map((node) =>
                        node.id === target.nodeId
                            ? {
                                  ...node,
                                  type: CanvasNodeType.Image,
                                  title: file.name,
                                  width: size.width,
                                  height: size.height,
                                  metadata: {
                                      ...node.metadata,
                                      ...imageMetadata(image),
                                      errorDetails: undefined,
                                      freeResize: true,
                                      isBatchRoot: undefined,
                                      batchRootId: undefined,
                                      batchChildIds: undefined,
                                      batchUsesReferenceImages: undefined,
                                      generationType: undefined,
                                      model: undefined,
                                      size: node.metadata?.canvasTool === "panorama360" ? node.metadata.size : undefined,
                                      quality: undefined,
                                      count: undefined,
                                      references: undefined,
                                      primaryImageId: undefined,
                                      imageBatchExpanded: undefined,
                                  },
                              }
                            : node,
                    ),
                );
                setSelectedNodeIds(new Set([target.nodeId]));
                setSelectedConnectionId(null);
                setDialogNodeId(target.nodeId);
            } else {
                const position = target?.position || screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                void (isTextFile(file) ? createTextFileNode(file, position) : isAudioFile(file) ? createAudioFileNode(file, position) : file.type.startsWith("video/") ? createVideoFileNode(file, position) : createImageFileNode(file, position));
            }

            uploadTargetRef.current = null;
            event.target.value = "";
        },
        [createAudioFileNode, createImageFileNode, createTextFileNode, createVideoFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleDrop = useCallback(
        (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item) || isTextFile(item));
            if (!file) return;

            const pos = screenToCanvas(event.clientX, event.clientY);
            void (isTextFile(file) ? createTextFileNode(file, pos) : isAudioFile(file) ? createAudioFileNode(file, pos) : file.type.startsWith("video/") ? createVideoFileNode(file, pos) : createImageFileNode(file, pos));
        },
        [createAudioFileNode, createImageFileNode, createTextFileNode, createVideoFileNode, screenToCanvas],
    );

    const pasteAssistantImage = useCallback(
        (file: File) => {
            const position = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            void createImageFileNode(file, position);
            message.success("已从剪切板添加图片");
        },
        [createImageFileNode, message, screenToCanvas, size.height, size.width],
    );

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);

    const startTitleEditing = useCallback(() => {
        setTitleDraft(projectTitle || "未命名画布");
        setTitleEditing(true);
    }, [projectTitle]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
        if ((event.target as HTMLElement).closest("[data-node-id]")) return;
        event.preventDefault();
        setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY });
    }, []);

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const isComfyMode = mode === "comfyui";
            if (!isComfyMode && !isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            setRunningNodeId(nodeId);
            const runController = startGenerationRequest(nodeId, nodeId, nodeId);
            const sourceTextContent = sourceNode?.type === CanvasNodeType.Text ? sourceNode.metadata?.content?.trim() || "" : "";
            const editingTextNode = mode === "text" && Boolean(sourceTextContent);
            const generationGraph = createCanvasResourceGraph(nodesRef.current, connectionsRef.current);
            const generationContext = await hydrateNodeGenerationContext(buildNodeGenerationContext(nodeId, generationGraph, editingTextNode ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}` : prompt));
            const effectivePrompt = generationContext.prompt.trim();
            if (runController.signal.aborted) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            const markSourceStatus = sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
            const rawPrompt = prompt;
            if (!effectivePrompt && (mode === "text" || mode === "audio")) {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
                return;
            }
            let pendingChildIds: string[] = [];
            if (markSourceStatus) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)));

            try {
                if (mode === "comfyui") {
                    const workflowId = sourceNode?.metadata?.comfyWorkflowId || comfyui.defaultWorkflowId;
                    const comfyWorkflow = workflowId ? await getComfyWorkflow(workflowId) : null;
                    if (!comfyWorkflow) throw new Error("请先在配置节点选择 ComfyUI 工作流");
                    const values = buildComfyCanvasFieldValues(comfyWorkflow, sourceNode?.metadata?.comfyFieldValues || {}, effectivePrompt);
                    resolveComfyTextFields(comfyWorkflow, values, generationContext);
                    await resolveComfyMediaFields(comfyWorkflow, values, generationContext, comfyui, runController.signal);
                    const requestWorkflow = applyComfyWorkflowFields(comfyWorkflow.workflow, comfyWorkflow.fields, values);
                    const result = await runComfyWorkflow(comfyui, requestWorkflow, runController.signal);
                    if (!result.images.length && !result.videos.length && !result.audios.length) throw new Error("ComfyUI 没有返回任何输出");

                    const parentConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const videoConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const audioConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const uploadedImages = await Promise.all(result.images.map((url) => uploadImage(url)));
                    const uploadedVideos = await Promise.all(result.videos.map((url) => uploadMediaFile(url, "video")));
                    const uploadedAudios = await Promise.all(result.audios.map((url) => uploadMediaFile(url, "audio")));
                    const allNodes: CanvasNodeData[] = [];
                    uploadedImages.forEach((image, index) => {
                        const imageSize = fitNodeSize(image.width, image.height, imageConfig.width, imageConfig.height);
                        allNodes.push({
                            id: nanoid(),
                            type: CanvasNodeType.Image,
                            title: comfyWorkflow.title || "ComfyUI Image",
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + (index % 2) * (imageConfig.width + 36),
                                y: parentPosition.y + Math.floor(index / 2) * (imageConfig.height + 36),
                            },
                            width: imageSize.width,
                            height: imageSize.height,
                            metadata: {
                                prompt: rawPrompt,
                                requestPrompt: effectivePrompt,
                                model: "ComfyUI",
                                comfyWorkflowId: comfyWorkflow.id,
                                ...imageMetadata(image),
                            },
                        });
                    });
                    const imageCount = uploadedImages.length;
                    uploadedVideos.forEach((video, index) => {
                        const videoSize = fitNodeSize(video.width || videoConfig.width, video.height || videoConfig.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        allNodes.push({
                            id: nanoid(),
                            type: CanvasNodeType.Video,
                            title: comfyWorkflow.title || "ComfyUI Video",
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + ((imageCount + index) % 2) * (videoConfig.width + 36),
                                y: parentPosition.y + Math.floor((imageCount + index) / 2) * (videoConfig.height + 36),
                            },
                            width: videoSize.width,
                            height: videoSize.height,
                            metadata: {
                                prompt: rawPrompt,
                                requestPrompt: effectivePrompt,
                                model: "ComfyUI",
                                comfyWorkflowId: comfyWorkflow.id,
                                ...videoMetadata(video),
                            },
                        });
                    });
                    const videoCount = uploadedVideos.length;
                    uploadedAudios.forEach((audio, index) => {
                        const colIndex = imageCount + videoCount + index;
                        allNodes.push({
                            id: nanoid(),
                            type: CanvasNodeType.Audio,
                            title: comfyWorkflow.title || "ComfyUI Audio",
                            position: {
                                x: parentPosition.x + parentConfig.width + 96 + (colIndex % 2) * (audioConfig.width + 36),
                                y: parentPosition.y + Math.floor(colIndex / 2) * (audioConfig.height + 36),
                            },
                            width: audioConfig.width,
                            height: audioConfig.height,
                            metadata: {
                                prompt: rawPrompt,
                                requestPrompt: effectivePrompt,
                                model: "ComfyUI",
                                comfyWorkflowId: comfyWorkflow.id,
                                ...audioMetadata(audio),
                            },
                        });
                    });
                    pendingChildIds = allNodes.map((node) => node.id);
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)), ...allNodes]);
                    setConnections((prev) => [...prev, ...allNodes.map((node) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: node.id }))]);
                    return;
                }

                if (mode === "image") {
                    const count = getGenerationCount(generationConfig.count);
                    const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                    const isImageNode = sourceNode?.type === CanvasNodeType.Image;
                    const isEmptyImageNode = isImageNode && !sourceNode?.metadata?.content;
                    const sourceReference =
                        isImageNode && sourceNode?.metadata?.content
                            ? [{ id: sourceNode.id, name: `${sourceNode.title || sourceNode.id}.png`, type: sourceNode.metadata.mimeType || "image/png", dataUrl: sourceNode.metadata.content, storageKey: sourceNode.metadata.storageKey }]
                            : [];
                    const referenceImages = sourceReference.length ? sourceReference : generationContext.referenceImages;
                    const generationType = referenceImages.length ? ("edit" as const) : ("generation" as const);
                    const generationMetadata = buildImageGenerationMetadata(generationType, generationConfig, count, referenceImages);
                    const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : isImageNode ? CanvasNodeType.Image : CanvasNodeType.Text];
                    const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                    const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                    const gap = 96;
                    const rowGap = 36;
                    const rootId = isEmptyImageNode ? nodeId : nanoid();
                    const childIds = count > 1 ? Array.from({ length: count }, () => nanoid()) : [];
                    const targetIds = count > 1 ? childIds : [rootId];
                    pendingChildIds = isEmptyImageNode ? childIds : [rootId, ...childIds];
                    const rootNode: CanvasNodeData = {
                        id: rootId,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: isEmptyImageNode ? parentPosition.x : parentPosition.x + parentConfig.width + gap,
                            y: parentPosition.y + parentConfig.height / 2 - imageConfig.height / 2,
                        },
                        width: isEmptyImageNode ? sourceNode?.width || imageConfig.width : imageConfig.width,
                        height: isEmptyImageNode ? sourceNode?.height || imageConfig.height : imageConfig.height,
                        metadata: {
                            prompt: rawPrompt,
                            requestPrompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            isBatchRoot: count > 1,
                            batchChildIds: count > 1 ? childIds : undefined,
                            batchUsesReferenceImages: referenceImages.length > 0,
                            ...generationMetadata,
                            imageBatchExpanded: count > 1 ? true : undefined,
                        },
                    };
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Image,
                        title: effectivePrompt.slice(0, 32) || "Generated Image",
                        position: {
                            x: rootNode.position.x + rootNode.width + 120 + (index % 2) * (imageConfig.width + 36),
                            y: rootNode.position.y + Math.floor(index / 2) * (imageConfig.height + rowGap),
                        },
                        width: imageConfig.width,
                        height: imageConfig.height,
                        metadata: { prompt: rawPrompt, requestPrompt: effectivePrompt, status: NODE_STATUS_LOADING, batchRootId: count > 1 ? rootId : undefined, ...generationMetadata },
                    }));
                    const batchConnections = [...(isEmptyImageNode ? [] : [{ id: nanoid(), fromNodeId: nodeId, toNodeId: rootId }]), ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: rootId, toNodeId: childId }))];

                    setNodes((prev) => [
                        ...prev.map((node) =>
                            node.id === nodeId
                                ? isConfigNode
                                    ? {
                                          ...node,
                                          metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined },
                                      }
                                    : isEmptyImageNode
                                      ? {
                                            ...node,
                                            position: rootNode.position,
                                            width: rootNode.width,
                                            height: rootNode.height,
                                            title: rootNode.title,
                                            metadata: { ...node.metadata, ...rootNode.metadata, errorDetails: undefined },
                                        }
                                      : isImageNode
                                        ? {
                                              ...node,
                                              metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined },
                                          }
                                        : {
                                              ...node,
                                              type: CanvasNodeType.Text,
                                              title: prompt.slice(0, 32) || "Prompt",
                                              width: parentConfig.width,
                                              height: parentConfig.height,
                                              metadata: { ...node.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS, fontSize: 14, errorDetails: undefined },
                                          }
                                : node,
                        ),
                        ...(isEmptyImageNode ? [] : [rootNode]),
                        ...childNodes,
                    ]);
                    setConnections((prev) => [...prev, ...batchConnections]);
                    setSelectedNodeIds(new Set([nodeId]));
                    setSelectedConnectionId(null);
                    setDialogNodeId(nodeId);

                    const controller = runController;
                    targetIds.forEach((targetId) => startGenerationRequest(targetId, nodeId, nodeId, controller));
                    if (count > 1) startGenerationRequest(rootId, nodeId, nodeId, controller);
                    let hasSuccess = false;
                    let hasFailure = false;
                    await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, undefined, { signal: controller.signal }).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal }).then((items) => items[0]);
                                const uploaded = await uploadImage(image.dataUrl);
                                const imageSize = fitNodeSize(uploaded.width, uploaded.height, imageConfig.width, imageConfig.height);
                                setNodes((prev) => {
                                    const root = prev.find((node) => node.id === rootId);
                                    return prev.map((node) => {
                                        if (node.id !== targetId && node.id !== rootId) return node;
                                        const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
                                        if (node.id === rootId && (targetId === rootId || !root?.metadata?.primaryImageId))
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded), primaryImageId: targetId },
                                            };
                                        if (node.id === targetId)
                                            return {
                                                ...node,
                                                position: { x: center.x - imageSize.width / 2, y: center.y - imageSize.height / 2 },
                                                width: imageSize.width,
                                                height: imageSize.height,
                                                metadata: { ...node.metadata, ...imageMetadata(uploaded) },
                                            };
                                        return node;
                                    });
                                });
                                hasSuccess = true;
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return true;
                            } catch (error) {
                                if (isGenerationCanceled(error)) return false;
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                hasFailure = true;
                                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                            } finally {
                                finishGenerationRequest(targetId, controller);
                            }
                            return false;
                        }),
                    );
                    if (count > 1) finishGenerationRequest(rootId, controller);
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    if (hasFailure) message.error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : "全部图片生成失败" } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: "全部图片生成失败" } }
                                    : node,
                        ),
                    );
                    return;
                }

                if (mode === "video") {
                    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                    const isEmptyVideoNode = sourceNode?.type === CanvasNodeType.Video && !sourceNode.metadata?.content;
                    const videoId = isEmptyVideoNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const videoNode: CanvasNodeData = {
                        id: videoId,
                        type: CanvasNodeType.Video,
                        title: effectivePrompt.slice(0, 32) || "Generated Video",
                        position: isEmptyVideoNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
                        width: isEmptyVideoNode ? sourceNode.width : spec.width,
                        height: isEmptyVideoNode ? sourceNode.height : spec.height,
                        metadata: {
                            prompt: rawPrompt,
                            requestPrompt: effectivePrompt,
                            status: NODE_STATUS_LOADING,
                            model: generationConfig.model,
                            size: generationConfig.size,
                            seconds: generationConfig.videoSeconds,
                            vquality: generationConfig.vquality,
                            generateAudio: generationConfig.videoGenerateAudio,
                            watermark: generationConfig.videoWatermark,
                            references: generationReferenceUrls(generationContext),
                        },
                    };
                    pendingChildIds = [videoId];
                    setNodes((prev) =>
                        isEmptyVideoNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode],
                    );
                    if (!isEmptyVideoNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }]);
                    const controller = startGenerationRequest(videoId, nodeId, nodeId, runController);
                    try {
                        const video = await storeGeneratedVideo(
                            await requestVideoGeneration(generationConfig, effectivePrompt, generationContext.referenceImages, generationContext.referenceVideos, generationContext.referenceAudios, { signal: controller.signal }),
                        );
                        const videoSize = fitNodeSize(video.width || spec.width, video.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                        setNodes((prev) =>
                            prev.map((node) =>
                                node.id === videoId
                                    ? {
                                          ...node,
                                          width: videoSize.width,
                                          height: videoSize.height,
                                          position: { x: node.position.x + node.width / 2 - videoSize.width / 2, y: node.position.y + node.height / 2 - videoSize.height / 2 },
                                          metadata: {
                                              ...node.metadata,
                                              ...videoMetadata(video),
                                              prompt: rawPrompt,
                                              requestPrompt: effectivePrompt,
                                              model: generationConfig.model,
                                              size: generationConfig.size,
                                              seconds: generationConfig.videoSeconds,
                                              vquality: generationConfig.vquality,
                                              generateAudio: generationConfig.videoGenerateAudio,
                                              watermark: generationConfig.videoWatermark,
                                              references: generationReferenceUrls(generationContext),
                                          },
                                      }
                                    : node,
                            ),
                        );
                    } finally {
                        finishGenerationRequest(videoId, controller);
                    }
                    return;
                }

                if (mode === "audio") {
                    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                    const isEmptyAudioNode = sourceNode?.type === CanvasNodeType.Audio && !sourceNode.metadata?.content;
                    const audioId = isEmptyAudioNode ? nodeId : nanoid();
                    const parent = sourceNode?.position || { x: 0, y: 0 };
                    const audioNode: CanvasNodeData = {
                        id: audioId,
                        type: CanvasNodeType.Audio,
                        title: effectivePrompt.slice(0, 32) || "Generated Audio",
                        position: isEmptyAudioNode ? sourceNode.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
                        width: isEmptyAudioNode ? sourceNode.width : spec.width,
                        height: isEmptyAudioNode ? sourceNode.height : spec.height,
                        metadata: { prompt: rawPrompt, requestPrompt: effectivePrompt, status: NODE_STATUS_LOADING, ...buildAudioGenerationMetadata(generationConfig) },
                    };
                    pendingChildIds = [audioId];
                    setNodes((prev) =>
                        isEmptyAudioNode
                            ? prev.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node))
                            : [...prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
                    );
                    if (!isEmptyAudioNode) setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);
                    const controller = startGenerationRequest(audioId, nodeId, nodeId, runController);
                    try {
                        const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, effectivePrompt, { signal: controller.signal }), generationConfig.audioFormat);
                        setNodes((prev) =>
                            prev.map((node) => (node.id === audioId ? { ...node, metadata: { ...node.metadata, ...audioMetadata(audio), prompt: rawPrompt, requestPrompt: effectivePrompt, ...buildAudioGenerationMetadata(generationConfig) } } : node)),
                        );
                    } finally {
                        finishGenerationRequest(audioId, controller);
                    }
                    return;
                }

                let streamed = "";
                const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
                const textCount = isConfigNode ? getGenerationCount(generationConfig.count) : 1;
                const parentConfig = NODE_DEFAULT_SIZE[isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text];
                const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
                const parentPosition = sourceNode?.position || { x: 0, y: 0 };
                const childIds = isConfigNode || editingTextNode ? Array.from({ length: textCount }, () => nanoid()) : [];
                pendingChildIds = childIds;
                if (isConfigNode || editingTextNode) {
                    const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
                        id,
                        type: CanvasNodeType.Text,
                        title: effectivePrompt.slice(0, 32) || "Generated Text",
                        position: {
                            x: parentPosition.x + parentConfig.width + 96,
                            y: parentPosition.y + parentConfig.height / 2 - textConfig.height / 2 + (index - (textCount - 1) / 2) * (textConfig.height + 36),
                        },
                        width: textConfig.width,
                        height: textConfig.height,
                        metadata: { prompt: rawPrompt, requestPrompt: effectivePrompt, status: NODE_STATUS_LOADING, fontSize: 14 },
                    }));
                    setNodes((prev) => [...prev.map((node) => (node.id === nodeId && isConfigNode ? { ...node, metadata: { ...node.metadata, prompt: rawPrompt, status: NODE_STATUS_LOADING, errorDetails: undefined } } : node)), ...childNodes]);
                    setConnections((prev) => [...prev, ...childIds.map((childId) => ({ id: nanoid(), fromNodeId: nodeId, toNodeId: childId }))]);
                }

                const controller = runController;
                const textTargetIds = childIds.length ? childIds : [nodeId];
                textTargetIds.forEach((targetNodeId) => startGenerationRequest(targetNodeId, nodeId, nodeId, controller));
                const answers = await Promise.all(
                    textTargetIds.map((targetNodeId) => {
                        let localStreamed = "";
                        return requestImageQuestion(
                            generationConfig,
                            buildNodeResponseMessages({ ...generationContext, prompt: effectivePrompt }),
                            (text) => {
                                localStreamed = text;
                                streamed = text;
                                if (isConfigNode) return;
                                setNodes((prev) => prev.map((node) => (node.id === targetNodeId ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, content: text, status: NODE_STATUS_LOADING } } : node)));
                            },
                            { signal: controller.signal },
                        )
                            .then((answer) => ({ nodeId: targetNodeId, content: answer || localStreamed }))
                            .finally(() => finishGenerationRequest(targetNodeId, controller));
                    }),
                );
                if (controller.signal.aborted) return;
                const answerByNodeId = new Map(answers.map((item) => [item.nodeId, item.content]));
                setNodes((prev) =>
                    prev.map((node) =>
                        childIds.includes(node.id)
                            ? { ...node, metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                            : node.id === nodeId && isConfigNode
                              ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } }
                              : node.id === nodeId && !editingTextNode
                                ? { ...node, type: CanvasNodeType.Text, title: prompt.slice(0, 32) || "Generated Text", metadata: { ...node.metadata, content: answerByNodeId.get(node.id) || streamed, status: NODE_STATUS_SUCCESS } }
                                : node,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) =>
                    prev.map((node) => (node.id === nodeId || pendingChildIds.includes(node.id) ? (node.id === nodeId && !markSourceStatus ? node : { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } }) : node)),
                );
            } finally {
                finishGenerationRequest(nodeId, runController);
                setRunningNodeId(null);
            }
        },
        [comfyui, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const handleRetryNode = useCallback(
        async (node: CanvasNodeData) => {
            const sourceNode = findRetrySourceNode(node.id, nodeByIdRef.current, connectionAdjacency.incomingByNodeId) || node;
            const batchRoot = node.metadata?.batchRootId ? nodesRef.current.find((item) => item.id === node.metadata?.batchRootId) : null;
            const savedImageMetadata = node.type === CanvasNodeType.Image ? { ...batchRoot?.metadata, ...node.metadata } : undefined;
            const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
            const generationConfig =
                hasSavedImageMetadata && savedImageMetadata
                    ? {
                          ...effectiveConfig,
                          model: savedImageMetadata.model || effectiveConfig.imageModel || effectiveConfig.model,
                          quality: savedImageMetadata.quality || effectiveConfig.quality,
                          size: savedImageMetadata.size || effectiveConfig.size,
                          count: "1",
                      }
                    : { ...buildGenerationConfig(effectiveConfig, sourceNode, node.type === CanvasNodeType.Text ? "text" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "image"), count: "1" };
            if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                openConfigDialog(true);
                return;
            }

            const retryGraph = createCanvasResourceGraph(nodesRef.current, connectionsRef.current);
            const context = hasSavedImageMetadata ? null : await hydrateNodeGenerationContext(buildNodeGenerationContext(sourceNode.id, retryGraph, sourceNode.metadata?.prompt || node.metadata?.prompt || ""));
            const prompt = (savedImageMetadata?.requestPrompt || savedImageMetadata?.prompt || context?.prompt || "").trim();
            if (!prompt) {
                message.warning("找不到提示词，无法重试");
                return;
            }
            const generationType = savedImageMetadata?.generationType;
            const useReferenceImages = generationType ? generationType === "edit" : Boolean(context?.referenceImages.length);
            const retryReferenceImages =
                hasSavedImageMetadata && savedImageMetadata ? await resolveMetadataReferences(savedImageMetadata) : useReferenceImages ? (context?.referenceImages.length ? context.referenceImages : sourceNodeReferenceImages(batchRoot || sourceNode)) : [];
            if (useReferenceImages && !retryReferenceImages) {
                message.error("参考图片已丢失，无法继续重试");
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails: "参考图片已丢失，无法继续重试" } } : item)));
                return;
            }
            const retryImages = retryReferenceImages || [];

            setRunningNodeId(node.id);
            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_LOADING, errorDetails: undefined } } : item)));
            const controller = startGenerationRequest(node.id, sourceNode.id, node.id);

            try {
                if (node.type === CanvasNodeType.Text) {
                    if (!context) return;
                    let streamed = "";
                    const answer = await requestImageQuestion(
                        generationConfig,
                        buildNodeResponseMessages({ ...context, prompt }),
                        (text) => {
                            streamed = text;
                            setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: text, status: NODE_STATUS_LOADING } } : item)));
                        },
                        { signal: controller.signal },
                    );
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, type: CanvasNodeType.Text, metadata: { ...item.metadata, content: answer || streamed, prompt, status: NODE_STATUS_SUCCESS } } : item)));
                    return;
                }
                if (node.type === CanvasNodeType.Video) {
                    const video = await storeGeneratedVideo(await requestVideoGeneration(generationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], { signal: controller.signal }));
                    const videoSize = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                    setNodes((prev) =>
                        prev.map((item) =>
                            item.id === node.id
                                ? {
                                      ...item,
                                      width: videoSize.width,
                                      height: videoSize.height,
                                      position: { x: item.position.x + item.width / 2 - videoSize.width / 2, y: item.position.y + item.height / 2 - videoSize.height / 2 },
                                      metadata: {
                                          ...item.metadata,
                                          ...videoMetadata(video),
                                          prompt,
                                          model: generationConfig.model,
                                          size: generationConfig.size,
                                          seconds: generationConfig.videoSeconds,
                                          vquality: generationConfig.vquality,
                                          generateAudio: generationConfig.videoGenerateAudio,
                                          watermark: generationConfig.videoWatermark,
                                      },
                                  }
                                : item,
                        ),
                    );
                    return;
                }
                if (node.type === CanvasNodeType.Audio) {
                    const audio = await storeGeneratedAudio(await requestAudioGeneration(generationConfig, prompt, { signal: controller.signal }), generationConfig.audioFormat);
                    setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, ...audioMetadata(audio), prompt, ...buildAudioGenerationMetadata(generationConfig) } } : item)));
                    return;
                }

                const image = useReferenceImages
                    ? await requestEdit(generationConfig, prompt, retryImages, undefined, { signal: controller.signal }).then((items) => items[0])
                    : await requestGeneration(generationConfig, prompt, { signal: controller.signal }).then((items) => items[0]);
                const uploadedImage = await uploadImage(image.dataUrl);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = fitNodeSize(uploadedImage.width, uploadedImage.height, imageConfig.width, imageConfig.height);
                const generationMetadata = savedImageMetadata?.generationType
                    ? { generationType: savedImageMetadata.generationType, model: generationConfig.model, size: generationConfig.size, quality: generationConfig.quality, count: savedImageMetadata.count || 1, references: savedImageMetadata.references }
                    : buildImageGenerationMetadata(useReferenceImages ? "edit" : "generation", generationConfig, 1, retryImages);
                setNodes((prev) =>
                    prev.map((item) =>
                        item.id === node.id
                            ? {
                                  ...item,
                                  type: CanvasNodeType.Image,
                                  width: imageSize.width,
                                  height: imageSize.height,
                                  metadata: { ...item.metadata, ...imageMetadata(uploadedImage), prompt, ...generationMetadata },
                              }
                            : item,
                    ),
                );
            } catch (error) {
                if (isGenerationCanceled(error)) return;
                const errorDetails = error instanceof Error ? error.message : "生成失败";
                message.error(errorDetails);
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, metadata: { ...item.metadata, status: NODE_STATUS_ERROR, errorDetails } } : item)));
            } finally {
                finishGenerationRequest(node.id, controller);
                setRunningNodeId(null);
            }
        },
        [connectionAdjacency, effectiveConfig, finishGenerationRequest, isAiConfigReady, message, openConfigDialog, startGenerationRequest],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message],
    );

    const insertAssistantImage = useCallback(
        async (image: CanvasAssistantImage) => {
            const storedImage = image.storageKey ? { url: image.dataUrl, storageKey: image.storageKey, width: 1, height: 1, bytes: 0, mimeType: "image/png" } : await uploadImage(image.dataUrl);
            const meta = storedImage.width === 1 && storedImage.height === 1 ? await readImageMeta(storedImage.url) : storedImage;
            const config = fitNodeSize(meta.width, meta.height);
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const node: CanvasNodeData = {
                id,
                type: CanvasNodeType.Image,
                title: image.prompt.slice(0, 32) || "Generated Image",
                position: { x: center.x - config.width / 2, y: center.y - config.height / 2 },
                width: config.width,
                height: config.height,
                metadata: { ...imageMetadata({ ...storedImage, width: meta.width, height: meta.height }), prompt: image.prompt },
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            setDialogNodeId(id);
        },
        [screenToCanvas, size.height, size.width],
    );

    const insertAssistantText = useCallback(
        (text: string) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: text, status: NODE_STATUS_SUCCESS }),
                title: text.slice(0, 32) || "Assistant Text",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
        },
        [screenToCanvas, size.height, size.width],
    );

    const handleAssetInsert = useCallback(
        (payload: InsertAssetPayload) => {
            if (payload.kind === "text") {
                insertAssistantText(payload.content);
            } else if (payload.kind === "video") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const nextSize = fitNodeSize(payload.width || spec.width, payload.height || spec.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Video,
                        title: payload.title,
                        position: { x: center.x - nextSize.width / 2, y: center.y - nextSize.height / 2 },
                        width: nextSize.width,
                        height: nextSize.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, naturalWidth: payload.width, naturalHeight: payload.height },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else if (payload.kind === "audio") {
                const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
                const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setNodes((prev) => [
                    ...prev,
                    {
                        id,
                        type: CanvasNodeType.Audio,
                        title: payload.title,
                        position: { x: center.x - spec.width / 2, y: center.y - spec.height / 2 },
                        width: spec.width,
                        height: spec.height,
                        metadata: { content: payload.url, storageKey: payload.storageKey, status: NODE_STATUS_SUCCESS, mimeType: payload.mimeType || "audio/mpeg", durationMs: payload.durationMs },
                    },
                ]);
                setSelectedNodeIds(new Set([id]));
            } else {
                insertAssistantImage({ id: `asset-${Date.now()}`, prompt: payload.title, dataUrl: payload.dataUrl, storageKey: payload.storageKey });
            }
            setAssetPickerOpen(false);
        },
        [insertAssistantImage, insertAssistantText, screenToCanvas, size.height, size.width],
    );

    const openMaterialLibrary = useCallback((tab: "styles" | "effects" | "assets" = "styles") => {
        setMaterialLibraryTab(tab);
        setMaterialLibraryOpen(true);
    }, []);

    const insertMaterialPreset = useCallback(
        (preset: { title: string; prompt: string }) => {
            const center = screenToCanvas((containerRef.current?.getBoundingClientRect().left || 0) + size.width / 2, (containerRef.current?.getBoundingClientRect().top || 0) + size.height / 2);
            const node = {
                ...createCanvasNode(CanvasNodeType.Text, center, { content: preset.prompt, status: NODE_STATUS_SUCCESS, fontSize: 13, generationMode: "text", prompt: preset.prompt }),
                title: preset.title,
                width: 220,
                height: 132,
            };
            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(node.id);
            setMaterialLibraryOpen(false);
        },
        [screenToCanvas, size.height, size.width],
    );

    const createDirectorStoryboard = useCallback(
        (directorNode: CanvasNodeData) => {
            const captures = directorNode.metadata?.directorCaptures?.length
                ? directorNode.metadata.directorCaptures
                : (directorNode.metadata?.directorShots?.length ? directorNode.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS).map((shot, index) => ({
                      id: `capture-${Date.now()}-${index}`,
                      cameraId: shot.id,
                      name: `${shot.name}-shot-${String(index + 1).padStart(2, "0")}`,
                      dataUrl: directorShotDataUrl(
                          shot,
                          directorNode.metadata?.directorSceneSettings || DEFAULT_DIRECTOR_SCENE_SETTINGS,
                          directorNode.metadata?.directorCharacters?.length ? directorNode.metadata.directorCharacters : DEFAULT_DIRECTOR_CHARACTERS,
                          index,
                      ),
                      createdAt: new Date().toISOString(),
                  }));
            const shots = directorNode.metadata?.directorShots?.length ? directorNode.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS;
            const scene = directorNode.metadata?.directorScene?.trim() || "未命名场景";
            const style = directorNode.metadata?.directorStyle?.trim() || "电影感";
            const characters = directorNode.metadata?.directorCast?.trim() || "角色待定";
            const props = directorNode.metadata?.directorProps?.trim() || "道具待定";
            const gap = 44;
            const startX = directorNode.position.x + directorNode.width + 120;
            const startY = directorNode.position.y;
            const outputIds: string[] = [];
            const shotNodes = captures.map((capture, index) => {
                const shot = shots.find((item) => item.id === capture.cameraId) || shots[index % shots.length] || DEFAULT_DIRECTOR_SHOTS[0];
                const id = `director-shot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
                outputIds.push(id);
                const shotPosition = shot.position ? `(${shot.position.x}, ${shot.position.y}, ${shot.position.z})` : "(0, 2.2, 10)";
                const shotTarget = shot.target ? `(${shot.target.x}, ${shot.target.y}, ${shot.target.z})` : "(0, 1.2, 0)";
                const prompt = [
                    `来源：${directorNode.title} / ${capture.name}`,
                    `场景：${scene}`,
                    `角色：${characters}`,
                    `道具：${props}`,
                    `风格：${style}`,
                    `机位：${shot.camera}`,
                    `FOV：${shot.fov ?? 50}°`,
                    `相机位置：${shotPosition}`,
                    `注视坐标：${shotTarget}`,
                    `镜头目标：${shot.prompt}`,
                ].join("\n");
                return {
                    id,
                    type: CanvasNodeType.Image,
                    title: `${directorNode.title} ${capture.name}`,
                    position: { x: startX + index * (300 + gap), y: startY + index * 34 },
                    width: 300,
                    height: 188,
                    metadata: {
                        content: capture.dataUrl,
                        status: NODE_STATUS_SUCCESS,
                        prompt,
                        generationMode: "image",
                        generationType: "generation",
                        model: directorNode.metadata?.model,
                        size: directorNode.metadata?.size,
                        count: 1,
                    },
                } satisfies CanvasNodeData;
            });
            setNodes((prev) => [...prev.map((node) => (node.id === directorNode.id ? { ...node, metadata: { ...node.metadata, directorCaptures: captures, directorOutputIds: outputIds, status: NODE_STATUS_SUCCESS } } : node)), ...shotNodes]);
            setConnections((prev) => [...prev, ...shotNodes.map((node) => ({ id: nanoid(), fromNodeId: directorNode.id, toNodeId: node.id }))]);
            setSelectedNodeIds(new Set(outputIds));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setDirectorStudioNodeId(null);
            message.success(`截图已添加到画布`);
        },
        [message],
    );

    const captureDirectorCamera = useCallback(
        (directorNode: CanvasNodeData, cameraId: string) => {
            const shots = directorNode.metadata?.directorShots?.length ? directorNode.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS;
            const shot = shots.find((item) => item.id === cameraId) || shots[0] || DEFAULT_DIRECTOR_SHOTS[0];
            const existing = directorNode.metadata?.directorCaptures || [];
            const captureIndex = existing.filter((item) => item.cameraId === cameraId).length + 1;
            const nextCapture = {
                id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                cameraId,
                name: `${shot.name}-shot-${String(captureIndex).padStart(2, "0")}`,
                dataUrl: directorShotDataUrl(
                    shot,
                    directorNode.metadata?.directorSceneSettings || DEFAULT_DIRECTOR_SCENE_SETTINGS,
                    directorNode.metadata?.directorCharacters?.length ? directorNode.metadata.directorCharacters : DEFAULT_DIRECTOR_CHARACTERS,
                    existing.length,
                ),
                createdAt: new Date().toISOString(),
            };
            handleConfigNodeChange(directorNode.id, { directorCaptures: [...existing, nextCapture], directorShots: shots, status: NODE_STATUS_SUCCESS });
            message.success(`${nextCapture.name} 已截图`);
        },
        [handleConfigNodeChange, message],
    );

    const createScriptStoryboard = useCallback(
        (scriptNode: CanvasNodeData) => {
            const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
            const beats = buildScriptBeats(body);
            const gap = 36;
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const startX = scriptNode.position.x + scriptNode.width + 96;
            const startY = scriptNode.position.y;
            const outputIds: string[] = [];
            const beatNodes = beats.map((beat, index) => {
                const id = `script-shot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
                outputIds.push(id);
                return {
                    id,
                    type: CanvasNodeType.Image,
                    title: beat.title,
                    position: { x: startX + index * (spec.width + gap), y: startY },
                    width: spec.width,
                    height: spec.height,
                    metadata: {
                        content: scriptStoryboardDataUrl(beat.title, index),
                        status: NODE_STATUS_SUCCESS,
                        prompt: beat.prompt,
                        generationMode: "image",
                        generationType: "generation",
                    },
                } satisfies CanvasNodeData;
            });
            setNodes((prev) => [
                ...prev.map((node) => (node.id === scriptNode.id ? { ...node, metadata: { ...node.metadata, scriptBody: body, content: body, scriptBeats: beats, scriptOutputIds: outputIds, status: NODE_STATUS_SUCCESS } } : node)),
                ...beatNodes,
            ]);
            setConnections((prev) => [...prev, ...beatNodes.map((node) => ({ id: nanoid(), fromNodeId: scriptNode.id, toNodeId: node.id }))]);
            setSelectedNodeIds(new Set(outputIds));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            message.success(`已拆出 ${beatNodes.length} 个分镜`);
        },
        [message],
    );

    const createScriptNarrationNode = useCallback((scriptNode: CanvasNodeData) => {
        const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `script-audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const node: CanvasNodeData = {
            id,
            type: CanvasNodeType.Audio,
            title: "脚本旁白",
            position: { x: scriptNode.position.x + scriptNode.width + 96, y: scriptNode.position.y + 196 },
            width: spec.width,
            height: spec.height,
            metadata: { status: NODE_STATUS_IDLE, prompt: `请把下面脚本生成自然、有情绪层次的旁白音频：\n${body}`, generationMode: "audio" },
        };
        setNodes((prev) => [...prev.map((item) => (item.id === scriptNode.id ? { ...item, metadata: { ...item.metadata, content: body, scriptBody: body } } : item)), node]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: scriptNode.id, toNodeId: id }]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const createScriptVideoNode = useCallback((scriptNode: CanvasNodeData) => {
        const body = scriptNode.metadata?.scriptBody?.trim() || scriptNode.metadata?.content?.trim() || DEFAULT_SCRIPT_BODY;
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
        const id = `script-video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const node: CanvasNodeData = {
            id,
            type: CanvasNodeType.Video,
            title: "脚本视频",
            position: { x: scriptNode.position.x + scriptNode.width + 96, y: scriptNode.position.y + 320 },
            width: spec.width,
            height: spec.height,
            metadata: { status: NODE_STATUS_IDLE, prompt: `请根据下面脚本生成连贯短视频，保留关键情节、角色动作和镜头节奏：\n${body}`, generationMode: "video" },
        };
        setNodes((prev) => [...prev.map((item) => (item.id === scriptNode.id ? { ...item, metadata: { ...item.metadata, content: body, scriptBody: body } } : item)), node]);
        setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: scriptNode.id, toNodeId: id }]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const renderCanvasNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            panelNode.metadata?.canvasTool === "director" ? (
                <DirectorDeskPanel node={panelNode} theme={theme} onChange={(patch) => handleConfigNodeChange(panelNode.id, patch)} onCreateStoryboard={() => createDirectorStoryboard(panelNode)} onClose={() => setDialogNodeId(null)} />
            ) : panelNode.metadata?.canvasTool === "script" ? (
                <ScriptDeskPanel
                    node={panelNode}
                    theme={theme}
                    onChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                    onCreateStoryboard={() => createScriptStoryboard(panelNode)}
                    onCreateNarration={() => createScriptNarrationNode(panelNode)}
                    onCreateVideo={() => createScriptVideoNode(panelNode)}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || EMPTY_NODE_INPUTS}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_MENTION_REFERENCES}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                />
            ),
        [
            configInputsById,
            confirmStopGeneration,
            createDirectorStoryboard,
            createScriptNarrationNode,
            createScriptStoryboard,
            createScriptVideoNode,
            handleConfigNodeChange,
            handleGenerateNode,
            handleNodePromptChange,
            mentionReferencesByNodeId,
            runningNodeId,
            theme,
        ],
    );

    const renderCanvasConfigNodeContent = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputs={configInputsById.get(contentNode.id) || EMPTY_NODE_INPUTS}
                inputSummary={configInputSummaryById.get(contentNode.id) || EMPTY_INPUT_SUMMARY}
                mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_MENTION_REFERENCES}
                onConfigChange={handleConfigNodeChange}
                onHeightChange={(nodeId, height) => handleNodeResize(nodeId, contentNode.width, height)}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    const mode = target?.metadata?.generationMode || defaultGenerationMode(target?.type);
                    void handleGenerateNode(nodeId, mode, target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [configInputSummaryById, configInputsById, confirmStopGeneration, handleConfigNodeChange, handleGenerateNode, handleNodeResize, mentionReferencesByNodeId, runningNodeId],
    );

    const pendingConnectionCreatePosition = pendingConnectionCreate ? canvasToScreen(pendingConnectionCreate.position) : null;
    const assistantOpen = assistantMounted && !assistantCollapsed;
    const openAgent = (mode: CanvasAgentMode = agentMode) => {
        if (agentCloseTimerRef.current) {
            clearTimeout(agentCloseTimerRef.current);
            agentCloseTimerRef.current = null;
        }
        setAgentMode(mode);
        setAssistantMounted(true);
        setAssistantClosing(false);
        setAssistantCollapsed(false);
    };
    const closeAgent = () => {
        if (!assistantMounted || assistantClosing) return;
        setAssistantCollapsed(true);
        setAssistantClosing(true);
        agentCloseTimerRef.current = setTimeout(() => {
            agentCloseTimerRef.current = null;
            setAssistantMounted(false);
            setAssistantClosing(false);
        }, CANVAS_AGENT_PANEL_MOTION_MS);
    };

    const handleReactFlowViewportChange = useCallback((next: ViewportTransform) => {
        setViewport((current) => {
            if (current.x === next.x && current.y === next.y && current.k === next.k) return current;
            return next;
        });
        setContextMenu((current) => (current ? null : current));
    }, []);

    const selectOnlyNode = useCallback((nodeId: string) => {
        const next = new Set([nodeId]);
        if (setsEqual(selectedNodeIdsRef.current, next)) return;
        selectedNodeIdsRef.current = next;
        setSelectedNodeIds(next);
    }, []);

    const selectSingleNode = useCallback(
        (nodeId: string) => {
            selectOnlyNode(nodeId);
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(nodeId);
        },
        [selectOnlyNode],
    );

    const handleRetryNodeAction = useCallback((node: CanvasNodeData) => void handleRetryNode(node), [handleRetryNode]);
    const handleViewNodeImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);
    const insertPanoramaSnapshot = useCallback(
        async (sourceNode: CanvasNodeData, dataUrl: string) => {
            try {
                const image = await uploadImage(dataUrl);
                const nextSize = fitNodeSize(image.width, image.height);
                const nodeId = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const position = {
                    x: sourceNode.position.x + sourceNode.width + 80,
                    y: sourceNode.position.y + sourceNode.height / 2 - nextSize.height / 2,
                };
                const node: CanvasNodeData = {
                    id: nodeId,
                    type: CanvasNodeType.Image,
                    title: `${sourceNode.title || "360场景"} 截图`,
                    position,
                    width: nextSize.width,
                    height: nextSize.height,
                    metadata: {
                        ...imageMetadata(image),
                        prompt: "360全景沉浸式预览截图",
                        generationMode: "image",
                        freeResize: true,
                    },
                };
                setNodes((prev) => [...prev, node]);
                setConnections((prev) => [...prev, { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: node.id }]);
                setSelectedNodeIds(new Set([node.id]));
                setSelectedConnectionId(null);
                setDialogNodeId(node.id);
                message.success("截图已插入画布");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "截图插入失败");
            }
        },
        [message],
    );
    const openNodeComposer = useCallback(
        (node: CanvasNodeData) => {
            selectOnlyNode(node.id);
            setSelectedConnectionId(null);
            setContextMenu(null);
            if (node.metadata?.canvasTool === "director") {
                setDialogNodeId(null);
                setDirectorStudioNodeId(node.id);
                setEditingNodeId(null);
                return;
            }
            setDialogNodeId(node.id);
            setEditingNodeId(null);
        },
        [selectOnlyNode],
    );
    const reactFlowConnections = useMemo(
        () => connections.filter((connection) => !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.fromNodeId) && !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.toNodeId)),
        [batchVisibilityIndex.hiddenConnectionEndpointIds, connections],
    );
    const reactFlowEdges = useMemo<Edge<ReactFlowCanvasEdgeData>[]>(
        () =>
            reactFlowConnections.map((connection) => ({
                id: connection.id,
                type: CANVAS_EDGE_TYPE,
                source: connection.fromNodeId,
                target: connection.toNodeId,
                sourceHandle: CANVAS_SOURCE_HANDLE,
                targetHandle: CANVAS_TARGET_HANDLE,
                selectable: true,
                data: {
                    connection,
                    selected: selectedConnectionId === connection.id,
                    active: selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id),
                    onSelect: selectConnection,
                    onDelete: deleteConnection,
                    onContextMenu: openConnectionContextMenu,
                },
            })),
        [deleteConnection, openConnectionContextMenu, reactFlowConnections, relatedHighlight.connectionIds, selectConnection, selectedConnectionId],
    );
    const directorStudioNode = useMemo(() => (directorStudioNodeId ? nodes.find((node) => node.id === directorStudioNodeId && node.metadata?.canvasTool === "director") || null : null), [directorStudioNodeId, nodes]);
    const dialogNode = useMemo(() => {
        const node = dialogNodeId ? visibleNodeItems.find((item) => item.id === dialogNodeId) || null : null;
        return node?.metadata?.canvasTool === "director" ? null : node;
    }, [dialogNodeId, visibleNodeItems]);
    const composerWidth = dialogNode ? Math.min(dialogNode.type === CanvasNodeType.Config ? 500 : 760, Math.max(280, size.width - 48)) : 0;
    const composerScale = dialogNode ? clampNumber(viewport.k, 0.7, 1) : 1;
    const composerPosition = dialogNode
        ? (() => {
              const rawLeft = (dialogNode.position.x + dialogNode.width / 2) * viewport.k + viewport.x;
              const halfWidth = (composerWidth * composerScale) / 2;
              const minLeft = halfWidth + 24;
              const maxLeft = Math.max(minLeft, size.width - halfWidth - 24);
              return {
                  left: clampNumber(rawLeft, minLeft, maxLeft),
                  top: (dialogNode.position.y + dialogNode.height) * viewport.k + viewport.y,
              };
          })()
        : null;

    const reactFlowNodes = useMemo<ReactFlowCanvasNodeType[]>(
        () =>
            visibleNodeItems.map((node) => ({
                id: node.id,
                type: CANVAS_NODE_TYPE,
                position: node.position,
                width: node.width,
                height: node.height,
                measured: { width: node.width, height: node.height },
                selected: selectedNodeIds.has(node.id),
                draggable: true,
                data: {
                    props: {
                        data: node,
                        isSelected: selectedNodeIds.has(node.id),
                        isRelated: relatedHighlight.nodeIds.has(node.id),
                        isFocusRelated: activeNodeId === node.id,
                        isConnectionTarget: connectionTargetNodeId === node.id,
                        isConnecting: Boolean(connectingParams),
                        editRequestNonce: editingNodeId === node.id ? editRequestNonce : 0,
                        showPanel: false,
                        batchCount: batchChildCountById.get(node.id) || 0,
                        batchExpanded: Boolean(node.metadata?.imageBatchExpanded),
                        batchClosing: Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId)),
                        batchOpening: openingBatchIds.has(node.id),
                        batchRecovering: collapsingBatchIds.has(node.id),
                        batchMotion: batchMotionById.get(node.id),
                        showImageInfo,
                        isOverview: isOverviewCanvas,
                        resourceLabel: resourceReferenceByNodeId.get(node.id),
                        mentionReferences: mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES,
                        renderPanel: renderCanvasNodePanel,
                        renderNodeContent: renderCanvasConfigNodeContent,
                        onMouseDown: handleReactFlowNodeMouseDown,
                        onHoverStart: handleNodeHoverStart,
                        onHoverEnd: handleNodeHoverEnd,
                        onConnectStart: handleConnectStart,
                        onResize: handleNodeResize,
                        onContentChange: handleNodeContentChange,
                        onToggleBatch: toggleBatchExpanded,
                        onSetBatchPrimary: setBatchPrimary,
                        onOpenComposer: openNodeComposer,
                        onUpload: (item) => handleUploadRequest(item.id),
                        onRetry: handleRetryNodeAction,
                        onGenerateImage: generateImageFromTextNode,
                        onViewImage: handleViewNodeImage,
                        onContextMenu: handleNodeContextMenu,
                    },
                },
            })),
        [
            activeNodeId,
            batchChildCountById,
            batchMotionById,
            collapsingBatchIds,
            connectingParams,
            connectionTargetNodeId,
            editRequestNonce,
            editingNodeId,
            generateImageFromTextNode,
            handleConnectStart,
            handleNodeContentChange,
            handleNodeContextMenu,
            handleNodeHoverEnd,
            handleNodeHoverStart,
            handleNodeResize,
            handleUploadRequest,
            openNodeComposer,
            handleReactFlowNodeMouseDown,
            handleRetryNodeAction,
            handleViewNodeImage,
            isOverviewCanvas,
            mentionReferencesByNodeId,
            openingBatchIds,
            relatedHighlight.nodeIds,
            renderCanvasConfigNodeContent,
            renderCanvasNodePanel,
            resourceReferenceByNodeId,
            selectedNodeIds,
            setBatchPrimary,
            showImageInfo,
            toggleBatchExpanded,
            visibleNodeItems,
        ],
    );

    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main className="flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <CanvasTopBar
                    title={projectTitle || "未命名画布"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    onHome={() => navigate("/")}
                    onProjects={() => navigate("/canvas")}
                    onCreateProject={createAndOpenProject}
                    onDeleteProject={deleteCurrentProject}
                    agentOpen={assistantOpen}
                    onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                />

                <ReactFlowCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    nodes={reactFlowNodes}
                    edges={reactFlowEdges}
                    nodeTypes={REACT_FLOW_NODE_TYPES}
                    edgeTypes={REACT_FLOW_EDGE_TYPES}
                    backgroundMode={backgroundMode}
                    onViewportChange={handleReactFlowViewportChange}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onNodesChange={handleReactFlowNodesChange}
                    onNodeDragStart={handleReactFlowNodeDragStart}
                    onNodeDrag={handleReactFlowNodeDrag}
                    onNodeDragStop={handleReactFlowNodeDragStop}
                    onSelectionChange={handleReactFlowSelectionChange}
                    onEdgeClick={handleReactFlowEdgeClick}
                    onConnect={handleReactFlowConnect}
                    onConnectStart={handleReactFlowConnectStart}
                    onConnectEnd={handleReactFlowConnectEnd}
                    onCanvasDeselect={deselectCanvas}
                    onContextMenu={preventCanvasContextMenu}
                    onDrop={handleDrop}
                    miniMapOpen={isMiniMapOpen}
                />

                {dialogNode && composerPosition ? (
                    <div
                        data-canvas-no-zoom
                        className="pointer-events-none absolute z-[70] -translate-x-1/2 pt-4"
                        style={{
                            left: composerPosition.left,
                            top: composerPosition.top,
                        }}
                    >
                        <div
                            className="pointer-events-auto max-h-[60vh] overflow-y-auto thin-scrollbar"
                            style={{
                                width: composerWidth,
                                maxWidth: "calc(100vw - 48px)",
                                transform: `scale(${composerScale})`,
                                transformOrigin: "top center",
                            }}
                            onWheel={(event) => {
                                const el = event.currentTarget;
                                if (el.scrollHeight <= el.clientHeight) return;
                                const atTop = el.scrollTop === 0;
                                const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
                                if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) return;
                                event.stopPropagation();
                            }}
                        >
                            <Suspense fallback={LazyCanvasFallback}>{renderCanvasNodePanel(dialogNode)}</Suspense>
                        </div>
                    </div>
                ) : null}

                {directorStudioNode ? (
                    <DirectorStudioOverlay
                        node={directorStudioNode}
                        theme={theme}
                        onChange={(patch) => handleConfigNodeChange(directorStudioNode.id, patch)}
                        onCapture={(cameraId) => captureDirectorCamera(directorStudioNode, cameraId)}
                        onSendToCanvas={() => createDirectorStoryboard(directorStudioNode)}
                        onClose={() => setDirectorStudioNodeId(null)}
                    />
                ) : null}

                <CanvasAssetManagerPanel
                    open={canvasAssetPanelOpen}
                    initialTab={canvasAssetPanelInitialTab}
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onClose={() => setCanvasAssetPanelOpen(false)}
                    onSelectNode={selectSingleNode}
                    onOpenAssetPicker={() => setAssetPickerOpen(true)}
                    onUpload={() => handleUploadRequest()}
                />

                {pendingConnectionCreate && pendingConnectionCreatePosition ? (
                    <ConnectionCreateMenu pending={pendingConnectionCreate} position={pendingConnectionCreatePosition} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} />
                ) : null}

                {!isNodeDragging && !nodeImageSettingsOpen && toolbarNode ? (
                    <CanvasNodeHoverToolbar
                        node={toolbarNode}
                        viewport={viewport}
                        onKeep={keepNodeToolbar}
                        onLeave={hideNodeToolbar}
                        onInfo={(node) => setInfoNodeId(node.id)}
                        onEditText={openTextEditor}
                        onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                        onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                        onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                        onGenerateImage={generateImageFromTextNode}
                        onUpload={(node) => handleUploadRequest(node.id)}
                        onMarkPanorama360={(node) => markNodeAsPanorama360(node.id)}
                        onDownload={downloadNodeImage}
                        onSaveAsset={(node) => void saveNodeAsset(node)}
                        onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                        onCrop={(node) => setCropNodeId(node.id)}
                        onSplit={(node) => setSplitNodeId(node.id)}
                        onUpscale={(node) => setUpscaleNodeId(node.id)}
                        onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                        onAngle={(node) => setAngleNodeId(node.id)}
                        onViewImage={handleViewNodeImage}
                        onReversePrompt={createImageReversePromptNodes}
                        onRetry={handleRetryNodeAction}
                        onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                        onDelete={(node) => deleteNodes(new Set([node.id]))}
                    />
                ) : null}

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    backgroundMode={backgroundMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onDeselect={deselectCanvas}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    assetPanelOpen={canvasAssetPanelOpen}
                    onOpenMyAssets={() => {
                        setCanvasAssetPanelInitialTab("assets");
                        setCanvasAssetPanelOpen(true);
                    }}
                    onOpenMaterialLibrary={openMaterialLibrary}
                    onOpenGenerationHistory={() => setGenerationHistoryOpen(true)}
                    onAddScript={createScriptNode}
                    onAddVideoComposition={createVideoCompositionNode}
                    onAddDirector={createDirectorNode}
                    onAddPanorama360={createPanorama360Node}
                    onTutorialAction={(action) => {
                        const labels = { guide: "使用教程", support: "联系客服", sales: "联系销售", wechat: "关注公众号" };
                        message.info(`${labels[action]}已打开`);
                    }}
                />

                <CanvasZoomControls
                    scale={viewport.k}
                    onScaleChange={setZoomScale}
                    onReset={resetViewport}
                    isMiniMapOpen={isMiniMapOpen}
                    onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                    onOpenMyAssets={() => {
                        setCanvasAssetPanelInitialTab("canvas");
                        setCanvasAssetPanelOpen(true);
                        setDialogNodeId(null);
                    }}
                />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                deleteNodes(new Set([contextMenu.nodeId]));
                            } else if (contextMenu.type === "connection") {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                        onAddImage={() => {
                            createNode(CanvasNodeType.Image);
                            setContextMenu(null);
                        }}
                        onAddVideo={() => {
                            createNode(CanvasNodeType.Video);
                            setContextMenu(null);
                        }}
                        onAddAudio={() => {
                            createNode(CanvasNodeType.Audio);
                            setContextMenu(null);
                        }}
                        onAddText={() => {
                            createNode(CanvasNodeType.Text);
                            setContextMenu(null);
                        }}
                        onAddConfig={() => {
                            createNode(CanvasNodeType.Config);
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav,text/plain,text/markdown,.txt,.md,.markdown,.srt" className="hidden" onChange={handleImageInputChange} />

                {infoNode ? <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} /> : null}

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open={Boolean(upscaleNode)} onClose={() => setUpscaleNodeId(null)} onConfirm={(params) => void upscaleImageNode(upscaleNode!, params)} />
                ) : null}

                <Modal title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={() => setSuperResolveNodeId(null)}>
                    <div className="py-8 text-center text-base font-medium">暂未实现</div>
                </Modal>

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title={previewNode?.metadata?.canvasTool === "panorama360" ? "360全景预览" : "图片详情"}
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width={previewNode?.metadata?.canvasTool === "panorama360" ? "96vw" : "auto"}
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode?.metadata?.content ? <PreviewImageContent node={previewNode} onCapturePanorama={(dataUrl) => insertPanoramaSnapshot(previewNode, dataUrl)} /> : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>

                {assetPickerOpen ? <AssetPickerModal open={assetPickerOpen} onInsert={handleAssetInsert} onClose={() => setAssetPickerOpen(false)} /> : null}
                <CanvasMaterialLibraryModal
                    open={materialLibraryOpen}
                    initialTab={materialLibraryTab}
                    onClose={() => setMaterialLibraryOpen(false)}
                    onUsePreset={insertMaterialPreset}
                    onOpenAssetPicker={() => {
                        setMaterialLibraryOpen(false);
                        setAssetPickerOpen(true);
                    }}
                    onUpload={() => {
                        setMaterialLibraryOpen(false);
                        handleUploadRequest();
                    }}
                />
                <CanvasGenerationHistoryModal open={generationHistoryOpen} nodes={nodes} onClose={() => setGenerationHistoryOpen(false)} onSelectNode={duplicateNode} />
            </section>
            {assistantMounted ? (
                <CanvasAssistantPanel
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    snapshot={agentSnapshot}
                    sessions={chatSessions}
                    activeSessionId={activeChatId}
                    onSelectNodeIds={setSelectedNodeIds}
                    onSessionsChange={handleAssistantSessionsChange}
                    onApplyOps={applyAgentOps}
                    canUndoOps={Boolean(agentUndoSnapshot)}
                    onUndoOps={undoAgentOps}
                    onPasteImage={pasteAssistantImage}
                    agentMode={agentMode}
                    onAgentModeChange={setAgentMode}
                    closing={assistantClosing}
                    onCollapse={closeAgent}
                />
            ) : null}
        </main>
    );
}

function stopCanvasPanelInteraction(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    event.stopPropagation();
}

function ScriptDeskPanel({
    node,
    theme,
    onChange,
    onCreateStoryboard,
    onCreateNarration,
    onCreateVideo,
    onClose,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onCreateStoryboard: () => void;
    onCreateNarration: () => void;
    onCreateVideo: () => void;
    onClose: () => void;
}) {
    const body = node.metadata?.scriptBody ?? node.metadata?.content ?? DEFAULT_SCRIPT_BODY;
    const beats = node.metadata?.scriptBeats?.length ? node.metadata.scriptBeats : buildScriptBeats(body);
    const fieldStyle = { background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text };
    const updateBody = (scriptBody: string) => onChange({ scriptBody, content: scriptBody, status: scriptBody.trim() ? NODE_STATUS_SUCCESS : NODE_STATUS_IDLE });

    return (
        <div
            className="nodrag nopan pointer-events-auto w-[720px] max-w-[calc(100vw-32px)] rounded-2xl border p-4 shadow-[0_18px_48px_rgba(0,0,0,.34)] backdrop-blur-xl"
            style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            data-canvas-no-zoom
        >
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">脚本</div>
                    <div className="mt-1 text-xs opacity-55">编辑剧本正文，并生成分镜、旁白或视频节点</div>
                </div>
                <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/10" onClick={onClose} aria-label="关闭脚本">
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid grid-cols-[1fr_220px] gap-4">
                <div className="min-w-0 space-y-3">
                    <DirectorInput label="标题" value={node.metadata?.scriptTitle || node.title || ""} placeholder="短片标题 / 分镜脚本名" onChange={(scriptTitle) => onChange({ scriptTitle })} style={fieldStyle} />
                    <DirectorInput label="一句话梗概" value={node.metadata?.scriptLogline || ""} placeholder="角色、目标、冲突和转折" onChange={(scriptLogline) => onChange({ scriptLogline })} style={fieldStyle} />
                    <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
                        <span className="mb-1 block text-xs opacity-55">脚本正文</span>
                        <textarea
                            className="thin-scrollbar h-56 w-full resize-none rounded-lg border px-3 py-2 text-sm leading-6 outline-none placeholder:opacity-35"
                            value={body}
                            placeholder="按幕、段落或镜头写下脚本内容"
                            onChange={(event) => updateBody(event.target.value)}
                            style={fieldStyle}
                        />
                    </label>
                </div>
                <div className="min-w-0 rounded-xl border p-3" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    <div className="mb-2 text-xs font-medium opacity-65">分镜预览</div>
                    <div className="thin-scrollbar max-h-[312px] space-y-2 overflow-y-auto pr-1">
                        {beats.map((beat, index) => (
                            <div key={beat.id} className="rounded-lg border p-2" style={{ borderColor: theme.toolbar.border }}>
                                <div className="text-xs font-medium">
                                    {index + 1}. {beat.title}
                                </div>
                                <div className="mt-1 line-clamp-3 text-xs leading-5 opacity-55">{beat.content}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button onClick={onCreateStoryboard} disabled={!body.trim()}>
                    拆成分镜
                </Button>
                <Button onClick={onCreateNarration} disabled={!body.trim()}>
                    生成旁白节点
                </Button>
                <Button type="primary" onClick={onCreateVideo} disabled={!body.trim()}>
                    脚本生视频
                </Button>
            </div>
        </div>
    );
}

type DirectorAspectLabel = "16:9" | "9:16" | "1:1" | "4:3" | "2.39:1";

const ASPECT_PRESETS: Array<{ label: DirectorAspectLabel; value: number }> = [
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "2.39:1", value: 2.39 },
];

function DirectorStudioOverlay({
    node,
    theme,
    onChange,
    onCapture,
    onSendToCanvas,
    onClose,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onCapture: (cameraId: string) => void;
    onSendToCanvas: () => void;
    onClose: () => void;
}) {
    const shots = node.metadata?.directorShots?.length ? node.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS;
    const captures = node.metadata?.directorCaptures || [];
    const [viewMode, setViewMode] = useState<"director" | "camera">("director");
    const [rightTab, setRightTab] = useState<"props" | "captures">("props");
    const [activeCameraId, setActiveCameraId] = useState(shots[0]?.id || DEFAULT_DIRECTOR_SHOTS[0].id);
    const [selectedObject, setSelectedObject] = useState<"scene" | "camera" | "character" | "prop">("scene");
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>(node.metadata?.directorCharacters?.[0]?.id || DEFAULT_DIRECTOR_CHARACTERS[0].id);
    const [aspectLabel, setAspectLabel] = useState<DirectorAspectLabel>(node.metadata?.directorSceneSettings?.aspectRatio || "16:9");
    const [panoramaEnabled, setPanoramaEnabled] = useState<boolean>(Boolean(node.metadata?.directorSceneSettings?.panoramaVisible));
    const [resetSignal, setResetSignal] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeShot = shots.find((shot) => shot.id === activeCameraId) || shots[0] || DEFAULT_DIRECTOR_SHOTS[0];
    const activeCameraIndex = Math.max(
        0,
        shots.findIndex((shot) => shot.id === activeCameraId),
    );
    const sceneSettings = node.metadata?.directorSceneSettings || DEFAULT_DIRECTOR_SCENE_SETTINGS;
    const characters = node.metadata?.directorCharacters?.length ? node.metadata.directorCharacters : DEFAULT_DIRECTOR_CHARACTERS;
    const selectedCharacter = characters.find((item) => item.id === selectedCharacterId) || characters[0];
    const panoramaUrl = node.metadata?.directorSceneSettings?.panoramaUrl;
    const aspectValue = ASPECT_PRESETS.find((item) => item.label === aspectLabel)?.value ?? 16 / 9;
    const fieldStyle = { background: "#343434", borderColor: "rgba(255,255,255,.08)", color: theme.node.text };

    const selectScene = () => {
        setViewMode("director");
        setSelectedObject("scene");
    };
    const selectCamera = (id = activeCameraId) => {
        setActiveCameraId(id);
        setSelectedObject("camera");
        setRightTab("props");
    };
    const selectCharacter = (id: string) => {
        setSelectedCharacterId(id);
        setSelectedObject("character");
    };
    const updateActiveShot = (patch: Partial<(typeof shots)[number]>) => {
        onChange({ directorShots: shots.map((shot) => (shot.id === activeCameraId ? { ...shot, ...patch } : shot)) });
    };
    const updateSceneSettings = (patch: Partial<typeof sceneSettings>) => {
        onChange({ directorSceneSettings: { ...sceneSettings, ...patch } });
    };
    const updateCharacter = (id: string, patch: Partial<DirectorCharacterData>) => {
        onChange({ directorCharacters: characters.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
    };
    const addCharacter = () => {
        const next = makeDirectorCharacter(characters.length);
        onChange({ directorCharacters: [...characters, next] });
        selectCharacter(next.id);
    };
    const removeCharacter = (id: string) => {
        const nextCharacters = characters.filter((item) => item.id !== id);
        onChange({ directorCharacters: nextCharacters });
        if (selectedCharacterId === id) setSelectedCharacterId(nextCharacters[0]?.id || "");
    };
    const props = node.metadata?.directorPropItems || [];
    const [selectedPropId, setSelectedPropId] = useState<string>("");
    const selectedProp = props.find((item) => item.id === selectedPropId);
    const updateProp = (id: string, patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]>) => {
        onChange({ directorPropItems: props.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
    };
    const addProp = (shape: "box" | "sphere" | "cylinder" | "cone" | "plane") => {
        const labels: Record<string, string> = { box: "立方体", sphere: "球体", cylinder: "圆柱", cone: "圆锥", plane: "平面" };
        const next = { id: `prop-${Date.now()}`, name: labels[shape], shape, position: { x: 0, y: 0.5, z: 0 }, rotation: 0, scale: 1, color: "#8a8a8a", visible: true };
        onChange({ directorPropItems: [...props, next] });
        setSelectedPropId(next.id);
        setSelectedObject("prop");
    };
    const removeProp = (id: string) => {
        onChange({ directorPropItems: props.filter((item) => item.id !== id) });
        if (selectedPropId === id) setSelectedPropId("");
    };
    const selectProp = (id: string) => {
        setSelectedPropId(id);
        setSelectedObject("prop");
    };
    const addCamera = () => {
        const index = shots.length + 1;
        const id = `camera-${Date.now()}`;
        onChange({
            directorShots: [
                ...shots,
                {
                    id,
                    name: `机位${index}`,
                    camera: index % 2 ? "35mm 标准镜头 / 平视横移" : "85mm 长焦 / 轻微手持",
                    prompt: "捕捉角色动作、表情和空间关系",
                    fov: index % 2 ? 50 : 42,
                    position: { x: (index - 1) * 2, y: 2.2, z: 10 - index },
                    target: { x: 0, y: 1.2, z: 0 },
                    targetMode: "manual",
                    visible: true,
                    locked: false,
                },
            ],
        });
        selectCamera(id);
    };
    const captureActiveCamera = () => {
        setSelectedObject("camera");
        setRightTab("captures");
        onCapture(activeCameraId);
    };
    const resetView = () => {
        onChange({
            directorShots: shots.map((shot) => (shot.id === activeCameraId ? { ...shot, position: { x: 0, y: 2.2, z: 10 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 } : shot)),
        });
        setResetSignal((v) => v + 1);
    };
    const cycleAspect = () => {
        const index = ASPECT_PRESETS.findIndex((item) => item.label === aspectLabel);
        const next = ASPECT_PRESETS[(index + 1) % ASPECT_PRESETS.length];
        setAspectLabel(next.label);
        onChange({ directorSceneSettings: { ...sceneSettings, aspectRatio: next.label } });
    };
    const togglePanorama = () => {
        if (!panoramaEnabled && !panoramaUrl) {
            message.info("请先点击「导入」加载一张全景图");
            return;
        }
        const next = !panoramaEnabled;
        setPanoramaEnabled(next);
        onChange({ directorSceneSettings: { ...sceneSettings, panoramaVisible: next } });
    };
    const onImportPanorama = (event: ReactChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result);
            onChange({ directorSceneSettings: { ...sceneSettings, panoramaUrl: url, panoramaVisible: true } });
            setPanoramaEnabled(true);
        };
        reader.readAsDataURL(file);
        event.target.value = "";
    };
    const toggleFullscreen = (event: ReactMouseEvent<HTMLButtonElement>) => {
        const el = event.currentTarget.closest(".fixed.inset-0") as HTMLElement | null;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen?.();
    };
    const aiRecognize = () => message.info("AI 识图需要接入 AI 服务，将在后续版本上线");
    const showHelp = () => message.info("拖动角色或机位调整构图；选中角色后拖拽关节手柄调整姿势；多机位截图可回画布作为生图参考。");

    return (
        <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#0b0b0b] text-white" data-canvas-no-zoom>
            <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#1f1f1f] px-6">
                <div className="text-base font-semibold">3D导演台</div>
                <div className="absolute left-1/2 top-3 flex -translate-x-1/2 rounded-2xl border border-white/10 bg-black/35 p-1">
                    <button type="button" className={`h-8 rounded-xl px-4 text-sm ${viewMode === "director" ? "bg-white/12" : "text-white/60"}`} onClick={selectScene}>
                        导演视角
                    </button>
                    <button
                        type="button"
                        className={`h-8 rounded-xl px-4 text-sm ${viewMode === "camera" ? "bg-white/12" : "text-white/60"}`}
                        onClick={() => {
                            setViewMode("camera");
                            selectCamera();
                        }}
                    >
                        机位视角
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white" title="帮助" onClick={showHelp}>
                        ?
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="关闭导演台">
                        <X className="size-5" />
                    </button>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_280px]">
                <aside className="border-r border-white/10 bg-[#202020] p-3">
                    <div className="mb-5 text-sm font-semibold">场景</div>
                    <label className="mb-5 flex h-8 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs text-white/50">
                        <span className="grow">请输入搜索内容</span>
                        <Search className="size-4" />
                    </label>
                    <div className="space-y-1">
                        {shots.map((shot, index) => (
                            <div key={shot.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm ${activeCameraId === shot.id && selectedObject === "camera" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}>
                                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => selectCamera(shot.id)}>
                                    <Video className="size-3.5 shrink-0" />
                                    <span className="truncate">{shot.name || `机位${index + 1}`}</span>
                                </button>
                                <button
                                    type="button"
                                    className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                                    title={shot.visible === false ? "显示" : "隐藏"}
                                    onClick={() => onChange({ directorShots: shots.map((item) => (item.id === shot.id ? { ...item, visible: item.visible === false } : item)) })}
                                >
                                    {shot.visible === false ? "隐" : "显"}
                                </button>
                                <button
                                    type="button"
                                    className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                                    title={shot.locked ? "解锁" : "锁定"}
                                    onClick={() => onChange({ directorShots: shots.map((item) => (item.id === shot.id ? { ...item, locked: !item.locked } : item)) })}
                                >
                                    {shot.locked ? "锁" : "开"}
                                </button>
                            </div>
                        ))}
                        <div className="mt-2 text-[11px] uppercase tracking-wide text-white/35">角色</div>
                        {characters.map((char) => (
                            <div key={char.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm ${selectedCharacterId === char.id && selectedObject === "character" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}>
                                <span className="size-3 shrink-0 rounded-full" style={{ background: char.color }} />
                                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => selectCharacter(char.id)}>
                                    <span className="truncate">{char.name}</span>
                                </button>
                                <button
                                    type="button"
                                    className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                                    title={char.visible === false ? "显示" : "隐藏"}
                                    onClick={() => updateCharacter(char.id, { visible: char.visible === false })}
                                >
                                    {char.visible === false ? "隐" : "显"}
                                </button>
                                <button
                                    type="button"
                                    className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white"
                                    title={char.locked ? "解锁" : "锁定"}
                                    onClick={() => updateCharacter(char.id, { locked: !char.locked })}
                                >
                                    {char.locked ? "锁" : "开"}
                                </button>
                                <button type="button" className="grid size-5 place-items-center rounded text-[11px] text-white/50 transition hover:bg-white/10 hover:text-white" title="删除角色" onClick={() => removeCharacter(char.id)}>
                                    ×
                                </button>
                            </div>
                        ))}
                        <button type="button" className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white" onClick={addCharacter}>
                            <span className="grid size-3.5 place-items-center text-[14px] leading-none">+</span>
                            <span>添加角色</span>
                        </button>
                        <div className="mt-2 text-[11px] uppercase tracking-wide text-white/35">道具</div>
                        {props.map((prop) => (
                            <div key={prop.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm ${selectedPropId === prop.id && selectedObject === "prop" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}>
                                <span className="size-3 shrink-0 rounded" style={{ background: prop.color }} />
                                <button type="button" className="flex min-w-0 flex-1 text-left" onClick={() => selectProp(prop.id)}>
                                    <span className="truncate">{prop.name}</span>
                                </button>
                                <button type="button" className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white" title="删除" onClick={() => removeProp(prop.id)}>
                                    ×
                                </button>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-1">
                            {[
                                ["box", "立方体"],
                                ["sphere", "球体"],
                                ["cylinder", "圆柱"],
                                ["cone", "圆锥"],
                                ["plane", "平面"],
                            ].map(([shape, label]) => (
                                <button key={shape} type="button" className="rounded bg-white/8 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/15" onClick={() => addProp(shape as "box" | "sphere" | "cylinder" | "cone" | "plane")}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                <main className="relative min-w-0 overflow-hidden bg-[#050505]">
                    <DirectorThreeStage
                        scene={sceneSettings}
                        characters={characters}
                        selectedCharacterId={selectedCharacterId}
                        onCharacterChange={updateCharacter}
                        onSelectCharacterId={selectCharacter}
                        activeShot={activeShot}
                        selectedObject={selectedObject}
                        viewMode={viewMode}
                        onSelectObject={setSelectedObject}
                        onActiveShotChange={updateActiveShot}
                        resetSignal={resetSignal}
                        props={props}
                        selectedPropId={selectedPropId}
                        onPropChange={updateProp}
                        onSelectPropId={selectProp}
                    />
                    <div className="absolute right-5 top-4 z-10 flex flex-col items-center gap-2">
                        <div className="relative size-20 rounded-full bg-[#151922] shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
                            <span className="absolute left-1/2 top-2 size-2 -translate-x-1/2 rounded-full bg-cyan-400" />
                            <span className="absolute bottom-2 left-1/2 size-2 -translate-x-1/2 rounded-full bg-white/20" />
                            <span className="absolute left-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/20" />
                            <span className="absolute right-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-rose-400" />
                            <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-blue-400" />
                            <span className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-blue-400" />
                        </div>
                        <button type="button" className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/75" onClick={resetView}>
                            重置视角
                        </button>
                    </div>
                    <div className="absolute bottom-5 left-1/2 flex h-14 -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#202020]/95 px-3 shadow-2xl">
                        {[
                            { label: "移动 (V)", icon: "↖" },
                            { label: "添加角色", icon: "人" },
                            { label: "全景图", icon: "720" },
                            { label: "添加机位", icon: "▣" },
                            { label: "选择画幅比例", icon: "▭" },
                            { label: "截图", icon: "◎" },
                            { label: "AI 识图", icon: "识" },
                            { label: "导入", icon: "入" },
                            { label: "全屏", icon: "⛶" },
                        ].map(({ label, icon }) => (
                            <button
                                key={label}
                                type="button"
                                className="grid size-9 place-items-center rounded-lg text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                                title={label}
                                onClick={(event) => {
                                    switch (label) {
                                        case "移动 (V)":
                                            selectScene();
                                            break;
                                        case "添加角色":
                                            addCharacter();
                                            break;
                                        case "全景图":
                                            togglePanorama();
                                            break;
                                        case "添加机位":
                                            addCamera();
                                            break;
                                        case "选择画幅比例":
                                            cycleAspect();
                                            break;
                                        case "截图":
                                            captureActiveCamera();
                                            break;
                                        case "AI 识图":
                                            aiRecognize();
                                            break;
                                        case "导入":
                                            fileInputRef.current?.click();
                                            break;
                                        case "全屏":
                                            toggleFullscreen(event);
                                            break;
                                    }
                                }}
                            >
                                {icon}
                            </button>
                        ))}
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImportPanorama} />
                    </div>
                </main>

                <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#202020]">
                    <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-5 text-base font-semibold">
                        {selectedObject === "camera" ? "摄像机" : selectedObject === "character" ? "角色" : selectedObject === "prop" ? "道具" : "3D场景"}
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                        {selectedObject === "camera" ? (
                            <>
                                <div className="border-b border-white/10 px-4 py-3">
                                    <div className="flex rounded-lg bg-white/5 p-1">
                                        <button type="button" className={`h-8 rounded-md px-3 text-sm ${rightTab === "props" ? "bg-white/12" : "text-white/55"}`} onClick={() => setRightTab("props")}>
                                            属性
                                        </button>
                                        <button type="button" className={`h-8 rounded-md px-3 text-sm ${rightTab === "captures" ? "bg-white/12" : "text-white/55"}`} onClick={() => setRightTab("captures")}>
                                            摄像机截图
                                        </button>
                                    </div>
                                </div>
                                {rightTab === "props" ? (
                                    <DirectorCameraPanel activeShot={activeShot} activeCameraIndex={activeCameraIndex} fieldStyle={fieldStyle} onChange={updateActiveShot} />
                                ) : (
                                    <DirectorCapturesPanel captures={captures} onClear={() => onChange({ directorCaptures: [] })} onSendToCanvas={onSendToCanvas} />
                                )}
                            </>
                        ) : selectedObject === "prop" ? (
                            selectedProp ? (
                                <div className="space-y-4 p-4">
                                    <DirectorInput label="名称" value={selectedProp.name} placeholder="道具名称" onChange={(name) => updateProp(selectedProp.id, { name })} style={fieldStyle} />
                                    <DirectorPanelBlock title="位置">
                                        <DirectorVectorEditor value={selectedProp.position} onChange={(position) => updateProp(selectedProp.id, { position })} />
                                    </DirectorPanelBlock>
                                    <DirectorPanelBlock title="形状">
                                        <select
                                            value={selectedProp.shape}
                                            onChange={(event) => updateProp(selectedProp.id, { shape: event.target.value as "box" | "sphere" | "cylinder" | "cone" | "plane" })}
                                            className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white/80 outline-none"
                                        >
                                            {(["box", "sphere", "cylinder", "cone", "plane"] as const).map((sh) => (
                                                <option key={sh} value={sh}>
                                                    {{ box: "立方体", sphere: "球体", cylinder: "圆柱", cone: "圆锥", plane: "平面" }[sh]}
                                                </option>
                                            ))}
                                        </select>
                                    </DirectorPanelBlock>
                                    <div className="flex items-center gap-3">
                                        <input type="color" value={selectedProp.color} className="size-7 border-0 bg-transparent p-0" onChange={(event) => updateProp(selectedProp.id, { color: event.target.value })} />
                                        <DirectorRange label="缩放" value={selectedProp.scale} min={0.2} max={5} step={0.1} digits={1} onChange={(scale) => updateProp(selectedProp.id, { scale })} />
                                    </div>
                                    <DirectorRange label="旋转" value={selectedProp.rotation} min={-180} max={180} digits={0} onChange={(rotation) => updateProp(selectedProp.id, { rotation })} />
                                    <DirectorSwitchRow label="显示" checked={selectedProp.visible} onChange={(visible) => updateProp(selectedProp.id, { visible })} />
                                </div>
                            ) : (
                                <div className="p-5 text-sm text-white/50">先添加道具，再编辑其属性</div>
                            )
                        ) : selectedObject === "character" ? (
                            selectedCharacter ? (
                                <DirectorCharacterPanel character={selectedCharacter} fieldStyle={fieldStyle} onChange={(patch) => updateCharacter(selectedCharacter.id, patch)} />
                            ) : (
                                <div className="p-5 text-sm text-white/50">先添加角色，再编辑其属性</div>
                            )
                        ) : (
                            <DirectorScenePanel scene={sceneSettings} onChange={updateSceneSettings} />
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}

function DirectorScenePanel({ scene, onChange }: { scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>; onChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorSceneSettings"]>>) => void }) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <DirectorRange label="场景缩放" value={scene.scale} min={80} max={500} suffix="%" onChange={(scale) => onChange({ scale })} />
            <DirectorPanelBlock title="场景平移">
                <DirectorVectorEditor value={scene.translate} onChange={(translate) => onChange({ translate })} />
            </DirectorPanelBlock>
            <DirectorPanelBlock title="场景旋转">
                <DirectorVectorEditor value={scene.rotate} onChange={(rotate) => onChange({ rotate })} />
            </DirectorPanelBlock>
            <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="text-sm font-semibold">全景背景</div>
                <div className="text-xs text-white/45">已连接全景图</div>
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-white/45">请将图片节点连接到导演台左侧输入口</div>
                <div>
                    <div className="mb-2 text-xs text-white/55">天空颜色</div>
                    <div className="flex h-8 items-center gap-2 rounded-lg bg-white/10 px-2">
                        <input type="color" value={scene.skyColor} className="size-5 border-0 bg-transparent p-0" onChange={(event) => onChange({ skyColor: event.target.value })} />
                        <input value={scene.skyColor} className="min-w-0 flex-1 bg-transparent text-sm text-white/75 outline-none" onChange={(event) => onChange({ skyColor: event.target.value })} />
                    </div>
                </div>
            </div>
            <div className="space-y-4 border-t border-white/10 pt-4">
                <div className="text-sm font-semibold">全景球</div>
                <DirectorRange label="水平旋转" value={scene.panoramaRotation} min={-180} max={180} suffix="°" onChange={(panoramaRotation) => onChange({ panoramaRotation })} />
                <DirectorRange label="球形半径" value={scene.panoramaRadius} min={10} max={160} onChange={(panoramaRadius) => onChange({ panoramaRadius })} />
            </div>
            <DirectorSwitchRow label="角色标签" checked={scene.characterLabels} onChange={(characterLabels) => onChange({ characterLabels })} />
            <DirectorSwitchRow label="网格吸附" checked={scene.gridSnap} onChange={(gridSnap) => onChange({ gridSnap })} />
            <div className="space-y-4 border-t border-white/10 pt-4">
                <DirectorSwitchRow label="地面" checked={scene.groundVisible} compact onChange={(groundVisible) => onChange({ groundVisible })} />
                <DirectorRange label="透明度" value={scene.groundOpacity} min={0} max={1} step={0.01} digits={2} onChange={(groundOpacity) => onChange({ groundOpacity })} />
                <DirectorRange label="高度" value={scene.groundHeight} min={-10} max={10} step={0.1} digits={1} onChange={(groundHeight) => onChange({ groundHeight })} />
            </div>
        </div>
    );
}

function DirectorCameraPanel({
    activeShot,
    activeCameraIndex,
    fieldStyle,
    onChange,
}: {
    activeShot: NonNullable<CanvasNodeMetadata["directorShots"]>[number];
    activeCameraIndex: number;
    fieldStyle: CSSProperties;
    onChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]>) => void;
}) {
    const position = activeShot.position || { x: 0, y: 2.2 + activeCameraIndex, z: 10 };
    const target = activeShot.target || { x: 0, y: 1.2, z: 0 };
    const fov = activeShot.fov ?? 50;
    return (
        <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#11161c]" />
                <div className="absolute left-1/2 top-1/2 h-10 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4f8ef7]" />
                <div className="absolute left-3 top-3 text-xs text-white/70">FOV {fov}°</div>
                <button type="button" className="absolute bottom-3 right-3 grid size-7 place-items-center rounded-md bg-white/10 text-xs text-white/70">
                    ↗
                </button>
            </div>
            <DirectorInput label="名称" value={activeShot.name} placeholder="机位名称" onChange={(name) => onChange({ name })} style={fieldStyle} />
            <DirectorInput label="镜头说明" value={activeShot.camera} placeholder="镜头说明" onChange={(camera) => onChange({ camera })} style={fieldStyle} />
            <DirectorPanelBlock title="位置">
                <DirectorVectorEditor value={position} onChange={(next) => onChange({ position: next })} />
            </DirectorPanelBlock>
            <DirectorInput label="注视目标" value={activeShot.targetMode === "character" ? "角色A" : "手动坐标"} placeholder="注视目标" onChange={(value) => onChange({ targetMode: value.includes("角色") ? "character" : "manual" })} style={fieldStyle} />
            <DirectorPanelBlock title="注视坐标">
                <DirectorVectorEditor value={target} onChange={(next) => onChange({ target: next })} />
            </DirectorPanelBlock>
            <DirectorRange label="视野角度 (FOV)" value={fov} min={20} max={90} digits={1} onChange={(next) => onChange({ fov: next })} />
            <DirectorInput label="截图提示词" value={activeShot.prompt} placeholder="这个机位要捕捉什么" onChange={(prompt) => onChange({ prompt })} style={fieldStyle} />
            <DirectorSwitchRow label="显示机位" checked={activeShot.visible !== false} onChange={(visible) => onChange({ visible })} />
            <DirectorSwitchRow label="锁定机位" checked={Boolean(activeShot.locked)} onChange={(locked) => onChange({ locked })} />
            <div className="border-t border-white/10 pt-4">
                <div className="text-sm font-semibold">相机截图</div>
            </div>
        </div>
    );
}

function DirectorCapturesPanel({ captures, onClear, onSendToCanvas }: { captures: NonNullable<CanvasNodeMetadata["directorCaptures"]>; onClear: () => void; onSendToCanvas: () => void }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                {captures.length ? (
                    <div className="grid gap-4">
                        {captures.map((capture) => (
                            <button key={capture.id} type="button" className="w-full text-left">
                                <img src={capture.dataUrl} alt={capture.name} className="aspect-video w-24 rounded bg-black object-cover" />
                                <div className="mt-1 text-xs text-white/60">{capture.name}</div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid h-full place-items-center text-sm text-white/45">暂无摄像机截图</div>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
                <Button onClick={onClear} disabled={!captures.length}>
                    全部清空
                </Button>
                <Button type="primary" onClick={onSendToCanvas} disabled={!captures.length}>
                    发送到画布
                </Button>
            </div>
        </div>
    );
}

function DirectorCharacterPanel({ character, fieldStyle, onChange }: { character: DirectorCharacterData; fieldStyle: CSSProperties; onChange: (patch: Partial<DirectorCharacterData>) => void }) {
    const pose = character.pose || DEFAULT_DIRECTOR_POSE;
    const updatePose = (patch: Partial<typeof pose>) => onChange({ pose: { ...pose, ...patch } });
    return (
        <div className="space-y-4 p-4">
            <div className="flex rounded-lg bg-white/5 p-1">
                <button className="h-8 rounded-md bg-white/12 px-3 text-sm" type="button">
                    属性
                </button>
                <button className="h-8 rounded-md px-3 text-sm text-white/55" type="button">
                    姿势
                </button>
            </div>
            <DirectorInput label="名称" value={character.name} placeholder="角色名称" onChange={(name) => onChange({ name })} style={fieldStyle} />
            <DirectorPanelBlock title="位置">
                <DirectorVectorEditor value={character.position} onChange={(position) => onChange({ position })} />
            </DirectorPanelBlock>
            <div className="flex items-center gap-3">
                <input type="color" value={character.color} className="size-7 border-0 bg-transparent p-0" onChange={(event) => onChange({ color: event.target.value })} />
                <input value={character.color} className="min-w-0 rounded bg-white/10 px-3 py-1.5 text-sm outline-none" onChange={(event) => onChange({ color: event.target.value })} />
                <DirectorPanelBlock title="体型">
                    <select value={character.type || "male"} onChange={(event) => onChange({ type: event.target.value as DirectorCharacterData["type"] })} className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white/80 outline-none">
                        {(["male", "female", "child", "tall", "short", "heavy", "slim"] as const).map((t) => (
                            <option key={t} value={t}>
                                {DIRECTOR_TYPE_LABELS[t]}
                            </option>
                        ))}
                    </select>
                </DirectorPanelBlock>
                <DirectorRange label="体型缩放" value={character.scale ?? 1} min={0.5} max={2} step={0.05} digits={2} onChange={(scale) => onChange({ scale })} />
            </div>
            <DirectorSwitchRow label="显示角色" checked={character.visible} onChange={(visible) => onChange({ visible })} />
            <DirectorSwitchRow label="锁定角色" checked={character.locked} onChange={(locked) => onChange({ locked })} />
            <div className="space-y-3 border-t border-white/10 pt-4">
                <div className="text-sm font-semibold">预设姿势</div>
                <div className="grid grid-cols-4 gap-1.5">
                    {DIRECTOR_POSE_PRESETS.map((p) => (
                        <button key={p.id} type="button" className="rounded bg-white/8 px-1 py-1.5 text-xs text-white/70 transition hover:bg-white/18" onClick={() => onChange({ pose: { ...DEFAULT_DIRECTOR_POSE, ...p.pose } })}>
                            {p.name}
                        </button>
                    ))}
                </div>
                <div className="text-sm font-semibold pt-2">头部</div>
                <DirectorRange label="左右转头" value={pose.headYaw} min={-60} max={60} digits={1} onChange={(headYaw) => updatePose({ headYaw })} />
                <DirectorRange label="上下点头" value={pose.headPitch} min={-45} max={45} digits={1} onChange={(headPitch) => updatePose({ headPitch })} />
                <DirectorRange label="歪头" value={pose.headRoll} min={-30} max={30} digits={1} onChange={(headRoll) => updatePose({ headRoll })} />
                <div className="text-sm font-semibold pt-2">躯干</div>
                <DirectorRange label="转身" value={pose.torsoTwist} min={-60} max={60} digits={1} onChange={(torsoTwist) => updatePose({ torsoTwist })} />
                <DirectorRange label="前倾后仰" value={pose.torsoLean} min={-45} max={45} digits={1} onChange={(torsoLean) => updatePose({ torsoLean })} />
                <DirectorRange label="侧弯" value={pose.torsoBend} min={-30} max={30} digits={1} onChange={(torsoBend) => updatePose({ torsoBend })} />
                <div className="text-sm font-semibold pt-2">左臂</div>
                <DirectorRange label="外展" value={pose.leftArm} min={-30} max={120} digits={1} onChange={(leftArm) => updatePose({ leftArm })} />
                <DirectorRange label="前举" value={pose.leftArmFwd} min={-45} max={120} digits={1} onChange={(leftArmFwd) => updatePose({ leftArmFwd })} />
                <DirectorRange label="肘弯曲" value={pose.leftElbow} min={-120} max={0} digits={1} onChange={(leftElbow) => updatePose({ leftElbow })} />
                <div className="text-sm font-semibold pt-2">右臂</div>
                <DirectorRange label="外展" value={pose.rightArm} min={-30} max={120} digits={1} onChange={(rightArm) => updatePose({ rightArm })} />
                <DirectorRange label="前举" value={pose.rightArmFwd} min={-45} max={120} digits={1} onChange={(rightArmFwd) => updatePose({ rightArmFwd })} />
                <DirectorRange label="肘弯曲" value={pose.rightElbow} min={-120} max={0} digits={1} onChange={(rightElbow) => updatePose({ rightElbow })} />
                <div className="text-sm font-semibold pt-2">左腿</div>
                <DirectorRange label="前抬后伸" value={pose.leftLeg} min={-45} max={90} digits={1} onChange={(leftLeg) => updatePose({ leftLeg })} />
                <DirectorRange label="外展" value={pose.leftHipSpread} min={-30} max={45} digits={1} onChange={(leftHipSpread) => updatePose({ leftHipSpread })} />
                <DirectorRange label="膝弯曲" value={pose.leftKnee} min={0} max={120} digits={1} onChange={(leftKnee) => updatePose({ leftKnee })} />
                <div className="text-sm font-semibold pt-2">右腿</div>
                <DirectorRange label="前抬后伸" value={pose.rightLeg} min={-45} max={90} digits={1} onChange={(rightLeg) => updatePose({ rightLeg })} />
                <DirectorRange label="外展" value={pose.rightHipSpread} min={-30} max={45} digits={1} onChange={(rightHipSpread) => updatePose({ rightHipSpread })} />
                <DirectorRange label="膝弯曲" value={pose.rightKnee} min={0} max={120} digits={1} onChange={(rightKnee) => updatePose({ rightKnee })} />
            </div>
        </div>
    );
}

function DirectorPanelBlock({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <div className="mb-2 text-xs text-white/55">{title}</div>
            {children}
        </div>
    );
}

function DirectorAxisTriplet({ values }: { values: string[] }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {values.map((value) => (
                <div key={value} className="h-8 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/75">
                    {value}
                </div>
            ))}
        </div>
    );
}

function DirectorVectorEditor({ value, onChange }: { value: { x: number; y: number; z: number }; onChange: (value: { x: number; y: number; z: number }) => void }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
                <label key={axis} className="flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2 text-sm text-white/75">
                    <span className="uppercase text-white/35">{axis}</span>
                    <input type="number" step="0.1" value={value[axis]} className="min-w-0 flex-1 bg-transparent text-white outline-none" onChange={(event) => onChange({ ...value, [axis]: Number(event.target.value) || 0 })} />
                </label>
            ))}
        </div>
    );
}

function DirectorRange({
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    suffix = "",
    digits = 0,
    onChange,
}: {
    label: string;
    value: number | string;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    digits?: number;
    onChange?: (value: number) => void;
}) {
    const numericValue = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, "")) || 0;
    const displayValue = `${numericValue.toFixed(digits)}${suffix}`;
    return (
        <div>
            <div className="mb-2 text-xs text-white/55">{label}</div>
            <div className="flex items-center gap-3">
                <input type="range" min={min} max={max} step={step} value={numericValue} className="min-w-0 flex-1 accent-cyan-400" onChange={(event) => onChange?.(Number(event.target.value))} />
                <input
                    type="text"
                    value={displayValue}
                    className="h-8 w-16 rounded-lg bg-white/10 px-2 text-center text-sm text-white/75 outline-none"
                    onChange={(event) => {
                        const next = Number(event.target.value.replace(/[^\d.-]/g, ""));
                        if (!Number.isNaN(next)) onChange?.(next);
                    }}
                />
            </div>
        </div>
    );
}

function DirectorSwitchRow({ label, checked, compact, onChange }: { label: string; checked?: boolean; compact?: boolean; onChange?: (checked: boolean) => void }) {
    return (
        <button type="button" className={`flex w-full items-center justify-between text-left ${compact ? "" : "border-t border-white/10 pt-4"}`} onClick={() => onChange?.(!checked)}>
            <span className="text-sm font-semibold">{label}</span>
            <span className={`relative h-5 w-9 rounded-full ${checked ? "bg-white" : "bg-white/15"}`}>
                <span className={`absolute top-1 size-3 rounded-full ${checked ? "right-1 bg-[#202020]" : "left-1 bg-white/55"}`} />
            </span>
        </button>
    );
}

function LegacyDirectorStudioOverlay({
    node,
    theme,
    onChange,
    onCapture,
    onSendToCanvas,
    onClose,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onCapture: (cameraId: string) => void;
    onSendToCanvas: () => void;
    onClose: () => void;
}) {
    const shots = node.metadata?.directorShots?.length ? node.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS;
    const captures = node.metadata?.directorCaptures || [];
    const [viewMode, setViewMode] = useState<"director" | "camera">("director");
    const [rightTab, setRightTab] = useState<"props" | "captures">("props");
    const [activeCameraId, setActiveCameraId] = useState(shots[0]?.id || DEFAULT_DIRECTOR_SHOTS[0].id);
    const [selectedObject, setSelectedObject] = useState<"camera" | "character" | "scene">("camera");
    const activeShot = shots.find((shot) => shot.id === activeCameraId) || shots[0] || DEFAULT_DIRECTOR_SHOTS[0];
    const activeCameraIndex = Math.max(
        0,
        shots.findIndex((shot) => shot.id === activeCameraId),
    );
    const fieldStyle = { background: "#343434", borderColor: "rgba(255,255,255,.08)", color: theme.node.text };

    const updateActiveShot = (patch: Partial<(typeof shots)[number]>) => {
        onChange({ directorShots: shots.map((shot) => (shot.id === activeCameraId ? { ...shot, ...patch } : shot)) });
    };
    const addCamera = () => {
        const index = shots.length + 1;
        const id = `camera-${Date.now()}`;
        onChange({
            directorShots: [
                ...shots,
                {
                    id,
                    name: `机位${index}`,
                    camera: index % 2 ? "35mm 标准镜头 / 平视横移" : "85mm 长焦 / 轻微手持",
                    prompt: "捕捉角色动作、表情和空间关系",
                },
            ],
        });
        setActiveCameraId(id);
        setSelectedObject("camera");
    };
    const clearCaptures = () => onChange({ directorCaptures: [] });
    const captureActiveCamera = () => {
        setRightTab("captures");
        onCapture(activeCameraId);
    };

    return (
        <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#0b0b0b] text-white" data-canvas-no-zoom>
            <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#1f1f1f] px-6">
                <div className="text-base font-semibold">3D导演台</div>
                <div className="absolute left-1/2 top-3 flex -translate-x-1/2 rounded-2xl border border-white/10 bg-black/35 p-1">
                    <button type="button" className={`h-8 rounded-xl px-4 text-sm ${viewMode === "director" ? "bg-white/12" : "text-white/60"}`} onClick={() => setViewMode("director")}>
                        导演视角
                    </button>
                    <button type="button" className={`h-8 rounded-xl px-4 text-sm ${viewMode === "camera" ? "bg-white/12" : "text-white/60"}`} onClick={() => setViewMode("camera")}>
                        机位视角
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white" title="帮助">
                        ?
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="关闭导演台">
                        <X className="size-5" />
                    </button>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_280px]">
                <aside className="border-r border-white/10 bg-[#202020] p-3">
                    <div className="mb-5 text-sm font-semibold">场景</div>
                    <label className="mb-5 flex h-8 items-center gap-2 rounded-lg bg-white/10 px-3 text-xs text-white/50">
                        <span className="grow">请输入搜索内容</span>
                        <Search className="size-4" />
                    </label>
                    <div className="space-y-1">
                        {shots.map((shot, index) => (
                            <button
                                key={shot.id}
                                type="button"
                                className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm ${activeCameraId === shot.id && selectedObject === "camera" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}
                                onClick={() => {
                                    setActiveCameraId(shot.id);
                                    setSelectedObject("camera");
                                    setRightTab("props");
                                }}
                            >
                                <Video className="size-3.5" />
                                <span className="truncate">{shot.name || `机位${index + 1}`}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm ${selectedObject === "character" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}
                            onClick={() => setSelectedObject("character")}
                        >
                            <span className="grid size-3.5 place-items-center text-[11px]">人</span>
                            <span>角色A</span>
                        </button>
                    </div>
                </aside>

                <main className="relative min-w-0 overflow-hidden bg-[#050505]">
                    <div className="absolute right-5 top-4 z-10 flex flex-col items-center gap-2">
                        <div className="relative size-20 rounded-full bg-[#151922] shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
                            <span className="absolute left-1/2 top-2 size-2 -translate-x-1/2 rounded-full bg-cyan-400" />
                            <span className="absolute bottom-2 left-1/2 size-2 -translate-x-1/2 rounded-full bg-white/20" />
                            <span className="absolute left-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/20" />
                            <span className="absolute right-2 top-1/2 size-2 -translate-y-1/2 rounded-full bg-rose-400" />
                            <span className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-blue-400" />
                            <span className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-blue-400" />
                        </div>
                        <button type="button" className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/75">
                            重置视角
                        </button>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-[55%] bg-[#11161c]" />
                    <div
                        className="absolute inset-x-0 bottom-0 h-[56%] opacity-80"
                        style={{
                            backgroundImage: "linear-gradient(rgba(50,180,220,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(50,180,220,.22) 1px, transparent 1px), linear-gradient(rgba(255,80,100,.18) 1px, transparent 1px)",
                            backgroundSize: "48px 48px, 48px 48px, 240px 240px",
                            transform: "perspective(520px) rotateX(62deg) translateY(120px) scale(1.45)",
                            transformOrigin: "50% 100%",
                        }}
                    />
                    <div className="absolute left-1/2 top-[27%] h-[46%] w-[58%] -translate-x-1/2 border border-cyan-300/28" style={{ transform: "translateX(-50%) perspective(800px) rotateX(0deg) skewX(-2deg)" }} />
                    <div className="absolute left-1/2 top-[40%] h-[44%] w-px -translate-x-1/2 bg-blue-400/65" />
                    <div className="absolute left-1/2 top-[39%] flex -translate-x-1/2 flex-col items-center">
                        <div className="mb-2 rounded px-2 py-1 text-sm font-semibold text-white drop-shadow">角色A</div>
                        <div className="relative h-56 w-28">
                            <div className="absolute left-1/2 top-0 size-12 -translate-x-1/2 rounded-full bg-[#4f8ef7]" />
                            <div className="absolute left-1/2 top-12 h-20 w-14 -translate-x-1/2 rounded-3xl bg-[#4f8ef7]" />
                            <div className="absolute left-3 top-20 h-24 w-4 rounded-full bg-[#4f8ef7]" />
                            <div className="absolute right-3 top-20 h-24 w-4 rounded-full bg-[#4f8ef7]" />
                            <div className="absolute left-8 top-30 h-24 w-5 rounded-full bg-[#4f8ef7]" />
                            <div className="absolute right-8 top-30 h-24 w-5 rounded-full bg-[#4f8ef7]" />
                        </div>
                    </div>
                    {selectedObject === "character" ? (
                        <div className="absolute left-1/2 top-[67%] h-36 w-36 -translate-x-1/2 rounded-full border-4 border-blue-400/70">
                            <span className="absolute left-1/2 top-1/2 h-36 w-1 -translate-x-1/2 -translate-y-1/2 bg-green-400" />
                            <span className="absolute left-0 top-1/2 h-1 w-36 -translate-y-1/2 bg-red-500" />
                        </div>
                    ) : null}

                    <div className="absolute bottom-5 left-1/2 flex h-14 -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-[#202020]/95 px-3 shadow-2xl">
                        {[
                            ["移动 (V)", "↖"],
                            ["添加角色", "人"],
                            ["全景图", "720"],
                            ["添加机位", "▣"],
                            ["选择画幅比例", "□"],
                            ["截图", "▣"],
                            ["AI 识图", "✦"],
                            ["导入", "⇱"],
                        ].map(([label, icon]) => (
                            <button
                                key={label}
                                type="button"
                                className="grid size-9 place-items-center rounded-lg text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
                                title={label}
                                onClick={() => {
                                    if (label === "添加机位") addCamera();
                                    if (label === "截图") captureActiveCamera();
                                }}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                </main>

                <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#202020]">
                    <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-5 text-base font-semibold">{selectedObject === "camera" ? "摄像机" : selectedObject === "character" ? "角色" : "3D场景"}</div>
                    <div className="flex min-h-0 flex-1 flex-col">
                        {selectedObject === "camera" ? (
                            <>
                                <div className="border-b border-white/10 px-4 py-3">
                                    <div className="flex rounded-lg bg-white/5 p-1">
                                        <button type="button" className={`h-8 rounded-md px-3 text-sm ${rightTab === "props" ? "bg-white/12" : "text-white/55"}`} onClick={() => setRightTab("props")}>
                                            属性
                                        </button>
                                        <button type="button" className={`h-8 rounded-md px-3 text-sm ${rightTab === "captures" ? "bg-white/12" : "text-white/55"}`} onClick={() => setRightTab("captures")}>
                                            摄像机截图
                                        </button>
                                    </div>
                                </div>
                                {rightTab === "props" ? (
                                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                                        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#11161c]" />
                                            <div className="absolute left-1/2 top-1/2 h-10 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4f8ef7]" />
                                            <div className="absolute left-3 top-3 text-xs text-white/70">FOV 50°</div>
                                        </div>
                                        <DirectorInput label="名称" value={activeShot.name} placeholder="机位名称" onChange={(name) => updateActiveShot({ name })} style={fieldStyle} />
                                        <DirectorInput label="切换机位" value={activeShot.name} placeholder="机位" onChange={(name) => updateActiveShot({ name })} style={fieldStyle} />
                                        <div>
                                            <div className="mb-2 text-xs text-white/55">位置</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {["X 0", `Y ${2.2 + activeCameraIndex}`, "Z 10"].map((value) => (
                                                    <div key={value} className="h-8 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/75">
                                                        {value}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <DirectorInput label="注视目标" value="角色A" placeholder="注视目标" onChange={() => undefined} style={fieldStyle} />
                                        <div>
                                            <div className="mb-2 text-xs text-white/55">视野角度 (FOV)</div>
                                            <input type="range" min="20" max="90" defaultValue="50" className="w-full accent-cyan-400" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex min-h-0 flex-1 flex-col">
                                        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                                            {captures.length ? (
                                                <div className="grid gap-3">
                                                    {captures.map((capture) => (
                                                        <div key={capture.id}>
                                                            <img src={capture.dataUrl} alt={capture.name} className="aspect-video w-24 rounded bg-black object-cover" />
                                                            <div className="mt-1 text-xs text-white/60">{capture.name}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="grid h-full place-items-center text-sm text-white/45">暂无摄像机截图</div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
                                            <Button onClick={clearCaptures} disabled={!captures.length}>
                                                全部清空
                                            </Button>
                                            <Button type="primary" onClick={onSendToCanvas} disabled={!captures.length}>
                                                发送到画布
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : selectedObject === "character" ? (
                            <div className="space-y-4 p-4">
                                <div className="flex rounded-lg bg-white/5 p-1">
                                    <button className="h-8 rounded-md bg-white/12 px-3 text-sm" type="button">
                                        属性
                                    </button>
                                    <button className="h-8 rounded-md px-3 text-sm text-white/55" type="button">
                                        姿势
                                    </button>
                                </div>
                                <DirectorInput label="名称" value="角色A" placeholder="角色名称" onChange={() => undefined} style={fieldStyle} />
                                <div className="grid grid-cols-3 gap-2">
                                    {["X 0", "Y 0", "Z 0"].map((value) => (
                                        <div key={value} className="h-8 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/75">
                                            {value}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="size-7 rounded-md bg-[#4f8ef7]" />
                                    <span className="rounded bg-white/10 px-3 py-1.5 text-sm">#4F8EF7</span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function DirectorDeskPanel({
    node,
    theme,
    onChange,
    onCreateStoryboard,
    onClose,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onCreateStoryboard: () => void;
    onClose: () => void;
}) {
    const shots = node.metadata?.directorShots?.length ? node.metadata.directorShots : DEFAULT_DIRECTOR_SHOTS;
    const updateShot = (id: string, patch: Partial<(typeof shots)[number]>) => {
        onChange({ directorShots: shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)) });
    };
    const addShot = () => {
        const index = shots.length + 1;
        onChange({
            directorShots: [
                ...shots,
                {
                    id: `shot-${Date.now()}`,
                    name: `机位 ${index}`,
                    camera: "50mm 标准镜头 / 平视跟拍",
                    prompt: "补充这个视角要表达的动作、情绪和画面重点",
                },
            ],
        });
    };
    const removeShot = (id: string) => {
        onChange({ directorShots: shots.filter((shot) => shot.id !== id) });
    };
    const fieldStyle = { background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text };

    return (
        <div
            className="pointer-events-auto w-[720px] max-w-[calc(100vw-32px)] rounded-2xl border p-4 shadow-[0_18px_48px_rgba(0,0,0,.34)] backdrop-blur-xl"
            style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            data-canvas-no-zoom
        >
            <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">导演台</div>
                    <div className="mt-1 text-xs opacity-55">搭建场景、编排机位，并把多视角截图回写到画布</div>
                </div>
                <button type="button" className="grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-white/10" onClick={onClose} aria-label="关闭导演台">
                    <X className="size-4" />
                </button>
            </div>
            <div className="grid grid-cols-[1fr_240px] gap-4">
                <div className="min-w-0 space-y-3">
                    <DirectorTextarea label="场景空间" value={node.metadata?.directorScene || ""} placeholder="描述空间、时间、氛围和角色站位" onChange={(directorScene) => onChange({ directorScene })} style={fieldStyle} />
                    <div className="grid grid-cols-2 gap-3">
                        <DirectorInput label="角色" value={node.metadata?.directorCast || ""} placeholder="主角、配角、群众" onChange={(directorCast) => onChange({ directorCast })} style={fieldStyle} />
                        <DirectorInput label="道具" value={node.metadata?.directorProps || ""} placeholder="关键道具、布景、灯光" onChange={(directorProps) => onChange({ directorProps })} style={fieldStyle} />
                    </div>
                    <DirectorInput label="视觉风格" value={node.metadata?.directorStyle || ""} placeholder="电影感、写实、赛博、纪录片..." onChange={(directorStyle) => onChange({ directorStyle })} style={fieldStyle} />
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    <div className="mb-2 text-xs font-medium opacity-65">3D 场景预览</div>
                    <div className="relative aspect-square overflow-hidden rounded-lg" style={{ background: "linear-gradient(145deg, #121212, #222 48%, #0b0b0b)" }}>
                        <div className="absolute left-[18%] top-[18%] h-[58%] w-[64%] border border-white/12 bg-white/[0.03]" />
                        <div className="absolute bottom-[22%] left-[36%] h-[34%] w-[18%] rounded-full bg-cyan-200/35 blur-sm" />
                        <div className="absolute bottom-[24%] right-[18%] h-[16%] w-[34%] rounded bg-white/10" />
                        <div className="absolute left-3 top-3 rounded bg-black/45 px-2 py-1 text-[10px] text-white/70">Scene</div>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs font-medium opacity-65">机位截图</div>
                <button type="button" className="h-8 rounded-lg px-3 text-xs transition hover:bg-white/10" onClick={addShot} style={{ color: theme.node.text }}>
                    添加机位
                </button>
            </div>
            <div className="mt-2 grid gap-2">
                {shots.map((shot, index) => (
                    <div key={shot.id} className="grid grid-cols-[92px_1fr_1fr_auto] items-center gap-2 rounded-xl border p-2" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                        <input className="h-8 rounded-lg border px-2 text-xs outline-none" value={shot.name} onChange={(event) => updateShot(shot.id, { name: event.target.value })} style={fieldStyle} aria-label={`机位 ${index + 1} 名称`} />
                        <input className="h-8 rounded-lg border px-2 text-xs outline-none" value={shot.camera} onChange={(event) => updateShot(shot.id, { camera: event.target.value })} style={fieldStyle} aria-label={`机位 ${index + 1} 镜头`} />
                        <input className="h-8 rounded-lg border px-2 text-xs outline-none" value={shot.prompt} onChange={(event) => updateShot(shot.id, { prompt: event.target.value })} style={fieldStyle} aria-label={`机位 ${index + 1} 目标`} />
                        <button type="button" className="grid size-8 place-items-center rounded-lg text-xs opacity-65 transition hover:bg-white/10 hover:opacity-100" onClick={() => removeShot(shot.id)} aria-label={`删除 ${shot.name}`}>
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
                <Button onClick={onClose}>收起</Button>
                <Button type="primary" onClick={onCreateStoryboard} disabled={!shots.length}>
                    生成多视角截图
                </Button>
            </div>
        </div>
    );
}

function DirectorInput({ label, value, placeholder, onChange, style }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; style: CSSProperties }) {
    return (
        <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
            <span className="mb-1 block text-xs opacity-55">{label}</span>
            <input className="nodrag nopan h-9 w-full rounded-lg border px-3 text-sm outline-none placeholder:opacity-35 select-text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={style} />
        </label>
    );
}

function DirectorTextarea({ label, value, placeholder, onChange, style }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; style: CSSProperties }) {
    return (
        <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
            <span className="mb-1 block text-xs opacity-55">{label}</span>
            <textarea
                className="nodrag nopan thin-scrollbar h-20 w-full resize-none rounded-lg border px-3 py-2 text-sm leading-5 outline-none placeholder:opacity-35 select-text"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                style={style}
            />
        </label>
    );
}

function directorShotDataUrl(shot: NonNullable<CanvasNodeMetadata["directorShots"]>[number], scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>, characters: DirectorCharacterData[], _index: number) {
    const sky = scene.skyColor || "#060608";
    const groundOpacity = Math.max(0.15, Math.min(1, scene.groundOpacity ?? 0.4));
    const fov = shot.fov ?? 50;
    const aspectValue = ASPECT_PRESETS.find((p) => p.label === (scene.aspectRatio || "16:9"))?.value ?? 16 / 9;
    const frameHeight = 300;
    const frameWidth = Math.max(150, Math.min(560, frameHeight * aspectValue));
    const frameX = (640 - frameWidth) / 2;
    const frameY = (640 - frameHeight) / 2;
    const grid = scene.gridSnap ? "rgba(103,232,249,.34)" : "rgba(103,232,249,.18)";
    const characterSvg = characters
        .map((char, ci) => {
            const cx = 320 + (char.position?.x || 0) * 18 - (shot.position?.x || 0) * 8 + ci * 8;
            const cy = 360 - (char.position?.y || 0) * 16;
            const color = char.color || "#4f8ef7";
            return `<text x="${cx - 32}" y="${cy - 96}" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="700">${escapeSvgText(char.name || `角色${ci + 1}`)}</text><circle cx="${cx}" cy="${cy - 64}" r="28" fill="${escapeSvgText(color)}"/><rect x="${cx - 25}" y="${cy - 36}" width="50" height="86" rx="24" fill="${escapeSvgText(color)}"/><rect x="${cx - 52}" y="${cy - 18}" width="18" height="82" rx="9" fill="${escapeSvgText(color)}"/><rect x="${cx + 34}" y="${cy - 18}" width="18" height="82" rx="9" fill="${escapeSvgText(color)}"/><rect x="${cx - 23}" y="${cy + 44}" width="18" height="92" rx="9" fill="${escapeSvgText(color)}"/><rect x="${cx + 5}" y="${cy + 44}" width="18" height="92" rx="9" fill="${escapeSvgText(color)}"/>`;
        })
        .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="${escapeSvgText(sky)}"/><rect y="310" width="640" height="330" fill="#11161c" opacity="${groundOpacity}"/><g stroke="${grid}" stroke-width="1">${Array.from(
        { length: 11 },
    )
        .map((_, i) => `<path d="M${80 + i * 48} 640 320 310"/>`)
        .join("")}${Array.from({ length: 7 })
        .map((_, i) => `<path d="M80 ${640 - i * 42} 560 ${640 - i * 42}"/>`)
        .join(
            "",
        )}</g><rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" fill="none" stroke="#67e8f9" stroke-opacity=".55" stroke-width="2"/>${characterSvg}<rect x="58" y="58" width="524" height="524" rx="28" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/><text x="82" y="104" fill="white" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeSvgText(shot.name)}</text><text x="82" y="140" fill="rgba(255,255,255,.68)" font-family="Arial, sans-serif" font-size="18">${escapeSvgText(shot.camera)}</text><text x="82" y="512" fill="rgba(255,255,255,.66)" font-family="Arial, sans-serif" font-size="16">FOV ${fov}° · ${escapeSvgText(scene.aspectRatio || "16:9")}</text><text x="82" y="548" fill="rgba(255,255,255,.5)" font-family="Arial, sans-serif" font-size="14">POS ${shot.position?.x ?? 0},${shot.position?.y ?? 0},${shot.position?.z ?? 0}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function escapeSvgText(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] || char);
}

function buildScriptBeats(body: string) {
    const lines = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const chunks = lines.length
        ? lines
        : body
              .split(/[。！？.!?]+/)
              .map((line) => line.trim())
              .filter(Boolean);
    const source = chunks.length ? chunks.slice(0, 6) : ["建立场景", "角色行动", "情绪高潮"];
    return source.map((content, index) => {
        const clean = content.replace(/^\d+[.、\s]*/, "");
        const title = clean.match(/^([^：:]{2,18})[：:]/)?.[1] || `分镜 ${index + 1}`;
        return {
            id: `beat-${index + 1}`,
            title,
            content: clean,
            prompt: `根据脚本分镜生成画面：${clean}。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。`,
        };
    });
}

function scriptStoryboardDataUrl(title: string, index: number) {
    const palettes = [
        ["#101010", "#374151", "#f9fafb"],
        ["#111827", "#1d4ed8", "#bfdbfe"],
        ["#18181b", "#9f1239", "#fecdd3"],
        ["#172554", "#854d0e", "#fde68a"],
    ];
    const [bg, block, accent] = palettes[index % palettes.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="${bg}"/><rect x="76" y="92" width="488" height="340" rx="24" fill="${block}" opacity=".78"/><path d="M126 382 240 244l92 104 62-76 120 110H126Z" fill="${accent}" opacity=".76"/><rect x="76" y="92" width="488" height="340" rx="24" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="2"/><text x="92" y="506" fill="white" font-family="Arial, sans-serif" font-size="30" font-weight="700">${escapeSvgText(title)}</text><text x="92" y="544" fill="rgba(255,255,255,.58)" font-family="Arial, sans-serif" font-size="17">Script Storyboard ${index + 1}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function materialPresetBackground(index: number, tab: "styles" | "effects" | "assets") {
    const styles = ["linear-gradient(135deg,#111827,#0e7490,#f8fafc)", "linear-gradient(135deg,#1f2937,#f59e0b,#fef3c7)", "linear-gradient(135deg,#0a0a0a,#581c87,#22d3ee)"];
    const effects = [
        "radial-gradient(circle at 35% 35%,#f8fafc 0 8%,transparent 9%),linear-gradient(135deg,#111827,#1d4ed8)",
        "conic-gradient(from 120deg,#111827,#16a34a,#f8fafc,#111827)",
        "linear-gradient(120deg,#0f172a 0 35%,#f97316 36% 44%,#111827 45% 100%)",
    ];
    return (tab === "effects" ? effects : styles)[index % 3];
}

function CanvasMaterialLibraryModal({
    open,
    initialTab,
    onClose,
    onUsePreset,
    onOpenAssetPicker,
    onUpload,
}: {
    open: boolean;
    initialTab: "styles" | "effects" | "assets";
    onClose: () => void;
    onUsePreset: (preset: { title: string; prompt: string }) => void;
    onOpenAssetPicker: () => void;
    onUpload: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [tab, setTab] = useState<"styles" | "effects" | "assets">("styles");

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    const presets = tab === "effects" ? MATERIAL_LIBRARY_PRESETS.effects : MATERIAL_LIBRARY_PRESETS.styles;
    return (
        <Modal title="素材库" open={open} centered width={720} footer={null} onCancel={onClose} destroyOnHidden styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                {[
                    ["styles", "风格库"],
                    ["effects", "效果库"],
                    ["assets", "我的素材"],
                ].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className="h-8 rounded-md px-3 text-sm transition"
                        style={{ background: tab === value ? theme.toolbar.activeBg : "transparent", color: tab === value ? theme.toolbar.activeText : theme.node.text }}
                        onClick={() => setTab(value as "styles" | "effects" | "assets")}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === "assets" ? (
                <div className="grid min-h-[260px] place-items-center rounded-xl border p-8 text-center" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    <div>
                        <FolderOpen className="mx-auto mb-3 size-8 opacity-55" />
                        <div className="text-sm font-medium">从我的素材插入</div>
                        <div className="mt-2 text-xs opacity-55">支持文本、图片、视频和音频素材回写到当前画布</div>
                        <div className="mt-4 flex justify-center gap-2">
                            <Button onClick={onUpload} icon={<Upload className="size-4" />}>
                                上传
                            </Button>
                            <Button type="primary" onClick={onOpenAssetPicker} icon={<FolderOpen className="size-4" />}>
                                选择素材
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    {presets.map((preset, index) => (
                        <button
                            key={preset.title}
                            type="button"
                            className="group min-w-0 rounded-xl border p-3 text-left transition hover:bg-white/10"
                            style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                            onClick={() => onUsePreset(preset)}
                        >
                            <div className="mb-3 aspect-square rounded-lg" style={{ background: materialPresetBackground(index, tab) }} />
                            <div className="truncate text-sm font-medium">{preset.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 opacity-55">{preset.prompt}</div>
                            <div className="mt-3 text-xs opacity-0 transition group-hover:opacity-80">插入到画布</div>
                        </button>
                    ))}
                </div>
            )}
        </Modal>
    );
}

function CanvasGenerationHistoryModal({ open, nodes, onClose, onSelectNode }: { open: boolean; nodes: CanvasNodeData[]; onClose: () => void; onSelectNode: (nodeId: string) => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [tab, setTab] = useState<"image" | "video" | "audio">("image");
    const items = nodes.filter((node) => {
        const hasMedia = Boolean(node.metadata?.content || node.metadata?.storageKey);
        if (!hasMedia) return false;
        if (tab === "image") return node.type === CanvasNodeType.Image;
        if (tab === "video") return node.type === CanvasNodeType.Video;
        return node.type === CanvasNodeType.Audio;
    });
    const sourceLabels = ["FlowCanvas", "生成节点", "ComfyUI", "AI应用"];

    return (
        <Modal title="选择生成历史" open={open} centered width={760} footer={null} onCancel={onClose} styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="grid min-h-[360px] grid-cols-[132px_1fr] gap-4">
                <div className="space-y-2 border-r pr-3" style={{ borderColor: theme.toolbar.border }}>
                    {sourceLabels.map((label) => (
                        <div key={label} className="rounded-lg px-3 py-2 text-sm" style={{ background: label === "FlowCanvas" ? theme.toolbar.activeBg : "transparent", color: label === "FlowCanvas" ? theme.toolbar.activeText : theme.node.text }}>
                            {label}
                        </div>
                    ))}
                </div>
                <div className="min-w-0">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                            {[
                                ["image", "图片"],
                                ["video", "视频"],
                                ["audio", "音频"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    className="h-8 rounded-md px-3 text-sm transition"
                                    style={{ background: tab === value ? theme.toolbar.activeBg : "transparent", color: tab === value ? theme.toolbar.activeText : theme.node.text }}
                                    onClick={() => setTab(value as "image" | "video" | "audio")}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs opacity-55">已选 0/10 项</span>
                    </div>
                    {items.length ? (
                        <div className="grid grid-cols-3 gap-3">
                            {items.slice(0, 30).map((node) => (
                                <button
                                    key={node.id}
                                    type="button"
                                    className="group min-w-0 rounded-xl border p-2 text-left transition hover:bg-white/10"
                                    style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                                    onClick={() => {
                                        onSelectNode(node.id);
                                        onClose();
                                    }}
                                >
                                    <div className="mb-2 flex aspect-[4/3] items-center justify-center rounded-lg text-xs opacity-65" style={{ background: theme.toolbar.itemHover }}>
                                        {tab === "image" ? <ImageIcon className="size-6" /> : tab === "video" ? <Video className="size-6" /> : <Music2 className="size-6" />}
                                    </div>
                                    <div className="truncate text-sm font-medium">{node.title}</div>
                                    <div className="mt-1 truncate text-xs opacity-50">{node.metadata?.prompt || node.metadata?.requestPrompt || "画布生成结果"}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="grid min-h-[260px] place-items-center rounded-xl border text-center text-sm opacity-55" style={{ borderColor: theme.toolbar.border }}>
                            当前画布还没有可选择的{tab === "image" ? "图片" : tab === "video" ? "视频" : "音频"}生成结果
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function CanvasAssetManagerPanel({
    open,
    initialTab,
    nodes,
    selectedNodeIds,
    onClose,
    onSelectNode,
    onOpenAssetPicker,
    onUpload,
}: {
    open: boolean;
    initialTab: "canvas" | "assets";
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    onSelectNode: (nodeId: string) => void;
    onOpenAssetPicker: () => void;
    onUpload: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const assets = useAssetStore((state) => state.assets);
    const [tab, setTab] = useState<"canvas" | "assets">("canvas");
    const [query, setQuery] = useState("");
    const filteredNodes = nodes.filter((node) => `${node.title} ${node.type}`.toLowerCase().includes(query.trim().toLowerCase()));
    const filteredAssets = assets.filter((asset) => `${asset.title} ${(asset.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    if (!open) return null;

    return (
        <aside className="absolute bottom-0 left-0 top-0 z-[65] flex w-[280px] flex-col border-r backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <div className="flex h-[92px] shrink-0 flex-col justify-end border-b px-4 pb-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">资产管理</div>
                        <div className="mt-1 truncate text-xs opacity-55">当前画布资源与项目素材</div>
                    </div>
                    <button type="button" className="grid size-8 place-items-center rounded-lg transition hover:bg-white/10" onClick={onClose} aria-label="关闭资产管理">
                        <X className="size-4" />
                    </button>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 border-b p-2" style={{ borderColor: theme.toolbar.border }}>
                <button
                    type="button"
                    className="h-8 rounded-lg px-3 text-sm font-medium transition"
                    style={{ background: tab === "canvas" ? theme.toolbar.activeBg : "transparent", color: tab === "canvas" ? theme.toolbar.activeText : theme.node.text }}
                    onClick={() => setTab("canvas")}
                >
                    画布
                </button>
                <button
                    type="button"
                    className="h-8 rounded-lg px-3 text-sm font-medium transition"
                    style={{ background: tab === "assets" ? theme.toolbar.activeBg : "transparent", color: tab === "assets" ? theme.toolbar.activeText : theme.node.text }}
                    onClick={() => setTab("assets")}
                >
                    资产
                </button>
            </div>
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.toolbar.border }}>
                <Search className="size-4 opacity-45" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "canvas" ? "搜索画布元素" : "搜索素材"} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-45" />
            </div>
            {tab === "canvas" ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-2 flex items-center justify-between text-xs opacity-55">
                        <span>画布元素</span>
                        <span>共 {nodes.length} 节点</span>
                    </div>
                    <div className="space-y-1.5">
                        {filteredNodes.map((node) => (
                            <button
                                key={node.id}
                                type="button"
                                className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition"
                                style={{ background: selectedNodeIds.has(node.id) ? theme.toolbar.activeBg : "transparent", color: selectedNodeIds.has(node.id) ? theme.toolbar.activeText : theme.node.text }}
                                onClick={() => onSelectNode(node.id)}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover }}>
                                    {nodeIcon(node.type)}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{node.title || node.type}</span>
                            </button>
                        ))}
                        {!filteredNodes.length ? <div className="rounded-lg px-2 py-8 text-center text-sm opacity-50">没有匹配的画布元素</div> : null}
                    </div>
                </div>
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-3 grid grid-cols-2 gap-2">
                        <Button className="!h-9" icon={<FolderOpen className="size-4" />} onClick={onOpenAssetPicker}>
                            从素材插入
                        </Button>
                        <Button className="!h-9" icon={<Upload className="size-4" />} onClick={onUpload}>
                            上传
                        </Button>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-xs opacity-55">
                        <span>我的素材</span>
                        <span>共 {assets.length} 项</span>
                    </div>
                    <div className="space-y-1.5">
                        {filteredAssets.slice(0, 40).map((asset) => (
                            <button key={asset.id} type="button" className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:bg-white/10" onClick={onOpenAssetPicker}>
                                <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover }}>
                                    {asset.kind === "text" ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{asset.title}</span>
                            </button>
                        ))}
                        {!filteredAssets.length ? <div className="rounded-lg px-2 py-8 text-center text-sm opacity-50">还没有素材，先上传或保存节点到素材库</div> : null}
                    </div>
                </div>
            )}
        </aside>
    );
}

function nodeIcon(type: CanvasNodeType) {
    if (type === CanvasNodeType.Text) return <FileText className="size-4" />;
    if (type === CanvasNodeType.Image) return <ImageIcon className="size-4" />;
    if (type === CanvasNodeType.Video) return <Video className="size-4" />;
    if (type === CanvasNodeType.Audio) return <Music2 className="size-4" />;
    return <Box className="size-4" />;
}

function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    agentOpen,
    onToggleAgent,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    agentOpen: boolean;
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between px-4">
                <div className="pointer-events-auto flex min-w-0 items-center overflow-hidden rounded-xl border backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: "回到主页", onClick: onHome },
                                { key: "projects", icon: <Images className="size-4" />, label: "全部项目", onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: "创建新项目", onClick: onCreateProject },
                                { type: "divider" },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: "删除项目", onClick: onDeleteProject },
                            ],
                        }}
                    >
                        <button type="button" className="flex h-10 items-center gap-2 px-3 transition hover:bg-white/10" aria-label="打开画布菜单">
                            <Menu className="size-4" />
                            <span className="font-semibold">FlowCanvas</span>
                            <ChevronDown className="size-3 opacity-55" />
                        </button>
                    </Dropdown>

                    <div className="h-6 w-px" style={{ background: theme.toolbar.border }} />
                    <div ref={titleRef} className="flex h-10 min-w-0 items-center px-3">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="max-w-[180px] bg-transparent p-0 text-left text-sm font-semibold tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button type="button" className="max-w-[180px] truncate text-left text-sm font-semibold tracking-normal transition hover:opacity-75" onDoubleClick={onStartTitleEditing} title="双击修改画布名称">
                                {title}
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-1.5">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                {
                                    key: "publish",
                                    icon: <Upload className="size-4" />,
                                    label: (
                                        <div>
                                            <div className="font-medium">在 FlowCanvas 上发布</div>
                                            <div className="text-xs opacity-55">发布当前作品和创作过程</div>
                                        </div>
                                    ),
                                },
                                {
                                    key: "link",
                                    icon: <Link2 className="size-4" />,
                                    label: (
                                        <div>
                                            <div className="font-medium">分享链接</div>
                                            <div className="text-xs opacity-55">复制当前画布地址</div>
                                        </div>
                                    ),
                                    onClick: () => void navigator.clipboard?.writeText(window.location.href),
                                },
                            ],
                        }}
                    >
                        <button
                            type="button"
                            className="grid size-10 place-items-center rounded-xl border backdrop-blur-xl transition hover:bg-white/10"
                            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                            aria-label="发布与分享"
                        >
                            <Share2 className="size-4" />
                        </button>
                    </Dropdown>
                    <button
                        type="button"
                        className="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold backdrop-blur-xl transition hover:bg-white/10"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        aria-label="积分"
                    >
                        <Zap className="size-4 fill-current" />
                        20
                    </button>
                    <Button
                        type="text"
                        className="!h-10 !rounded-xl !px-3 !font-medium"
                        style={{ background: agentOpen ? theme.toolbar.activeBg : theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        icon={<Bot className="size-4" />}
                        onClick={onToggleAgent}
                    >
                        Agent
                    </Button>
                </div>
            </div>
        </>
    );
}

function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

function imageMetadata(image: UploadedImage): CanvasNodeMetadata {
    return { content: image.url, storageKey: image.storageKey, status: "success", naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
    return { content: video.url, storageKey: video.storageKey, status: "success", naturalWidth: video.width, naturalHeight: video.height, bytes: video.bytes, mimeType: video.mimeType || "video/mp4", durationMs: video.durationMs };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
    return { content: audio.url, storageKey: audio.storageKey, status: "success", bytes: audio.bytes, mimeType: audio.mimeType || "audio/mpeg", durationMs: audio.durationMs };
}

function promoteImageMetadata(current: CanvasNodeMetadata | undefined, source: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
    const next: CanvasNodeMetadata = { ...current };
    if (!source) return next;
    next.content = source.content;
    next.storageKey = source.storageKey;
    next.naturalWidth = source.naturalWidth;
    next.naturalHeight = source.naturalHeight;
    next.freeResize = source.freeResize;
    next.bytes = source.bytes;
    next.mimeType = source.mimeType;
    next.status = source.status || next.status;
    next.errorDetails = source.errorDetails;
    return next;
}

function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        generationType: type,
        model: config.model,
        size: config.size,
        quality: config.quality,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

function buildComfyCanvasFieldValues(workflow: ComfyWorkflow, nodeValues: Record<string, unknown>, prompt: string) {
    const values = Object.fromEntries(workflow.fields.map((field) => [field.id, nodeValues[field.id] ?? field.default]));
    const promptText = prompt.trim();
    if (!promptText) return values;
    workflow.fields
        .filter((field) => field.bindPrompt || isComfyPromptField(field))
        .forEach((field) => {
            values[field.id] = promptText;
        });
    return values;
}

function isComfyPromptField(field: ComfyWorkflowField) {
    if (field.type !== "text" && field.type !== "textarea") return false;
    return /prompt|text|caption|description|positive|negative|提示词|正向|负向/i.test(`${field.input} ${field.name}`);
}

const NODE_REF_PATTERN = /@\[node:([^\]]+)\]/;
const NODE_REF_PATTERN_GLOBAL = /@\[node:([^\]]+)\]/g;

function resolveComfyTextFields(workflow: ComfyWorkflow, values: Record<string, unknown>, context: NodeGenerationContext) {
    workflow.fields
        .filter((field) => field.type === "text" || field.type === "textarea")
        .forEach((field) => {
            values[field.id] = replaceComfyReferences(String(values[field.id] ?? ""), context, "text");
        });
}

async function resolveComfyMediaFields(workflow: ComfyWorkflow, values: Record<string, unknown>, context: NodeGenerationContext, config: ComfyUiConfig, signal?: AbortSignal) {
    const mediaFields = workflow.fields.filter((field): field is ComfyWorkflowField & { type: "image" | "video" | "audio" } => field.type === "image" || field.type === "video" || field.type === "audio");
    for (const field of mediaFields) {
        const raw = String(values[field.id] ?? "");
        const media = findMediaByReference(field.type, raw, context);
        if (!media) {
            if (raw.match(NODE_REF_PATTERN)) throw new Error(`字段「${field.name || field.input}」引用的上游节点不存在或类型不匹配`);
            continue;
        }
        const { blob, filename } = await fetchMediaBlob(media);
        const uploaded = await uploadComfyFile(config, blob, filename, signal);
        values[field.id] = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    }
}

function replaceComfyReferences(value: string, context: NodeGenerationContext, type: "text" | "image" | "video" | "audio") {
    let next = value.replace(NODE_REF_PATTERN_GLOBAL, (_, nodeId: string) => {
        const text = findTextByNodeId(nodeId, context);
        return text ?? "";
    });
    getLabeledInputs(context, type).forEach((input) => {
        if (input.type !== "text") return;
        next = replaceStandaloneLabel(next, input.label, input.text || "");
    });
    return next;
}

function findMediaByReference(type: "image" | "video" | "audio", raw: string, context: NodeGenerationContext) {
    const match = raw.match(NODE_REF_PATTERN);
    if (match) return findMediaByNodeId(type, match[1], context);
    const value = raw.trim();
    const reference = getLabeledInputs(context, type).find((input) => value === input.label || value === `【${input.label}】`);
    if (!reference) return null;
    return findMediaByNodeId(type, reference.nodeId, context);
}

function findMediaByNodeId(type: "image" | "video" | "audio", nodeId: string, context: NodeGenerationContext) {
    const input = context.inputs.find((item) => item.nodeId === nodeId && item.type === type);
    if (type === "image") return input?.image || null;
    if (type === "video") return input?.video || null;
    if (type === "audio") return input?.audio || null;
    return null;
}

function findTextByNodeId(nodeId: string, context: NodeGenerationContext) {
    return getLabeledInputs(context, "text").find((input) => input.nodeId === nodeId)?.text;
}

function getLabeledInputs(context: NodeGenerationContext, type: "text" | "image" | "video" | "audio") {
    const items = type === "text" ? context.inputs.filter((input) => input.type === "text") : context.inputs.filter((input) => input.type === type);
    return items.map((item, index) => ({ ...item, label: comfyReferenceLabel(type, index) }));
}

function comfyReferenceLabel(type: "text" | "image" | "video" | "audio", index: number) {
    if (type === "image") return `图片${index + 1}`;
    if (type === "video") return `视频${index + 1}`;
    if (type === "audio") return `音频${index + 1}`;
    return `文本${index + 1}`;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceStandaloneLabel(value: string, label: string, replacement: string) {
    const escaped = escapeRegExp(label);
    return value.replace(new RegExp(`【${escaped}】`, "g"), replacement).replace(new RegExp(`(^|[^\\p{L}\\p{N}_【])${escaped}(?![\\p{L}\\p{N}_】])`, "gu"), (_match, prefix: string) => `${prefix}${replacement}`);
}

async function fetchMediaBlob(media: { dataUrl?: string; url?: string; storageKey?: string; name?: string; type?: string }) {
    const source = media.dataUrl || media.url || media.storageKey;
    if (!source) throw new Error("无法读取媒体数据");
    const response = await fetch(source);
    const blob = await response.blob();
    const ext = blob.type.split("/")[1]?.split(";")[0] || "bin";
    const filename = `${media.name || `upload-${Date.now()}`}.${ext}`;
    return { blob, filename };
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        model: config.model,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioInstructions: config.audioInstructions,
    };
}

function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

/** Resolve a node's media content URL from storageKey if needed.
 *  After lazy-hydrate, `content` may be a stale blob URL; this ensures a valid URL for user actions. */
async function resolveNodeContent(node: CanvasNodeData): Promise<string> {
    const { storageKey, content } = node.metadata ?? {};
    if (!content && !storageKey) return "";
    if (node.type === CanvasNodeType.Image) return resolveImageUrl(storageKey, content ?? "");
    return resolveMediaUrl(storageKey, content ?? "");
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            // Image/Video/Audio: defer URL resolution to component (lazy hydrate)
            if (node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) return node;
            if (node.type === CanvasNodeType.Image && node.metadata?.storageKey) return node;
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(count)) || 1)));
}

function applyNodeConfigPatch(node: CanvasNodeData, patch: Partial<CanvasNodeData["metadata"]>) {
    const safePatch = patch || {};
    const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
    const spec = node.type === CanvasNodeType.Video ? NODE_DEFAULT_SIZE[CanvasNodeType.Video] : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
    const size = typeof safePatch.size === "string" && !node.metadata?.content ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height) : null;
    return size && (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) ? { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } } : next;
}

function nodeSpatialRect(node: CanvasNodeData): CanvasSpatialRect {
    return {
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + node.width,
        bottom: node.position.y + node.height,
    };
}

function viewportSpatialRect(viewport: ViewportTransform, width: number, height: number, padding: number): CanvasSpatialRect {
    const left = -viewport.x / viewport.k - padding;
    const top = -viewport.y / viewport.k - padding;
    return {
        left,
        top,
        right: left + width / viewport.k + padding * 2,
        bottom: top + height / viewport.k + padding * 2,
    };
}

function getInputSummary(inputs: NodeGenerationInput[]) {
    return {
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: inputs.filter((input) => input.type === "image").length,
        videoCount: inputs.filter((input) => input.type === "video").length,
        audioCount: inputs.filter((input) => input.type === "audio").length,
    };
}

function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    return {
        ...config,
        model: node?.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : config.model || defaultConfig.model),
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        size: node?.metadata?.size || config.size || defaultConfig.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || (mode === "image" ? config.canvasImageCount || config.count : config.count) || defaultConfig.count),
    };
}

function mergeActiveGenerationNodes(restoredNodes: CanvasNodeData[], liveNodes: CanvasNodeData[], activeNodeIds: Set<string>) {
    if (!activeNodeIds.size) return restoredNodes;
    const liveById = new Map(liveNodes.map((node) => [node.id, node]));
    const restoredIds = new Set(restoredNodes.map((node) => node.id));
    const merged = restoredNodes.map((node) => (activeNodeIds.has(node.id) ? liveById.get(node.id) || node : node));
    activeNodeIds.forEach((id) => {
        const liveNode = liveById.get(id);
        if (liveNode && !restoredIds.has(id)) merged.push(liveNode);
    });
    return merged;
}

function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => (node.metadata?.status === "loading" ? { ...node, metadata: { ...node.metadata, status: "error" as const, errorDetails: "页面刷新后生成已中断，请重新生成。" } } : node));
}

function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

function findRetrySourceNode(nodeId: string, nodeById: Map<string, CanvasNodeData>, incomingByNodeId: Map<string, CanvasConnection[]>) {
    const queue = (incomingByNodeId.get(nodeId) || []).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodeById.get(id);
        if (node?.type === CanvasNodeType.Config) return node;
        incomingByNodeId.get(id)?.forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function isTextFile(file: File) {
    return file.type.startsWith("text/") || /\.(txt|md|markdown|srt)$/i.test(file.name);
}

function isScriptTextFile(file: File) {
    return /\.(md|markdown|srt)$/i.test(file.name) || /script|剧本|脚本|分镜/i.test(file.name);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? "正面视角" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function PreviewImageContent({ node, onCapturePanorama }: { node: CanvasNodeData; onCapturePanorama: (dataUrl: string) => void | Promise<void> }) {
    if (node.metadata?.canvasTool === "panorama360") return <PreviewPanoramaContent node={node} onCapture={onCapturePanorama} />;

    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content;
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mounted = true;
        setError(false);
        resolveImageUrl(storageKey, content ?? "")
            .then((url) => {
                if (!mounted) return;
                if (url) setSrc(url);
                else setError(true);
            })
            .catch(() => {
                if (mounted) setError(true);
            });
        return () => {
            mounted = false;
        };
    }, [content, storageKey]);

    if (error) {
        return (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8">
                <p className="text-sm font-medium">图片加载失败</p>
                <p className="text-xs opacity-60">对象 URL 已失效或图片已被清理</p>
            </div>
        );
    }
    if (!src) return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm opacity-60">加载中…</div>;
    return <img src={src} alt={node.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} onError={() => setError(true)} />;
}

function PreviewPanoramaContent({ node, onCapture }: { node: CanvasNodeData; onCapture: (dataUrl: string) => void | Promise<void> }) {
    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content;
    const [src, setSrc] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;
        setError("");
        resolveImageUrl(storageKey, content ?? "")
            .then((url) => {
                if (!mounted) return;
                if (url) setSrc(url);
                else setError("全景图加载失败");
            })
            .catch((err) => {
                if (mounted) setError(err instanceof Error ? err.message : "全景图加载失败");
            });
        return () => {
            mounted = false;
        };
    }, [content, storageKey]);

    if (error) {
        return (
            <div className="flex h-[76vh] w-[92vw] flex-col items-center justify-center gap-2 bg-black p-8 text-white">
                <p className="text-sm font-medium">{error}</p>
                <p className="text-xs text-white/55">请重新上传或重新生成 2:1 全景图</p>
            </div>
        );
    }
    if (!src) return <div className="flex h-[76vh] w-[92vw] items-center justify-center bg-black p-8 text-sm text-white/60">正在加载全景图…</div>;
    return <PanoramaImmersivePreview src={src} title={node.title} onCapture={onCapture} />;
}

function PanoramaImmersivePreview({ src, title, onCapture }: { src: string; title: string; onCapture: (dataUrl: string) => void | Promise<void> }) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const renderRef = useRef<() => void>(() => {});
    const [textureSrc, setTextureSrc] = useState(src);
    const [error, setError] = useState("");
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError("");
        if (!/^https?:/i.test(src)) {
            setTextureSrc(src);
            return;
        }
        setTextureSrc("");
        imageToDataUrl({ url: src })
            .then((dataUrl) => {
                if (!cancelled) setTextureSrc(dataUrl);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "全景贴图加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, [src]);

    useEffect(() => {
        if (!textureSrc) return;
        const host = hostRef.current;
        if (!host) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
        rendererRef.current = renderer;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 1);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1100);
        camera.position.set(0, 0, 0);
        let disposed = false;
        let dragging = false;
        let yaw = 0;
        let pitch = 0;

        const geometry = new THREE.SphereGeometry(500, 96, 48);
        geometry.scale(-1, 1, 1);
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const texture = loader.load(
            textureSrc,
            () => render(),
            undefined,
            () => {
                if (!disposed) setError("全景贴图加载失败");
            },
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const material = new THREE.MeshBasicMaterial({ map: texture });
        scene.add(new THREE.Mesh(geometry, material));

        const updateCameraDirection = () => {
            const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
            camera.lookAt(direction);
        };
        updateCameraDirection();

        const resize = () => {
            if (disposed) return;
            const width = Math.max(1, host.clientWidth);
            const height = Math.max(1, host.clientHeight);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            render();
        };
        function render() {
            if (disposed) return;
            renderer.render(scene, camera);
        }
        renderRef.current = render;
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();
            camera.fov = Math.max(35, Math.min(95, camera.fov + event.deltaY * 0.035));
            camera.updateProjectionMatrix();
            render();
        };
        const stopCanvasInteraction = (event: Event) => event.stopPropagation();
        const handlePointerDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            dragging = true;
            renderer.domElement.setPointerCapture(event.pointerId);
            renderer.domElement.style.cursor = "grabbing";
        };
        const handlePointerMove = (event: PointerEvent) => {
            if (!dragging) return;
            event.preventDefault();
            event.stopPropagation();
            yaw -= event.movementX * 0.004;
            pitch += event.movementY * 0.004;
            pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
            updateCameraDirection();
            render();
        };
        const handlePointerUp = (event: PointerEvent) => {
            if (!dragging) return;
            event.preventDefault();
            event.stopPropagation();
            dragging = false;
            renderer.domElement.releasePointerCapture(event.pointerId);
            renderer.domElement.style.cursor = "grab";
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        renderer.domElement.className = "nodrag nopan block h-full w-full";
        renderer.domElement.style.cursor = "grab";
        host.addEventListener("wheel", handleWheel, { passive: false });
        renderer.domElement.addEventListener("pointerdown", handlePointerDown);
        renderer.domElement.addEventListener("pointermove", handlePointerMove);
        renderer.domElement.addEventListener("pointerup", handlePointerUp);
        renderer.domElement.addEventListener("pointercancel", handlePointerUp);
        host.addEventListener("mousedown", stopCanvasInteraction);
        resize();

        return () => {
            disposed = true;
            rendererRef.current = null;
            renderRef.current = () => {};
            observer.disconnect();
            host.removeEventListener("wheel", handleWheel);
            renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
            renderer.domElement.removeEventListener("pointermove", handlePointerMove);
            renderer.domElement.removeEventListener("pointerup", handlePointerUp);
            renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
            host.removeEventListener("mousedown", stopCanvasInteraction);
            texture.dispose();
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [textureSrc]);

    const capture = useCallback(async () => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        setCapturing(true);
        try {
            renderRef.current();
            await onCapture(renderer.domElement.toDataURL("image/png"));
        } finally {
            setCapturing(false);
        }
    }, [onCapture]);

    return (
        <div className="nodrag nopan relative h-[76vh] w-[92vw] overflow-hidden bg-black text-white" data-canvas-no-zoom>
            <div ref={hostRef} className="h-full w-full" aria-label={title || "360全景预览"} />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
                <div className="min-w-0 pr-4">
                    <div className="truncate text-sm font-medium">{title || "360全景预览"}</div>
                    <div className="text-xs text-white/55">左键拖动旋转视角，滚轮缩放 FOV</div>
                </div>
                <Button className="pointer-events-auto" type="primary" loading={capturing} onClick={capture}>
                    截图插入画布
                </Button>
            </div>
            {!textureSrc || error ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">{error || "正在准备全景贴图"}</div> : null}
        </div>
    );
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
