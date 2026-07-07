"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Background,
    BackgroundVariant,
    ConnectionMode,
    MiniMap,
    ReactFlow,
    ViewportPortal,
    type Connection,
    type Edge,
    type EdgeTypes,
    type NodeChange,
    type NodeTypes,
    type OnSelectionChangeFunc,
    type OnConnectEnd,
    type OnConnectStart,
    type OnMove,
    type OnMoveEnd,
    type OnNodeDrag,
    type ReactFlowInstance,
    type XYPosition,
} from "@xyflow/react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";
import type { ReactFlowCanvasNodeType } from "./react-flow-canvas-node";
import { CanvasScaleCtx } from "./canvas-scale-context";
import { toReactFlowViewport } from "../utils/react-flow-adapter";

type ReactFlowCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    nodes?: ReactFlowCanvasNodeType[];
    edges?: Edge[];
    nodeTypes?: NodeTypes;
    edgeTypes?: EdgeTypes;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onNodesChange?: (changes: NodeChange<ReactFlowCanvasNodeType>[]) => void;
    onNodeDragStart?: OnNodeDrag<ReactFlowCanvasNodeType>;
    onNodeDrag?: OnNodeDrag<ReactFlowCanvasNodeType>;
    onNodeDragStop?: OnNodeDrag<ReactFlowCanvasNodeType>;
    onSelectionChange?: OnSelectionChangeFunc<ReactFlowCanvasNodeType, Edge>;
    onConnect?: (connection: Connection) => void;
    onConnectStart?: OnConnectStart;
    onConnectEnd?: OnConnectEnd;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    miniMapOpen?: boolean;
    children?: React.ReactNode;
};

const EMPTY_NODES: ReactFlowCanvasNodeType[] = [];
const EMPTY_EDGES: Edge[] = [];

type RuntimeOverride = {
    position?: XYPosition;
    dragging?: boolean;
};

export function ReactFlowCanvas({
    containerRef,
    viewport,
    nodes = EMPTY_NODES,
    edges = EMPTY_EDGES,
    nodeTypes,
    edgeTypes,
    backgroundMode = "lines",
    onViewportChange,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onSelectionChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onCanvasMouseDown,
    onCanvasDeselect,
    onContextMenu,
    onDrop,
    miniMapOpen = false,
    children,
}: ReactFlowCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const flowRef = useRef<ReactFlowInstance<ReactFlowCanvasNodeType, Edge> | null>(null);
    const pointerState = useRef({ x: 0, y: 0, moved: false });
    const onViewportChangeRef = useRef(onViewportChange);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    // Per-node runtime overrides (drag position/dragging flag) kept in a ref so the
    // parent `nodes` prop stays the single source of truth and we avoid a setState
    // loop. A version counter forces a re-render when overrides change during drag.
    const runtimeOverridesRef = useRef<Map<string, RuntimeOverride>>(new Map());
    const [runtimeVersion, setRuntimeVersion] = useState(0);

    useEffect(() => {
        onViewportChangeRef.current = onViewportChange;
    }, [onViewportChange]);

    useEffect(() => {
        viewportRef.current = viewport;
        scaleRef.current = viewport.k;
        const flow = flowRef.current;
        if (!flow) return;
        const current = flow.getViewport();
        if (current.x === viewport.x && current.y === viewport.y && current.zoom === viewport.k) return;
        void flow.setViewport(toReactFlowViewport(viewport), { duration: 0 });
    }, [viewport]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const updateViewport = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        scaleRef.current = next.k;
        onViewportChangeRef.current(next);
    }, []);

    const handleMove = useCallback<OnMove>((_, next) => {
        viewportRef.current = { x: next.x, y: next.y, k: next.zoom };
        scaleRef.current = next.zoom;
    }, []);

    const handleMoveEnd = useCallback<OnMoveEnd>(
        (_, next) => {
            updateViewport({ x: next.x, y: next.y, k: next.zoom });
        },
        [updateViewport],
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-canvas-no-zoom],[data-connection-create-menu],.canvas-no-zoom-popup")) return;
            const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
            pointerState.current = { x: event.clientX, y: event.clientY, moved: false };

            if (event.button === 0 && (event.ctrlKey || event.metaKey) && isBackgroundClick) {
                onCanvasMouseDown?.(event);
            }
        },
        [onCanvasMouseDown],
    );

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const state = pointerState.current;
        if (Math.abs(event.clientX - state.x) > 3 || Math.abs(event.clientY - state.y) > 3) state.moved = true;
    }, []);

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const target = event.target instanceof Element ? event.target : null;
            const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id],[data-canvas-no-zoom],[data-connection-create-menu],.canvas-no-zoom-popup");
            if (event.button === 0 && isBackgroundClick && !pointerState.current.moved && !event.ctrlKey && !event.metaKey) onCanvasDeselect?.();
        },
        [onCanvasDeselect],
    );

    const handleNodesChange = useCallback(
        (changes: NodeChange<ReactFlowCanvasNodeType>[]) => {
            const overrides = runtimeOverridesRef.current;
            let changed = false;
            changes.forEach((change) => {
                if (change.type !== "position") return;
                const override: RuntimeOverride = overrides.get(change.id) || {};
                if (change.position) override.position = change.position;
                if (typeof change.dragging === "boolean") override.dragging = change.dragging;
                overrides.set(change.id, override);
                changed = true;
            });
            if (changed) setRuntimeVersion((version) => version + 1);
            onNodesChange?.(changes);
        },
        [onNodesChange],
    );

    // Derive runtime nodes from the parent prop + drag overrides. We return the
    // parent `nodes` array by reference when there are no overrides, so React Flow's
    // StoreUpdater sees a stable reference and does not re-run setNodes every render.
    const runtimeNodes = useMemo<ReactFlowCanvasNodeType[]>(() => {
        const overrides = runtimeOverridesRef.current;
        if (!overrides.size) return nodes;
        let changed = false;
        const result = nodes.map((node) => {
            const override = overrides.get(node.id);
            if (!override) return node;
            changed = true;
            return { ...node, ...(override.position ? { position: override.position } : {}), ...(typeof override.dragging === "boolean" ? { dragging: override.dragging } : {}) };
        });
        return changed ? result : nodes;
        // runtimeVersion forces re-derivation when overrides change during drag.
    }, [nodes, runtimeVersion]);

    // Clear overrides once the parent has committed the final position (drag stop),
    // so the parent stays the single source of truth.
    useEffect(() => {
        const overrides = runtimeOverridesRef.current;
        if (!overrides.size) return;
        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        let cleared = false;
        for (const [id, override] of overrides) {
            if (override.dragging) continue;
            const node = nodeById.get(id);
            if (!node) continue;
            if (override.position && node.position.x === override.position.x && node.position.y === override.position.y) {
                overrides.delete(id);
                cleared = true;
            }
        }
        if (cleared) setRuntimeVersion((version) => version + 1);
    }, [nodes]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-hidden"
            style={{ background: theme.canvas.background }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasScaleCtx.Provider value={scaleRef}>
                <ReactFlow
                    nodes={runtimeNodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultViewport={toReactFlowViewport(viewport)}
                    minZoom={0.05}
                    maxZoom={5}
                    panOnDrag={!isSpacePressed}
                    zoomOnScroll
                    zoomOnPinch
                    zoomOnDoubleClick={false}
                    nodesDraggable
                    nodeDragThreshold={1}
                    nodesConnectable
                    elementsSelectable
                    selectionOnDrag
                    selectionKeyCode={["Meta", "Control"]}
                    multiSelectionKeyCode={["Meta", "Control", "Shift"]}
                    connectionMode={ConnectionMode.Loose}
                    connectionRadius={48}
                    onSelectionChange={onSelectionChange}
                    onlyRenderVisibleElements
                    onNodesChange={handleNodesChange}
                    onConnect={onConnect}
                    onConnectStart={onConnectStart}
                    onConnectEnd={onConnectEnd}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDrag={onNodeDrag}
                    onNodeDragStop={onNodeDragStop}
                    proOptions={{ hideAttribution: true }}
                    onInit={(instance) => {
                        flowRef.current = instance;
                        void instance.setViewport(toReactFlowViewport(viewportRef.current), { duration: 0 });
                    }}
                    onMove={handleMove}
                    onMoveEnd={handleMoveEnd}
                    style={{ background: theme.canvas.background }}
                >
                    {backgroundMode !== "blank" ? (
                        <Background color={backgroundMode === "dots" ? theme.canvas.dot : theme.canvas.line} gap={48} size={backgroundMode === "dots" ? 1.15 : 1} variant={backgroundMode === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines} />
                    ) : null}
                    {miniMapOpen ? (
                        <MiniMap
                            pannable
                            zoomable
                            nodeStrokeWidth={2}
                            nodeColor={() => theme.node.muted}
                            maskColor={theme.canvas.selectionFill}
                            style={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 12, left: 24, bottom: 96, width: 240, height: 160 }}
                        />
                    ) : null}
                    <ViewportPortal>{children}</ViewportPortal>
                </ReactFlow>
            </CanvasScaleCtx.Provider>
        </div>
    );
}
