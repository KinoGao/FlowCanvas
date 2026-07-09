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
    type EdgeMouseHandler,
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
import type { CanvasNodeProps } from "./canvas-node";
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
    onEdgeClick?: EdgeMouseHandler<Edge>;
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
const VIEWPORT_EPSILON = 0.001;

type RuntimeOverride = {
    position?: XYPosition;
    dragging?: boolean;
};

function useStableReactFlowNodes(nodes: ReactFlowCanvasNodeType[]) {
    const previousRef = useRef(nodes);

    return useMemo(() => {
        if (sameReactFlowNodes(previousRef.current, nodes)) return previousRef.current;
        previousRef.current = nodes;
        return nodes;
    }, [nodes]);
}

function sameReactFlowNodes(previous: ReactFlowCanvasNodeType[], next: ReactFlowCanvasNodeType[]) {
    if (previous === next) return true;
    if (previous.length !== next.length) return false;
    return previous.every((node, index) => sameReactFlowNode(node, next[index]));
}

function sameReactFlowNode(previous: ReactFlowCanvasNodeType, next: ReactFlowCanvasNodeType) {
    return (
        previous.id === next.id &&
        previous.type === next.type &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.selected === next.selected &&
        previous.draggable === next.draggable &&
        previous.position.x === next.position.x &&
        previous.position.y === next.position.y &&
        previous.measured?.width === next.measured?.width &&
        previous.measured?.height === next.measured?.height &&
        sameNodeData(previous.data, next.data)
    );
}

function sameNodeData(previous: ReactFlowCanvasNodeType["data"], next: ReactFlowCanvasNodeType["data"]) {
    if (previous === next) return true;
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length) return false;
    return previousKeys.every((key) => {
        const previousValue = previous[key];
        const nextValue = next[key];
        if (previousValue === nextValue) return true;
        if (key === "props" && isCanvasNodeProps(previousValue) && isCanvasNodeProps(nextValue)) return sameCanvasNodeProps(previousValue, nextValue);
        if (key === "props" && isRecord(previousValue) && isRecord(nextValue)) return shallowEqualRecord(previousValue, nextValue);
        return false;
    });
}

function isCanvasNodeProps(value: unknown): value is CanvasNodeProps {
    return isRecord(value) && isRecord(value.data) && typeof value.isSelected === "boolean";
}

function sameCanvasNodeProps(previous: CanvasNodeProps, next: CanvasNodeProps) {
    return (
        previous.data === next.data &&
        previous.isSelected === next.isSelected &&
        previous.isRelated === next.isRelated &&
        previous.isFocusRelated === next.isFocusRelated &&
        previous.isConnectionTarget === next.isConnectionTarget &&
        previous.isConnecting === next.isConnecting &&
        previous.editRequestNonce === next.editRequestNonce &&
        previous.showPanel === next.showPanel &&
        previous.showImageInfo === next.showImageInfo &&
        previous.isOverview === next.isOverview &&
        previous.positioned === next.positioned &&
        previous.batchCount === next.batchCount &&
        previous.batchExpanded === next.batchExpanded &&
        previous.batchClosing === next.batchClosing &&
        previous.batchOpening === next.batchOpening &&
        previous.batchRecovering === next.batchRecovering &&
        sameOptionalVector(previous.batchMotion, next.batchMotion) &&
        sameResourceReference(previous.resourceLabel, next.resourceLabel) &&
        sameResourceReferences(previous.mentionReferences, next.mentionReferences)
    );
}

function sameOptionalVector(previous: CanvasNodeProps["batchMotion"], next: CanvasNodeProps["batchMotion"]) {
    if (previous === next) return true;
    if (!previous || !next) return false;
    return previous.x === next.x && previous.y === next.y && previous.index === next.index;
}

function sameResourceReference(previous: CanvasNodeProps["resourceLabel"], next: CanvasNodeProps["resourceLabel"]) {
    if (previous === next) return true;
    if (!previous || !next) return false;
    return previous.id === next.id && previous.nodeId === next.nodeId && previous.label === next.label && previous.kind === next.kind && previous.title === next.title && previous.active === next.active && previous.text === next.text;
}

function sameResourceReferences(previous: CanvasNodeProps["mentionReferences"], next: CanvasNodeProps["mentionReferences"]) {
    if (previous === next) return true;
    const previousItems = previous || [];
    const nextItems = next || [];
    if (previousItems.length !== nextItems.length) return false;
    return previousItems.every((item, index) => sameResourceReference(item, nextItems[index]));
}

function shallowEqualRecord(previous: Record<string, unknown>, next: Record<string, unknown>) {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length) return false;
    return previousKeys.every((key) => previous[key] === next[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function sameViewport(current: { x: number; y: number; zoom: number }, next: ViewportTransform) {
    return Math.abs(current.x - next.x) < VIEWPORT_EPSILON && Math.abs(current.y - next.y) < VIEWPORT_EPSILON && Math.abs(current.zoom - next.k) < VIEWPORT_EPSILON;
}

function sameViewportTransform(previous: ViewportTransform, next: ViewportTransform) {
    return Math.abs(previous.x - next.x) < VIEWPORT_EPSILON && Math.abs(previous.y - next.y) < VIEWPORT_EPSILON && Math.abs(previous.k - next.k) < VIEWPORT_EPSILON;
}

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
    onEdgeClick,
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
    const committedViewportRef = useRef(viewport);
    const flowRef = useRef<ReactFlowInstance<ReactFlowCanvasNodeType, Edge> | null>(null);
    const pointerState = useRef({ x: 0, y: 0, moved: false });
    const onViewportChangeRef = useRef(onViewportChange);
    const suppressSelectionChangeRef = useRef(false);
    const selectionSuppressionTimerRef = useRef<number | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    // Per-node runtime overrides (drag position/dragging flag) kept in a ref so the
    // parent `nodes` prop stays the single source of truth and we avoid a setState
    // loop. A version counter forces a re-render when overrides change during drag.
    const runtimeOverridesRef = useRef<Map<string, RuntimeOverride>>(new Map());
    const [runtimeVersion, setRuntimeVersion] = useState(0);
    const stableNodes = useStableReactFlowNodes(nodes);

    useEffect(() => {
        onViewportChangeRef.current = onViewportChange;
    }, [onViewportChange]);

    useEffect(() => {
        committedViewportRef.current = viewport;
        viewportRef.current = viewport;
        scaleRef.current = viewport.k;
        const flow = flowRef.current;
        if (!flow) return;
        const current = flow.getViewport();
        if (sameViewport(current, viewport)) return;
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

    useEffect(
        () => () => {
            if (selectionSuppressionTimerRef.current !== null) window.clearTimeout(selectionSuppressionTimerRef.current);
        },
        [],
    );

    const updateViewport = useCallback((next: ViewportTransform) => {
        viewportRef.current = next;
        scaleRef.current = next.k;
        if (sameViewportTransform(committedViewportRef.current, next)) return;
        committedViewportRef.current = next;
        onViewportChangeRef.current(next);
    }, []);

    const clearReactFlowSelection = useCallback(() => {
        const flow = flowRef.current;
        if (!flow) return;
        suppressSelectionChangeRef.current = true;
        if (selectionSuppressionTimerRef.current !== null) window.clearTimeout(selectionSuppressionTimerRef.current);
        flow.setNodes((items) => items.map((node) => (node.selected ? { ...node, selected: false } : node)));
        flow.setEdges((items) => items.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)));
        selectionSuppressionTimerRef.current = window.setTimeout(() => {
            suppressSelectionChangeRef.current = false;
            selectionSuppressionTimerRef.current = null;
        }, 0);
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
            } else if (event.button === 0 && isBackgroundClick && !event.shiftKey) {
                clearReactFlowSelection();
                onCanvasDeselect?.();
            }
        },
        [clearReactFlowSelection, onCanvasDeselect, onCanvasMouseDown],
    );

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const state = pointerState.current;
        if (Math.abs(event.clientX - state.x) > 3 || Math.abs(event.clientY - state.y) > 3) state.moved = true;
    }, []);

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const target = event.target instanceof Element ? event.target : null;
            const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id],[data-canvas-no-zoom],[data-connection-create-menu],.canvas-no-zoom-popup");
            if (event.button === 0 && isBackgroundClick && !pointerState.current.moved && !event.ctrlKey && !event.metaKey) {
                clearReactFlowSelection();
                onCanvasDeselect?.();
            }
        },
        [clearReactFlowSelection, onCanvasDeselect],
    );

    const handleNodesChange = useCallback(
        (changes: NodeChange<ReactFlowCanvasNodeType>[]) => {
            const overrides = runtimeOverridesRef.current;
            let changed = false;
            changes.forEach((change) => {
                if (change.type !== "position") return;

                // React Flow can emit non-drag position changes while it reconciles
                // controlled `nodes`. If we mirror those into local state, the derived
                // `runtimeNodes` prop gets a new reference, StoreUpdater calls its
                // internal setNodes again, and the cycle can trip React's maximum
                // update depth guard. Runtime overrides are only needed during an
                // active drag; committed/non-drag positions are handled by the parent.
                if (change.dragging !== true && !overrides.has(change.id)) return;

                const override: RuntimeOverride = overrides.get(change.id) || {};
                let overrideChanged = false;
                if (change.position && (!override.position || override.position.x !== change.position.x || override.position.y !== change.position.y)) {
                    override.position = change.position;
                    overrideChanged = true;
                }
                if (typeof change.dragging === "boolean" && override.dragging !== change.dragging) {
                    override.dragging = change.dragging;
                    overrideChanged = true;
                }
                if (!overrideChanged) return;
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
        if (!overrides.size) return stableNodes;
        let changed = false;
        const result = stableNodes.map((node) => {
            const override = overrides.get(node.id);
            if (!override) return node;
            changed = true;
            return { ...node, ...(override.position ? { position: override.position } : {}), ...(typeof override.dragging === "boolean" ? { dragging: override.dragging } : {}) };
        });
        return changed ? result : stableNodes;
        // runtimeVersion forces re-derivation when overrides change during drag.
    }, [runtimeVersion, stableNodes]);

    useEffect(() => {
        const flow = flowRef.current;
        if (!flow) return;
        suppressSelectionChangeRef.current = true;
        flow.setNodes(runtimeNodes);
        queueMicrotask(() => {
            suppressSelectionChangeRef.current = false;
        });
    }, [runtimeNodes]);

    useEffect(() => {
        const flow = flowRef.current;
        if (!flow) return;
        suppressSelectionChangeRef.current = true;
        flow.setEdges(edges);
        queueMicrotask(() => {
            suppressSelectionChangeRef.current = false;
        });
    }, [edges]);

    // Clear overrides once the parent has committed the final position (drag stop),
    // so the parent stays the single source of truth.
    useEffect(() => {
        const overrides = runtimeOverridesRef.current;
        if (!overrides.size) return;
        const nodeById = new Map(stableNodes.map((node) => [node.id, node]));
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
    }, [stableNodes]);

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
                    defaultNodes={EMPTY_NODES}
                    defaultEdges={EMPTY_EDGES}
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
                    onSelectionChange={(selection) => {
                        if (suppressSelectionChangeRef.current) return;
                        onSelectionChange?.(selection);
                    }}
                    onEdgeClick={onEdgeClick}
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
                        instance.setNodes(runtimeNodes);
                        instance.setEdges(edges);
                        void instance.setViewport(toReactFlowViewport(viewportRef.current), { duration: 0 });
                    }}
                    onMove={handleMove}
                    onMoveEnd={handleMoveEnd}
                    style={{ background: theme.canvas.background }}
                >
                    {backgroundMode !== "blank" ? (
                        <Background color={backgroundMode === "dots" ? theme.canvas.dot : theme.canvas.line} gap={56} size={backgroundMode === "dots" ? 1 : 0.8} variant={backgroundMode === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines} />
                    ) : null}
                    {miniMapOpen ? (
                        <MiniMap
                            pannable
                            zoomable
                            nodeStrokeWidth={2}
                            nodeColor={() => theme.node.faint}
                            maskColor={theme.canvas.selectionFill}
                            style={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 12, left: 40, bottom: 86, width: 164, height: 116 }}
                        />
                    ) : null}
                    <ViewportPortal>{children}</ViewportPortal>
                </ReactFlow>
            </CanvasScaleCtx.Provider>
        </div>
    );
}
