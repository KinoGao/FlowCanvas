"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Library, Link2, Plus, RefreshCw, Video, X } from "lucide-react";
import { nanoid } from "nanoid";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { fetchWebPageReader } from "@/services/api/web-preview";
import { extractWebPageInfo } from "../utils/web-media-extraction";
import type { CanvasNodeData, CanvasWebPreviewData, CanvasWebPreviewTab } from "../types";

type CanvasNodeWebPreviewContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    onContentChange: (nodeId: string, content: string) => void;
};

const EMPTY_DATA: CanvasWebPreviewData = { url: "", mode: "preview", title: "", summary: "", image: "", tabs: [], activeTabId: "" };

function normalizeUrl(raw: string): string {
    const url = raw.trim();
    if (!url) return "";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function CanvasNodeWebPreviewContent({ node, theme, onContentChange }: CanvasNodeWebPreviewContentProps) {
    const data = useMemo(() => parseWebPreviewData(node), [node]);
    const [draftUrl, setDraftUrl] = useState(data.url);
    const [mode, setMode] = useState<CanvasWebPreviewData["mode"]>(data.mode);
    const [reading, setReading] = useState(false);

    useEffect(() => {
        setDraftUrl(data.url);
        setMode(data.mode);
    }, [data.url, data.mode]);

    const update = (patch: Partial<CanvasWebPreviewData>) => {
        const next = { ...data, ...patch };
        // 没有 id 的 data 不入库
        if (next.mode === "reference" && !next.title && !next.summary && !next.image) next.mode = "preview";
        onContentChange(node.id, JSON.stringify(next));
    };

    const activeTabId = data.activeTabId || data.tabs?.[0]?.id || "";
    const activeTab = data.tabs?.find((tab) => tab.id === activeTabId);
    const openExternal = (url: string) => {
        if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    const applyUrlRaw = () => {
        const safeUrl = normalizeUrl(draftUrl);
        if (!safeUrl) return;
        const existing = data.tabs?.find((tab) => tab.url === safeUrl);
        const nextTabs = existing ? (data.tabs || []) : appendTab(data.tabs || [], { id: nanoid(8), url: safeUrl, title: data.title || safeUrl });
        update({ url: safeUrl, tabs: nextTabs, activeTabId: existing?.id || nextTabs[nextTabs.length - 1].id, title: data.title || safeUrl });
    };

    const readPage = async (tabUrl: string) => {
        if (!tabUrl) return;
        setReading(true);
        update({ read: { status: "loading" } });
        const result = await fetchWebPageReader(tabUrl);
        if (result.status === "success") {
            const extracted = result.html ? extractWebPageInfo(result.html) : { title: result.title || "", description: result.description || "", images: result.images || [], videos: result.videos || [] };
            const title = extracted.title || result.title || tabUrl;
            const summary = extracted.description || result.description || "";
            const image = extracted.images?.[0] || "";
            update({
                read: { status: "success", title, description: summary, images: extracted.images, videos: extracted.videos },
                title,
                summary,
                image,
                mode: "preview",
            });
        } else {
            update({ read: { status: "error", errorDetails: result.errorDetails } });
        }
        setReading(false);
    };

    const saveAsReference = () => {
        const title = activeTab?.title || data.title || data.url || "未命名引用";
        update({ mode: "reference", title, summary: data.summary || "", image: data.image || "" });
    };

    const addTab = () => {
        const nextTabs = appendTab(data.tabs || [], { id: nanoid(8), url: "", title: "新标签页" });
        update({ tabs: nextTabs, activeTabId: nextTabs[nextTabs.length - 1].id, url: "" });
        setDraftUrl("");
    };

    const closeTab = (tabId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        const nextTabs = (data.tabs || []).filter((tab) => tab.id !== tabId);
        const nextActive = data.activeTabId === tabId ? nextTabs[nextTabs.length - 1]?.id || "" : data.activeTabId;
        const nextTab = nextTabs.find((tab) => tab.id === nextActive);
        setDraftUrl(nextTab?.url || "");
        update({ tabs: nextTabs, activeTabId: nextActive, url: nextTab?.url || "" });
    };

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: theme.node.fill }} data-canvas-no-zoom>
            {/* URL 地址栏 */}
            <div className="flex shrink-0 items-center gap-2 border-b p-2" style={{ borderColor: theme.ui.hairline, background: theme.ui.materialElevated }} data-canvas-no-zoom>
                <Globe className="size-3.5 shrink-0 opacity-55" />
                <input
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") applyUrlRaw();
                    }}
                    placeholder="输入网址，例如 https://example.com"
                    className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-[11px] outline-none"
                    style={{ borderColor: theme.ui.hairline, color: theme.node.text }}
                />
                <button
                    type="button"
                    className="h-7 shrink-0 rounded-md px-2 text-[11px] font-medium"
                    style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                    onClick={applyUrlRaw}
                >
                    打开
                </button>
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-40"
                    style={{ color: theme.node.muted }}
                    title="读取页面信息"
                    disabled={reading || !draftUrl.trim()}
                    onClick={() => readPage(normalizeUrl(draftUrl) || activeTab?.url || data.url)}
                >
                    <RefreshCw className={`size-3.5 ${reading ? "animate-spin" : ""}`} />
                </button>
                <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-md"
                    style={{ color: theme.node.muted }}
                    title="在浏览器打开（无内嵌）"
                    onClick={() => openExternal(activeTab?.url || data.url)}
                >
                    <ExternalLink className="size-3.5" />
                </button>
            </div>

            {/* 多标签栏 */}
            {(data.tabs?.length || 0) > 0 ? (
                <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5" style={{ borderColor: theme.ui.hairline, background: theme.ui.materialElevated }} data-canvas-no-zoom>
                    {data.tabs?.map((tab) => (
                        <div
                            key={tab.id}
                            className={`flex min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] ${tab.id === activeTabId ? "font-medium" : "opacity-70"}`}
                            style={{ background: tab.id === activeTabId ? theme.toolbar.activeBg : "transparent", color: tab.id === activeTabId ? theme.toolbar.activeText : theme.node.text }}
                            onClick={() => {
                                setDraftUrl(tab.url);
                                update({ activeTabId: tab.id, url: tab.url });
                            }}
                        >
                            <span className="max-w-24 truncate">{tab.title || tab.url || "标签"}</span>
                            <button
                                type="button"
                                className="grid size-4 shrink-0 place-items-center rounded"
                                onClick={(event) => closeTab(tab.id, event)}
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="grid size-6 shrink-0 place-items-center rounded-md"
                        style={{ color: theme.node.muted }}
                        title="新建标签"
                        onClick={addTab}
                    >
                        <Plus className="size-3.5" />
                    </button>
                </div>
            ) : null}

            {/* 内容区 */}
            <div className="min-h-0 flex-1 overflow-auto p-3" data-canvas-no-zoom>
                {mode === "reference" ? (
                    <ReferenceCard data={data} theme={theme} onPatch={(patch) => update(patch)} onOpenExternal={(url) => openExternal(url)} />
                ) : data.read?.status === "success" ? (
                    <ReadResult data={data} theme={theme} onOpenExternal={(url) => openExternal(url)} onSaveReference={saveAsReference} />
                ) : (
                    <IdleOrError data={data} theme={theme} reading={reading} onRead={() => readPage(activeTab?.url || data.url)} onOpenExternal={(url) => openExternal(url)} onSaveReference={saveAsReference} />
                )}
            </div>
        </div>
    );
}

function ReadResult({ data, theme, onOpenExternal, onSaveReference }: { data: CanvasWebPreviewData; theme: CanvasTheme; onOpenExternal: (url: string) => void; onSaveReference: () => void }) {
    const read = data.read;
    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-semibold text-clip">{read?.title || data.title || "无标题"}</div>
                <button type="button" className="h-7 shrink-0 rounded-md px-2 text-[11px] font-medium" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }} onClick={onSaveReference}>
                    存为引用卡
                </button>
            </div>
            {read?.description ? (
                <div className="whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>{read.description}</div>
            ) : null}

            {read?.images?.length ? (
                <div className="grid grid-cols-3 gap-2">
                    {read.images.map((image, index) => (
                        <img key={index} src={image} alt="" loading="lazy" className="h-16 w-full rounded-md object-cover" />
                    ))}
                </div>
            ) : null}

            {read?.videos?.length ? (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: theme.node.muted }}>
                        <Video className="size-3.5" /> 视频
                    </div>
                    {read.videos.map((video, index) => (
                        <button key={index} type="button" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:opacity-80" style={{ background: theme.toolbar.itemHover, color: theme.node.text }} onClick={() => onOpenExternal(video)}>
                            <Link2 className="size-3.5 shrink-0" />
                            <span className="truncate">{video}</span>
                        </button>
                    ))}
                </div>
            ) : null}

            <button type="button" className="mt-auto flex h-8 items-center justify-center gap-2 rounded-lg text-xs font-medium" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }} onClick={() => onOpenExternal(data.url)}>
                <ExternalLink className="size-3.5" /> 在浏览器打开原文
            </button>
        </div>
    );
}

function IdleOrError({ data, theme, reading, onRead, onOpenExternal, onSaveReference }: { data: CanvasWebPreviewData; theme: CanvasTheme; reading: boolean; onRead: () => void; onOpenExternal: (url: string) => void; onSaveReference: () => void }) {
    const read = data.read;
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Globe className="size-5" />
            </span>
            <div className="text-xs leading-5 opacity-70">
                {read?.status === "error" ? (read.errorDetails || "无法读取页面") : "输入网址后「打开」，再点读取获取标题、图片与视频"}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium"
                    style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                    onClick={onRead}
                    disabled={reading}
                >
                    <RefreshCw className={`size-3.5 ${reading ? "animate-spin" : ""}`} /> {reading ? "读取中" : "读取页面信息"}
                </button>
                <button type="button" className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs" style={{ color: theme.node.muted }} onClick={onSaveReference}>
                    <Library className="size-3.5" /> 存为引用卡
                </button>
            </div>
            {data.url ? (
                <button type="button" className="flex items-center gap-1.5 text-[11px]" style={{ color: theme.node.muted }} onClick={() => onOpenExternal(data.url)}>
                    <ExternalLink className="size-3.5" /> 在浏览器打开
                </button>
            ) : null}
        </div>
    );
}

function ReferenceCard({ data, theme, onPatch, onOpenExternal }: { data: CanvasWebPreviewData; theme: CanvasTheme; onPatch: (patch: Partial<CanvasWebPreviewData>) => void; onOpenExternal: (url: string) => void }) {
    return (
        <div className="flex h-full flex-col gap-3">
            <input
                value={data.title}
                onChange={(event) => onPatch({ title: event.target.value })}
                placeholder="引用卡标题"
                className="h-8 rounded-md border bg-transparent px-2 text-sm font-semibold outline-none"
                style={{ borderColor: theme.ui.hairline, color: theme.node.text }}
            />
            {data.image ? <img src={data.image} alt="" className="max-h-40 w-full rounded-lg object-cover" /> : null}
            <textarea
                value={data.summary}
                onChange={(event) => onPatch({ summary: event.target.value })}
                placeholder="摘要 / 笔记"
                rows={4}
                className="min-h-0 flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs leading-5 outline-none"
                style={{ borderColor: theme.ui.hairline, color: theme.node.text }}
            />
            <button type="button" className="flex h-8 items-center justify-center gap-2 rounded-lg text-xs font-medium" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }} onClick={() => onOpenExternal(data.url)}>
                <Link2 className="size-3.5" /> 打开原文
            </button>
        </div>
    );
}

function appendTab(tabs: CanvasWebPreviewTab[], tab: CanvasWebPreviewTab): CanvasWebPreviewTab[] {
    return [...tabs, tab];
}

function parseWebPreviewData(node: CanvasNodeData): CanvasWebPreviewData {
    if (node.metadata?.webPreviewData) return { ...EMPTY_DATA, ...node.metadata.webPreviewData };
    try {
        const parsed = JSON.parse(node.metadata?.content || "") as Partial<CanvasWebPreviewData>;
        return { ...EMPTY_DATA, ...parsed };
    } catch {
        return { ...EMPTY_DATA };
    }
}
