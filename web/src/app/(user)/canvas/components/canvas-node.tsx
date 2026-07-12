"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Clapperboard, FileText, Image as ImageIcon, Layers3, Music2, RefreshCw, Settings2, Star, Video } from "lucide-react";
import * as THREE from "three";

import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useThemeStore } from "@/stores/use-theme-store";
import { imageToDataUrl, peekCachedImageUrl, resolveImageUrl } from "@/services/image-storage";
import { peekCachedMediaUrl, resolveMediaUrl } from "@/services/file-storage";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasNodeData, type Position as CanvasPosition } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { useCanvasScaleRef } from "./canvas-scale-context";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#0a84ff";

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
    connectionTargetSide?: "source" | "target" | null;
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
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: CanvasPosition) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onOpenComposer?: (node: CanvasNodeData) => void;
    onUpload?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onGroupAction?: (node: CanvasNodeData, action: "run" | "toolbox" | "storyboard" | "ungroup" | "download") => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isSelected: boolean;
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
    onStartEditing?: () => void;
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onOpenComposer?: () => void;
    onUpload?: () => void;
    onGroupAction?: (node: CanvasNodeData, action: "run" | "toolbox" | "storyboard" | "ungroup" | "download") => void;
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
    if (prev.connectionTargetSide !== next.connectionTargetSide) return false;
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
    connectionTargetSide = null,
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
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onOpenComposer,
    onUpload,
    onRetry,
    onGenerateImage,
    onViewImage,
    onGroupAction,
    onContextMenu,
}: CanvasNodeProps) {
    const scaleRef = useCanvasScaleRef();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [isEditingContent, setIsEditingContent] = useState(false);
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const isGroup = data.type === CanvasNodeType.Group;
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive || (isRelated && !isBatchChild) ? theme.ui.accent : theme.ui.hairline;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const mediaClickTimerRef = useRef<number | null>(null);
    const mediaClickRef = useRef({ count: 0, lastAt: 0 });
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
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handleResizeMove);
        window.removeEventListener("pointerup", handleResizeUp);
        window.removeEventListener("pointercancel", handleResizeUp);
        window.removeEventListener("blur", handleResizeUp);
    }, [data.id, handleResizeMove, onResize]);

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
            if (mediaClickTimerRef.current) window.clearTimeout(mediaClickTimerRef.current);
            if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", handleResizeMove);
            window.removeEventListener("pointerup", handleResizeUp);
            window.removeEventListener("pointercancel", handleResizeUp);
            window.removeEventListener("blur", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    const clearMediaClickTimer = useCallback(() => {
        if (!mediaClickTimerRef.current) return;
        window.clearTimeout(mediaClickTimerRef.current);
        mediaClickTimerRef.current = null;
    }, []);

    const handleMediaClick = useCallback(
        (event: React.MouseEvent) => {
            if (data.type !== CanvasNodeType.Image || !hasImageContent) return;
            const now = Date.now();
            if (now - mediaClickRef.current.lastAt > 750) mediaClickRef.current.count = 0;
            mediaClickRef.current.count += 1;
            mediaClickRef.current.lastAt = now;

            if (mediaClickRef.current.count === 2) {
                event.stopPropagation();
                clearMediaClickTimer();
                mediaClickTimerRef.current = window.setTimeout(() => {
                    mediaClickTimerRef.current = null;
                    mediaClickRef.current.count = 0;
                    onOpenComposer?.(data);
                }, 760);
            } else if (mediaClickRef.current.count >= 3) {
                event.stopPropagation();
                clearMediaClickTimer();
                mediaClickRef.current.count = 0;
                onViewImage?.(data);
            }
        },
        [clearMediaClickTimer, data, hasImageContent, isBatchRoot, onOpenComposer, onViewImage],
    );

    const shouldUseOverview = isOverview && !showPanel && !isEditingContent;
    const panelWidthClass =
        data.metadata?.canvasTool === "director"
            ? "w-[920px] max-w-[calc(100vw-48px)]"
            : data.metadata?.canvasTool === "script"
              ? "w-[720px] max-w-[calc(100vw-48px)]"
              : "w-[500px] max-w-[calc(100vw-32px)]";

    return (
        <div
            ref={nodeRef}
            data-node-id={data.id}
            className={`node-element ${positioned ? "absolute" : "relative"} flex select-none flex-col transition-shadow duration-150 ${isGroup ? "z-0" : isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: positioned ? `translate(${data.position.x}px, ${data.position.y}px)` : undefined,
                width: data.width,
                height: data.height,
                transition: "box-shadow 160ms ease, opacity 160ms ease",
                contain: "layout style",
            }}
            onPointerEnter={() => {
                if (shouldUseOverview) return;
                onHoverStart(data.id);
            }}
            onPointerLeave={() => {
                if (shouldUseOverview) return;
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            <Card
                className="creative-os-node relative h-full w-full overflow-visible rounded-[8px] border bg-transparent p-0 py-0 text-sm ring-0"
                style={{
                    background: isGroup ? theme.ui.controlFill : shouldUseOverview || (!hasImageContent && !hasVideoContent) ? theme.node.panel : "rgba(14,14,14,.45)",
                    borderColor: isGroup
                        ? isSelected
                            ? theme.ui.accent
                            : theme.ui.hairline
                        : shouldUseOverview
                          ? isRelated
                              ? theme.ui.accent
                              : theme.ui.hairline
                          : hasImageContent
                            ? imageBorderColor
                            : isActive
                              ? theme.ui.accent
                              : isRelated
                                ? theme.ui.accent
                                : theme.ui.hairline,
                    boxShadow: isGroup ? (isSelected ? `0 0 0 2px ${theme.ui.accentSoft}` : undefined) : shouldUseOverview ? undefined : isActive ? `0 0 0 2px ${theme.ui.accent}, ${theme.ui.shadow}` : undefined,
                }}
                onClick={handleMediaClick}
                onDoubleClick={(event) => {
                    if (data.type === CanvasNodeType.Image && hasImageContent) return;
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
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
                            background: shouldUseOverview || (!hasImageContent && !hasVideoContent) ? theme.node.panel : "transparent",
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    {shouldUseOverview ? (
                        <MediaAwareOverviewNodeContent node={data} theme={theme} />
                    ) : (
                        <NodeContent
                            node={data}
                            theme={theme}
                            isSelected={isSelected}
                            isEditingContent={isEditingContent}
                            textareaRef={textareaRef}
                            isBatchRoot={isBatchRoot}
                            batchCount={batchCount}
                            batchExpanded={batchExpanded}
                            batchOpening={batchOpening}
                            batchRecovering={batchRecovering}
                            renderNodeContent={renderNodeContent}
                            mentionReferences={mentionReferences}
                            onStartEditing={() => setIsEditingContent(true)}
                            onContentChange={onContentChange}
                            onStopEditing={() => setIsEditingContent(false)}
                            onRetry={onRetry}
                            onGenerateImage={onGenerateImage}
                            onOpenComposer={() => onOpenComposer?.(data)}
                            onUpload={() => onUpload?.(data)}
                            onToggleBatch={() => onToggleBatch?.(data.id)}
                            onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                            onGroupAction={onGroupAction}
                        />
                    )}
                </div>

                {!isGroup ? <NodeTitleBadge node={data} theme={theme} overview={isOverview} /> : null}
                {isGroup ? <GroupTitleEditor node={data} theme={theme} overview={isOverview} onTitleChange={onTitleChange} /> : null}
                {!shouldUseOverview && showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}
                {!shouldUseOverview && resourceLabel ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!shouldUseOverview ? (
                    <>
                        <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} />
                    </>
                ) : null}
            </Card>

            {!isGroup ? <ConnectionHandleDot side="left" visible={!shouldUseOverview && (isSelected || isConnecting)} active={isConnectionTarget && connectionTargetSide === "target"} /> : null}
            {!isGroup ? <ConnectionHandleDot side="right" visible={!shouldUseOverview && data.type !== CanvasNodeType.Config && (isSelected || isConnecting)} active={isConnectionTarget && connectionTargetSide === "source"} /> : null}

            {showPanel && renderPanel ? (
                <div
                    ref={panelRef}
                    className={cn("absolute left-1/2 top-full z-[70] max-h-[68vh] -translate-x-1/2 overflow-x-hidden overflow-y-auto pt-4 thin-scrollbar", panelWidthClass)}
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

function MediaAwareOverviewNodeContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const hasMedia = Boolean(node.metadata?.content || node.metadata?.storageKey);
    if (hasMedia && node.type === CanvasNodeType.Image) return <OverviewImageContent node={node} theme={theme} />;
    if (hasMedia && node.type === CanvasNodeType.Video) return <OverviewVideoContent node={node} theme={theme} />;
    if (hasMedia && node.type === CanvasNodeType.Audio) return <OverviewAudioContent node={node} theme={theme} />;
    return <OverviewNodeContent node={node} theme={theme} />;
}

function OverviewImageContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "image");
    if (!src) return <OverviewNodeContent node={node} theme={theme} />;
    return (
        <div className="relative h-full w-full overflow-hidden rounded-[inherit]" style={{ background: theme.node.fill }}>
            <img
                src={src}
                alt={node.title}
                draggable={false}
                decoding="async"
                onDragStart={(event) => event.preventDefault()}
                className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
            />
        </div>
    );
}

function OverviewVideoContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    if (!src) return <OverviewNodeContent node={node} theme={theme} />;
    return (
        <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-black">
            <video src={src} muted playsInline preload="metadata" className="pointer-events-none h-full w-full select-none object-contain" />
            <div className="pointer-events-none absolute left-2 top-2 grid size-7 place-items-center rounded-md bg-black/45 text-white/80">
                <Video className="size-3.5" />
            </div>
        </div>
    );
}

function OverviewAudioContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    if (!src) return <OverviewNodeContent node={node} theme={theme} />;
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 overflow-hidden rounded-[inherit] px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium opacity-80">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "\u97f3\u9891"}</span>
            </div>
            <div className="flex h-8 items-end gap-1 overflow-hidden rounded-md px-2 py-1.5" style={{ background: theme.toolbar.panel }}>
                {Array.from({ length: 24 }).map((_, index) => (
                    <span
                        key={index}
                        className="w-1 shrink-0 rounded-full"
                        style={{
                            height: `${28 + ((index * 17) % 52)}%`,
                            background: index % 3 === 0 ? theme.node.activeStroke : theme.node.placeholder,
                            opacity: index % 3 === 0 ? 0.8 : 0.35,
                        }}
                    />
                ))}
            </div>
            <audio src={src} preload="none" className="hidden" />
        </div>
    );
}

function OverviewNodeContent({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const Icon = node.type === CanvasNodeType.Image ? ImageIcon : node.type === CanvasNodeType.Video ? Video : node.type === CanvasNodeType.Audio ? Music2 : node.type === CanvasNodeType.Config ? Settings2 : node.type === CanvasNodeType.Group ? Layers3 : FileText;
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
    if (props.node.type === CanvasNodeType.Group) return <GroupContent {...props} />;
    if (props.node.metadata?.canvasTool === "videoComposition") return <VideoCompositionContent {...props} />;
    if (props.node.metadata?.canvasTool === "director") return <DirectorContent {...props} />;
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
    [CanvasNodeType.Group]: GroupContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function GroupContent({ node, isSelected, onGroupAction }: NodeContentRendererProps) {
    const isStoryboard = node.metadata?.groupVariant === "storyboard";
    const actions: Array<{ key: "run" | "toolbox" | "storyboard" | "ungroup" | "download"; label: string }> = [
        { key: "run", label: "整组执行" },
        { key: "toolbox", label: "添加到工具箱" },
        { key: "storyboard", label: isStoryboard ? "已是分镜组" : "转分镜组" },
        { key: "ungroup", label: "解组" },
        { key: "download", label: "批量下载" },
    ];

    return (
        <div className="relative h-full w-full rounded-[inherit]">
            {isSelected ? (
                <div className="absolute -top-11 left-0 flex max-w-[calc(100vw-40px)] items-center gap-1 rounded-lg border border-white/10 bg-[#1f1f1f]/95 px-1.5 py-1 text-xs text-white/75 shadow-[0_10px_30px_rgba(0,0,0,.28)] backdrop-blur">
                    {actions.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            className="h-7 whitespace-nowrap rounded-md px-2 transition hover:bg-white/10 hover:text-white"
                            onClick={(event) => {
                                event.stopPropagation();
                                onGroupAction?.(node, action.key);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div
            role="status"
            aria-label="生成中"
            className="canvas-generation-loading relative h-full w-full overflow-hidden rounded-[inherit]"
            style={
                {
                    "--canvas-generation-base": canvasThemes.dark.canvas.background,
                    "--canvas-generation-glow": canvasThemes.dark.node.text,
                    "--canvas-generation-dot": theme.node.placeholder,
                } as React.CSSProperties
            }
        >
            <div aria-hidden className="canvas-generation-loading-dots absolute inset-0" />
            <div aria-hidden className="canvas-generation-loading-dot-mask absolute inset-0" />
            <div aria-hidden className="canvas-generation-loading-shimmer absolute inset-0" />
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5" style={{ color: theme.node.placeholder }}>
            <div className="flex size-11 items-center justify-center rounded-lg border" style={{ background: theme.toolbar.activeBg, borderColor: `${theme.node.stroke}88` }}>
                {icon}
            </div>
            <Badge variant="outline" className="h-auto rounded-md border px-2 py-1 text-[10px] opacity-60" style={{ borderColor: `${theme.node.stroke}88`, color: theme.node.placeholder }}>
                {label}
            </Badge>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onStartEditing, onGenerateImage, onOpenComposer }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box" } as React.CSSProperties;
    const isEmpty = !node.metadata?.content?.trim();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            {!isEmpty ? (
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
            ) : null}
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className="nodrag nopan thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent pl-4 pr-14 pt-0 pb-4 m-0 font-mono outline-none select-text appearance-none"
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
            ) : isEmpty && node.metadata?.canvasTool === "script" ? (
                <TryActionList
                    theme={theme}
                    actions={[
                        { label: "自己编写脚本", onClick: onOpenComposer || onStartEditing },
                        { label: "拆成分镜", onClick: onOpenComposer },
                        { label: "脚本生视频", onClick: onOpenComposer },
                        { label: "生成旁白", onClick: onOpenComposer },
                    ]}
                />
            ) : isEmpty ? (
                <TryActionList
                    theme={theme}
                    actions={[
                        { label: "自己编写内容", onClick: onOpenComposer || onStartEditing },
                        { label: "文生视频", onClick: onOpenComposer },
                        { label: "图片反推提示词", onClick: onOpenComposer },
                        { label: "文字生音乐", onClick: onOpenComposer },
                    ]}
                />
            ) : (
                <div
                    className="thin-scrollbar block h-full w-full select-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono"
                    style={textStyle}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        onStartEditing?.();
                    }}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata?.content}
                </div>
            )}
        </div>
    );
}

function VideoCompositionContent({ node, theme, onOpenComposer }: NodeContentRendererProps) {
    const connectedCount = node.metadata?.references?.length || 0;
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Clapperboard className="size-5" />
            </span>
            <div className="text-xs leading-5 opacity-65">
                {connectedCount ? `已连接 ${connectedCount} 个视频节点，可继续编排合成要求` : "空空如也，请连接视频节点后操作"}
            </div>
            <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs transition"
                style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenComposer?.();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                编排合成
            </button>
        </div>
    );
}

function DirectorContent({ theme, onOpenComposer }: NodeContentRendererProps) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Layers3 className="size-5" />
            </span>
            <div className="text-xs leading-5 opacity-70">
                在3D空间中搭建场景并进行多视角截图
            </div>
            <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs transition"
                style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenComposer?.();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                打开导演台
            </button>
        </div>
    );
}

function NodeTitleBadge({ node, theme, overview }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; overview: boolean }) {
    const Icon = node.type === CanvasNodeType.Image ? ImageIcon : node.type === CanvasNodeType.Video ? Video : node.type === CanvasNodeType.Audio ? Music2 : node.type === CanvasNodeType.Config ? Settings2 : node.type === CanvasNodeType.Group ? Layers3 : FileText;
    return (
        <div
            className={cn("pointer-events-none absolute left-0 z-30 flex max-w-[220px] items-center gap-1 text-[11px] leading-4", overview ? "top-0 rounded-md border px-1.5 py-1" : "-top-[22px] max-w-full")}
            style={{
                color: theme.node.label,
                background: overview ? theme.toolbar.panel : "transparent",
                borderColor: overview ? theme.toolbar.border : "transparent",
                transform: overview ? "scale(var(--canvas-overview-inverse-scale, 1))" : undefined,
                transformOrigin: "top left",
            }}
        >
            <Icon className="size-3 shrink-0 opacity-65" />
            <span className="truncate">{node.title || "未命名节点"}</span>
        </div>
    );
}

function GroupTitleEditor({
    node,
    theme,
    overview,
    onTitleChange,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    overview: boolean;
    onTitleChange: (nodeId: string, title: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const cancelRef = useRef(false);
    const fallbackTitle = node.metadata?.groupVariant === "storyboard" ? "分镜组" : "分组";
    const commit = () => {
        if (cancelRef.current) {
            cancelRef.current = false;
            return;
        }
        onTitleChange(node.id, draft.trim() || fallbackTitle);
        setEditing(false);
    };
    const sharedStyle: React.CSSProperties = {
        color: theme.node.text,
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
    };

    return (
        <div
            className={cn("absolute z-40 max-w-[70%]", overview ? "bottom-full right-0" : "right-2 top-2")}
            style={{
                transform: overview ? "scale(var(--canvas-overview-inverse-scale, 1))" : undefined,
                transformOrigin: overview ? "bottom right" : "top right",
            }}
        >
            {editing ? (
                <input
                    autoFocus
                    data-canvas-no-zoom
                    value={draft}
                    maxLength={64}
                    className="h-7 w-40 select-text rounded-md border px-2 text-right text-xs outline-none"
                    style={sharedStyle}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commit();
                        }
                        if (event.key === "Escape") {
                            cancelRef.current = true;
                            setEditing(false);
                        }
                    }}
                />
            ) : (
                <button
                    type="button"
                    data-canvas-no-zoom
                    title="双击重命名"
                    className="block max-w-full truncate rounded-md border px-2 py-1 text-right text-xs font-medium"
                    style={sharedStyle}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        cancelRef.current = false;
                        setDraft(node.title || fallbackTitle);
                        setEditing(true);
                    }}
                >
                    {node.title || fallbackTitle}
                </button>
            )}
        </div>
    );
}

function TryActionList({ theme, actions }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; actions: Array<{ label: string; onClick?: () => void }> }) {
    return (
        <div className="flex h-full w-full flex-col items-start justify-center px-3 text-left">
            <div className="mb-1.5 text-[12px]" style={{ color: theme.node.placeholder }}>尝试：</div>
            <div className="flex max-w-full flex-col items-start gap-0.5">
                {actions.map((action) => (
                    <button
                        key={action.label}
                        type="button"
                        className="max-w-full rounded-md px-1 py-0.5 text-left text-[12px] leading-5 transition"
                        style={{ color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            action.onClick?.();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                        onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                    >
                        {action.label}
                    </button>
                ))}
            </div>
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

function EmptyImageContent({ node, theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, onOpenComposer, onUpload }: NodeContentRendererProps) {
    if (node.metadata?.canvasTool === "panorama360") {
        return (
            <TryActionList
                theme={theme}
                actions={[
                    { label: "生成360全景", onClick: onOpenComposer },
                    { label: "上传360图片", onClick: onUpload },
                ]}
            />
        );
    }
    const content = (
        <TryActionList
            theme={theme}
            actions={[
                { label: "图生图", onClick: onOpenComposer },
                { label: "图片高清", onClick: onOpenComposer },
            ]}
        />
    );
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
            <div className="h-full w-full overflow-hidden rounded-[8px]">
                {imgSrc ? (
                    <div className="relative h-full w-full">
                        <img
                            src={imgSrc}
                            alt={node.title}
                            draggable={false}
                            decoding="async"
                            onDragStart={(event) => event.preventDefault()}
                            className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                        />
                        {node.metadata?.canvasTool === "panorama360" ? <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur">360</span> : null}
                    </div>
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
                    className="absolute right-2.5 top-2.5 z-30 h-8 rounded-md border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
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

function Panorama360Viewer({ src, title }: { src: string; title: string }) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [textureSrc, setTextureSrc] = useState(src);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoadError("");
        if (!/^https?:/i.test(src)) {
            setTextureSrc(src);
            return;
        }
        setTextureSrc("");
        imageToDataUrl({ url: src })
            .then((dataUrl) => {
                if (!cancelled) setTextureSrc(dataUrl);
            })
            .catch((error) => {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : "360贴图加载失败");
            });
        return () => {
            cancelled = true;
        };
    }, [src]);

    useEffect(() => {
        if (!textureSrc) return;
        const host = hostRef.current;
        if (!host) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x050505, 1);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1100);
        camera.position.set(0, 0, 0);
        let disposed = false;
        let yaw = 0;
        let pitch = 0;

        const geometry = new THREE.SphereGeometry(500, 96, 48);
        geometry.scale(-1, 1, 1);
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        const texture = loader.load(textureSrc, render, undefined, () => {
            if (!disposed) setLoadError("360贴图加载失败");
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        const updateCameraDirection = () => {
            const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
            camera.lookAt(direction);
        };
        updateCameraDirection();

        const resize = () => {
            if (!host || disposed) return;
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
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        renderer.domElement.className = "block h-full w-full";
        renderer.domElement.style.pointerEvents = "none";
        resize();

        return () => {
            disposed = true;
            observer.disconnect();
            texture.dispose();
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [textureSrc]);

    return (
        <div ref={hostRef} className="relative h-full w-full bg-black" aria-label={title || "360场景"}>
            {!textureSrc || loadError ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-xs text-white/70">
                    {loadError || "正在准备360贴图"}
                </div>
            ) : null}
        </div>
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
        <div className="group/batch relative h-full w-full overflow-visible">
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

function ConnectionHandleDot({ side, visible, active }: { side: "left" | "right"; visible: boolean; active: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isSource = side === "right";
    const visualClass = isSource ? "left-[18px]" : "right-[18px]";
    const plusVisibility = active
        ? "opacity-100 scale-125"
        : visible
          ? "opacity-100 scale-100"
          : "opacity-0 scale-75 group-hover/connection-handle:opacity-100 group-hover/connection-handle:scale-100";

    return (
        <div
            data-handle
            data-handle-type={isSource ? "source" : "target"}
            className="group/connection-handle !pointer-events-auto !z-40 absolute top-0 h-full cursor-crosshair"
            style={{ [side]: "-22px", width: "44px" }}
        >
            <span className={`absolute top-1/2 flex size-9 -translate-y-1/2 items-center justify-center ${visualClass}`}>
                <span
                    className={`pointer-events-none relative grid size-5 place-items-center rounded-full border transition duration-150 ${plusVisibility}`}
                    style={{
                        background: active ? "#a5f3fc" : "#f7f7f7",
                        borderColor: active ? "#ecfeff" : "rgba(255,255,255,.7)",
                        color: theme.canvas.background,
                        boxShadow: active ? "0 0 0 7px rgba(165,243,252,.16), 0 0 18px rgba(103,232,249,.72)" : undefined,
                    }}
                >
                    <span className="absolute left-1/2 top-1/2 h-[10px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                    <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                </span>
            </span>
        </div>
    );
}
