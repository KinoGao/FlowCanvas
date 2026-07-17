"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as LUI from "leafer-ui";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "../types";
import { CanvasScaleCtx } from "./canvas-scale-context";
import { buildConnectionPathFromPoints, getNodeConnectionPoint } from "../utils/canvas-connection-geometry";
import { canvasToScreen, clampViewport, screenToCanvas, viewportToCssTransform, sameViewport } from "./leafer-viewport";

type LeaferCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode?: CanvasBackgroundMode;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    onViewportChange: (viewport: ViewportTransform) => void;
    onNodePointerDown?: (nodeId: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => boolean;
    onNodeDragStart?: (nodeId: string) => void;
    onNodeDrag?: (nodeId: string, position: { x: number; y: number }) => void;
    onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>, canvasPos: { x: number; y: number }) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent, canvasPos: { x: number; y: number }) => void;
    onConnectStart?: (nodeId: string, handleType: "source" | "target") => void;
    onConnectEnd?: (canvasPos?: { x: number; y: number }) => void;
    onConnect?: (fromNodeId: string, toNodeId: string) => void;
    onEdgeClick?: (connectionId: string) => void;
    onDrop?: (files: FileList, canvasPos: { x: number; y: number }) => void;
    onSelectionBox?: (nodeIds: string[], mode: 'replace' | 'add' | 'toggle') => void;
    connectingParams?: { nodeId: string; handleType: "source" | "target" } | null;
    pendingConnection?: {
        connection: { nodeId: string; handleType: "source" | "target" };
        position: { x: number; y: number };
    } | null;
    connectionTargetNodeId?: string | null;
    onConnectionTargetChange?: (nodeId: string | null) => void;
    miniMapOpen?: boolean;
    children?: React.ReactNode;
};

const EMPTY_NODES: CanvasNodeData[] = [];
const EMPTY_CONNECTIONS: CanvasConnection[] = [];
const CONNECTION_SNAP_RADIUS = 48;
const CONNECTION_SNAP_RELEASE_RADIUS = 64;

export function LeaferCanvas({
    containerRef,
    viewport,
    nodes = EMPTY_NODES,
    connections = EMPTY_CONNECTIONS,
    backgroundMode = "lines",
    selectedNodeIds,
    selectedConnectionId,
    onViewportChange,
    onNodePointerDown,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onCanvasMouseDown,
    onCanvasDeselect,
    onContextMenu,
    onConnectStart,
    onConnectEnd,
    onConnect,
    onEdgeClick,
    onDrop,
    onSelectionBox,
    connectingParams,
    pendingConnection,
    connectionTargetNodeId,
    onConnectionTargetChange,
    miniMapOpen = false,
    children,
}: LeaferCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const committedViewportRef = useRef(viewport);
    const leaferContainerRef = useRef<HTMLDivElement>(null);
    const leaferRef = useRef<LUI.Leafer | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const selectionModifiersRef = useRef({ shiftKey: false, ctrlKey: false, metaKey: false });

    // Refs for all mutable props/state — prevents recreating event handlers (which causes infinite loops)
    const nodesRef = useRef(nodes); nodesRef.current = nodes;
    const connectingParamsRef = useRef(connectingParams); connectingParamsRef.current = connectingParams;
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId); connectionTargetNodeIdRef.current = connectionTargetNodeId;
    const isSpacePressedRef = useRef(isSpacePressed); isSpacePressedRef.current = isSpacePressed;
    const connectStartScreenRef = useRef<{ x: number; y: number } | null>(null);
    const callbacksRef = useRef({ onViewportChange, onNodePointerDown, onNodeDragStart, onNodeDrag, onNodeDragStop, onCanvasMouseDown, onCanvasDeselect, onConnectStart, onConnectEnd, onConnect, onEdgeClick, onDrop, onSelectionBox, onConnectionTargetChange, onContextMenu });
    callbacksRef.current = { onViewportChange, onNodePointerDown, onNodeDragStart, onNodeDrag, onNodeDragStop, onCanvasMouseDown, onCanvasDeselect, onConnectStart, onConnectEnd, onConnect, onEdgeClick, onDrop, onSelectionBox, onConnectionTargetChange, onContextMenu };

    // Drag state
    const dragRef = useRef<{
        type: "pan" | "node" | "select" | null;
        nodeId: string;
        startScreenX: number;
        startScreenY: number;
        startNodeX: number;
        startNodeY: number;
        startViewportX: number;
        startViewportY: number;
        selectStartCanvas: { x: number; y: number };
        selectRect: { x: number; y: number; w: number; h: number } | null;
        selectionMode: 'replace' | 'add' | 'toggle';
    }>({
        type: null, nodeId: "", startScreenX: 0, startScreenY: 0,
        startNodeX: 0, startNodeY: 0, startViewportX: 0, startViewportY: 0,
        selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: 'replace',
    });

    const tempEdgePathRef = useRef<SVGPathElement>(null);
    const frozenTempEdgeRef = useRef<NonNullable<LeaferCanvasProps["pendingConnection"]>>(null);
    const previousPendingConnectionRef = useRef(pendingConnection ?? null);

    // Init LeaferJS
    useEffect(() => {
        const container = leaferContainerRef.current;
        if (!container) return;
        container.style.position = "absolute";
        container.style.inset = "0";
        container.style.pointerEvents = "none";

        const app = new LUI.Leafer({ view: container, start: true });
        app.config = { ...app.config, hittable: false };
        leaferRef.current = app;
        drawBackground(app, backgroundMode, theme);

        return () => {
            app.destroy();
            leaferRef.current = null;
        };
    }, []);

    // Native wheel listener with { passive: false } to allow preventDefault
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const target = e.target instanceof Element ? e.target : null;
            if (target?.closest("[data-canvas-no-zoom],.canvas-no-zoom-popup,[data-connection-create-menu]")) {
                if (e.ctrlKey || e.metaKey) e.preventDefault();
                return;
            }
            if (dragRef.current.type) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const vp = viewportRef.current;
            if (!e.ctrlKey && !e.metaKey) {
                const next = clampViewport({ x: vp.x - e.deltaX, y: vp.y - e.deltaY, k: vp.k }, rect.width, rect.height);
                if (sameViewport(committedViewportRef.current, next)) return;
                viewportRef.current = next;
                committedViewportRef.current = next;
                callbacksRef.current.onViewportChange(next);
                return;
            }
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = Math.exp(-Math.max(-80, Math.min(80, e.deltaY)) * 0.0025);
            const newK = Math.max(0.05, Math.min(5, vp.k * zoomFactor));
            const newX = mouseX - (mouseX - vp.x) * (newK / vp.k);
            const newY = mouseY - (mouseY - vp.y) * (newK / vp.k);
            const next = { x: newX, y: newY, k: newK };
            viewportRef.current = next;
            scaleRef.current = next.k;
            const clamped = clampViewport(next, rect.width, rect.height);
            if (sameViewport(committedViewportRef.current, clamped)) return;
            committedViewportRef.current = clamped;
            callbacksRef.current.onViewportChange(clamped);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [containerRef]);

    // Background redraw
    useEffect(() => {
        const app = leaferRef.current;
        if (!app) return;
        app.clear();
        drawBackground(app, backgroundMode, theme);
    }, [backgroundMode, theme]);

    // Viewport sync
    useEffect(() => {
        committedViewportRef.current = viewport;
        viewportRef.current = viewport;
        scaleRef.current = viewport.k;
    }, [viewport]);

    // Keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            selectionModifiersRef.current = {
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
            };
            if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable))) {
                e.preventDefault();
                isSpacePressedRef.current = true;
                setIsSpacePressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            selectionModifiersRef.current = {
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
            };
            if (e.code === "Space") {
                isSpacePressedRef.current = false;
                setIsSpacePressed(false);
            }
        };
        const handleBlur = () => {
            selectionModifiersRef.current = { shiftKey: false, ctrlKey: false, metaKey: false };
            isSpacePressedRef.current = false;
            setIsSpacePressed(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const getCanvasPos = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect() ?? null;
        if (!rect) return { x: 0, y: 0 };
        return screenToCanvas(clientX, clientY, rect, viewportRef.current);
    }, [containerRef]);

    const renderTempEdgeAtCanvasPoint = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, pointerCanvasPoint: { x: number; y: number }) => {
        const path = tempEdgePathRef.current;
        const node = nodesRef.current.find((item) => item.id === connection.nodeId);
        if (!path || !node) return;

        const fixedCanvasPoint = getNodeConnectionPoint(node, connection.handleType);
        const fixedScreenPoint = canvasToScreen(fixedCanvasPoint.x, fixedCanvasPoint.y, viewportRef.current);
        const pointerScreenPoint = canvasToScreen(pointerCanvasPoint.x, pointerCanvasPoint.y, viewportRef.current);
        const sourcePoint = connection.handleType === "source" ? fixedScreenPoint : pointerScreenPoint;
        const targetPoint = connection.handleType === "source" ? pointerScreenPoint : fixedScreenPoint;

        path.setAttribute("d", buildConnectionPathFromPoints(sourcePoint, targetPoint));
        path.style.opacity = "1";
    }, []);

    const renderTempEdge = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, clientX: number, clientY: number) => {
        renderTempEdgeAtCanvasPoint(connection, getCanvasPos(clientX, clientY));
    }, [getCanvasPos, renderTempEdgeAtCanvasPoint]);

    const findConnectionSnapTarget = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const pointer = { x: clientX - rect.left, y: clientY - rect.top };
        const targetSide = connection.handleType === "source" ? "target" : "source";
        const currentTargetId = connectionTargetNodeIdRef.current;
        let nearest: { node: CanvasNodeData; distance: number } | null = null;

        for (const node of nodesRef.current) {
            if (node.id === connection.nodeId || node.type === CanvasNodeType.Group) continue;
            if (targetSide === "source" && node.type === CanvasNodeType.Config) continue;
            const canvasPoint = getNodeConnectionPoint(node, targetSide);
            const screenPoint = canvasToScreen(canvasPoint.x, canvasPoint.y, viewportRef.current);
            const distance = Math.hypot(pointer.x - screenPoint.x, pointer.y - screenPoint.y);
            const radius = node.id === currentTargetId ? CONNECTION_SNAP_RELEASE_RADIUS : CONNECTION_SNAP_RADIUS;
            if (distance <= radius && (!nearest || distance < nearest.distance)) nearest = { node, distance };
        }

        return nearest ? { nodeId: nearest.node.id, position: getNodeConnectionPoint(nearest.node, targetSide) } : null;
    }, [containerRef]);

    const clearTempEdge = useCallback(() => {
        const path = tempEdgePathRef.current;
        if (!path) return;
        path.style.opacity = "0";
        path.removeAttribute("d");
    }, []);

    useEffect(() => {
        const hadPendingConnection = previousPendingConnectionRef.current !== null;
        previousPendingConnectionRef.current = pendingConnection ?? null;

        if (pendingConnection) {
            frozenTempEdgeRef.current = pendingConnection;
            renderTempEdgeAtCanvasPoint(pendingConnection.connection, pendingConnection.position);
            return;
        }
        if (connectingParams) {
            frozenTempEdgeRef.current = null;
            return;
        }
        if (hadPendingConnection) {
            frozenTempEdgeRef.current = null;
            clearTempEdge();
            return;
        }
        if (frozenTempEdgeRef.current) {
            renderTempEdgeAtCanvasPoint(frozenTempEdgeRef.current.connection, frozenTempEdgeRef.current.position);
            return;
        }
        clearTempEdge();
    }, [clearTempEdge, connectingParams, nodes, pendingConnection, renderTempEdgeAtCanvasPoint, viewport.k, viewport.x, viewport.y]);

    // --- Event handlers use refs, never depend on changing state ---
    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-canvas-no-zoom],.canvas-no-zoom-popup,[data-connection-create-menu]")) return;

        const isNode = !!target.closest("[data-node-id]");
        const isHandle = !!target.closest("[data-handle]");
        const isEdge = !!target.closest("[data-connection-id]");
        const cb = callbacksRef.current;

        const shouldPanFromPointer = event.button === 1 || (event.button === 0 && isSpacePressedRef.current);
        if (shouldPanFromPointer && !isHandle) {
            dragRef.current = {
                type: "pan", nodeId: "",
                startScreenX: event.clientX, startScreenY: event.clientY,
                startNodeX: 0, startNodeY: 0,
                startViewportX: viewportRef.current.x, startViewportY: viewportRef.current.y,
                selectStartCanvas: getCanvasPos(event.clientX, event.clientY),
                selectRect: null,
                selectionMode: "replace",
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            document.body.style.userSelect = "none";
            return;
        }

        if (isHandle && !connectingParamsRef.current) {
            const handleEl = target.closest("[data-handle]") as HTMLElement;
            const nodeEl = target.closest("[data-node-id]") as HTMLElement;
            const handleType = handleEl?.dataset.handleType as "source" | "target";
            const nodeId = nodeEl?.dataset.nodeId;
            if (handleType && nodeId) {
                const nextConnection = { nodeId, handleType };
                frozenTempEdgeRef.current = null;
                connectingParamsRef.current = nextConnection;
                connectStartScreenRef.current = { x: event.clientX, y: event.clientY };
                cb.onConnectStart?.(nodeId, handleType);
                renderTempEdge(nextConnection, event.clientX, event.clientY);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.preventDefault();
                return;
            }
        }

        if (isNode && !isHandle && event.button === 0) {
            const nodeEl = target.closest("[data-node-id]") as HTMLElement;
            const nodeId = nodeEl?.dataset.nodeId;
            if (nodeId) {
                const node = nodesRef.current.find((n) => n.id === nodeId);
                if (node) {
                    const trackedModifiers = selectionModifiersRef.current;
                    const shouldStartDrag = cb.onNodePointerDown?.(nodeId, {
                        shiftKey: event.shiftKey || trackedModifiers.shiftKey,
                        ctrlKey: event.ctrlKey || trackedModifiers.ctrlKey,
                        metaKey: event.metaKey || trackedModifiers.metaKey,
                    }) ?? true;
                    if (!shouldStartDrag) return;
                    dragRef.current = {
                        type: "node", nodeId,
                        startScreenX: event.clientX, startScreenY: event.clientY,
                        startNodeX: node.position.x, startNodeY: node.position.y,
                        startViewportX: 0, startViewportY: 0,
                        selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: 'replace',
                    };
                    cb.onNodeDragStart?.(nodeId);
                    event.preventDefault();
                    document.body.style.userSelect = "none";
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    return;
                }
            }
        }

        if (isEdge) {
            const edgeEl = target.closest("[data-connection-id]") as HTMLElement;
            cb.onEdgeClick?.(edgeEl?.dataset.connectionId || "");
            return;
        }

        if (!isNode && !isHandle && !isEdge) {
            if (event.button === 0 || event.button === 1) {
                const trackedModifiers = selectionModifiersRef.current;
                const toggleSelection = event.ctrlKey || event.metaKey || trackedModifiers.ctrlKey || trackedModifiers.metaKey;
                const addSelection = event.shiftKey || trackedModifiers.shiftKey;
                const selectionMode = toggleSelection ? 'toggle' : addSelection ? 'add' : 'replace';
                dragRef.current = {
                    type: 'select', nodeId: '',
                    startScreenX: event.clientX, startScreenY: event.clientY,
                    startNodeX: 0, startNodeY: 0,
                    startViewportX: viewportRef.current.x, startViewportY: viewportRef.current.y,
                    selectStartCanvas: getCanvasPos(event.clientX, event.clientY),
                    selectRect: null,
                    selectionMode,
                };
                if (selectionMode === "replace") cb.onCanvasDeselect?.();
                cb.onCanvasMouseDown?.(event, dragRef.current.selectStartCanvas);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            }
        }
    }, [getCanvasPos, renderTempEdge]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const cb = callbacksRef.current;

        if (drag.type === "node") {
            const vp = viewportRef.current;
            const dx = (event.clientX - drag.startScreenX) / vp.k;
            const dy = (event.clientY - drag.startScreenY) / vp.k;
            cb.onNodeDrag?.(drag.nodeId, { x: drag.startNodeX + dx, y: drag.startNodeY + dy });
            return;
        }

        if (drag.type === "select" || drag.type === "pan") {
            const vp = viewportRef.current;
            if ((isSpacePressedRef.current || event.buttons === 4) && drag.type === "select") {
                drag.type = "pan";
                drag.startViewportX = vp.x;
                drag.startViewportY = vp.y;
                drag.startScreenX = event.clientX;
                drag.startScreenY = event.clientY;
            }
            if (drag.type === "pan") {
                const next = {
                    x: drag.startViewportX + (event.clientX - drag.startScreenX),
                    y: drag.startViewportY + (event.clientY - drag.startScreenY),
                    k: vp.k,
                };
                viewportRef.current = next;
                scaleRef.current = next.k;
                const rect = containerRef.current?.getBoundingClientRect();
                const clamped = rect ? clampViewport(next, rect.width, rect.height) : next;
                if (!sameViewport(committedViewportRef.current, clamped)) {
                    committedViewportRef.current = clamped;
                    cb.onViewportChange(clamped);
                }
                return;
            }
            if (drag.type === "select") {
                const start = drag.selectStartCanvas;
                const current = getCanvasPos(event.clientX, event.clientY);
                drag.selectRect = {
                    x: Math.min(start.x, current.x), y: Math.min(start.y, current.y),
                    w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y),
                };
                renderSelectionBox(leaferRef.current, drag.selectRect);
            }
        }

        // Connection drag
        const cp = connectingParamsRef.current;
        if (cp && !drag.type) {
            const fromNode = nodesRef.current.find((n) => n.id === cp.nodeId);
            if (fromNode) {
                const snapTarget = findConnectionSnapTarget(cp, event.clientX, event.clientY);
                const currentTarget = connectionTargetNodeIdRef.current;
                renderTempEdgeAtCanvasPoint(cp, snapTarget?.position ?? getCanvasPos(event.clientX, event.clientY));
                const nextTarget = snapTarget?.nodeId ?? null;
                if (nextTarget !== currentTarget) {
                    connectionTargetNodeIdRef.current = nextTarget;
                    cb.onConnectionTargetChange?.(nextTarget);
                }
            }
        }
    }, [findConnectionSnapTarget, getCanvasPos, containerRef, renderTempEdgeAtCanvasPoint]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const cb = callbacksRef.current;
        const vp = viewportRef.current;

        if (drag.type === "node") {
            const dx = (event.clientX - drag.startScreenX) / vp.k;
            const dy = (event.clientY - drag.startScreenY) / vp.k;
            cb.onNodeDragStop?.(drag.nodeId, { x: drag.startNodeX + dx, y: drag.startNodeY + dy });
        }

        if (drag.type === "select" && drag.selectRect && drag.selectRect.w > 5 && drag.selectRect.h > 5) {
            clearSelectionBox(leaferRef.current);
            const r = drag.selectRect;
            const hitIds = nodesRef.current.filter((n) => {
                const nx2 = n.position.x + n.width;
                const ny2 = n.position.y + n.height;
                return n.position.x < r.x + r.w && nx2 > r.x && n.position.y < r.y + r.h && ny2 > r.y;
            }).map((n) => n.id);
            cb.onSelectionBox?.(hitIds, drag.selectionMode);
        } else if (drag.selectRect) {
            clearSelectionBox(leaferRef.current);
        }

        const cp = connectingParamsRef.current;
        const snapTarget = cp ? findConnectionSnapTarget(cp, event.clientX, event.clientY) : null;
        const targetId = snapTarget?.nodeId ?? connectionTargetNodeIdRef.current;
        if (cp && targetId && cp.nodeId !== targetId) {
            cb.onConnect?.(cp.nodeId, targetId);
        }

        if (cp && !targetId) {
            // 拖拽距离阈值：单击连接 handle（未拖动）不弹出创建节点菜单
            const start = connectStartScreenRef.current;
            const dragged = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 : true;
            if (dragged) {
                const pos = getCanvasPos(event.clientX, event.clientY);
                frozenTempEdgeRef.current = { connection: cp, position: pos };
                renderTempEdgeAtCanvasPoint(cp, pos);
                cb.onConnectEnd?.(pos);
            } else {
                clearTempEdge();
                cb.onConnectEnd?.();
            }
        } else {
            clearTempEdge();
            cb.onConnectEnd?.();
        }
        connectingParamsRef.current = null;
        connectStartScreenRef.current = null;

        dragRef.current = {
            type: null, nodeId: "", startScreenX: 0, startScreenY: 0,
            startNodeX: 0, startNodeY: 0, startViewportX: 0, startViewportY: 0,
            selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: 'replace',
        };
        document.body.style.userSelect = "";
    }, [clearTempEdge, findConnectionSnapTarget, getCanvasPos, renderTempEdgeAtCanvasPoint]);

    const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (drag.type === "node") {
            const vp = viewportRef.current;
            const dx = (event.clientX - drag.startScreenX) / vp.k;
            const dy = (event.clientY - drag.startScreenY) / vp.k;
            callbacksRef.current.onNodeDragStop?.(drag.nodeId, { x: drag.startNodeX + dx, y: drag.startNodeY + dy });
        }
        if (drag.type === "select") clearSelectionBox(leaferRef.current);
        dragRef.current = {
            type: null, nodeId: "", startScreenX: 0, startScreenY: 0,
            startNodeX: 0, startNodeY: 0, startViewportX: 0, startViewportY: 0,
            selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: "replace",
        };
        if (!frozenTempEdgeRef.current) clearTempEdge();
        if (connectingParamsRef.current) callbacksRef.current.onConnectEnd?.();
        connectingParamsRef.current = null;
        connectionTargetNodeIdRef.current = null;
        callbacksRef.current.onConnectionTargetChange?.(null);
        document.body.style.userSelect = "";
    }, [clearTempEdge]);

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        const pos = getCanvasPos(event.clientX, event.clientY);
        callbacksRef.current.onContextMenu?.(event, pos);
    }, [getCanvasPos]);

    const viewportStyle: React.CSSProperties = useMemo(() => ({
        transform: viewportToCssTransform(viewport),
        transformOrigin: "0 0",
        position: "absolute",
        top: 0, left: 0,
        width: 1,
        height: 1,
        overflow: "visible",
        willChange: "transform",
        "--canvas-overview-inverse-scale": String(1 / Math.max(0.05, viewport.k)),
    }) as React.CSSProperties, [viewport.x, viewport.y, viewport.k]);

    const backgroundStyle = useMemo<React.CSSProperties>(() => {
        if (backgroundMode === "blank") return { backgroundColor: theme.canvas.background };
        const gap = Math.max(8, 56 * viewport.k);
        const position = `${viewport.x % gap}px ${viewport.y % gap}px`;
        if (backgroundMode === "dots") {
            return {
                backgroundColor: theme.canvas.background,
                backgroundImage: `radial-gradient(circle, ${theme.canvas.dot} 1px, transparent 1.5px)`,
                backgroundSize: `${gap}px ${gap}px`,
                backgroundPosition: position,
            };
        }
        return {
            backgroundColor: theme.canvas.background,
            backgroundImage: `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`,
            backgroundSize: `${gap}px ${gap}px`,
            backgroundPosition: position,
        };
    }, [backgroundMode, theme, viewport.k, viewport.x, viewport.y]);

    const cursor = isSpacePressed ? "grab" : "default";

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-hidden"
            style={{ ...backgroundStyle, cursor, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length && onDrop) {
                    const pos = getCanvasPos(e.clientX, e.clientY);
                    onDrop(e.dataTransfer.files, pos);
                }
            }}
        >
            <svg
                className="pointer-events-none absolute inset-0 z-[60] h-full w-full overflow-visible"
                aria-hidden
            >
                <path
                    ref={tempEdgePathRef}
                    className="canvas-flow-edge"
                    fill="none"
                    stroke="#a5f3fc"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeDasharray="10 18"
                    vectorEffect="non-scaling-stroke"
                    style={{ opacity: 0, filter: "drop-shadow(0 0 5px rgba(103,232,249,.8))" }}
                />
            </svg>
            <div style={viewportStyle}>
                <div ref={leaferContainerRef} className="absolute inset-0" />
                <CanvasScaleCtx.Provider value={scaleRef}>
                    {children}
                </CanvasScaleCtx.Provider>
            </div>
        </div>
    );
}

function drawBackground(app: LUI.Leafer, mode: CanvasBackgroundMode, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    app.clear();
    if (mode === "blank") return;
    const gap = 56;
    const size = mode === "dots" ? 1.2 : 0.8;
    const color = mode === "dots" ? theme.canvas.dot : theme.canvas.line;
    const gridSize = 4000;
    const half = gridSize / 2;
    if (mode === "dots") {
        for (let x = -half; x <= half; x += gap) {
            for (let y = -half; y <= half; y += gap) {
                const dot = new LUI.Rect({ x: x - size / 2, y: y - size / 2, width: size, height: size, fill: color });
                dot.hittable = false;
                app.add(dot);
            }
        }
    } else {
        for (let x = -half; x <= half; x += gap) {
            const line = new LUI.Line({ points: [x, -half, x, half], stroke: color, strokeWidth: size });
            line.hittable = false;
            app.add(line);
        }
        for (let y = -half; y <= half; y += gap) {
            const line = new LUI.Line({ points: [-half, y, half, y], stroke: color, strokeWidth: size });
            line.hittable = false;
            app.add(line);
        }
    }
}

let _selectionRect: LUI.Rect | null = null;

function renderSelectionBox(app: LUI.Leafer | null, rect: { x: number; y: number; w: number; h: number } | null) {
    if (!app) return;
    if (_selectionRect) { _selectionRect.remove(); _selectionRect = null; }
    if (!rect || rect.w < 2 || rect.h < 2) return;
    const box = new LUI.Rect({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: "rgba(125, 211, 252, 0.1)", stroke: "#7dd3fc", strokeWidth: 1 });
    box.hittable = false;
    app.add(box);
    _selectionRect = box;
}

function clearSelectionBox(app: LUI.Leafer | null) {
    if (_selectionRect && app) { _selectionRect.remove(); _selectionRect = null; }
}
