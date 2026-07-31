import type { CanvasConnection, CanvasNodeData } from "../types";

export type CanvasWorkflowTemplate = {
    id: string;
    name: string;
    createdAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

export type CloneCanvasSelectionResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

/**
 * 把一组节点（含组内连线）复制为相对坐标偏移的克隆集合。
 * 返回的新节点/连线使用新 id，媒体引用（storageKey）原样保留，
 * 因此跨画布粘贴后媒体仍能通过后端账号存储解析。
 */
export function cloneCanvasSelection(nodes: CanvasNodeData[], connections: CanvasConnection[], offset: { x: number; y: number }, nextNode: (node: CanvasNodeData, position: { x: number; y: number }, metadata: CanvasNodeData["metadata"]) => CanvasNodeData, nextConnection: (fromNodeId: string, toNodeId: string) => CanvasConnection): CloneCanvasSelectionResult {
    const idMap = new Map<string, string>();
    const nextNodes = nodes.map((node) => {
        const position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
        const next = nextNode(node, position, node.metadata);
        idMap.set(node.id, next.id);
        return next;
    });
    const nextConnections = connections.flatMap((connection) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [nextConnection(fromNodeId, toNodeId)];
    });
    return { nodes: nextNodes, connections: nextConnections };
}

/** 计算一组节点包围盒的中心，用于居中粘贴 */
export function canvasSelectionCenter(nodes: CanvasNodeData[]) {
    if (!nodes.length) return { x: 0, y: 0 };
    const bounds = nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
}
