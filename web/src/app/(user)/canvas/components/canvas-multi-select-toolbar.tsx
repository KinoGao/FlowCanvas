"use client";

import { AlignCenterVertical, Download, Play, RefreshCw, Trash2 } from "lucide-react";

import type { canvasThemes } from "@/lib/canvas-theme";

/** 多选框工具条 + 9 宫格对齐面板（对齐 SHUO Canvas）：多选 ≥2 节点时显示于画布顶部居中 */
export function CanvasMultiSelectToolbar({
    theme,
    count,
    canSync,
    alignOpen,
    onToggleAlign,
    onAlignSlot,
    onRun,
    onDownload,
    onSyncPreview,
    onDelete,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    count: number;
    canSync: boolean;
    alignOpen: boolean;
    onToggleAlign: () => void;
    onAlignSlot: (slot: number) => void;
    onRun: () => void;
    onDownload: () => void;
    onSyncPreview: () => void;
    onDelete: () => void;
}) {
    const barStyle = { background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text, boxShadow: theme.ui.shadow };
    return (
        <div className="pointer-events-none absolute left-1/2 top-20 z-[70] -translate-x-1/2" data-canvas-no-zoom>
            <div className="pointer-events-auto flex h-11 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={barStyle}>
                <span className="px-2 text-xs" style={{ color: theme.node.muted }}>
                    已选 {count}
                </span>
                <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition hover:bg-white/10" onClick={onRun}>
                    <RefreshCw className="size-3.5" />
                    重跑选中
                </button>
                <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition hover:bg-white/10" onClick={onDownload}>
                    <Download className="size-3.5" />
                    下载选中
                </button>
                {canSync ? (
                    <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition hover:bg-white/10" onClick={onSyncPreview}>
                        <Play className="size-3.5" />
                        同步预览
                    </button>
                ) : null}
                <button type="button" className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition hover:bg-white/10 ${alignOpen ? "bg-white/10" : ""}`} onClick={onToggleAlign}>
                    <AlignCenterVertical className="size-3.5" />
                    对齐
                </button>
                <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs transition hover:bg-white/10" style={{ color: theme.ui.danger }} onClick={onDelete}>
                    <Trash2 className="size-3.5" />
                    删除
                </button>
            </div>
            {alignOpen ? (
                <div className="pointer-events-auto absolute left-1/2 top-full mt-3 grid h-[216px] w-[216px] grid-cols-3 grid-rows-3 gap-1 rounded-xl border p-2 shadow-2xl backdrop-blur" style={barStyle}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => (
                        <button
                            key={slot}
                            type="button"
                            className="rounded-lg border transition hover:bg-white/10"
                            style={{ borderColor: theme.ui.hairline }}
                            title={slot === 5 ? "水平+垂直居中" : `对齐 ${Math.ceil(slot / 3) === 1 ? "顶" : Math.ceil(slot / 3) === 2 ? "中" : "底"} · ${slot % 3 === 1 ? "左" : slot % 3 === 2 ? "中" : "右"}`}
                            onClick={() => onAlignSlot(slot)}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
