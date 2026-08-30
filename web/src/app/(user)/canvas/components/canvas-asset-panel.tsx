"use client";

import { useMemo, useState, type UIEvent } from "react";
import { App, Spin } from "antd";
import { Check, ChevronRight, Clapperboard, Download, Eye, EyeOff, FileText, Globe, Image as ImageIcon, Layers3, ListChecks, Maximize2, Music2, PenTool, Search, SlidersHorizontal, StickyNote, Type, Video, Workflow } from "lucide-react";

import type { canvasThemes, CanvasTheme } from "@/lib/canvas-theme";
import { peekCachedImageUrl } from "@/services/image-storage";
import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { exportCanvasNodes } from "../utils/canvas-export";
import { CanvasNodeType, type CanvasNodeData } from "../types";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

const NODE_TYPE_LABEL: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Text]: "文本",
    [CanvasNodeType.Annotation]: "注释",
    [CanvasNodeType.Whiteboard]: "白板",
    [CanvasNodeType.WebPreview]: "网页预览",
    [CanvasNodeType.Image]: "图片",
    [CanvasNodeType.Video]: "视频",
    [CanvasNodeType.Audio]: "音频",
    [CanvasNodeType.Script]: "脚本",
    [CanvasNodeType.ComfyUI]: "ComfyUI",
    [CanvasNodeType.Clip]: "智能剪辑",
    [CanvasNodeType.Group]: "分组",
    [CanvasNodeType.Config]: "生成配置",
};

const NODE_FILTER_VALUES: string[] = ["all", CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Text, CanvasNodeType.Annotation, CanvasNodeType.Whiteboard, CanvasNodeType.WebPreview, CanvasNodeType.Audio, CanvasNodeType.Script, CanvasNodeType.Clip, CanvasNodeType.ComfyUI, CanvasNodeType.Config, CanvasNodeType.Group];

function nodeTypeIcon(node: CanvasNodeData) {
    switch (node.type) {
        case CanvasNodeType.Text:
            return <Type className="size-4" />;
        case CanvasNodeType.Annotation:
            return <StickyNote className="size-4" />;
        case CanvasNodeType.Whiteboard:
            return <PenTool className="size-4" />;
        case CanvasNodeType.WebPreview:
            return <Globe className="size-4" />;
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

function nodeStatusColor(node: CanvasNodeData): string | null {
    const status = node.metadata?.status;
    if (status === "error") return "#ef4444";
    if (status === "loading") return "#f59e0b";
    if (status === "success" || node.metadata?.content || node.metadata?.storageKey) return "#22c55e";
    return null; // 空 idle 不显示状态点（对齐上游）
}

/** 行内第二行预览：文本/脚本显示正文片段，其余显示类型名 */
function nodePreviewText(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Annotation || node.type === CanvasNodeType.Whiteboard || node.type === CanvasNodeType.Script) {
        const text = node.metadata?.content || node.metadata?.scriptBody || node.metadata?.prompt || "";
        return text.slice(0, 36);
    }
    return NODE_TYPE_LABEL[node.type] || node.type;
}

/** 节点缩略图：图片节点用缓存的签名 URL，其余用类型图标 */
function NodeRowThumb({ node, theme }: { node: CanvasNodeData; theme: Theme }) {
    const thumb = node.type === CanvasNodeType.Image ? peekCachedImageUrl(node.metadata?.storageKey) || node.metadata?.content : undefined;
    return (
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.faint }}>
            {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
                nodeTypeIcon(node)
            )}
        </span>
    );
}

/** 「画布」页签：节点清单（搜索 + 类型筛选 + 多选导出 + 分组树折叠 + 定位 + 放大预览），对齐上游侧栏 */
export function CanvasNodesTab({
    theme,
    nodes,
    selectedNodeIds,
    onLocateNode,
    onPreviewNode,
    onToggleVisibility,
}: {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onLocateNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    onToggleVisibility: (nodeId: string) => void;
}) {
    const { message } = App.useApp();
    const [keyword, setKeyword] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [selectMode, setSelectMode] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes.filter((node) => (typeFilter === "all" || node.type === typeFilter) && (!query || [node.title, node.metadata?.content, node.metadata?.prompt, node.metadata?.scriptBody].filter(Boolean).join(" ").toLowerCase().includes(query)));
    }, [keyword, nodes, typeFilter]);

    // 分组树：Group 节点（metadata.groupChildIds）可折叠，子节点仅出现在组内
    const treeRows = useMemo(() => {
        const filteredIds = new Set(filtered.map((node) => node.id));
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const groupChildIds = new Set(nodes.filter((node) => node.type === CanvasNodeType.Group).flatMap((node) => node.metadata?.groupChildIds || []));
        const rows: Array<{ node: CanvasNodeData; depth: number }> = [];
        for (const node of filtered) {
            if (groupChildIds.has(node.id)) continue; // 子节点只在组内列出
            if (node.type !== CanvasNodeType.Group) {
                rows.push({ node, depth: 0 });
                continue;
            }
            const children = (node.metadata?.groupChildIds || []).flatMap((id) => {
                const child = byId.get(id);
                return child && filteredIds.has(child.id) ? [child] : [];
            });
            rows.push({ node, depth: 0 });
            if (!collapsedGroups.has(node.id)) {
                for (const child of children) rows.push({ node: child, depth: 1 });
            }
        }
        return rows;
    }, [collapsedGroups, filtered, nodes]);

    const exitSelect = () => {
        setSelectMode(false);
        setChecked(new Set());
    };
    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const allChecked = filtered.length > 0 && filtered.every((node) => checked.has(node.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((node) => node.id)));

    const handleExport = async () => {
        const targets = filtered.filter((node) => checked.has(node.id));
        if (!targets.length) return;
        setExporting(true);
        try {
            await exportCanvasNodes(targets, `画布节点-${targets.length}`);
            message.success(`已导出 ${targets.length} 个节点`);
            exitSelect();
        } catch {
            message.error("导出失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            {/* 标题行：元素数 + 多选模式 + 类型筛选 */}
            <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.faint }}>
                    节点管理
                </span>
                <span className="text-xs" style={{ color: theme.node.faint }}>
                    {filtered.length}
                    {nodes.some((node) => node.metadata?.hidden) ? ` · 隐藏 ${nodes.filter((node) => node.metadata?.hidden).length}` : ""}
                </span>
                {selectMode ? (
                    <button type="button" className="ml-auto rounded-md px-2 py-0.5 text-xs transition hover:bg-white/10" style={{ color: theme.node.text }} onClick={exitSelect}>
                        取消
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            onClick={() => setSelectMode(true)}
                        >
                            <ListChecks className="size-3.5" />
                            多选
                        </button>
                        <select
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                            className="h-6 rounded-md border bg-transparent px-1 text-[11px] outline-none"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                        >
                            {NODE_FILTER_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {value === "all" ? "全部" : NODE_TYPE_LABEL[value as CanvasNodeType] || value}
                                </option>
                            ))}
                        </select>
                    </>
                )}
            </div>
            {/* 搜索 */}
            <div className="mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: theme.node.fill, border: `1px solid ${theme.toolbar.border}` }}>
                <Search className="size-3.5 shrink-0" style={{ color: theme.node.faint }} />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索节点" className="w-full bg-transparent text-xs outline-none" style={{ color: theme.node.text }} />
            </div>
            {/* 树列表 */}
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1" data-canvas-no-zoom>
                {treeRows.length === 0 ? (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.faint }}>
                        {nodes.length === 0 ? "画布还是空的" : "没有匹配的节点"}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {treeRows.map(({ node, depth }) => {
                            const selected = selectedNodeIds.has(node.id);
                            const isChecked = checked.has(node.id);
                            const active = selectMode ? isChecked : selected;
                            const groupChildren = (node.metadata?.groupChildIds || []).length;
                            return (
                                <div
                                    key={node.id}
                                    className={`group relative flex items-center rounded-lg transition ${depth ? "ml-5" : ""} ${active ? "" : "hover:bg-white/5"}`}
                                    style={{ ...(active ? { background: theme.toolbar.activeBg } : {}), opacity: node.metadata?.hidden ? 0.58 : undefined }}
                                >
                                    {depth ? <span className="pointer-events-none absolute -left-3 top-[-0.4rem] h-[calc(100%+0.4rem)] w-3 rounded-bl-md border-b border-l opacity-45" style={{ borderColor: theme.toolbar.border }} /> : null}
                                    {node.type === CanvasNodeType.Group && groupChildren ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCollapsedGroups((prev) => {
                                                    const next = new Set(prev);
                                                    next.has(node.id) ? next.delete(node.id) : next.add(node.id);
                                                    return next;
                                                })
                                            }
                                            className="ml-1 grid size-6 shrink-0 place-items-center opacity-55 transition hover:opacity-100"
                                        >
                                            <ChevronRight className={`size-3.5 transition-transform ${collapsedGroups.has(node.id) ? "" : "rotate-90"}`} />
                                        </button>
                                    ) : (
                                        <span className="ml-1 size-6 shrink-0" />
                                    )}
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1.5 pr-1.5"
                                        onClick={() => (selectMode ? toggleChecked(node.id) : onLocateNode(node.id))}
                                        onKeyDown={(event) => event.key === "Enter" && (selectMode ? toggleChecked(node.id) : onLocateNode(node.id))}
                                    >
                                        {selectMode ? (
                                            <span
                                                className="grid size-4 shrink-0 place-items-center rounded border transition"
                                                style={{ borderColor: isChecked ? theme.toolbar.activeText : theme.node.stroke, background: isChecked ? theme.toolbar.activeText : "transparent" }}
                                            >
                                                {isChecked ? <Check className="size-3 text-white" /> : null}
                                            </span>
                                        ) : null}
                                        <NodeRowThumb node={node} theme={theme} />
                                        <span className="min-w-0 flex-1 space-y-0.5">
                                            <span className="block truncate text-xs font-medium leading-snug">{node.title || NODE_TYPE_LABEL[node.type] || "节点"}</span>
                                            <span className="block truncate text-[10px] leading-snug" style={{ color: theme.node.faint }}>
                                                {nodePreviewText(node)}
                                            </span>
                                        </span>
                                        {nodeStatusColor(node) ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: nodeStatusColor(node) as string }} /> : null}
                                    </div>
                                    {selectMode ? null : (
                                        <div className="flex shrink-0 items-center">
                                            <button
                                                type="button"
                                                className="grid size-7 shrink-0 place-items-center rounded-md opacity-45 transition hover:bg-white/10 hover:opacity-100"
                                                title={node.metadata?.hidden ? "显示节点" : "隐藏节点"}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onToggleVisibility(node.id);
                                                }}
                                            >
                                                {node.metadata?.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                            </button>
                                            <button
                                                type="button"
                                                className="grid size-7 shrink-0 place-items-center rounded-md opacity-45 transition hover:bg-white/10 hover:opacity-100"
                                                title="放大预览"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onPreviewNode(node.id);
                                                }}
                                            >
                                                <Maximize2 className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* 多选模式底部栏 */}
            {selectMode ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    <button type="button" className="text-xs transition hover:opacity-70" style={{ color: theme.node.text }} onClick={toggleAll}>
                        {allChecked ? "清空" : "全选"}
                    </button>
                    <span className="text-xs" style={{ color: theme.node.faint }}>
                        已选 {checked.size}
                    </span>
                    <button
                        type="button"
                        disabled={!checked.size || exporting}
                        className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white transition disabled:opacity-40"
                        style={{ background: theme.toolbar.activeBg }}
                        onClick={() => void handleExport()}
                    >
                        <Download className="size-3.5" />
                        {exporting ? "导出中…" : "导出选中"}
                    </button>
                </div>
            ) : null}
        </div>
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
