"use client";

import { useMemo, useState, type UIEvent } from "react";
import { App, Spin } from "antd";
import { Clapperboard, Eye, EyeOff, FileText, Image as ImageIcon, Layers3, Music2, PackagePlus, Search, SlidersHorizontal, Type, Video, Workflow, X } from "lucide-react";

import type { canvasThemes, CanvasTheme } from "@/lib/canvas-theme";
import { peekCachedImageUrl } from "@/services/image-storage";
import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { useConfigStore } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { DigitalHumanPanel } from "./canvas-digital-human-library";
import { VoiceManagerSection } from "./canvas-voice-manager";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

export type AssetPanelTab = "canvas" | "assets" | "prompts";

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

/** 提示词库页签：搜索 + 列表，点击复制 */
function PromptListTab({ theme }: { theme: Theme }) {
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
        <div className="flex min-h-0 flex-1 flex-col">
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
        </div>
    );
}

/**
 * 左侧资产面板（对齐 TapNow）：画布元素清单 / 资产（数字人+音色+素材入口）/ 提示词库。
 */
export function CanvasAssetPanel({
    theme,
    nodes,
    selectedNodeIds,
    onLocateNode,
    onToggleNodeHidden,
    onInsertDigitalHuman,
    onOpenMaterialLibrary,
    onClose,
}: {
    theme: CanvasTheme;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onLocateNode: (nodeId: string) => void;
    onToggleNodeHidden: (nodeId: string) => void;
    onInsertDigitalHuman: Parameters<typeof DigitalHumanPanel>[0]["onInsert"];
    onOpenMaterialLibrary: (tab: "styles" | "effects" | "assets") => void;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<AssetPanelTab>("canvas");
    const [keyword, setKeyword] = useState("");
    const [selectedOnly, setSelectedOnly] = useState(false);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);

    const filteredNodes = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return nodes.filter((node) => {
            if (selectedOnly && !selectedNodeIds.has(node.id)) return false;
            if (!kw) return true;
            return (node.title || "").toLowerCase().includes(kw) || (NODE_TYPE_LABEL[node.type] || "").includes(kw);
        });
    }, [keyword, nodes, selectedNodeIds, selectedOnly]);

    return (
        <aside
            className="absolute bottom-3 left-3 top-14 z-30 flex w-[280px] flex-col rounded-2xl border shadow-xl"
            style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            data-canvas-composer
            onWheelCapture={(event) => event.stopPropagation()}
        >
            {/* 顶部页签 */}
            <div className="flex items-center gap-1 border-b px-3 pt-2" style={{ borderColor: theme.toolbar.border }}>
                {([
                    ["canvas", "画布"],
                    ["assets", "资产"],
                    ["prompts", "提示词库"],
                ] as [AssetPanelTab, string][]).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        className="relative px-2.5 pb-2 pt-1 text-sm transition"
                        style={{ color: tab === value ? theme.node.text : theme.node.faint, fontWeight: tab === value ? 600 : 400 }}
                        onClick={() => setTab(value)}
                    >
                        {label}
                        {tab === value ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full" style={{ background: theme.node.text }} /> : null}
                    </button>
                ))}
                <button type="button" className="ml-auto mb-1 grid size-6 place-items-center rounded-md opacity-50 transition hover:opacity-100" onClick={onClose} title="关闭面板">
                    <X className="size-3.5" />
                </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-3">
                {tab === "canvas" ? (
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
                                        const hidden = Boolean(node.metadata?.hidden);
                                        const selected = selectedNodeIds.has(node.id);
                                        return (
                                            <div
                                                key={node.id}
                                                role="button"
                                                tabIndex={0}
                                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition hover:bg-white/5"
                                                style={{ borderColor: selected ? theme.ui.accent : "transparent", background: selected ? theme.toolbar.itemHover : "transparent", opacity: hidden ? 0.5 : 1 }}
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
                                                    title={hidden ? "显示节点" : "隐藏节点"}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onToggleNodeHidden(node.id);
                                                    }}
                                                >
                                                    {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : tab === "assets" ? (
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" data-canvas-no-zoom>
                        <section>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.faint }}>
                                数字人分身
                            </div>
                            <DigitalHumanPanel theme={theme} compact onInsert={onInsertDigitalHuman} />
                        </section>
                        <section className="border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                            <VoiceManagerSection voice={config.audioVoice} onSelectVoice={(value) => updateConfig("audioVoice", value)} />
                        </section>
                        <section className="border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.faint }}>
                                更多素材
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    ["styles", "风格库"],
                                    ["effects", "效果库"],
                                    ["assets", "我的素材"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className="flex h-9 items-center justify-center gap-1 rounded-lg border text-xs transition hover:bg-white/5"
                                        style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                                        onClick={() => onOpenMaterialLibrary(value)}
                                    >
                                        <PackagePlus className="size-3.5" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                ) : (
                    <PromptListTab theme={theme} />
                )}
            </div>
        </aside>
    );
}
