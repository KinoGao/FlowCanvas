"use client";

import { useMemo, useState, type UIEvent } from "react";
import { App, Spin } from "antd";
import { Clapperboard, Eye, FileText, Image as ImageIcon, Layers3, Music2, Search, SlidersHorizontal, Type, Video, Workflow } from "lucide-react";

import type { canvasThemes, CanvasTheme } from "@/lib/canvas-theme";
import { peekCachedImageUrl } from "@/services/image-storage";
import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { CanvasNodeType, type CanvasNodeData } from "../types";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const NODE_TYPE_LABEL: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Text]: "文本",
    [CanvasNodeType.Image]: "图片",
    [CanvasNodeType.Video]: "视频",
    [CanvasNodeType.Audio]: "音频",
    [CanvasNodeType.Script]: "脚本",
    [CanvasNodeType.ComfyUI]: "ComfyUI",
    [CanvasNodeType.Clip]: "智能剪辑",
    [CanvasNodeType.Group]: "分组",
    [CanvasNodeType.Config]: "生成配置",
};

function nodeTypeIcon(node: CanvasNodeData) {
    switch (node.type) {
        case CanvasNodeType.Text:
            return <Type className="size-4" />;
        case CanvasNodeType.Image:
            return <ImageIcon className="size-4" />;
        case CanvasNodeType.Video:
            return <Video className="size-4" />;
        case CanvasNodeType.Audio:
            return <Music2 className="size-4" />;
        case CanvasNodeType.Script:
            return <FileText className="size-4" />;
        case CanvasNodeType.ComfyUI:
            return <Workflow className="size-4" />;
        case CanvasNodeType.Clip:
            return <Clapperboard className="size-4" />;
        case CanvasNodeType.Group:
            return <Layers3 className="size-4" />;
        default:
            return <SlidersHorizontal className="size-4" />;
    }
}

function nodeStatusColor(node: CanvasNodeData): string {
    const status = node.metadata?.status;
    if (status === "error") return "#ef4444";
    if (status === "loading") return "#f59e0b";
    if (status === "success" || node.metadata?.content || node.metadata?.storageKey) return "#22c55e";
    return "#9ca3af";
}

/** 节点缩略图：图片节点用缓存的签名 URL，其余用类型图标 */
function NodeRowThumb({ node, theme }: { node: CanvasNodeData; theme: Theme }) {
    const thumb = node.type === CanvasNodeType.Image ? peekCachedImageUrl(node.metadata?.storageKey) || node.metadata?.content : undefined;
    return (
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg" style={{ background: theme.toolbar.itemHover, color: theme.node.faint }}>
            {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
                nodeTypeIcon(node)
            )}
        </span>
    );
}

/** 「画布」页签：画布元素清单（搜索 + 全部/仅选中 + 定位 + 放大预览），对齐 TapNow 左侧栏 */
export function CanvasNodesTab({
    theme,
    nodes,
    selectedNodeIds,
    onLocateNode,
    onPreviewNode,
}: {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onLocateNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
}) {
    const [keyword, setKeyword] = useState("");
    const [selectedOnly, setSelectedOnly] = useState(false);

    const filteredNodes = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return nodes.filter((node) => {
            if (selectedOnly && !selectedNodeIds.has(node.id)) return false;
            if (!kw) return true;
            return (node.title || "").toLowerCase().includes(kw) || (NODE_TYPE_LABEL[node.type] || "").includes(kw);
        });
    }, [keyword, nodes, selectedNodeIds, selectedOnly]);

    return (
        <>
            <div className="mb-2 flex items-center text-xs" style={{ color: theme.node.faint }}>
                <span>
                    画布元素 <span style={{ color: theme.node.text }}>{filteredNodes.length}</span>
                </span>
                <button type="button" className="ml-auto rounded-md px-2 py-0.5 transition hover:bg-white/10" onClick={() => setSelectedOnly((v) => !v)}>
                    {selectedOnly ? "仅选中" : "全部"} <span className="opacity-60">▾</span>
                </button>
            </div>
            <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: theme.node.fill, border: `1px solid ${theme.toolbar.border}` }}>
                <Search className="size-3.5 shrink-0" style={{ color: theme.node.faint }} />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索节点" className="w-full bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1" data-canvas-no-zoom>
                {filteredNodes.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.faint }}>
                        {nodes.length === 0 ? "画布还是空的" : "没有匹配的节点"}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filteredNodes.map((node) => {
                            const selected = selectedNodeIds.has(node.id);
                            return (
                                <div
                                    key={node.id}
                                    role="button"
                                    tabIndex={0}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition hover:bg-white/5"
                                    style={{ borderColor: selected ? theme.ui.accent : "transparent", background: selected ? theme.toolbar.itemHover : "transparent" }}
                                    onClick={() => onLocateNode(node.id)}
                                    onKeyDown={(event) => event.key === "Enter" && onLocateNode(node.id)}
                                >
                                    <NodeRowThumb node={node} theme={theme} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-medium">{node.title || NODE_TYPE_LABEL[node.type] || "节点"}</span>
                                        <span className="block text-[10px]" style={{ color: theme.node.faint }}>
                                            {NODE_TYPE_LABEL[node.type] || node.type}
                                        </span>
                                    </span>
                                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: nodeStatusColor(node) }} />
                                    <button
                                        type="button"
                                        className="grid size-6 shrink-0 place-items-center rounded-md opacity-45 transition hover:opacity-100"
                                        title="放大预览"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onPreviewNode(node.id);
                                        }}
                                    >
                                        <Eye className="size-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

/** 「提示词库」页签：搜索 + 列表，点击复制 */
export function PromptListTab({ theme }: { theme: Theme }) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const { query, items } = usePromptList({ keyword, tags: [], category: ALL_PROMPTS_OPTION, enabled: true });

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 120) void query.fetchNextPage();
    };

    const copyPrompt = async (prompt: string, title: string) => {
        try {
            await navigator.clipboard.writeText(prompt);
            message.success(`已复制「${title}」`);
        } catch {
            message.warning("复制失败，请手动选择文本复制");
        }
    };

    return (
        <>
            <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: theme.node.fill, border: `1px solid ${theme.toolbar.border}` }}>
                <Search className="size-3.5 shrink-0" style={{ color: theme.node.faint }} />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按标题查询" className="w-full bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1" data-canvas-no-zoom onScroll={handleScroll} onWheelCapture={(event) => event.stopPropagation()}>
                {query.isLoading ? (
                    <div className="flex h-32 items-center justify-center">
                        <Spin size="small" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.faint }}>
                        没有找到匹配的提示词
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="w-full rounded-lg border p-2.5 text-left transition hover:bg-white/5"
                                style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                                onClick={() => void copyPrompt(item.prompt, item.title)}
                                title="点击复制提示词"
                            >
                                <div className="truncate text-xs font-medium" style={{ color: theme.node.text }}>
                                    {item.title}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[11px] leading-4" style={{ color: theme.node.faint }}>
                                    {item.prompt}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {query.isFetchingNextPage ? (
                    <div className="py-3 text-center">
                        <Spin size="small" />
                    </div>
                ) : null}
            </div>
        </>
    );
}
