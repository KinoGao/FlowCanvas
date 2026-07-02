import React, { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCanvasDragStore } from "../stores/use-canvas-drag-store";
import type { CanvasConnection, ConnectionHandle, Position } from "../types";

type ConnectionPathProps = {
    connection: CanvasConnection;
    fromX: number;
    fromY: number;
    fromWidth: number;
    fromHeight: number;
    toX: number;
    toY: number;
    toWidth: number;
    toHeight: number;
    active: boolean;
    onSelect: (connectionId: string) => void;
    onDelete?: (connectionId: string) => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => void;
};

/** Skip callback props; only compare primitives that affect rendering. */
function connectionPathPropsEqual(prev: ConnectionPathProps, next: ConnectionPathProps) {
    if (prev.connection !== next.connection) return false;
    if (prev.fromX !== next.fromX || prev.fromY !== next.fromY) return false;
    if (prev.fromWidth !== next.fromWidth || prev.fromHeight !== next.fromHeight) return false;
    if (prev.toX !== next.toX || prev.toY !== next.toY) return false;
    if (prev.toWidth !== next.toWidth || prev.toHeight !== next.toHeight) return false;
    if (prev.active !== next.active) return false;
    return true;
}

export const ConnectionPath = React.memo(function ConnectionPath({
    connection,
    fromX,
    fromY,
    fromWidth,
    fromHeight,
    toX,
    toY,
    toWidth,
    toHeight,
    active,
    onSelect,
    onDelete,
    onContextMenu,
}: ConnectionPathProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    // Only re-renders when this connection's endpoints are being dragged
    const fromOffset = useCanvasDragStore((s) => (s.offset && s.draggedIds?.has(connection.fromNodeId)) ? s.offset : null);
    const toOffset = useCanvasDragStore((s) => (s.offset && s.draggedIds?.has(connection.toNodeId)) ? s.offset : null);
    const [deleteVisible, setDeleteVisible] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);
    const startX = fromX + (fromOffset?.dx ?? 0) + fromWidth;
    const startY = fromY + (fromOffset?.dy ?? 0) + fromHeight / 2;
    const endX = toX + (toOffset?.dx ?? 0);
    const endY = toY + (toOffset?.dy ?? 0) + toHeight / 2;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;
    const mid = cubicPoint(
        { x: startX, y: startY },
        { x: startX + curvature, y: startY },
        { x: endX - curvature, y: endY },
        { x: endX, y: endY },
        0.5,
    );
    const deleteSize = 24;

    const showDeleteLater = () => {
        if (!onDelete) return;
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => setDeleteVisible(true), 1000);
    };

    const hideDelete = () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
        setDeleteVisible(false);
    };

    useEffect(() => () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    }, []);

    return (
        <g onMouseEnter={showDeleteLater} onMouseLeave={hideDelete}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect(connection.id);
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event, connection.id);
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.muted}
                strokeWidth={active ? 3 : 2}
                strokeOpacity={active ? 1 : 0.82}
                fill="none"
                style={{ filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined, pointerEvents: "none" }}
            />
            {deleteVisible && onDelete ? (
                <foreignObject x={mid.x - deleteSize / 2} y={mid.y - deleteSize / 2} width={deleteSize} height={deleteSize} style={{ overflow: "visible", pointerEvents: "auto" }}>
                    <button
                        type="button"
                        className="grid size-6 place-items-center rounded-full border shadow-lg backdrop-blur-md transition hover:scale-110"
                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: "#ef4444" }}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete(connection.id);
                        }}
                        aria-label="删除连线"
                        title="删除连线"
                    >
                        <X className="size-3.5" />
                    </button>
                </foreignObject>
            ) : null}
        </g>
    );
}, connectionPathPropsEqual);

function cubicPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
        y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
    };
}

export const ActiveConnectionPath = React.memo(function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: { position: Position; width: number; height: number }; handle: ConnectionHandle; mouseWorld: Position; target?: { position: Position; width: number; height: number } }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
});