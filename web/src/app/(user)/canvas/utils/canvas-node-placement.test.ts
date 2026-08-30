import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { findAvailableCanvasPosition } from "./canvas-node-placement";

function node(id: string, x: number, y: number, width = 100, height = 50): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title: id, position: { x, y }, width, height };
}

const size = { width: 100, height: 50 };

test("keeps free canvas positions unchanged", () => {
    assert.deepEqual(findAvailableCanvasPosition({ x: 0, y: 0 }, size, []), { x: 0, y: 0 });
});

test("shifts overlapping nodes to the right then wraps to the next row", () => {
    assert.deepEqual(findAvailableCanvasPosition({ x: 0, y: 0 }, size, [node("a", 0, 0)]), { x: 140, y: 0 });
    assert.deepEqual(findAvailableCanvasPosition({ x: 0, y: 0 }, size, [node("a", 0, 0), node("b", 140, 0)]), { x: 280, y: 0 });
    assert.deepEqual(findAvailableCanvasPosition({ x: 0, y: 0 }, size, [node("a", 0, 0), node("b", 140, 0), node("c", 280, 0)]), { x: 420, y: 0 });
});
