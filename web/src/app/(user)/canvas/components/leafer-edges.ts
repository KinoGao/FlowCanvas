"use client";

import * as LUI from "leafer-ui";
import type { CanvasConnection, CanvasNodeData } from "../types";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { buildConnectionPolyline, getConnectionPoints } from "../utils/canvas-connection-geometry";

const FALLBACK_CONNECTION = {
    color: "#78716c",
    activeColor: "#67e8f9",
    width: 3.2,
    activeWidth: 4.4,
    tempWidth: 2.5,
    dash: [8, 4] as const,
};

type EdgeRenderData = {
    connection: CanvasConnection;
    line: LUI.Line;
};

/** 在 LeaferJS 画布上管理连线渲染。 */
export class LeaferEdgeLayer {
    private app: LUI.Leafer;
    private nodeMap: Map<string, CanvasNodeData> = new Map();
    private edges: Map<string, EdgeRenderData> = new Map();
    private conn: { color: string; activeColor: string; width: number; activeWidth: number; tempWidth: number; dash: readonly number[] };

    constructor(app: LUI.Leafer, conn?: Partial<CanvasTheme["connection"]>) {
        this.app = app;
        this.conn = { ...FALLBACK_CONNECTION, ...conn };
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
            const color = isActive ? this.conn.activeColor : this.conn.color;
            const width = isActive ? this.conn.activeWidth : this.conn.width;

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
            stroke: this.conn.activeColor,
            strokeWidth: this.conn.tempWidth,
            strokeCap: "round",
            dashPattern: [...this.conn.dash],
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
