"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Handle, Position as ReactFlowPosition, useUpdateNodeInternals } from "@xyflow/react";
import { ChevronRight, FileText, Image as ImageIcon, Music2, RefreshCw, Settings2, Star, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useThemeStore } from "@/stores/use-theme-store";
import { peekCachedImageUrl, resolveImageUrl } from "@/services/image-storage";
import { peekCachedMediaUrl, resolveMediaUrl } from "@/services/file-storage";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasNodeData, type Position as CanvasPosition } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { useCanvasScaleRef } from "./canvas-scale-context";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#2f80ff";

type ResizeStartEvent = React.PointerEvent;

/** Lazy-resolve media URL from storageKey on mount.
 *  - If storageKey is present, resolve via IndexedDB (cached after first hit).
 *  - Sync-checks the in-memory cache to avoid showing stale blob URLs from previous sessions.
 *  - Only falls back to `content` when there is no storageKey (legacy data without upload). */
function useLazyMediaUrl(storageKey: string | undefined, content: string | undefined, type: "image" | "media"): string {
    const [url, setUrl] = useState<string>(() => {
        if (!storageKey) return content ?? "";
        const cached = type === "image" ? peekCachedImageUrl(storageKey) : peekCachedMediaUrl(storageKey);
        return cached ?? "";
    });

    useEffect(() => {
        if (!storageKey) {
            setUrl(content ?? "");
            return;
        }
        const resolve = type === "image" ? resolveImageUrl : resolveMediaUrl;
        const peek = type === "image" ? peekCachedImageUrl : peekCachedMediaUrl;
        let cancelled = false;
        setUrl(peek(storageKey) ?? "");
        resolve(storageKey, content?.startsWith("blob:") ? "" : (content ?? "")).then((resolved) => {
            if (!cancelled) setUrl(resolved);
        });
        return () => {
            cancelled = true;
        };
    }, [storageKey, content, type]);

    return url;
}

export type CanvasNodeProps = {
    data: CanvasNodeData;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    isConnecting: boolean;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    isOverview?: boolean;
    positioned?: boolean;
    resourceLabel?: CanvasResourceReference;
    mentionReferences?: CanvasResourceReference[];
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: CanvasPosition) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
};

/** Custom memo comparator: skip function props (renderPanel, renderNodeContent, callbacks)
 *  that change reference every render. Compare data by identity + primitive/enum props. */
function canvasNodePropsEqual(prev: CanvasNodeProps, next: CanvasNodeProps) {
    if (prev.data !== next.data) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isRelated !== next.isRelated) return false;
    if (prev.isFocusRelated !== next.isFocusRelated) return false;
    if (prev.isConnectionTarget !== next.isConnectionTarget) return false;
    if (prev.isConnecting !== next.isConnecting) return false;
    if (prev.showPanel !== next.showPanel) return false;
    if (prev.showImageInfo !== next.showImageInfo) return false;
    if (prev.isOverview !== next.isOverview) return false;
    if (prev.positioned !== next.positioned) return false;
    if (prev.editRequestNonce !== next.editRequestNonce) return false;
    if (prev.batchCount !== next.batchCount) return false;
    if (prev.batchExpanded !== next.batchExpanded) return false;
    if (prev.batchClosing !== next.batchClosing) return false;
    if (prev.batchOpening !== next.batchOpening) return false;
    if (prev.batchRecovering !== next.batchRecovering) return false;
    if (prev.batchMotion !== next.batchMotion) return false;
    if (prev.resourceLabel !== next.resourceLabel) return false;
    if (prev.mentionReferences !== next.mentionReferences) return false;
    return true;
}

export const CanvasNode = React.memo(function CanvasNode({
    data,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    isConnecting,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    isOverview = false,
    positioned = true,
    resourceLabel,
    mentionReferences = [],
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onGenerateImage,
    onViewImage,
    onContextMenu,
}: CanvasNodeProps) {
    const scaleRef = useCanvasScaleRef();
    const updateNodeInternals = useUpdateNodeInternals();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [isEditingContent, setIsEditingContent] = useState(false);
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive ? selectionBlue : isRelated && !isBatchChild ? theme.node.muted : "transparent";
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const resizeFrameRef = useRef<number | null>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        currentWidth: data.width,
        currentHeight: data.height,
        currentPosition: data.position,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!showPanel) return;
        const panel = panelRef.current;
        if (!panel) return;
        const stopWheel = (event: WheelEvent) => event.stopPropagation();
        panel.addEventListener("wheel", stopWheel, { capture: true, passive: true });
        return () => panel.removeEventListener("wheel", stopWheel, true);
    }, [showPanel]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: PointerEvent) => {
            if (!resizeRef.current.isResizing) return;

            const scale = Math.max(scaleRef.current, 0.05);
            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = data.type === CanvasNodeType.Image && data.metadata?.freeResize ? 64 : 220;
            const minHeight = data.type === CanvasNodeType.Image && data.metadata?.freeResize ? 64 : 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            const position = {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            };
            resizeRef.current.currentWidth = width;
            resizeRef.current.currentHeight = height;
            resizeRef.current.currentPosition = position;
            if (resizeFrameRef.current) return;
            resizeFrameRef.current = requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                const element = nodeRef.current;
                if (!element) return;
                element.style.width = `${resizeRef.current.currentWidth}px`;
                element.style.height = `${resizeRef.current.currentHeight}px`;
                if (positioned) element.style.transform = `translate(${resizeRef.current.currentPosition.x}px, ${resizeRef.current.currentPosition.y}px)`;
            });
        },
        [data.metadata?.freeResize, data.type, positioned, scaleRef],
    );

    const handleResizeUp = useCallback(() => {
        if (!resizeRef.current.isResizing) return;
        resizeRef.current.isResizing = false;
        if (resizeFrameRef.current) {
            cancelAnimationFrame(resizeFrameRef.current);
            resizeFrameRef.current = null;
        }
        onResize(data.id, resizeRef.current.currentWidth, resizeRef.current.currentHeight, resizeRef.current.currentPosition);
        updateNodeInternals(data.id);
        requestAnimationFrame(() => updateNodeInternals(data.id));
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handleResizeMove);
        window.removeEventListener("pointerup", handleResizeUp);
        window.removeEventListener("pointercancel", handleResizeUp);
        window.removeEventListener("blur", handleResizeUp);
    }, [data.id, handleResizeMove, onResize, updateNodeInternals]);

    const handleResizeMouseDown = (event: ResizeStartEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            currentWidth: data.width,
            currentHeight: data.height,
            currentPosition: data.position,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video,
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        document.body.style.cursor = corner.includes("left") === corner.includes("top") ? "nwse-resize" : "nesw-resize";
        document.body.style.userSelect = "none";
        const element = nodeRef.current;
        if (element) {
            element.style.width = `${data.width}px`;
            element.style.height = `${data.height}px`;
            if (positioned) element.style.transform = `translate(${data.position.x}px, ${data.position.y}px)`;
        }
        window.addEventListener("pointermove", handleResizeMove);
        window.addEventListener("pointerup", handleResizeUp);
        window.addEventListener("pointercancel", handleResizeUp);
        window.addEventListener("blur", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", handleResizeMove);
            window.removeEventListener("pointerup", handleResizeUp);
            window.removeEventListener("pointercancel", handleResizeUp);
            window.removeEventListener("blur", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    const shouldUseOverview = isOverview && !isActive && !showPanel && !isEditingContent;

    return (
        <div
            ref={nodeRef}
            data-node-id={data.id}
            className={`node-element ${positioned ? "absolute" : "relative"} flex select-none flex-col transition-shadow duration-200 ${isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: positioned ? `translate(${data.position.x}px, ${data.position.y}px)` : undefined,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                if (shouldUseOverview) return;
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                if (shouldUseOverview) return;
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            <Card
                className="relative h-full w-full overflow-visible rounded-[22px] border bg-transparent p-0 py-0 text-sm ring-0"
                style={{
                    background: shouldUseOverview || (!hasImageContent && !hasVideoContent) ? theme.node.fill : "transparent",
                    borderColor: shouldUseOverview ? (isRelated ? theme.node.muted : theme.node.stroke) : hasImageContent ? imageBorderColor : isActive ? selectionBlue : isRelated ? theme.node.muted : theme.node.stroke,
                    boxShadow: shouldUseOverview ? undefined : isActive ? `0 0 0 1px ${selectionBlue}55` : isRelated && !isBatchChild ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)` : undefined,
                }}
                onMouseDown={(event) => onMouseDown(event, data.id)}
                onDoubleClick={(event) => {
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`relative flex h-full w-full items-center justify-center rounded-[inherit] ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: shouldUseOverview || (!hasImageContent && !hasVideoContent) ? theme.node.fill : "transparent",
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    {shouldUseOverview ? (
                        <OverviewNodeContent node={data} theme={theme} />
                    ) : (
                        <NodeContent
                            node={data}
                            theme={theme}
                            isEditingContent={isEditingContent}
                            textareaRef={textareaRef}
                            isBatchRoot={isBatchRoot}
                            batchCount={batchCount}
                            batchExpanded={batchExpanded}
                            batchOpening={batchOpening}
                            batchRecovering={batchRecovering}
                            renderNodeContent={renderNodeContent}
                            mentionReferences={mentionReferences}
                            onContentChange={onContentChange}
                            onStopEditing={() => setIsEditingContent(false)}
                            onRetry={onRetry}
                            onGenerateImage={onGenerateImage}
                            onToggleBatch={() => onToggleBatch?.(data.id)}
                            onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                        />
                    )}
                </div>

                {!shouldUseOverview && showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}
                {!shouldUseOverview && resourceLabel ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!shouldUseOverview && !hasImageContent && !hasVideoContent && !hasAudioContent ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} />
                ) : null}

                {!shouldUseOverview ? (
                    <>
                        <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} />
                    </>
                ) : null}
            </Card>

            <ConnectionHandleDot side="left" visible={!shouldUseOverview && (isSelected || isConnecting)} onMouseDown={() => onConnectStart(data.id, "target")} />
            <ConnectionHandleDot side="right" visible={!shouldUseOverview && data.type !== CanvasNodeType.Config && (isSelected || isConnecting)} onMouseDown={() => onConnectStart(data.id, "source")} />

            {showPanel && renderPanel ? (
                <div
                    ref={panelRef}
                    className="absolute left-1/2 top-full z-[70] w-[500px] max-h-[60vh] -translate-x-1/2 overflow-y-auto pt-4 thin-scrollbar"
                    onWheel={(event) => {
                        const el = event.currentTarget;
                        if (el.scrollHeight <= el.clientHeight) return; // no overflow → let canvas scroll
                        const atTop = el.scrollTop === 0;
                        const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
                        if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) return; // at boundary → let canvas scroll
                        event.stopPropagation();
                    }}
                >
                    {renderPanel(data)}
                </div>
            ) : null}
        </div>
    );
}, canvasNodePropsEqual);

function OverviewNodeContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const Icon = node.type === CanvasNodeType.Image ? ImageIcon : node.type === CanvasNodeType.Video ? Video : node.type === CanvasNodeType.Audio ? Music2 : node.type === CanvasNodeType.Config ? Settings2 : FileText;
    const title = node.title || node.metadata?.prompt || node.metadata?.content || (node.type === CanvasNodeType.Config ? "配置节点" : "节点");
    return (
        <div className="flex h-full w-full items-center gap-2 overflow-hidden rounded-[inherit] px-3 py-2" style={{ color: theme.node.text }}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium opacity-75">{title}</span>
        </div>
    );
}

function NodeContent(props: NodeContentRendererProps): React.ReactElement {
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return <>{props.renderNodeContent(props.node)}</>;
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return <>{Renderer(props)}</>;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]" style={{ background: theme.node.fill }}>
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${theme.node.activeStroke}18, transparent)`,
                        animation: "shimmer-sweep 2s ease-in-out infinite",
                    }}
                />
            </div>
            <span className="relative z-10 text-[10px] tracking-[0.2em]" style={{ color: theme.node.activeStroke }}>
                生成中
            </span>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || "生成失败"}</div>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border px-3 text-xs transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </Button>
        </div>
    );
}

function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return <EmptyState icon={<FileText className="size-6 opacity-35" />} label="未知节点" theme={theme} />;
}

function EmptyState({ icon, label, theme }: { icon: ReactNode; label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.placeholder }}>
            <div className="flex size-14 items-center justify-center rounded-2xl border" style={{ background: theme.toolbar.activeBg, borderColor: `${theme.node.stroke}88` }}>
                {icon}
            </div>
            <Badge variant="outline" className="h-auto rounded-full border px-2.5 py-1 text-[10px] tracking-[0.18em] opacity-60" style={{ borderColor: `${theme.node.stroke}88`, color: theme.node.placeholder }}>
                {label}
            </Badge>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="absolute right-3 top-3 z-20 h-8 rounded-full border px-2.5 text-xs opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateImage?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="用文本生图"
                aria-label="用文本生图"
            >
                <ImageIcon className="size-3.5" />
                生图
            </Button>
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono outline-none select-text appearance-none"
                    style={textStyle}
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div className="thin-scrollbar block h-full w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono" style={textStyle} onWheel={(event) => event.stopPropagation()}>
                    {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击编辑文字</span>}
                </div>
            )}
        </div>
    );
}

function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    return <Badge className={cn("pointer-events-none absolute right-2 top-2 z-30 h-auto rounded-md px-1.5 py-0.5 text-[10px]", reference.active ? "bg-[#2f80ff] text-white shadow-sm" : "bg-black/35 text-white/75")}>{reference.label}</Badge>;
}

function ImageNodeContent(props: NodeContentRendererProps) {
    const hasMedia = props.node.metadata?.content || props.node.metadata?.storageKey;
    if (!hasMedia && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!hasMedia) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch }: NodeContentRendererProps) {
    const content = <EmptyState icon={<ImageIcon className="size-6 opacity-35" />} label="空图片节点" theme={theme} />;
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent({ node, theme }: NodeContentRendererProps) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    if (!src) return <EmptyState icon={<Video className="size-7 opacity-35" />} label="空视频节点" theme={theme} />;
    return <video src={src} controls preload="none" className="h-full w-full rounded-[18px] bg-black object-contain" data-canvas-no-zoom />;
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    if (!src) return <EmptyState icon={<Music2 className="size-7 opacity-35" />} label="空音频节点" theme={theme} />;
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "音频"}</span>
            </div>
            <audio src={src} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function ImageContent({
    node,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);
    const imgSrc = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "image");

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="h-full w-full overflow-hidden rounded-3xl">
                {imgSrc ? (
                    <img
                        src={imgSrc}
                        alt={node.title}
                        draggable={false}
                        decoding="async"
                        onDragStart={(event) => event.preventDefault()}
                        className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: theme.node.fill, color: theme.node.placeholder }} aria-label="图片加载中">
                        <ImageIcon className="size-6 opacity-30" />
                    </div>
                )}
            </div>
            {isBatchRoot ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute right-2.5 top-2.5 z-30 h-8 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none text-[#2f80ff]">{batchCount}</span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </Button>
            ) : null}
            {isBatchChild ? (
                <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="absolute right-3 top-3 z-30 h-9 rounded-xl border px-2.5 text-xs opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5 text-[#2f80ff]" />
                    设为主图
                </Button>
            ) : null}
        </BatchFrame>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <Badge className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </Badge>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: ResizeStartEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return (
        <div
            className={`nodrag nopan group/resize absolute z-50 size-7 pointer-events-auto ${positionClass}`}
            onPointerDown={(event) => onMouseDown(event, corner)}
            onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            {corner === "bottom-right" ? <span className="absolute bottom-2 right-2 size-3 rounded-br-md border-b-2 border-r-2 border-white/55 opacity-0 transition group-hover/resize:opacity-100" /> : null}
        </div>
    );
}

function ConnectionHandleDot({ side, visible, onMouseDown }: { side: "left" | "right"; visible: boolean; onMouseDown: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isSource = side === "right";
    const visualClass = isSource ? "left-1/2" : "right-1/2";
    const plusVisibility = visible ? "opacity-100 scale-100" : "opacity-0 scale-75 group-hover/connection-handle:opacity-100 group-hover/connection-handle:scale-100";

    return (
        <Handle
            id={isSource ? "source" : "target"}
            type={isSource ? "source" : "target"}
            position={isSource ? ReactFlowPosition.Right : ReactFlowPosition.Left}
            className="group/connection-handle !pointer-events-auto !z-40 !size-3 !border-0 !bg-transparent !opacity-100"
            isConnectable
            onMouseDown={onMouseDown}
        >
            <span className={`absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center ${visualClass}`}>
                <span
                    className={`pointer-events-none grid size-[22px] place-items-center rounded-full border shadow-[0_8px_20px_rgba(15,23,42,.18)] backdrop-blur-md transition duration-150 ${plusVisibility}`}
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.muted, color: theme.node.text }}
                >
                    <span className="absolute h-2.5 w-px rounded-full bg-current" />
                    <span className="absolute h-px w-2.5 rounded-full bg-current" />
                </span>
            </span>
        </Handle>
    );
}
