import assert from "node:assert/strict";
import test from "node:test";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { canvasSelectionCenter, cloneCanvasSelection } from "./canvas-workflow-template";

function node(id: string, type: CanvasNodeData["type"], position: { x: number; y: number }, width = 160, height = 120, storageKey?: string): CanvasNodeData {
    return {
        id,
        type,
        title: `${type}-${id}`,
        position,
        width,
        height,
        metadata: storageKey ? { storageKey } : undefined,
    };
}

test("cloneCanvasSelection reassigns ids and remaps internal connections", () => {
    const nodes = [
        node("a", CanvasNodeType.Text, { x: 10, y: 20 }),
        node("b", CanvasNodeType.Image, { x: 300, y: 20 }, 160, 120, "image:abc"),
    ];
    const connections: CanvasConnection[] = [
        { id: "c1", fromNodeId: "a", toNodeId: "b" },
        { id: "c2", fromNodeId: "a", toNodeId: "missing" },
    ];

    let counter = 0;
    const result = cloneCanvasSelection(
        nodes,
        connections,
        { x: 100, y: 50 },
        (source, position, metadata) => ({ ...source, id: `new-${++counter}`, position, metadata }),
        (fromNodeId, toNodeId) => ({ id: `edge-${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId }),
    );

    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[0].position.x, 110);
    assert.equal(result.nodes[0].position.y, 70);
    assert.equal(result.nodes[1].metadata?.storageKey, "image:abc", "media storageKey is preserved for cross-canvas paste");
    assert.equal(result.connections.length, 1, "dangling connection to a node outside the selection is dropped");
    assert.notEqual(result.nodes[0].id, "a");
    assert.equal(result.connections[0].fromNodeId, result.nodes[0].id);
    assert.equal(result.connections[0].toNodeId, result.nodes[1].id);
});

test("canvasSelectionCenter returns the bounding box midpoint", () => {
    const nodes = [node("a", CanvasNodeType.Text, { x: 0, y: 0 }), node("b", CanvasNodeType.Text, { x: 200, y: 100 })];

    assert.deepEqual(canvasSelectionCenter(nodes), { x: 180, y: 110 });
    assert.deepEqual(canvasSelectionCenter([]), { x: 0, y: 0 });
});
