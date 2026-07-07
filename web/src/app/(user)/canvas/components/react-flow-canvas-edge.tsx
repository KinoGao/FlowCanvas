"use client";

import React, { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection } from "../types";
import { CANVAS_EDGE_TYPE } from "../utils/react-flow-adapter";

export type ReactFlowCanvasEdgeData = {
    connection: CanvasConnection;
    active: boolean;
    onSelect: (connectionId: string) => void;
    onDelete?: (connectionId: string) => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => void;
} & Record<string, unknown>;

export function ReactFlowCanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [deleteVisible, setDeleteVisible] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);
    const edgeData = data as ReactFlowCanvasEdgeData | undefined;
    const active = Boolean(edgeData?.active);
    const [pathD, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

    const showDeleteLater = () => {
        if (!edgeData?.onDelete) return;
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => setDeleteVisible(true), 1000);
    };

    const hideDelete = () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
        setDeleteVisible(false);
    };

    useEffect(
        () => () => {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        },
        [],
    );

    return (
        <g onMouseEnter={showDeleteLater} onMouseLeave={hideDelete}>
            <BaseEdge id={`${id}-hitbox`} path={pathD} style={{ stroke: "transparent", strokeWidth: 16, cursor: "pointer", pointerEvents: "stroke" }} />
            <path
                data-connection-id={id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    edgeData?.onSelect(id);
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    edgeData?.onContextMenu?.(event, id);
                }}
            />
            <BaseEdge
                id={id}
                path={pathD}
                style={{ stroke: active ? theme.node.activeStroke : theme.node.muted, strokeWidth: active ? 3 : 2, strokeOpacity: active ? 1 : 0.82, filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined }}
            />
            {deleteVisible && edgeData?.onDelete ? (
                <EdgeLabelRenderer>
                    <button
                        type="button"
                        className="nodrag nopan pointer-events-auto absolute grid size-6 place-items-center rounded-full border shadow-lg backdrop-blur-md transition hover:scale-110"
                        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, background: theme.toolbar.panel, borderColor: theme.node.stroke, color: "#ef4444" }}
                        onMouseEnter={showDeleteLater}
                        onMouseLeave={hideDelete}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            edgeData.onDelete?.(id);
                        }}
                        aria-label="删除连线"
                        title="删除连线"
                    >
                        <X className="size-3.5" />
                    </button>
                </EdgeLabelRenderer>
            ) : null}
        </g>
    );
}

export const reactFlowCanvasEdgeTypes = { [CANVAS_EDGE_TYPE]: ReactFlowCanvasEdge };
