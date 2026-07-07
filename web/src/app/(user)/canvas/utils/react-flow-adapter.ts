import type { Edge, Node, NodeChange, Viewport } from "@xyflow/react";

import type { CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export const CANVAS_NODE_TYPE = "canvasNode";
export const CANVAS_EDGE_TYPE = "canvasEdge";
export const CANVAS_SOURCE_HANDLE = "source";
export const CANVAS_TARGET_HANDLE = "target";

export type ReactFlowCanvasNodeData = {
    node: CanvasNodeData;
} & Record<string, unknown>;

export type ReactFlowCanvasNode = Node<ReactFlowCanvasNodeData, typeof CANVAS_NODE_TYPE>;
export type ReactFlowCanvasEdge = Edge<CanvasConnection>;

export function toReactFlowNodes(nodes: CanvasNodeData[]): ReactFlowCanvasNode[] {
    return nodes.map((node) => ({
        id: node.id,
        type: CANVAS_NODE_TYPE,
        position: node.position,
        width: node.width,
        height: node.height,
        data: { node },
        selected: false,
        draggable: true,
    }));
}

export function toReactFlowEdges(connections: CanvasConnection[]): ReactFlowCanvasEdge[] {
    return connections.map((connection) => ({
        id: connection.id,
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: CANVAS_SOURCE_HANDLE,
        targetHandle: CANVAS_TARGET_HANDLE,
        type: CANVAS_EDGE_TYPE,
        data: connection,
    }));
}

export function applyReactFlowNodeChanges(nodes: CanvasNodeData[], changes: NodeChange<ReactFlowCanvasNode>[]) {
    const positionChanges = new Map<string, { x: number; y: number }>();

    changes.forEach((change) => {
        if (change.type === "position" && change.position) positionChanges.set(change.id, change.position);
    });

    if (!positionChanges.size) return nodes;

    let changed = false;
    const next = nodes.map((node) => {
        const position = positionChanges.get(node.id);
        if (!position) return node;
        if (node.position.x === position.x && node.position.y === position.y) return node;
        changed = true;
        return { ...node, position };
    });

    return changed ? next : nodes;
}

export function toReactFlowViewport(viewport: ViewportTransform): Viewport {
    return { x: viewport.x, y: viewport.y, zoom: viewport.k };
}

export function fromReactFlowViewport(viewport: Viewport): ViewportTransform {
    return { x: viewport.x, y: viewport.y, k: viewport.zoom };
}
