"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent as ReactChangeEvent, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bot, Box, FileText, FolderOpen, Home, ImageIcon, Images, Layers3, Link2, List, Menu, Music2, Plus, Search, Settings2, Share2, Trash2, Upload, Video, X } from "lucide-react";
import * as THREE from "three";

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
import { useUserStore } from "@/stores/use-user-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl } from "../utils/canvas-image-data";
import { fitNodeSize, nodeSizeFromRatio } from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal, message } from "antd";
import { NODE_DEFAULT_SIZE, getConfigNodeHeight, getNodeSpec } from "../constants";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { BackendWorkspaceGate } from "@/components/layout/backend-workspace-gate";
import type { CanvasImageAngleParams } from "../components/canvas-node-angle-dialog";
import type { CanvasImageCropRect } from "../components/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "../components/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "../components/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "../components/canvas-node-upscale-dialog";
import { buildNodeGenerationContext, buildNodeGenerationInputs, buildNodeResponseMessages, hydrateNodeGenerationContext, type NodeGenerationContext, type NodeGenerationInput } from "../components/canvas-node-generation";
import { LeaferCanvas } from "../components/leafer-canvas";
import { CanvasNode } from "../components/canvas-node";
import type { CanvasNodeGenerationMode } from "../components/canvas-node-prompt-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import type { InsertAssetPayload } from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { useCanvasStore } from "../stores/use-canvas-store";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { buildBatchVisibilityIndex, buildConnectionAdjacency, buildNodeById, normalizeConnectionWithNodeMap, setsEqual } from "../utils/canvas-derived-indexes";
import { buildConnectionPathFromPoints, getConnectionPoints, getNodeConnectionPoint } from "../utils/canvas-connection-geometry";
import { buildSpatialIndex, querySpatialIndex, type CanvasSpatialRect } from "../utils/canvas-spatial-index";
import { buildCanvasResourceReferences, buildNodeMentionReferences, createCanvasResourceGraph } from "../utils/canvas-resource-references";
import type { DirectorDeskCapture } from "../director/storyai/DirectorDesk";
import type { CanvasAgentMode } from "../components/canvas-agent-chat-ui";
import {
    CanvasNodeType,
    type CanvasAssistantImage,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasImageGenerationType,
    type CanvasNodeActionIntent,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type ConnectionHandle,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";
import { normalizeRuntimeModelOption } from "@/services/runtime-config";

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

const CANVAS_OPEN_LOCK_PREFIX = "infinite-canvas:open-canvas:";
const CANVAS_OPEN_LOCK_TTL = 8000;
const CANVAS_OPEN_LOCK_HEARTBEAT = 2500;

type CanvasOpenLock = {
    ownerId: string;
    updatedAt: number;
};

function useCanvasSingleOpenLock(projectId: string, enabled: boolean) {
    const ownerIdRef = useRef("");
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        if (!enabled || !projectId || typeof window === "undefined") return;
        const ownerKey = `${CANVAS_OPEN_LOCK_PREFIX}${projectId}:owner`;
        if (!ownerIdRef.current) {
            try {
                ownerIdRef.current = window.sessionStorage.getItem(ownerKey) || "";
                if (!ownerIdRef.current) {
                    ownerIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
                    window.sessionStorage.setItem(ownerKey, ownerIdRef.current);
                }
            } catch {
                ownerIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            }
        }
        const ownerId = ownerIdRef.current;
        const key = `${CANVAS_OPEN_LOCK_PREFIX}${projectId}`;

        const readLock = () => {
            try {
                const raw = window.localStorage.getItem(key);
                return raw ? (JSON.parse(raw) as CanvasOpenLock) : null;
            } catch {
                return null;
            }
        };
        const writeLock = () => window.localStorage.setItem(key, JSON.stringify({ ownerId, updatedAt: Date.now() } satisfies CanvasOpenLock));
        const isOtherLiveLock = (lock: CanvasOpenLock | null) => Boolean(lock && lock.ownerId !== ownerId && Date.now() - lock.updatedAt < CANVAS_OPEN_LOCK_TTL);

        if (isOtherLiveLock(readLock())) {
            setExpired(true);
            return;
        }
        setExpired(false);
        writeLock();
        const timer = window.setInterval(() => {
            if (isOtherLiveLock(readLock())) {
                setExpired(true);
                return;
            }
            writeLock();
        }, CANVAS_OPEN_LOCK_HEARTBEAT);
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== key) return;
            if (isOtherLiveLock(readLock())) setExpired(true);
        };
        window.addEventListener("storage", handleStorage);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("storage", handleStorage);
            const lock = readLock();
            if (lock?.ownerId === ownerId) window.localStorage.removeItem(key);
        };
    }, [enabled, projectId]);

    return expired;
}

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

function hasRetainableMedia(node: CanvasNodeData) {
    return (
        (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) &&
        Boolean(node.metadata?.storageKey || node.metadata?.content)
    );
}

function reconcileGroupMembership(nodes: CanvasNodeData[]): CanvasNodeData[] {
    const groups = nodes.filter((node) => node.type === CanvasNodeType.Group);
    if (!groups.length) return nodes;

    const existingOwnerByChildId = new Map<string, string>();
    for (const group of groups) {
        for (const childId of group.metadata?.groupChildIds || []) {
            if (!existingOwnerByChildId.has(childId)) existingOwnerByChildId.set(childId, group.id);
        }
    }

    const childIdsByGroupId = new Map(groups.map((group) => [group.id, [] as string[]]));
    for (const node of nodes) {
        if (node.type === CanvasNodeType.Group) continue;
        const centerX = node.position.x + node.width / 2;
        const centerY = node.position.y + node.height / 2;
        const containingGroups = groups.filter(
            (group) =>
                centerX >= group.position.x &&
                centerX <= group.position.x + group.width &&
                centerY >= group.position.y &&
                centerY <= group.position.y + group.height,
        );
        if (!containingGroups.length) continue;

        const currentOwnerId = existingOwnerByChildId.get(node.id);
        const owner =
            containingGroups.find((group) => group.id === currentOwnerId) ||
            containingGroups.reduce((smallest, group) =>
                group.width * group.height < smallest.width * smallest.height ? group : smallest,
            );
        childIdsByGroupId.get(owner.id)?.push(node.id);
    }

    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const currentChildIds = node.metadata?.groupChildIds || [];
        const nextChildIds = childIdsByGroupId.get(node.id) || [];
        if (currentChildIds.length === nextChildIds.length && currentChildIds.every((id, index) => id === nextChildIds[index])) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, groupChildIds: nextChildIds } };
    });
    return changed ? next : nodes;
}

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const CANVAS_AGENT_PANEL_MOTION_MS = 500;
const CANVAS_OVERVIEW_SCALE = 0.24;
const NODE_TOOLBAR_HIDE_DELAY_MS = 320;

const CanvasConfigNodePanel = lazy(() => import("../components/canvas-config-node-panel").then((mod) => ({ default: mod.CanvasConfigNodePanel })));
const CanvasAssistantPanel = lazy(() => import("../components/canvas-assistant-panel").then((mod) => ({ default: mod.CanvasAssistantPanel })));
const CanvasNodeAngleDialog = lazy(() => import("../components/canvas-node-angle-dialog").then((mod) => ({ default: mod.CanvasNodeAngleDialog })));
const CanvasNodeCropDialog = lazy(() => import("../components/canvas-node-crop-dialog").then((mod) => ({ default: mod.CanvasNodeCropDialog })));
const CanvasNodeMaskEditDialog = lazy(() => import("../components/canvas-node-mask-edit-dialog").then((mod) => ({ default: mod.CanvasNodeMaskEditDialog })));
const CanvasNodeSplitDialog = lazy(() => import("../components/canvas-node-split-dialog").then((mod) => ({ default: mod.CanvasNodeSplitDialog })));
const CanvasNodeUpscaleDialog = lazy(() => import("../components/canvas-node-upscale-dialog").then((mod) => ({ default: mod.CanvasNodeUpscaleDialog })));
const CanvasNodeHoverToolbar = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeHoverToolbar })));
const CanvasNodeInfoModal = lazy(() => import("../components/canvas-node-hover-toolbar").then((mod) => ({ default: mod.CanvasNodeInfoModal })));
const CanvasNodePromptPanel = lazy(() => import("../components/canvas-node-prompt-panel").then((mod) => ({ default: mod.CanvasNodePromptPanel })));
const AssetPickerModal = lazy(() => import("../components/asset-picker-modal").then((mod) => ({ default: mod.AssetPickerModal })));
const StoryAiDirectorDesk = lazy(() => import("../director/storyai/DirectorDesk").then((mod) => ({ default: mod.StoryAiDirectorDesk })));
const LazyCanvasFallback = <div className="pointer-events-none absolute inset-0" />;
const NODE_STATUS_IDLE = "idle" as const;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const EMPTY_INPUT_SUMMARY = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0 };
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
    const height = type === CanvasNodeType.Config ? getConfigNodeHeight(metadata?.generationMode || spec.metadata?.generationMode) : spec.height;

    return {
        id,
        type,
        title: spec.title,
        position: {
            x: position.x - spec.width / 2,
            y: position.y - height / 2,
        },
        width: spec.width,
        height,
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
        <ErrorBoundary>
            <Suspense fallback={LazyCanvasFallback}>
                <ReactFlowCanvasPage />
            </Suspense>
        </ErrorBoundary>
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

function CanvasExpiredShell({ onBack }: { onBack: () => void }) {
    return (
        <main className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#141414] px-6 text-white">
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />
            <div className="relative z-10 w-full max-w-sm text-center">
                <div className="mb-3 text-lg font-medium">会话已过期</div>
                <p className="mb-6 text-sm leading-6 text-white/60">这个画布已经在另一个窗口中打开。为了避免多个窗口同时写入导致数据覆盖，当前窗口已停止加载。</p>
                <Button type="primary" onClick={onBack}>
                    返回画布列表
                </Button>
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
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(position);

    useLayoutEffect(() => {
        const element = menuRef.current;
        const offsetParent = element?.offsetParent as HTMLElement | null;
        if (!element || !offsetParent) return;
        let frame = 0;
        const updatePosition = () => {
            const padding = 12;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const nextPosition = {
                x: Math.min(Math.max(padding, position.x), Math.max(padding, offsetParent.clientWidth - width - padding)),
                y: Math.min(Math.max(padding, position.y), Math.max(padding, offsetParent.clientHeight - height - padding)),
            };
            setMenuPosition((current) => (current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition));
        };
        const scheduleUpdate = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updatePosition);
        };
        scheduleUpdate();
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(element);
        observer.observe(offsetParent);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [position.x, position.y]);

    return (
        <div
            ref={menuRef}
            className="nodrag nopan absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
            data-connection-create-menu
            style={{ left: menuPosition.x, top: menuPosition.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
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
    const canvasShellRef = useRef<HTMLElement>(null);
    const composerOverlayRef = useRef<HTMLDivElement>(null);
    const dialogNodeRef = useRef<CanvasNodeData | null>(null);
    const composerWidthRef = useRef(0);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const historyRef = useRef<{ past: CanvasHistoryEntry[]; future: CanvasHistoryEntry[] }>({ past: [], future: [] });
    const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
    const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const projectSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const restoredProjectKeyRef = useRef("");
    const restoreGenerationRef = useRef(0);
    const applyingHistoryRef = useRef(false);
    const historyPausedRef = useRef(false);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nodeDraggingRef = useRef(false);
    const imageTapGestureRef = useRef<{ nodeId: string | null; count: number; lastAt: number; composerTimer: number | null }>({
        nodeId: null,
        count: 0,
        lastAt: 0,
        composerTimer: null,
    });

    const config = useConfigStore((state) => state.config);
    const comfyui = useConfigStore((state) => state.comfyui);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const userHydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const backendWorkspaceReady = saveMode !== "backend" || (userHydrated && Boolean(user && token) && workspaceStatus === "ready");
    const canvasSessionExpired = useCanvasSingleOpenLock(projectId, backendWorkspaceReady);
    const createProject = useCanvasStore((state) => state.createProject);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const projectTitle = useCanvasStore((state) => {
        const p = state.projects.find((project) => project.id === projectId);
        return p?.title || "";
    });
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    useEffect(() => {
        const shell = canvasShellRef.current;
        if (!shell) return;
        const preventBrowserWheelZoom = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) event.preventDefault();
        };
        shell.addEventListener("wheel", preventBrowserWheelZoom, { capture: true, passive: false });
        // window 层兜底：覆盖 portal 到 document.body 的 antd 弹层（Popover/Modal）
        window.addEventListener("wheel", preventBrowserWheelZoom, { capture: true, passive: false });
        return () => {
            shell.removeEventListener("wheel", preventBrowserWheelZoom, { capture: true });
            window.removeEventListener("wheel", preventBrowserWheelZoom, { capture: true });
        };
    }, []);

    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIdsState] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
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
    const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
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
    const multiNodeDragStartRef = useRef<{ anchorId: string; anchorPosition: Position; nodePositions: Map<string, Position> } | null>(null);
    const retainedMediaNodeIdsRef = useRef(new Set<string>());
    const [retainedMediaVersion, setRetainedMediaVersion] = useState(0);

    const setSelectedNodeIds = useCallback((nextValue: Set<string> | ((current: Set<string>) => Set<string>)) => {
        const next = typeof nextValue === "function" ? nextValue(selectedNodeIdsRef.current) : nextValue;
        selectedNodeIdsRef.current = next;
        setSelectedNodeIdsState(next);
    }, []);

    const resetImageTapGesture = useCallback(() => {
        const gesture = imageTapGestureRef.current;
        if (gesture.composerTimer) window.clearTimeout(gesture.composerTimer);
        imageTapGestureRef.current = { nodeId: null, count: 0, lastAt: 0, composerTimer: null };
    }, []);

    useEffect(() => () => resetImageTapGesture(), [resetImageTapGesture]);

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
        if (!backendWorkspaceReady || canvasSessionExpired) return;
        const restoreKey = `${saveMode}:${user?.id || "anonymous"}:${projectId}`;
        if (restoredProjectKeyRef.current === restoreKey) return;

        const restoreGeneration = restoreGenerationRef.current + 1;
        restoreGenerationRef.current = restoreGeneration;
        let cancelled = false;
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
            if (cancelled || restoreGenerationRef.current !== restoreGeneration) return;

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
            restoredProjectKeyRef.current = restoreKey;
            setHistoryState({ canUndo: false, canRedo: false });
            setProjectLoaded(true);
        };
        void restore();
        return () => {
            cancelled = true;
            if (restoreGenerationRef.current === restoreGeneration) restoreGenerationRef.current += 1;
        };
    }, [backendWorkspaceReady, canvasSessionExpired, navigate, openProject, projectId, saveMode, user?.id]);

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
        selectedConnectionIdRef.current = selectedConnectionId;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, selectedConnectionId, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport((current) => {
                    if (current.x !== 0 || current.y !== 0 || current.k !== 1) return current;
                    const next = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    viewportRef.current = next;
                    return current.x === next.x && current.y === next.y && current.k === next.k ? current : next;
                });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

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
        return {
            x: (rect?.left || 0) + position.x * viewport.k + viewport.x,
            y: (rect?.top || 0) + position.y * viewport.k + viewport.y,
        };
    }, [viewport.k, viewport.x, viewport.y]);

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
        }, NODE_TOOLBAR_HIDE_DELAY_MS);
    }, []);

    useEffect(() => () => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
    }, []);

    const nodeById = useMemo(() => buildNodeById(nodes), [nodes]);
    const batchVisibilityIndex = useMemo(() => buildBatchVisibilityIndex(nodes, nodeById, collapsingBatchIds), [collapsingBatchIds, nodeById, nodes]);
    const connectionAdjacency = useMemo(() => buildConnectionAdjacency(connections), [connections]);
    const visibleNodeItems = useMemo(
        () => nodes.filter((node) => !batchVisibilityIndex.hiddenBatchChildIds.has(node.id)).sort((a, b) => (a.type === CanvasNodeType.Group ? 0 : 1) - (b.type === CanvasNodeType.Group ? 0 : 1)),
        [batchVisibilityIndex, nodes],
    );
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

    const handleLeaferConnect = useCallback(
        (fromNodeId: string, toNodeId: string) => {
            const startedFrom = connectingParamsRef.current;
            const startHandleType = startedFrom?.handleType || "source";
            connectNodes({ nodeId: fromNodeId, handleType: startHandleType }, toNodeId);
        },
        [connectNodes],
    );

    const handleLeaferConnectStart = useCallback(
        (nodeId: string, handleType: "source" | "target") => {
            const nextConnection = { nodeId, handleType };
            connectingParamsRef.current = nextConnection;
            setConnecting(nextConnection);
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
            setPendingConnectionCreate(null);
        },
        [setConnecting],
    );

    const handleLeaferConnectEnd = useCallback((canvasPos?: { x: number; y: number }) => {
        const currentConnection = connectingParamsRef.current;
        connectingParamsRef.current = null;
        setConnecting(null);
        if (canvasPos && currentConnection) {
            // Dropped on empty space → show "create node" menu
            setMouseWorld(canvasPos);
            setPendingConnectionCreate({ connection: currentConnection, position: canvasPos });
        }
    }, [setConnecting]);

    const handleLeaferNodeDragStart = useCallback((nodeId: string) => {
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
        const anchor = nodeByIdRef.current.get(nodeId);
        if (!anchor) return;
        const movingIds = selectedNodeIdsRef.current.has(nodeId)
            ? new Set(selectedNodeIdsRef.current)
            : new Set([nodeId]);
        for (const id of Array.from(movingIds)) {
            const node = nodeByIdRef.current.get(id);
            if (node?.type === CanvasNodeType.Group) {
                for (const childId of node.metadata?.groupChildIds || []) movingIds.add(childId);
            }
        }
        multiNodeDragStartRef.current = {
            anchorId: nodeId,
            anchorPosition: { ...anchor.position },
            nodePositions: new Map(nodesRef.current.filter((item) => movingIds.has(item.id)).map((item) => [item.id, { ...item.position }])),
        };
    }, []);

    const nodeDragRafRef = useRef<number>(0);
    const pendingDragPosRef = useRef<{ nodeId: string; position: { x: number; y: number } } | null>(null);
    const handleLeaferNodeDrag = useCallback((nodeId: string, position: { x: number; y: number }) => {
        // RAF 节流：拖拽时每帧最多更新一次 nodes state，避免高频 setNodes 触发级联 useMemo 重算
        pendingDragPosRef.current = { nodeId, position };
        if (nodeDragRafRef.current) return;
        nodeDragRafRef.current = requestAnimationFrame(() => {
            nodeDragRafRef.current = 0;
            const pending = pendingDragPosRef.current;
            if (!pending) return;
            pendingDragPosRef.current = null;
            const multiNodeDrag = multiNodeDragStartRef.current;
            if (multiNodeDrag?.anchorId === pending.nodeId) {
                const dx = pending.position.x - multiNodeDrag.anchorPosition.x;
                const dy = pending.position.y - multiNodeDrag.anchorPosition.y;
                setNodes((prev) => {
                    let changed = false;
                    const next = prev.map((node) => {
                        const startPosition = multiNodeDrag.nodePositions.get(node.id);
                        if (!startPosition) return node;
                        const nextPosition = { x: startPosition.x + dx, y: startPosition.y + dy };
                        if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
                        changed = true;
                        return { ...node, position: nextPosition };
                    });
                    return changed ? next : prev;
                });
                return;
            }
            setNodes((prev) => {
                let changed = false;
                const next = prev.map((node) => {
                    if (node.id !== pending.nodeId || (node.position.x === pending.position.x && node.position.y === pending.position.y)) return node;
                    changed = true;
                    return { ...node, position: pending.position };
                });
                return changed ? next : prev;
            });
        });
    }, []);

    const handleLeaferNodeDragStop = useCallback((nodeId: string, position: { x: number; y: number }) => {
        const multiNodeDrag = multiNodeDragStartRef.current;
        if (multiNodeDrag?.anchorId === nodeId) {
            const dx = position.x - multiNodeDrag.anchorPosition.x;
            const dy = position.y - multiNodeDrag.anchorPosition.y;
            setNodes((prev) => {
                let changed = false;
                const next = prev.map((node) => {
                    const startPosition = multiNodeDrag.nodePositions.get(node.id);
                    if (!startPosition) return node;
                    const nextPosition = { x: startPosition.x + dx, y: startPosition.y + dy };
                    if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
                    changed = true;
                    return { ...node, position: nextPosition };
                });
                return reconcileGroupMembership(changed ? next : prev);
            });
        } else {
            setNodes((prev) => {
                let changed = false;
                const next = prev.map((node) => {
                    if (node.id !== nodeId || (node.position.x === position.x && node.position.y === position.y)) return node;
                    changed = true;
                    return { ...node, position };
                });
                return reconcileGroupMembership(changed ? next : prev);
            });
        }
        multiNodeDragStartRef.current = null;
        // 取消可能 pending 的拖拽 RAF，避免 dragStop 后多一次无效 setNodes
        if (nodeDragRafRef.current) {
            cancelAnimationFrame(nodeDragRafRef.current);
            nodeDragRafRef.current = 0;
        }
        pendingDragPosRef.current = null;
        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
    }, []);

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

    useEffect(() => {
        const retainedIds = retainedMediaNodeIdsRef.current;
        let changed = false;

        visibleNodes.forEach((node) => {
            if (!hasRetainableMedia(node) || retainedIds.has(node.id)) return;
            retainedIds.add(node.id);
            changed = true;
        });

        if (changed) setRetainedMediaVersion((version) => version + 1);
    }, [visibleNodes]);

    useEffect(() => {
        const retainedIds = retainedMediaNodeIdsRef.current;
        const existingIds = new Set(nodes.map((node) => node.id));
        let changed = false;

        retainedIds.forEach((id) => {
            if (existingIds.has(id)) return;
            retainedIds.delete(id);
            changed = true;
        });

        if (changed) setRetainedMediaVersion((version) => version + 1);
    }, [nodes]);

    // 实际渲染的节点列表：视口内可见节点 + 必须保持挂载的特殊节点（正在编辑/有对话框/有工具栏等）
    const renderedNodes = useMemo(() => {
        const visibleIds = new Set(visibleNodes.map((n) => n.id));
        const mustRenderIds = new Set<string>();
        // 正在编辑、有对话框、有工具栏、有裁剪/蒙版等操作中的节点即使不在视口内也需保持挂载
        for (const id of [editingNodeId, dialogNodeId, toolbarNodeId, cropNodeId, maskEditNodeId, splitNodeId, upscaleNodeId, angleNodeId, previewNodeId]) {
            if (id) mustRenderIds.add(id);
        }
        // 选中节点也需保持挂载（可能被拖拽出视口）
        selectedNodeIdsRef.current.forEach((id) => mustRenderIds.add(id));
        // 已经进入过视口的媒体节点保持 DOM 挂载，避免平移回来时重新创建媒体元素和重复读取元数据
        retainedMediaNodeIdsRef.current.forEach((id) => mustRenderIds.add(id));
        // 合并：视口内 + 必须挂载的，保持 Group 优先排序
        const extra = mustRenderIds.size
            ? visibleNodeItems.filter((n) => !visibleIds.has(n.id) && mustRenderIds.has(n.id))
            : [];
        return extra.length ? [...visibleNodes, ...extra] : visibleNodes;
    }, [visibleNodes, visibleNodeItems, editingNodeId, dialogNodeId, toolbarNodeId, cropNodeId, maskEditNodeId, splitNodeId, upscaleNodeId, angleNodeId, previewNodeId, retainedMediaVersion]);

    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const upscaleNode = upscaleNodeId ? nodeById.get(upscaleNodeId) || null : null;    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const activeNodeId = hasMultipleSelectedNodes ? null : selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const toolbarNode = toolbarNodeId
        ? nodeById.get(toolbarNodeId) || null
        : activeNodeId
          ? nodeById.get(activeNodeId) || null
          : null;
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
        () => ({ projectId, title: projectTitle || "未命名画布", nodes, connections, selectedNodeIds: Array.from(selectedNodeIds), viewport: viewportRef.current }),
        [connections, projectTitle, nodes, projectId, selectedNodeIds],
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

    const createGroupFromSelection = useCallback(
        (variant: "normal" | "storyboard" = "normal") => {
            const selectedIds = Array.from(selectedNodeIdsRef.current);
            const selectedNodes = nodesRef.current.filter((node) => selectedIds.includes(node.id) && node.type !== CanvasNodeType.Group);
            if (selectedNodes.length < 2) {
                message.info("至少选择 2 个节点才能成组");
                return;
            }
            const existingGroupIds = new Set(nodesRef.current.filter((node) => node.type === CanvasNodeType.Group).flatMap((node) => node.metadata?.groupChildIds || []));
            const groupNodes = selectedNodes.filter((node) => !existingGroupIds.has(node.id));
            if (groupNodes.length < 2) {
                message.info("选中的节点已经在分组中");
                return;
            }

            const padding = 48;
            const left = Math.min(...groupNodes.map((node) => node.position.x)) - padding;
            const top = Math.min(...groupNodes.map((node) => node.position.y)) - padding;
            const right = Math.max(...groupNodes.map((node) => node.position.x + node.width)) + padding;
            const bottom = Math.max(...groupNodes.map((node) => node.position.y + node.height)) + padding;
            const group: CanvasNodeData = {
                id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: CanvasNodeType.Group,
                title: variant === "storyboard" ? "分镜组" : "分组",
                position: { x: left, y: top },
                width: Math.max(220, right - left),
                height: Math.max(160, bottom - top),
                metadata: { groupChildIds: groupNodes.map((node) => node.id), groupVariant: variant, status: NODE_STATUS_IDLE },
            };

            nodesRef.current = [group, ...nodesRef.current];
            setNodes((prev) => [group, ...prev]);
            selectedNodeIdsRef.current = new Set([group.id]);
            setSelectedNodeIds(new Set([group.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setContextMenu(null);
        },
        [message],
    );

    const ungroupNodes = useCallback((groupIds: string[]) => {
        const ids = new Set(groupIds);
        if (!ids.size) return;
        const nextNodes = nodesRef.current.filter((node) => !ids.has(node.id));
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        selectedNodeIdsRef.current = new Set();
        setSelectedNodeIds(new Set());
        setDialogNodeId(null);
        setContextMenu(null);
    }, []);

    const handleGroupAction = useCallback(
        (node: CanvasNodeData, action: "storyboard" | "ungroup") => {
            if (node.type !== CanvasNodeType.Group) return;
            if (action === "ungroup") {
                ungroupNodes([node.id]);
                return;
            }
            if (action === "storyboard") {
                setNodes((prev) => prev.map((item) => (item.id === node.id ? { ...item, title: !item.title || item.title === "分组" ? "分镜组" : item.title, metadata: { ...item.metadata, groupVariant: "storyboard" } } : item)));
                message.success("已转换为分镜组");
                return;
            }
        },
        [message, ungroupNodes],
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
                const groupChildIds = node.metadata?.groupChildIds?.filter((childId) => !allIds.has(childId));
                const childIds = node.metadata?.batchChildIds?.filter((childId) => !allIds.has(childId));
                const groupChanged = groupChildIds?.length !== node.metadata?.groupChildIds?.length;
                const batchChanged = node.metadata?.isBatchRoot && childIds?.length !== node.metadata.batchChildIds?.length;
                if (!groupChanged && !batchChanged) return node;
                const primaryImageId = childIds?.includes(node.metadata?.primaryImageId || "") ? node.metadata?.primaryImageId : childIds?.[0];
                const primaryNode = nextNodes.find((item) => item.id === primaryImageId);
                return {
                    ...node,
                    metadata: {
                        ...(batchChanged ? promoteImageMetadata(node.metadata, primaryNode?.metadata) : node.metadata),
                        ...(groupChanged ? { groupChildIds } : {}),
                        ...(batchChanged ? { batchChildIds: childIds, primaryImageId } : {}),
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
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
        setDialogNodeId(null);
    }, [resetImageTapGesture]);

    const openConnectionContextMenu = useCallback((event: ReactMouseEvent<Element>, connectionId: string) => {
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = connectionId;
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setDialogNodeId(null);
        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
    }, [resetImageTapGesture]);

    const deselectCanvas = useCallback(() => {
        cancelPendingConnectionCreate();
        resetImageTapGesture();
        selectedNodeIdsRef.current = new Set();
        selectedConnectionIdRef.current = null;
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
    }, [cancelPendingConnectionCreate, resetImageTapGesture]);

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
        const rect = containerRef.current?.getBoundingClientRect();
        const width = rect?.width || size.width;
        const height = rect?.height || size.height;
        const fitNodes = nodes.filter((node) => !hiddenBatchChildIdsRef.current.has(node.id));
        if (!fitNodes.length || !width || !height) {
            const next = { x: width / 2, y: height / 2, k: 1 };
            viewportRef.current = next;
            setViewport(next);
            setContextMenu(null);
            return;
        }
        const bounds = fitNodes.reduce(
            (result, node) => ({
                left: Math.min(result.left, node.position.x),
                top: Math.min(result.top, node.position.y),
                right: Math.max(result.right, node.position.x + node.width),
                bottom: Math.max(result.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const padding = 96;
        const contentWidth = Math.max(1, bounds.right - bounds.left);
        const contentHeight = Math.max(1, bounds.bottom - bounds.top);
        const scale = Math.max(0.05, Math.min(1, (width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight));
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const next = { x: width / 2 - centerX * scale, y: height / 2 - centerY * scale, k: scale };
        viewportRef.current = next;
        setViewport(next);
        setContextMenu(null);
    }, [nodes, size.height, size.width]);

    const setZoomScale = useCallback(
        (scale: number) => {
            const nextScale = Math.min(Math.max(scale, 0.05), 5);
            const rect = containerRef.current?.getBoundingClientRect();
            const width = rect?.width && rect.width > 0 ? rect.width : size.width;
            const height = rect?.height && rect.height > 0 ? rect.height : size.height;
            setViewport((prev) => {
                const next = {
                    x: width / 2 - ((width / 2 - prev.x) / prev.k) * nextScale,
                    y: height / 2 - ((height / 2 - prev.y) / prev.k) * nextScale,
                    k: nextScale,
                };
                viewportRef.current = next;
                return next;
            });
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

            if (['Control', 'Meta', 'Shift'].includes(event.key)) {
                setDialogNodeId(null);
                setToolbarNodeId(null);
                return;
            }

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

            if (isModifierShortcut && !event.altKey && (event.key === "+" || event.key === "=")) {
                event.preventDefault();
                setZoomScale(viewportRef.current.k * 1.12);
                return;
            }

            if (isModifierShortcut && !event.altKey && event.key === "-") {
                event.preventDefault();
                setZoomScale(viewportRef.current.k / 1.12);
                return;
            }

            if (isModifierShortcut && !event.altKey && event.key === "0") {
                event.preventDefault();
                resetViewport();
                return;
            }

            // 拦截浏览器原生快捷键，避免触发保存网页/打印对话框
            if (isModifierShortcut && !event.altKey && (key === "s" || key === "p")) {
                event.preventDefault();
                return;
            }

            if ((isModifierShortcut || event.altKey) && key === "g") {
                event.preventDefault();
                if (event.shiftKey) {
                    const groupIds = Array.from(selectedNodeIdsRef.current).filter((id) => nodeByIdRef.current.get(id)?.type === CanvasNodeType.Group);
                    ungroupNodes(groupIds);
                } else {
                    createGroupFromSelection(isModifierShortcut && event.altKey ? "storyboard" : "normal");
                }
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
                resetImageTapGesture();
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
    }, [copySelectedNodes, createGroupFromSelection, deleteConnection, deleteNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, resetImageTapGesture, resetViewport, setConnecting, setZoomScale, undoCanvas, ungroupNodes]);

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

    const handleLeaferNodePointerDown = useCallback((nodeId: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        selectedConnectionIdRef.current = null;
        setSelectedConnectionId(null);

        const currentSelected = selectedNodeIdsRef.current;
        const nextSelected = new Set(currentSelected);
        const isToggle = modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey;
        if (isToggle) {
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
        const node = nodeByIdRef.current.get(nodeId);
        const isMediaPreviewNode =
            node?.type === CanvasNodeType.Image &&
            Boolean(node.metadata?.content || node.metadata?.storageKey);
        if (!isMediaPreviewNode || isToggle || imageTapGestureRef.current.nodeId !== nodeId) resetImageTapGesture();
        if (!isToggle && nextSelected.size === 1 && !isMediaPreviewNode && node?.type !== CanvasNodeType.Group && node?.metadata?.canvasTool !== "director") {
            setDialogNodeId(nodeId);
        } else {
            setDialogNodeId(null);
        }
        return !isToggle;
    }, [resetImageTapGesture]);

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
            const changed = nodesRef.current.some(
                (node) => node.id === nodeId && node.type === CanvasNodeType.Image && node.metadata?.canvasTool !== "panorama360",
            );
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== nodeId || node.type !== CanvasNodeType.Image) return node;
                    if (node.metadata?.canvasTool === "panorama360") return node;
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

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        const nextTitle = title.trim();
        if (!nextTitle) return;
        setNodes((prev) => prev.map((node) => (node.id === nodeId && node.title !== nextTitle ? { ...node, title: nextTitle } : node)));
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
        const next = new Set([node.id]);
        selectedNodeIdsRef.current = next;
        setSelectedNodeIds(next);
        selectedConnectionIdRef.current = null;
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        setEditingNodeId(node.id);
        setEditRequestNonce((value) => value + 1);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.metadata?.prompt === prompt) return node;
                return { ...node, metadata: { ...node.metadata, prompt } };
            }),
        );
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const handleConfigNodeHeightChange = useCallback((nodeId: string, height: number) => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                if (node.id !== nodeId || node.height === height) return node;
                changed = true;
                return { ...node, height };
            });
            return changed ? next : prev;
        });
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
                let image;
                try {
                    image = await uploadImage(file);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "图片上传失败，请重试");
                    uploadTargetRef.current = null;
                    event.target.value = "";
                    return;
                }
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

    const handleDropFiles = useCallback(
        (files: FileList, canvasPos: { x: number; y: number }) => {
            const file = Array.from(files).find((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || isAudioFile(item) || isTextFile(item));
            if (!file) return;
            void (isTextFile(file) ? createTextFileNode(file, canvasPos) : isAudioFile(file) ? createAudioFileNode(file, canvasPos) : file.type.startsWith("video/") ? createVideoFileNode(file, canvasPos) : createImageFileNode(file, canvasPos));
        },
        [createAudioFileNode, createImageFileNode, createTextFileNode, createVideoFileNode],
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

    const handleGenerateNode = useCallback(
        async (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => {
            const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
            const generationConfig = buildGenerationConfig(effectiveConfig, sourceNode, mode);
            const isComfyMode = mode === "comfyui";
            if (!isComfyMode && !isAiConfigReady(generationConfig, generationConfig.model)) {
                message.warning("请先配置当前模型渠道和 API Key");
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
                message.warning(mode === "audio" ? "请先输入朗读文本或连接文本节点" : "请先输入提示词或连接上游文本节点");
                setDialogNodeId(nodeId);
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
                    const results = await Promise.all(
                        targetIds.map(async (targetId) => {
                            try {
                                const image = referenceImages.length
                                    ? await requestEdit({ ...generationConfig, count: "1" }, effectivePrompt, referenceImages, undefined, { signal: controller.signal }).then((items) => items[0])
                                    : await requestGeneration({ ...generationConfig, count: "1" }, effectivePrompt, { signal: controller.signal }).then((items) => items[0]);
                                if (!image?.dataUrl) throw new Error("接口没有返回图片 URL");
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
                                if (isConfigNode) setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS, errorDetails: undefined } } : node)));
                                return { ok: true as const, targetId };
                            } catch (error) {
                                if (isGenerationCanceled(error)) return { ok: false as const, targetId, canceled: true };
                                const errorDetails = error instanceof Error ? error.message : "生成失败";
                                setNodes((prev) => prev.map((node) => (node.id === targetId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails } } : node)));
                                return { ok: false as const, targetId, errorDetails };
                            } finally {
                                finishGenerationRequest(targetId, controller);
                            }
                        }),
                    );
                    if (count > 1) finishGenerationRequest(rootId, controller);
                    if (controller.signal.aborted) {
                        setNodes((prev) => prev.map((node) => (node.id === nodeId && isConfigNode && node.metadata?.status === NODE_STATUS_LOADING ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_IDLE, errorDetails: undefined } } : node)));
                        return;
                    }
                    const hasSuccess = results.some((result) => result.ok);
                    const failedResults = results.filter((result) => !result.ok && !("canceled" in result));
                    const hasFailure = failedResults.length > 0;
                    const firstErrorDetails = failedResults.find((result) => "errorDetails" in result)?.errorDetails || "全部图片生成失败";
                    if (hasFailure) message.error(hasSuccess ? "部分图片生成失败" : firstErrorDetails);
                    setNodes((prev) =>
                        prev.map((node) =>
                            node.id === nodeId && isConfigNode
                                ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstErrorDetails } }
                                : node.id === nodeId && isEmptyImageNode
                                  ? { ...node, metadata: { ...node.metadata, status: hasSuccess ? NODE_STATUS_SUCCESS : NODE_STATUS_ERROR, errorDetails: hasSuccess ? undefined : firstErrorDetails } }
                                  : node.id === rootId && !hasSuccess
                                    ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_ERROR, errorDetails: node.metadata?.errorDetails || firstErrorDetails } }
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
                            draft: generationConfig.videoDraft,
                            videoGenerationMode: sourceNode?.metadata?.videoGenerationMode,
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
                            await requestVideoGeneration(generationConfig, effectivePrompt, generationContext.referenceImages, generationContext.referenceVideos, generationContext.referenceAudios, {
                                signal: controller.signal,
                                generationMode: sourceNode?.metadata?.videoGenerationMode,
                            }),
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
                                              draft: generationConfig.videoDraft,
                                              videoGenerationMode: sourceNode?.metadata?.videoGenerationMode,
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
                    const videoGenerationMode = node.metadata?.videoGenerationMode ?? sourceNode.metadata?.videoGenerationMode;
                    const video = await storeGeneratedVideo(
                        await requestVideoGeneration(generationConfig, prompt, retryImages, context?.referenceVideos || [], context?.referenceAudios || [], {
                            signal: controller.signal,
                            generationMode: videoGenerationMode,
                        }),
                    );
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
                                          draft: generationConfig.videoDraft,
                                          videoGenerationMode,
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

    const insertVideoFrameCapture = useCallback(async (sourceNode: CanvasNodeData, dataUrl: string, kind: "first" | "current" | "last") => {
        const videoNode = nodesRef.current.find((node) => node.id === sourceNode.id && node.type === CanvasNodeType.Video);
        if (!videoNode) {
            message.error("源视频节点已不存在");
            return;
        }
        const frameLabel = kind === "first" ? "首帧" : kind === "last" ? "尾帧" : "当前帧";
        try {
            const image = await uploadImage(dataUrl);
            const size = fitNodeSize(image.width, image.height);
            const frameNode = {
                ...createCanvasNode(
                    CanvasNodeType.Image,
                    {
                        x: videoNode.position.x + videoNode.width + 64 + size.width / 2,
                        y: videoNode.position.y + videoNode.height / 2,
                    },
                    {
                        ...imageMetadata(image),
                        freeResize: true,
                        status: NODE_STATUS_SUCCESS,
                    },
                ),
                title: `${videoNode.title || "视频"} - ${frameLabel}`,
                width: size.width,
                height: size.height,
            } satisfies CanvasNodeData;
            setNodes((previous) => [...previous, frameNode]);
            setConnections((previous) => [...previous, { id: nanoid(), fromNodeId: videoNode.id, toNodeId: frameNode.id }]);
            setSelectedNodeIds(new Set([frameNode.id]));
            setSelectedConnectionId(null);
            message.success(`${frameLabel}已插入画布`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频截帧插入失败");
            throw error;
        }
    }, []);

    const insertDirectorCaptures = useCallback(
        async (directorNodeId: string, captures: DirectorDeskCapture[]) => {
            const directorNode = nodesRef.current.find((node) => node.id === directorNodeId);
            if (!directorNode) throw new Error("导演台节点已不存在");
            if (captures.length === 0) throw new Error("没有可插入的导演台截图");

            try {
                const gap = 44;
                const createdNodes = await Promise.all(
                    captures.map(async (capture, index) => {
                        const image = await uploadImage(capture.dataUrl);
                        const imageSize = fitNodeSize(image.width, image.height);
                        const id = `director-shot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
                        return {
                            id,
                            type: CanvasNodeType.Image,
                            title: capture.fileName.replace(/\.[^.]+$/, "") || `导演台截图 ${index + 1}`,
                            position: {
                                x: directorNode.position.x + directorNode.width + 120 + index * (imageSize.width + gap),
                                y: directorNode.position.y + index * 34,
                            },
                            width: imageSize.width,
                            height: imageSize.height,
                            metadata: {
                                ...imageMetadata(image),
                                prompt: `来自 ${directorNode.title} 的 3D 机位截图`,
                                generationMode: "image",
                                generationType: "generation",
                                freeResize: true,
                                status: NODE_STATUS_SUCCESS,
                            },
                        } satisfies CanvasNodeData;
                    }),
                );
                const outputIds = createdNodes.map((node) => node.id);
                setNodes((previous) => [
                    ...previous.map((node) =>
                        node.id === directorNodeId
                            ? {
                                  ...node,
                                  metadata: {
                                      ...node.metadata,
                                      directorOutputIds: [...(node.metadata?.directorOutputIds || []), ...outputIds],
                                      status: NODE_STATUS_SUCCESS,
                                  },
                              }
                            : node,
                    ),
                    ...createdNodes,
                ]);
                setConnections((previous) => [
                    ...previous,
                    ...createdNodes.map((node) => ({ id: nanoid(), fromNodeId: directorNodeId, toNodeId: node.id })),
                ]);
                setSelectedNodeIds(new Set(outputIds));
                setSelectedConnectionId(null);
                message.success(`${createdNodes.length} 张导演台截图已插入画布`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "导演台截图插入失败");
                throw error;
            }
        },
        [message],
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
            panelNode.metadata?.canvasTool === "script" ? (
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
                onHeightChange={handleConfigNodeHeightChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    const mode = target?.metadata?.generationMode || defaultGenerationMode(target?.type);
                    void handleGenerateNode(nodeId, mode, target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [configInputSummaryById, configInputsById, confirmStopGeneration, handleConfigNodeChange, handleConfigNodeHeightChange, handleGenerateNode, mentionReferencesByNodeId, runningNodeId],
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

    const viewportRafRef = useRef<number>(0);
    const pendingViewportRef = useRef<ViewportTransform | null>(null);
    const handleReactFlowViewportChange = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        pendingViewportRef.current = next;
        if (viewportRafRef.current) return;
        viewportRafRef.current = requestAnimationFrame(() => {
            viewportRafRef.current = 0;
            const pending = pendingViewportRef.current;
            if (!pending) return;
            pendingViewportRef.current = null;
            setViewport((current) => {
                if (current.x === pending.x && current.y === pending.y && current.k === pending.k) return current;
                return pending;
            });
            setContextMenu((current) => (current ? null : current));
        });
    }, []);

    // 组件卸载时取消未执行的 RAF
    useEffect(() => () => {
        if (viewportRafRef.current) cancelAnimationFrame(viewportRafRef.current);
        if (nodeDragRafRef.current) cancelAnimationFrame(nodeDragRafRef.current);
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
            selectedConnectionIdRef.current = null;
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

    const handleLeaferNodeTap = useCallback(
        (nodeId: string) => {
            const node = nodeByIdRef.current.get(nodeId);
            const isPopulatedImage =
                node?.type === CanvasNodeType.Image &&
                Boolean(node.metadata?.content || node.metadata?.storageKey);
            if (!node || !isPopulatedImage) return;

            const now = Date.now();
            const previous = imageTapGestureRef.current;
            if (previous.nodeId !== nodeId || now - previous.lastAt > 750) {
                resetImageTapGesture();
                imageTapGestureRef.current = { nodeId, count: 1, lastAt: now, composerTimer: null };
                return;
            }

            const count = previous.count + 1;
            previous.count = count;
            previous.lastAt = now;
            if (count === 2) {
                if (previous.composerTimer) window.clearTimeout(previous.composerTimer);
                previous.composerTimer = window.setTimeout(() => {
                    const currentGesture = imageTapGestureRef.current;
                    if (currentGesture.nodeId !== nodeId || currentGesture.count !== 2) return;
                    const currentNode = nodeByIdRef.current.get(nodeId);
                    resetImageTapGesture();
                    if (currentNode) openNodeComposer(currentNode);
                }, 760);
                return;
            }

            resetImageTapGesture();
            handleViewNodeImage(node);
        },
        [handleViewNodeImage, openNodeComposer, resetImageTapGesture],
    );
    const createConnectedGenerationNode = useCallback(
        (sourceNode: CanvasNodeData, type: CanvasNodeType.Video | CanvasNodeType.Audio) => {
            const source = nodesRef.current.find((node) => node.id === sourceNode.id);
            if (!source) return;
            const spec = NODE_DEFAULT_SIZE[type];
            const prompt = (source.metadata?.content || source.metadata?.prompt || "").trim();
            const target = createCanvasNode(
                type,
                { x: source.position.x + source.width + 96, y: source.position.y },
                type === CanvasNodeType.Video
                    ? {
                          status: NODE_STATUS_IDLE,
                          prompt,
                          composerContent: prompt,
                          generationMode: "video",
                          videoGenerationMode: "text-to-video",
                          model: effectiveConfig.videoModel || effectiveConfig.model,
                      }
                    : {
                          status: NODE_STATUS_IDLE,
                          prompt,
                          composerContent: prompt,
                          generationMode: "audio",
                          model: effectiveConfig.audioModel || effectiveConfig.model,
                      },
            );
            target.title = type === CanvasNodeType.Video ? "文生视频" : "文字生音乐";
            target.width = spec.width;
            target.height = spec.height;
            const nextNodes = [...nodesRef.current, target];
            const nextConnections = [...connectionsRef.current, { id: nanoid(), fromNodeId: source.id, toNodeId: target.id }];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([target.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(target.id);
            setEditingNodeId(null);
        },
        [effectiveConfig.audioModel, effectiveConfig.model, effectiveConfig.videoModel],
    );

    const handleNodeAction = useCallback(
        (node: CanvasNodeData, intent: CanvasNodeActionIntent) => {
            switch (intent) {
                case "text-to-video":
                    createConnectedGenerationNode(node, CanvasNodeType.Video);
                    return;
                case "text-to-audio":
                    createConnectedGenerationNode(node, CanvasNodeType.Audio);
                    return;
                case "script-edit":
                    openNodeComposer(node);
                    return;
                case "script-to-storyboard":
                    createScriptStoryboard(node);
                    return;
                case "script-to-video":
                    createScriptVideoNode(node);
                    return;
                case "script-to-audio":
                    createScriptNarrationNode(node);
                    return;
                case "image-to-panorama": {
                    const prompt = (node.metadata?.composerContent || node.metadata?.prompt || DEFAULT_PANORAMA_360_PROMPT).trim();
                    const nextNode: CanvasNodeData = {
                        ...node,
                        title: node.title || "360场景",
                        metadata: {
                            ...node.metadata,
                            canvasTool: "panorama360",
                            prompt,
                            composerContent: prompt,
                            generationMode: "image",
                            generationType: "generation",
                            model: node.metadata?.model || effectiveConfig.imageModel || effectiveConfig.model,
                            size: "2048x1024",
                            count: 1,
                            freeResize: true,
                            status: NODE_STATUS_IDLE,
                            errorDetails: undefined,
                        },
                    };
                    setNodes((current) => current.map((item) => (item.id === node.id ? nextNode : item)));
                    openNodeComposer(nextNode);
                    return;
                }
            }
        },
        [createConnectedGenerationNode, createScriptNarrationNode, createScriptStoryboard, createScriptVideoNode, effectiveConfig.imageModel, effectiveConfig.model, openNodeComposer],
    );
    const reactFlowConnections = useMemo(
        () => connections.filter((connection) => !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.fromNodeId) && !batchVisibilityIndex.hiddenConnectionEndpointIds.has(connection.toNodeId)),
        [batchVisibilityIndex.hiddenConnectionEndpointIds, connections],
    );
    const connectionPaths = useMemo(
        () =>
            reactFlowConnections.flatMap((connection) => {
                const points = getConnectionPoints(connection, nodeById);
                if (!points) return [];
                return [{ connection, path: buildConnectionPathFromPoints(points.from, points.to) }];
            }),
        [nodeById, reactFlowConnections],
    );
    const directorStudioNode = useMemo(() => (directorStudioNodeId ? nodes.find((node) => node.id === directorStudioNodeId && node.metadata?.canvasTool === "director") || null : null), [directorStudioNodeId, nodes]);
    const dialogNode = useMemo(() => {
        const node = dialogNodeId ? visibleNodeItems.find((item) => item.id === dialogNodeId) || null : null;
        return node?.metadata?.canvasTool === "director" ? null : node;
    }, [dialogNodeId, visibleNodeItems]);
    const composerShellWidth = canvasShellRef.current?.clientWidth || containerRef.current?.clientWidth || size.width || 1280;
    const composerWidth = dialogNode ? Math.min(dialogNode.type === CanvasNodeType.Config ? 500 : 760, Math.max(dialogNode.type === CanvasNodeType.Config ? 420 : 520, composerShellWidth - 48)) : 0;
    dialogNodeRef.current = dialogNode;
    composerWidthRef.current = composerWidth;
    const composerPosition = dialogNode
        ? (() => {
              const shellRect = canvasShellRef.current?.getBoundingClientRect();
              const containerRect = containerRef.current?.getBoundingClientRect();
              const nodeRect = findCanvasNodeElement(containerRef.current, dialogNode.id)?.getBoundingClientRect();
              const shellOffsetX = shellRect ? shellRect.left : containerRect?.left || 0;
              const shellOffsetY = shellRect ? shellRect.top : containerRect?.top || 0;
              const containerOffsetX = containerRect ? containerRect.left - shellOffsetX : 0;
              const containerOffsetY = containerRect ? containerRect.top - shellOffsetY : 0;
              const rawLeft = nodeRect ? nodeRect.left - shellOffsetX + nodeRect.width / 2 : containerOffsetX + (dialogNode.position.x + dialogNode.width / 2) * viewport.k + viewport.x;
              const nodeTop = nodeRect ? nodeRect.top - shellOffsetY : containerOffsetY + dialogNode.position.y * viewport.k + viewport.y;
              const nodeBottom = nodeRect ? nodeRect.bottom - shellOffsetY : containerOffsetY + (dialogNode.position.y + dialogNode.height) * viewport.k + viewport.y;
              const estimatedHeight = dialogNode.type === CanvasNodeType.Config ? 260 : 168;
              const shellHeight = shellRect?.height || size.height || 900;
              const dockSafeBottom = shellHeight - 104;
              const rawTop = nodeBottom + estimatedHeight > dockSafeBottom && nodeTop > estimatedHeight + 24 ? nodeTop - estimatedHeight - 14 : nodeBottom;
              const minTop = 24;
              const maxTop = Math.max(minTop, dockSafeBottom - estimatedHeight);
              const halfWidth = composerWidth / 2;
              const minLeft = halfWidth + 24;
              const shellWidth = shellRect?.width || size.width;
              const maxLeft = Math.max(minLeft, shellWidth - halfWidth - 24);
              return {
                  left: clampNumber(rawLeft, minLeft, maxLeft),
                  top: clampNumber(rawTop, minTop, maxTop),
              };
          })()
        : null;

    const handleViewportPresentation = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        const overlay = composerOverlayRef.current;
        const node = dialogNodeRef.current;
        if (!overlay || !node) return;

        const shellRect = canvasShellRef.current?.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        const shellOffsetX = shellRect ? shellRect.left : containerRect?.left || 0;
        const shellOffsetY = shellRect ? shellRect.top : containerRect?.top || 0;
        const containerOffsetX = containerRect ? containerRect.left - shellOffsetX : 0;
        const containerOffsetY = containerRect ? containerRect.top - shellOffsetY : 0;
        const rawLeft = containerOffsetX + (node.position.x + node.width / 2) * next.k + next.x;
        const nodeTop = containerOffsetY + node.position.y * next.k + next.y;
        const nodeBottom = containerOffsetY + (node.position.y + node.height) * next.k + next.y;
        const estimatedHeight = node.type === CanvasNodeType.Config ? 260 : 168;
        const shellHeight = shellRect?.height || size.height || 900;
        const dockSafeBottom = shellHeight - 104;
        const rawTop = nodeBottom + estimatedHeight > dockSafeBottom && nodeTop > estimatedHeight + 24
            ? nodeTop - estimatedHeight - 14
            : nodeBottom;
        const minTop = 24;
        const maxTop = Math.max(minTop, dockSafeBottom - estimatedHeight);
        const width = composerWidthRef.current;
        const halfWidth = width / 2;
        const minLeft = halfWidth + 24;
        const shellWidth = shellRect?.width || size.width;
        const maxLeft = Math.max(minLeft, shellWidth - halfWidth - 24);

        overlay.style.left = `${clampNumber(rawLeft, minLeft, maxLeft) - halfWidth}px`;
        overlay.style.top = `${clampNumber(rawTop, minTop, maxTop)}px`;
    }, [size.height, size.width]);
    if (!backendWorkspaceReady) return <BackendWorkspaceGate title="画布工作区" />;
    if (canvasSessionExpired) return <CanvasExpiredShell onBack={() => navigate("/canvas")} />;
    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <main
            className="creative-os-shell flex h-full min-h-0 overflow-hidden"
            style={
                {
                    background: theme.canvas.background,
                    color: theme.node.text,
                    "--creative-material": theme.ui.material,
                    "--creative-material-elevated": theme.ui.materialElevated,
                    "--creative-hairline": theme.ui.hairline,
                    "--creative-shadow": theme.ui.shadow,
                    "--creative-accent": theme.ui.accent,
                    "--creative-accent-soft": theme.ui.accentSoft,
                    "--creative-control-fill": theme.ui.controlFill,
                    "--creative-danger": theme.ui.danger,
                    "--creative-text": theme.node.text,
                    "--creative-muted": theme.node.muted,
                } as CSSProperties
            }
        >
            <section ref={canvasShellRef} className="creative-os-canvas relative min-w-0 flex-1 overflow-hidden">
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

                <LeaferCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    nodes={visibleNodeItems}
                    connections={reactFlowConnections}
                    backgroundMode={backgroundMode}
                    selectedNodeIds={selectedNodeIds}
                    selectedConnectionId={selectedConnectionId}
                    onViewportChange={handleReactFlowViewportChange}
                    onViewportPresentation={handleViewportPresentation}
                    onNodePointerDown={handleLeaferNodePointerDown}
                    onNodeTap={handleLeaferNodeTap}
                    onNodeDragStart={handleLeaferNodeDragStart}
                    onNodeDrag={handleLeaferNodeDrag}
                    onNodeDragStop={handleLeaferNodeDragStop}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDeselect={deselectCanvas}
                    onContextMenu={(event, canvasPos) => {
                        event.preventDefault();
                        setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY });
                    }}
                    onConnectStart={handleLeaferConnectStart}
                    onConnectEnd={handleLeaferConnectEnd}
                    onConnect={handleLeaferConnect}
                    onEdgeClick={selectConnection}
                    onDrop={(files, canvasPos) => {
                        handleDropFiles(files, canvasPos);
                    }}
                    onSelectionBox={(nodeIds, mode) => {
                        const next = mode === 'replace' ? new Set<string>() : new Set(selectedNodeIdsRef.current);
                        for (const nodeId of nodeIds) {
                            if (mode === 'toggle' && next.has(nodeId)) next.delete(nodeId);
                            else next.add(nodeId);
                        }
                        resetImageTapGesture();
                        selectedNodeIdsRef.current = next;
                        setSelectedNodeIds(next);
                        setDialogNodeId(null);
                        setContextMenu(null);
                    }}
                    connectingParams={connectingParams}
                    pendingConnection={pendingConnectionCreate}
                    connectionTargetNodeId={connectionTargetNodeId}
                    onConnectionTargetChange={(nodeId) => {
                        connectionTargetNodeIdRef.current = nodeId;
                        setConnectionTargetNodeId(nodeId);
                    }}
                    miniMapOpen={isMiniMapOpen}
                >
                    <svg
                        className="pointer-events-none absolute overflow-visible"
                        style={{ left: 0, top: 0, width: 1, height: 1, zIndex: 1 }}
                        aria-hidden
                    >
                        {connectionPaths.map(({ connection, path }) => {
                            const isConnectionSelected = selectedConnectionId === connection.id;
                            const isConnectionHovered = hoveredConnectionId === connection.id;
                            const isRelatedConnection = relatedHighlight.connectionIds.has(connection.id);
                            return (
                                <g
                                    key={connection.id}
                                    className={`canvas-connection-group${isConnectionSelected ? " is-selected" : ""}${isConnectionHovered ? " is-hovered" : ""}`}
                                >
                                    <path
                                        className="canvas-connection-hit"
                                        data-connection-id={connection.id}
                                        d={path}
                                        fill="none"
                                        stroke="transparent"
                                        strokeWidth={20}
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        style={{ cursor: "pointer", pointerEvents: "stroke" }}
                                        onPointerEnter={() => setHoveredConnectionId(connection.id)}
                                        onPointerLeave={() => {
                                            setHoveredConnectionId((current) => current === connection.id ? null : current);
                                        }}
                                        onPointerDown={(event) => {
                                            event.stopPropagation();
                                            selectConnection(connection.id);
                                        }}
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            openConnectionContextMenu(event, connection.id);
                                        }}
                                    />
                                    <path
                                        className="canvas-connection-line"
                                        d={path}
                                        fill="none"
                                        stroke={isConnectionSelected ? "#e0e4e8" : isRelatedConnection ? "#67e8f9" : "#86909c"}
                                        strokeWidth={isConnectionSelected ? 3 : 2.4}
                                        strokeLinecap="round"
                                        opacity={isConnectionSelected ? 1 : isRelatedConnection ? 0.88 : 0.78}
                                        vectorEffect="non-scaling-stroke"
                                        style={{ pointerEvents: "none" }}
                                    />
                                    {isConnectionSelected
                                        ? [0, 1, 2].map((index) => (
                                            <path
                                                key={index}
                                                className="canvas-flow-edge canvas-connection-selected-flow"
                                                d={path}
                                                fill="none"
                                                stroke="#e0f2fe"
                                                strokeWidth={4}
                                                strokeLinecap="round"
                                                strokeDasharray="10 34"
                                                vectorEffect="non-scaling-stroke"
                                                style={{ pointerEvents: "none", animationDelay: `${index * -300}ms` }}
                                            />
                                        ))
                                        : isConnectionHovered
                                            ? (
                                                <path
                                                    key={`hover-${connection.id}`}
                                                    className="canvas-flow-edge canvas-flow-edge-hover canvas-connection-flow"
                                                    d={path}
                                                    fill="none"
                                                    stroke="#a5f3fc"
                                                    strokeWidth={3.4}
                                                    strokeLinecap="round"
                                                    strokeDasharray="8 42"
                                                    vectorEffect="non-scaling-stroke"
                                                    style={{ pointerEvents: "none" }}
                                                />
                                            )
                                            : null}
                                </g>
                            );
                        })}
                    </svg>
                    {/* Render node DOM elements */}
                    {renderedNodes.map((node) => {
                        const isSelected = selectedNodeIds.has(node.id);
                        return (
                            <CanvasNode
                                key={node.id}
                                data={node}
                                isSelected={isSelected}
                                isRelated={relatedHighlight.nodeIds.has(node.id)}
                                isFocusRelated={activeNodeId === node.id}
                                isConnectionTarget={connectionTargetNodeId === node.id}
                                isConnecting={Boolean(connectingParams)}
                                connectionTargetSide={connectionTargetNodeId === node.id ? (connectingParams?.handleType === "source" ? "target" : "source") : null}
                                editRequestNonce={editingNodeId === node.id ? editRequestNonce : 0}
                                showPanel={false}
                                batchCount={batchChildCountById.get(node.id) || 0}
                                batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
                                batchClosing={Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId))}
                                batchOpening={openingBatchIds.has(node.id)}
                                batchRecovering={collapsingBatchIds.has(node.id)}
                                batchMotion={batchMotionById.get(node.id)}
                                showImageInfo={showImageInfo}
                                isOverview={isOverviewCanvas}
                                resourceLabel={resourceReferenceByNodeId.get(node.id)}
                                mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES}
                                renderPanel={renderCanvasNodePanel}
                                renderNodeContent={renderCanvasConfigNodeContent}
                                onHoverStart={handleNodeHoverStart}
                                onHoverEnd={handleNodeHoverEnd}
                                onConnectStart={handleLeaferConnectStart}
                                onResize={handleNodeResize}
                                onContentChange={handleNodeContentChange}
                                onTitleChange={handleNodeTitleChange}
                                onToggleBatch={toggleBatchExpanded}
                                onSetBatchPrimary={setBatchPrimary}
                                onOpenComposer={openNodeComposer}
                                onNodeAction={handleNodeAction}
                                onUpload={(item) => handleUploadRequest(item.id)}
                                onRetry={handleRetryNodeAction}
                                onGenerateImage={generateImageFromTextNode}
                                onCaptureVideoFrame={insertVideoFrameCapture}
                                onViewImage={handleViewNodeImage}
                                onGroupAction={handleGroupAction}
                                onContextMenu={handleNodeContextMenu}
                            />
                        );
                    })}
                </LeaferCanvas>

                {dialogNode && composerPosition ? (
                    <div
                        ref={composerOverlayRef}
                        data-canvas-no-zoom
                        className="pointer-events-none absolute z-[70] pt-4"
                        style={{
                            left: composerPosition.left - composerWidth / 2,
                            top: composerPosition.top,
                            width: composerWidth,
                        }}
                    >
                        <div
                            data-canvas-composer
                            className="creative-os-composer-scroll pointer-events-auto max-h-[60vh] overflow-y-auto"
                            style={{
                                width: composerWidth,
                                maxWidth: "calc(100vw - 48px)",
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
                    <ErrorBoundary
                        fallback={(error, reset) => (
                            <div className="fixed inset-0 z-[220] grid place-items-center bg-black/80 p-6 text-white backdrop-blur-xl">
                                <div className="max-w-md rounded-2xl border border-white/10 bg-neutral-900/90 p-6 text-center shadow-2xl">
                                    <div className="text-base font-medium">导演台加载失败</div>
                                    <div className="mt-2 text-sm text-white/55">{error.message}</div>
                                    <div className="mt-5 flex justify-center gap-2">
                                        <Button onClick={reset}>重试</Button>
                                        <Button type="text" onClick={() => setDirectorStudioNodeId(null)}>关闭</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    >
                        <Suspense fallback={<div className="fixed inset-0 z-[220] grid place-items-center bg-black text-sm text-white/60">正在打开 3D 导演台...</div>}>
                            <StoryAiDirectorDesk
                                key={directorStudioNode.id}
                                nodeId={directorStudioNode.id}
                                initialProject={directorStudioNode.metadata?.directorProject}
                                theme={colorTheme}
                                onProjectChange={(directorProject) => handleConfigNodeChange(directorStudioNode.id, { directorProject, status: NODE_STATUS_SUCCESS })}
                                onCaptures={(captures) => insertDirectorCaptures(directorStudioNode.id, captures)}
                                onClose={() => setDirectorStudioNodeId(null)}
                            />
                        </Suspense>
                    </ErrorBoundary>
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

                {!dialogNode && !isNodeDragging && !nodeImageSettingsOpen && viewport.k >= 0.3 && toolbarNode ? (
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
                        onUpscale={(node) => setUpscaleNodeId(node.id)}                        onAngle={(node) => setAngleNodeId(node.id)}
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
                    onGroup={() => createGroupFromSelection('normal')}
                    onStoryboardGroup={() => createGroupFromSelection('storyboard')}
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
{angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    className={previewNode?.metadata?.canvasTool === 'panorama360' ? 'canvas-panorama-modal' : undefined}
                    title={previewNode?.metadata?.canvasTool === "panorama360" ? "360全景预览" : "图片详情"}
                    open={Boolean(previewNode && (previewNode.metadata?.content || previewNode.metadata?.storageKey))}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    transitionName={previewNode?.metadata?.canvasTool === 'panorama360' ? '' : undefined}
                    maskTransitionName={previewNode?.metadata?.canvasTool === 'panorama360' ? '' : undefined}
                    width={previewNode?.metadata?.canvasTool === "panorama360" ? "96vw" : "auto"}
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                        <PreviewImageContent node={previewNode} onCapturePanorama={(dataUrl) => insertPanoramaSnapshot(previewNode, dataUrl)} />
                    ) : null}
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
                    <CanvasPanelInput label="标题" value={node.metadata?.scriptTitle || node.title || ""} placeholder="短片标题 / 分镜脚本名" onChange={(scriptTitle) => onChange({ scriptTitle })} style={fieldStyle} />
                    <CanvasPanelInput label="一句话梗概" value={node.metadata?.scriptLogline || ""} placeholder="角色、目标、冲突和转折" onChange={(scriptLogline) => onChange({ scriptLogline })} style={fieldStyle} />
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

function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function findCanvasNodeElement(root: HTMLElement | null, nodeId: string) {
    if (!root) return null;
    const escapedNodeId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(nodeId) : nodeId.replace(/["\\]/g, "\\$&");
    return root.querySelector<HTMLElement>(`[data-canvas-node-id="${escapedNodeId}"]`);
}

function CanvasPanelInput({ label, value, placeholder, onChange, style }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; style: CSSProperties }) {
    return (
        <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
            <span className="mb-1 block text-xs opacity-55">{label}</span>
            <input className="nodrag nopan h-9 w-full rounded-lg border px-3 text-sm outline-none placeholder:opacity-35 select-text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={style} />
        </label>
    );
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
    if (type === CanvasNodeType.Group) return <Layers3 className="size-4" />;
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
        <div className="creative-os-topbar pointer-events-none absolute inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-3 sm:px-4">
            <div className="pointer-events-auto flex items-center gap-2">
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
                    <button type="button" className="creative-os-icon-button" aria-label="打开画布菜单">
                        <Menu className="size-[18px]" />
                    </button>
                </Dropdown>
                <span className="hidden text-[13px] font-semibold tracking-normal opacity-70 sm:block">FlowCanvas</span>
            </div>

            <div ref={titleRef} className="pointer-events-auto absolute left-1/2 max-w-[44vw] -translate-x-1/2">
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
                        className="creative-os-title-control w-[min(280px,44vw)] bg-transparent px-3 text-center text-[13px] font-semibold outline-none"
                        style={{ color: theme.node.text }}
                    />
                ) : (
                    <button type="button" className="creative-os-title-control max-w-[44vw] truncate px-3 text-[13px] font-semibold" onDoubleClick={onStartTitleEditing} title="双击修改画布名称">
                        {title}
                    </button>
                )}
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
                                        <div className="font-medium">发布作品</div>
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
                    <button type="button" className="creative-os-icon-button" aria-label="发布与分享">
                        <Share2 className="size-[17px]" />
                    </button>
                </Dropdown>
                <Button
                    type="text"
                    className={`creative-os-agent-button ${agentOpen ? "is-active" : ""}`}
                    icon={<Bot className="size-[17px]" />}
                    onClick={onToggleAgent}
                    aria-label="打开创作 Agent"
                >
                    <span className="hidden sm:inline">Agent</span>
                </Button>
            </div>
        </div>
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
    const patchEntries = Object.entries(safePatch);
    if (!patchEntries.length || patchEntries.every(([key, value]) => Object.is(node.metadata?.[key as keyof CanvasNodeData["metadata"]], value))) return node;
    const nextMode = safePatch.generationMode || node.metadata?.generationMode;
    const nextHeight = node.type === CanvasNodeType.Config && nextMode !== "comfyui" ? getConfigNodeHeight(nextMode) : node.height;
    const next = { ...node, height: nextHeight, metadata: { ...node.metadata, ...safePatch } };
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
    const selectedModel = normalizeRuntimeModelOption(config, node?.metadata?.model || defaultModel, mode)
        || normalizeRuntimeModelOption(config, defaultModel, mode)
        || (mode === "audio" ? defaultConfig.audioModel : config.model || defaultConfig.model);
    return {
        ...config,
        model: selectedModel,
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        size: node?.metadata?.size || config.size || defaultConfig.size,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        videoDraft: node?.metadata?.draft || config.videoDraft || defaultConfig.videoDraft,
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
    const [textureReady, setTextureReady] = useState(false);
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setError("");
        setTextureReady(false);
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
        let pointerX = 0;
        let pointerY = 0;

        const geometry = new THREE.SphereGeometry(500, 96, 48);
        geometry.scale(-1, 1, 1);
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const texture = loader.load(
            textureSrc,
            () => {
                if (disposed) return;
                setTextureReady(true);
                render();
            },
            undefined,
            () => {
                if (!disposed) {
                    setTextureReady(false);
                    setError("全景贴图加载失败");
                }
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
            pointerX = event.clientX;
            pointerY = event.clientY;
            renderer.domElement.setPointerCapture(event.pointerId);
            renderer.domElement.style.cursor = "grabbing";
        };
        const handlePointerMove = (event: PointerEvent) => {
            if (!dragging) return;
            event.preventDefault();
            event.stopPropagation();
            const deltaX = event.clientX - pointerX;
            const deltaY = event.clientY - pointerY;
            pointerX = event.clientX;
            pointerY = event.clientY;
            yaw -= deltaX * 0.004;
            pitch += deltaY * 0.004;
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
        if (!renderer || !textureReady || error) return;
        setCapturing(true);
        try {
            renderRef.current();
            await onCapture(renderer.domElement.toDataURL("image/png"));
        } finally {
            setCapturing(false);
        }
    }, [error, onCapture, textureReady]);

    return (
        <div className="nodrag nopan relative h-[76vh] w-[92vw] overflow-hidden bg-black text-white" data-canvas-no-zoom>
            <div ref={hostRef} className="h-full w-full" aria-label={title || "360全景预览"} />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4">
                <div className="min-w-0 pr-4">
                    <div className="truncate text-sm font-medium">{title || "360全景预览"}</div>
                    <div className="text-xs text-white/55">左键拖动旋转视角，滚轮缩放 FOV</div>
                </div>
                <Button className="pointer-events-auto" type="primary" loading={capturing} disabled={!textureReady || !!error} onClick={capture}>
                    截图插入画布
                </Button>
            </div>
            {!textureReady || error ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">{error || "正在准备全景贴图"}</div> : null}
        </div>
    );
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
