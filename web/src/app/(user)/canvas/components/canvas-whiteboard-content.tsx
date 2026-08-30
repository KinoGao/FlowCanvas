"use client";

import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Eraser, ImagePlus, PaintBucket, Pen, Save, Square, Trash2 } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData, CanvasWhiteboardData, CanvasWhiteboardStroke } from "../types";

type CanvasNodeWhiteboardContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    onContentChange: (nodeId: string, content: string) => void;
};

export function CanvasNodeWhiteboardContent({ node, theme, onContentChange }: CanvasNodeWhiteboardContentProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const drawingRef = useRef<CanvasWhiteboardStroke | null>(null);
    const previewRef = useRef<CanvasWhiteboardData | null>(null);
    const [tool, setTool] = useState<CanvasWhiteboardStroke["kind"]>("pen");
    const [color, setColor] = useState("#2f80ff");
    const [size, setSize] = useState(4);
    const [data, setData] = useState<CanvasWhiteboardData>(() => parseWhiteboardData(node));

    useEffect(() => {
        setData(parseWhiteboardData(node));
    }, [node]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.round(node.width * 2));
        canvas.height = Math.max(1, Math.round(node.height * 2));
        void drawWhiteboard(canvas, data, node.width, node.height);
    }, [data, node.height, node.width]);

    const commit = (next: CanvasWhiteboardData) => {
        setData(next);
        onContentChange(node.id, JSON.stringify(next));
    };

    const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
        };
    };

    const render = (next: CanvasWhiteboardData) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        void drawWhiteboard(canvas, next, node.width, node.height);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = canvasPoint(event);
        const item: CanvasWhiteboardStroke = {
            id: nanoid(),
            kind: tool,
            color,
            size,
            ...(tool === "pen" || tool === "eraser" ? { points: [point] } : { x: point.x, y: point.y, width: 0, height: 0 }),
        };
        drawingRef.current = item;
        if (tool === "fill") {
            previewRef.current = { ...data, background: color };
            commit(previewRef.current);
            return;
        }
        previewRef.current = { ...data, items: [...data.items, item] };
        render(previewRef.current);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const item = drawingRef.current;
        if (!item || !previewRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        const point = canvasPoint(event);
        if (item.kind === "pen" || item.kind === "eraser") {
            item.points = [...(item.points || []), point];
        } else {
            item.width = point.x - (item.x || 0);
            item.height = point.y - (item.y || 0);
        }
        render(previewRef.current);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        event.stopPropagation();
        drawingRef.current = null;
        if (previewRef.current) {
            commit(previewRef.current);
            previewRef.current = null;
        }
    };

    const handleBackground = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") commit({ ...data, background: reader.result });
        };
        reader.readAsDataURL(file);
    };

    const exportImage = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = `${node.title || "白板"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };

    const tools: Array<{ id: CanvasWhiteboardStroke["kind"]; label: string; icon: ReactNode }> = [
        { id: "pen", label: "画笔", icon: <Pen className="size-3.5" /> },
        { id: "rect", label: "矩形", icon: <Square className="size-3.5" /> },
        { id: "eraser", label: "橡皮", icon: <Eraser className="size-3.5" /> },
        { id: "fill", label: "油漆桶", icon: <PaintBucket className="size-3.5" /> },
    ];

    return (
        <div className="relative h-full w-full overflow-hidden" style={{ background: theme.node.fill }}>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />
            <div className="absolute left-2 top-2 z-20 flex max-w-full flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1" style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }} data-canvas-no-zoom>
                {tools.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        title={item.label}
                        className="grid size-7 place-items-center rounded-md transition"
                        style={{ background: tool === item.id ? theme.toolbar.activeBg : "transparent", color: tool === item.id ? theme.ui.accent : theme.node.muted }}
                        onClick={(event) => {
                            event.stopPropagation();
                            setTool(item.id);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {item.icon}
                    </button>
                ))}
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" title="颜色" />
                <input type="range" min={1} max={24} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-14" title="笔刷粗细" />
                <button type="button" className="grid size-7 place-items-center rounded-md transition hover:bg-white/10" title="背景图" onClick={() => inputRef.current?.click()} onPointerDown={(event) => event.stopPropagation()}>
                    <ImagePlus className="size-3.5" />
                </button>
                <button type="button" className="grid size-7 place-items-center rounded-md transition hover:bg-white/10" title="导出 PNG" onClick={exportImage} onPointerDown={(event) => event.stopPropagation()}>
                    <Save className="size-3.5" />
                </button>
                <button type="button" className="grid size-7 place-items-center rounded-md transition hover:bg-white/10" title="清空白板" onClick={() => commit({ background: "", items: [] })} onPointerDown={(event) => event.stopPropagation()}>
                    <Trash2 className="size-3.5" />
                </button>
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleBackground} />
        </div>
    );
}

function parseWhiteboardData(node: CanvasNodeData): CanvasWhiteboardData {
    const content = node.metadata?.content || "";
    try {
        const parsed = JSON.parse(content) as Partial<CanvasWhiteboardData>;
        if (Array.isArray(parsed.items)) return { background: typeof parsed.background === "string" ? parsed.background : "", items: parsed.items };
    } catch {
        // 非 JSON 内容忽略，使用默认可编辑白板。
    }
    return node.metadata?.whiteboardData || { background: "", items: [] };
}

async function drawWhiteboard(canvas: HTMLCanvasElement, data: CanvasWhiteboardData, width: number, height: number) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / Math.max(1, width);
    const scaleY = canvas.height / Math.max(1, height);
    if (data.background) {
        const image = new Image();
        image.onload = () => {
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            context.restore();
            drawItems(context, data, scaleX, scaleY);
        };
        image.src = data.background;
        return;
    }
    drawItems(context, data, scaleX, scaleY);
}

function drawItems(context: CanvasRenderingContext2D, data: CanvasWhiteboardData, scaleX: number, scaleY: number) {
    data.items.forEach((item) => {
        context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        context.strokeStyle = item.color;
        context.fillStyle = item.color;
        context.lineWidth = item.size;
        context.lineCap = "round";
        context.lineJoin = "round";
        if (item.kind === "pen" || item.kind === "eraser") {
            context.globalCompositeOperation = item.kind === "eraser" ? "destination-out" : "source-over";
            if (item.points?.length) {
                context.beginPath();
                context.moveTo(item.points[0].x * canvasWorldWidth(context, scaleX), item.points[0].y * canvasWorldHeight(context, scaleY));
                item.points.slice(1).forEach((point) => context.lineTo(point.x * canvasWorldWidth(context, scaleX), point.y * canvasWorldHeight(context, scaleY)));
                context.stroke();
            }
        } else if (item.kind === "rect") {
            context.globalCompositeOperation = "source-over";
            context.strokeRect((item.x || 0) * canvasWorldWidth(context, scaleX), (item.y || 0) * canvasWorldHeight(context, scaleY), (item.width || 0) * canvasWorldWidth(context, scaleX), (item.height || 0) * canvasWorldHeight(context, scaleY));
        }
        context.globalCompositeOperation = "source-over";
        context.setTransform(1, 0, 0, 1, 0, 0);
    });
}

function canvasWorldWidth(context: CanvasRenderingContext2D, scaleX: number) {
    return context.canvas.width / scaleX;
}

function canvasWorldHeight(context: CanvasRenderingContext2D, scaleY: number) {
    return context.canvas.height / scaleY;
}
