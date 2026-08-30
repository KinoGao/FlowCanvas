"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Link2 } from "lucide-react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData, CanvasWebPreviewData } from "../types";

type CanvasNodeWebPreviewContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    onContentChange: (nodeId: string, content: string) => void;
};

export function CanvasNodeWebPreviewContent({ node, theme, onContentChange }: CanvasNodeWebPreviewContentProps) {
    const data = useMemo(() => parseWebPreviewData(node), [node]);
    const [draftUrl, setDraftUrl] = useState(data.url);
    const [mode, setMode] = useState<CanvasWebPreviewData["mode"]>(data.mode);
    useEffect(() => {
        setDraftUrl(data.url);
        setMode(data.mode);
    }, [data.url, data.mode]);

    const update = (patch: Partial<CanvasWebPreviewData>) => {
        const next = { ...data, ...patch };
        onContentChange(node.id, JSON.stringify(next));
    };

    const url = data.url.trim();
    const safeUrl = /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : "";
    const openExternal = () => {
        if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
    };
    const applyUrl = () => {
        if (!safeUrl) return;
        update({ url: safeUrl, title: data.title || safeUrl });
    };

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: theme.node.fill }}>
            <div className="flex shrink-0 items-center gap-2 border-b p-2" style={{ borderColor: theme.ui.hairline, background: theme.ui.materialElevated }} data-canvas-no-zoom>
                <Globe className="size-3.5 shrink-0 opacity-55" />
                <input
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") applyUrl();
                    }}
                    placeholder="输入网址，例如 https://example.com"
                    className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-[11px] outline-none"
                    style={{ borderColor: theme.ui.hairline, color: theme.node.text }}
                />
                <button
                    type="button"
                    className="h-7 shrink-0 rounded-md px-2 text-[11px] font-medium"
                    style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                    onClick={applyUrl}
                >
                    打开
                </button>
                <button
                    type="button"
                    className="h-7 shrink-0 rounded-md px-2 text-[11px]"
                    style={{ color: theme.node.muted }}
                    onClick={() => setMode((current) => {
                        const next = current === "preview" ? "reference" : "preview";
                        update({ mode: next });
                        return next;
                    })}
                    title="切换预览 / 引用卡"
                >
                    {mode === "preview" ? "引用卡" : "预览"}
                </button>
                <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md" style={{ color: theme.node.muted }} title="在浏览器打开" onClick={openExternal}>
                    <ExternalLink className="size-3.5" />
                </button>
            </div>
            <div className="min-h-0 flex-1">
                {safeUrl ? (
                    mode === "preview" ? (
                        <iframe src={safeUrl} title={data.title || "网页预览"} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" className="h-full w-full border-0" />
                    ) : (
                        <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
                            {data.image ? <img src={data.image} alt="" className="max-h-40 w-full rounded-lg object-cover" /> : null}
                            <div className="text-sm font-semibold">{data.title || "未命名引用"}</div>
                            <div className="min-h-0 flex-1 whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>
                                {data.summary || "点击「在浏览器打开」查看原文，或把标题 / 摘要写入引用卡。"}
                            </div>
                            <button
                                type="button"
                                className="flex h-8 items-center justify-center gap-2 rounded-lg text-xs font-medium"
                                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                                onClick={openExternal}
                            >
                                <Link2 className="size-3.5" />
                                打开原文
                            </button>
                        </div>
                    )
                ) : (
                    <div className="grid h-full place-items-center p-6 text-center text-xs opacity-55">
                        <span>输入网址预览网页，或切换为引用卡记录标题、摘要与缩略图</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function parseWebPreviewData(node: CanvasNodeData): CanvasWebPreviewData {
    const fallback: CanvasWebPreviewData = { url: "", mode: "preview", title: "", summary: "", image: "" };
    if (node.metadata?.webPreviewData) return { ...fallback, ...node.metadata.webPreviewData };
    try {
        const parsed = JSON.parse(node.metadata?.content || "") as Partial<CanvasWebPreviewData>;
        return { ...fallback, ...parsed };
    } catch {
        return fallback;
    }
}
