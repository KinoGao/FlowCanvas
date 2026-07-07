import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

export type ConnectionAdjacency = {
    incomingByNodeId: Map<string, CanvasConnection[]>;
    outgoingByNodeId: Map<string, CanvasConnection[]>;
};

export type BatchVisibilityIndex = {
    hiddenBatchChildIds: Set<string>;
    hiddenConnectionEndpointIds: Set<string>;
};

export function buildNodeById(nodes: CanvasNodeData[]) {
    return new Map(nodes.map((node) => [node.id, node]));
}

export function buildConnectionAdjacency(connections: CanvasConnection[]): ConnectionAdjacency {
    const incomingByNodeId = new Map<string, CanvasConnection[]>();
    const outgoingByNodeId = new Map<string, CanvasConnection[]>();
    connections.forEach((connection) => {
        pushConnection(incomingByNodeId, connection.toNodeId, connection);
        pushConnection(outgoingByNodeId, connection.fromNodeId, connection);
    });
    return { incomingByNodeId, outgoingByNodeId };
}

export function buildBatchVisibilityIndex(nodes: CanvasNodeData[], nodeById: Map<string, CanvasNodeData>, collapsingBatchIds?: Set<string>): BatchVisibilityIndex {
    const hiddenBatchChildIds = new Set<string>();
    const hiddenConnectionEndpointIds = new Set<string>();
    nodes.forEach((node) => {
        const rootId = node.metadata?.batchRootId;
        if (!rootId) return;
        const root = nodeById.get(rootId);
        if (!root) return;
        if (!root.metadata?.imageBatchExpanded) hiddenConnectionEndpointIds.add(node.id);
        if (!root.metadata?.imageBatchExpanded && !collapsingBatchIds?.has(rootId)) hiddenBatchChildIds.add(node.id);
    });
    return { hiddenBatchChildIds, hiddenConnectionEndpointIds };
}

export function normalizeConnectionWithNodeMap(firstNodeId: string, secondNodeId: string, nodeById: Map<string, CanvasNodeData>, firstHandleType: "source" | "target") {
    const first = nodeById.get(firstNodeId);
    const second = nodeById.get(secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}

export function setsEqual<T>(left: Set<T>, right: Set<T>) {
    if (left.size !== right.size) return false;
    for (const item of left) {
        if (!right.has(item)) return false;
    }
    return true;
}

function pushConnection(index: Map<string, CanvasConnection[]>, nodeId: string, connection: CanvasConnection) {
    const connections = index.get(nodeId);
    if (connections) connections.push(connection);
    else index.set(nodeId, [connection]);
}
