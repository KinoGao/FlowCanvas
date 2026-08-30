import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types.ts";
import { buildConnectionPathFromPoints, CONNECTION_HANDLE_OFFSET, getNodeConnectionPoint } from "./canvas-connection-geometry.ts";

const node: CanvasNodeData = {
    id: "node-1",
    type: CanvasNodeType.Text,
    title: "文本节点",
    position: { x: 100, y: 200 },
    width: 400,
    height: 240,
};

test("connection endpoints align with the external plus handles", () => {
    assert.deepEqual(getNodeConnectionPoint(node, "target"), { x: 100 - CONNECTION_HANDLE_OFFSET, y: 320 });
    assert.deepEqual(getNodeConnectionPoint(node, "source"), { x: 500 + CONNECTION_HANDLE_OFFSET, y: 320 });
});

test("connection path supports curve, orthogonal, and straight styles", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 400, y: 200 };
    assert.match(buildConnectionPathFromPoints(from, to, "curve"), /^M 0 0 C /);
    assert.equal(buildConnectionPathFromPoints(from, to, "orthogonal"), "M 0 0 L 200 0 L 200 200 L 400 200");
    assert.equal(buildConnectionPathFromPoints(from, to, "straight"), "M 0 0 L 400 200");
});
