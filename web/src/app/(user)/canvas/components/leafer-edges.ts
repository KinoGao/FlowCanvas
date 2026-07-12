"use client";

import * as LUI from "leafer-ui";
import type { CanvasConnection, CanvasNodeData } from "../types";
import { buildConnectionPolyline, getConnectionPoints } from "../utils/canvas-connection-geometry";

const EDGE_COLOR = "#78716c";
const EDGE_ACTIVE_COLOR = "#67e8f9";
const EDGE_WIDTH = 3.2;
const EDGE_ACTIVE_WIDTH = 4.4;

type EdgeRenderData = {
    connection: CanvasConnection;
    line: LUI.Line;
};

/** 在 LeaferJS 画布上管理连线渲染。 */
export class LeaferEdgeLayer {
    private app: LUI.Leafer;
    private nodeMap: Map<string, CanvasNodeData> = new Map();
    private edges: Map<string, EdgeRenderData> = new Map();

    constructor(app: LUI.Leafer) {
        this.app = app;
    }

    setNodeMap(nodes: CanvasNodeData[]) {
        this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
    }

    updateConnections(connections: CanvasConnection[], selectedId: string | null, activeConnectionId?: string | null) {
        const currentIds = new Set(connections.map((c) => c.id));

        // Remove stale edges
        for (const [id, data] of this.edges) {
            if (!currentIds.has(id)) {
                data.line.remove();
                this.edges.delete(id);
            }
        }

        // Add or update edges
        for (const conn of connections) {
            const pointsPair = getConnectionPoints(conn, this.nodeMap);
            if (!pointsPair) continue;

            const existing = this.edges.get(conn.id);
            const isActive = conn.id === (activeConnectionId ?? selectedId);
            const color = isActive ? EDGE_ACTIVE_COLOR : EDGE_COLOR;
            const width = isActive ? EDGE_ACTIVE_WIDTH : EDGE_WIDTH;

            if (existing) {
                // Update position
                const points = buildConnectionPolyline(pointsPair.from, pointsPair.to);
                existing.line.set({ points, stroke: color, strokeWidth: width });
            } else {
                const points = buildConnectionPolyline(pointsPair.from, pointsPair.to);
                const line = new LUI.Line({
                    points,
                    stroke: color,
                    strokeWidth: width,
                    strokeCap: "round",
                });
                line.hittable = false;
                this.app.add(line);
                this.edges.set(conn.id, { connection: conn, line });
            }
        }
    }

    /** 绘制临时连线（拖拽创建中） */
    drawTempEdge(fromX: number, fromY: number, toX: number, toY: number, line: LUI.Line | null): LUI.Line {
        const points = buildConnectionPolyline({ x: fromX, y: fromY }, { x: toX, y: toY });
        if (line) {
            line.set({ points });
            return line;
        }
        const newLine = new LUI.Line({
            points,
            stroke: EDGE_ACTIVE_COLOR,
            strokeWidth: 2.5,
            strokeCap: "round",
            dashPattern: [8, 4],
        });
        newLine.hittable = false;
        this.app.add(newLine);
        return newLine;
    }

    removeTempEdge(line: LUI.Line | null) {
        if (line) {
            line.remove();
        }
    }

    destroy() {
        for (const [, data] of this.edges) {
            data.line.remove();
        }
        this.edges.clear();
        this.nodeMap.clear();
    }

    /** Clear internal cache — call after app.clear() to force full rebuild */
    reset() {
        this.edges.clear();
    }
}
