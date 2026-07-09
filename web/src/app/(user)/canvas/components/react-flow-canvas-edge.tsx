"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection } from "../types";
import { CANVAS_EDGE_TYPE } from "../utils/react-flow-adapter";

export type ReactFlowCanvasEdgeData = {
    connection: CanvasConnection;
    active: boolean;
    selected?: boolean;
    onSelect: (connectionId: string) => void;
    onDelete?: (connectionId: string) => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => void;
} & Record<string, unknown>;

export function ReactFlowCanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const edgeData = data as ReactFlowCanvasEdgeData | undefined;
    const active = Boolean(edgeData?.active);
    const selected = Boolean(edgeData?.selected);
    const [pathD] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

    return (
        <g>
            <path
                data-connection-id={id}
                d={pathD}
                stroke="transparent"
                strokeWidth="28"
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
                style={{ stroke: active ? theme.node.activeStroke : theme.node.faint, strokeWidth: active ? 4.4 : 3.2, strokeOpacity: active ? 0.98 : 0.84, filter: active ? `drop-shadow(0 0 7px ${theme.node.activeStroke}66)` : undefined }}
            />
            {selected ? (
                <g pointerEvents="none">
                    <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="9" strokeLinecap="round" strokeDasharray="42 220" fill="none" opacity="0.82">
                        <animate attributeName="stroke-dashoffset" from="0" to="-254" dur="1.45s" repeatCount="indefinite" />
                    </path>
                    <path d={pathD} stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="20 234" fill="none" opacity="0.78">
                        <animate attributeName="stroke-dashoffset" from="0" to="-254" dur="1.45s" repeatCount="indefinite" />
                    </path>
                    {[0, 0.45, 0.9].map((delay) => (
                        <circle key={delay} r="3.8" fill="#ffffff" opacity="0.92">
                            <animateMotion path={pathD} dur="1.35s" begin={`${delay}s`} repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.12;0.82;1" dur="1.35s" begin={`${delay}s`} repeatCount="indefinite" />
                        </circle>
                    ))}
                </g>
            ) : null}
        </g>
    );
}

export const reactFlowCanvasEdgeTypes = { [CANVAS_EDGE_TYPE]: ReactFlowCanvasEdge };
