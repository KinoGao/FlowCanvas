import type { CanvasNodeData, Position } from "../types";
import { buildSpatialIndex, querySpatialIndex } from "./canvas-spatial-index";

const PLACEMENT_GAP = 40;
const PLACEMENT_COLUMNS = 8;
const PLACEMENT_ROWS = 4;

export function findAvailableCanvasPosition(
    requested: Position,
    size: { width: number; height: number },
    nodes: CanvasNodeData[],
    gap = PLACEMENT_GAP,
) {
    const index = buildSpatialIndex(nodes, (node) => ({
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + (node.width || 240),
        bottom: node.position.y + (node.height || 160),
    }));
    const overlaps = (position: Position) =>
        querySpatialIndex(index, {
            left: position.x,
            top: position.y,
            right: position.x + size.width,
            bottom: position.y + size.height,
        }).length > 0;

    if (!overlaps(requested)) return requested;

    let position = requested;
    for (let attempt = 1; attempt <= PLACEMENT_COLUMNS * PLACEMENT_ROWS; attempt += 1) {
        const row = Math.floor((attempt - 1) / PLACEMENT_COLUMNS);
        const column = (attempt - 1) % PLACEMENT_COLUMNS;
        position = {
            x: requested.x + (column + 1) * (size.width + gap),
            y: requested.y + row * (size.height + gap),
        };
        if (!overlaps(position)) return position;
    }
    return position;
}

export function canvasRightmostGridPosition(nodes: CanvasNodeData[], gap = PLACEMENT_GAP): Position {
    if (!nodes.length) return { x: 0, y: 0 };
    const maxRight = Math.max(...nodes.map((node) => node.position.x + (node.width || 240)));
    const rightMost = nodes.filter((node) => node.position.x + (node.width || 240) === maxRight);
    return {
        x: Math.round(maxRight + gap),
        y: rightMost[0]?.position.y || 0,
    };
}
