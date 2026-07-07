"use client";

import type { Node, NodeProps } from "@xyflow/react";

import { CANVAS_NODE_TYPE } from "../utils/react-flow-adapter";
import { CanvasNode, type CanvasNodeProps } from "./canvas-node";

export type ReactFlowCanvasNodeData = {
    props: CanvasNodeProps;
} & Record<string, unknown>;

export type ReactFlowCanvasNodeType = Node<ReactFlowCanvasNodeData, typeof CANVAS_NODE_TYPE>;

export function ReactFlowCanvasNode({ data }: NodeProps<ReactFlowCanvasNodeType>) {
    return <CanvasNode {...data.props} positioned={false} />;
}
