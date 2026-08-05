"use client";

import { useRef, useState, type ReactNode } from "react";
import { FolderOpen, History, Image as ImageIcon, LayoutTemplate, Music2, Plus, Search, Type, Upload, Video } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasLeftToolbarProps = {
    onAddText: () => void;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onUpload: () => void;
    onOpenHistory: () => void;
    onOpenSearch: () => void;
    onOpenAssets: () => void;
    onOpenTemplates: () => void;
};

type ToolEntry = {
    key: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
};

export function CanvasLeftToolbar({
    onAddText,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onUpload,
    onOpenHistory,
    onOpenSearch,
    onOpenAssets,
    onOpenTemplates,
}: CanvasLeftToolbarProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [createOpen, setCreateOpen] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);

    const createEntries: ToolEntry[] = [
        { key: "text", label: "文字", icon: <Type className="size-4" />, onClick: onAddText },
        { key: "image", label: "图片", icon: <ImageIcon className="size-4" />, onClick: onAddImage },
        { key: "video", label: "视频", icon: <Video className="size-4" />, onClick: onAddVideo },
        { key: "audio", label: "音频", icon: <Music2 className="size-4" />, onClick: onAddAudio },
    ];

    const closeCreate = () => setCreateOpen(false);

    return (
        <div
            ref={barRef}
            className="relative z-[55] flex h-full w-11 shrink-0 flex-col items-center border-r py-3"
            style={{ borderColor: theme.ui.hairline, color: theme.toolbar.item }}
        >
            <LeftToolbarButton label="创建节点" active={createOpen} theme={theme} onClick={() => setCreateOpen((value) => !value)}>
                <Plus className="size-5" />
            </LeftToolbarButton>

            <Divider theme={theme} />

            <LeftToolbarButton label="生成历史" theme={theme} onClick={onOpenHistory}>
                <History className="size-[18px]" />
            </LeftToolbarButton>
            <LeftToolbarButton label="搜索节点" theme={theme} onClick={onOpenSearch}>
                <Search className="size-[18px]" />
            </LeftToolbarButton>
            <LeftToolbarButton label="素材库" theme={theme} onClick={onOpenAssets}>
                <FolderOpen className="size-[18px]" />
            </LeftToolbarButton>
            <LeftToolbarButton label="模板" theme={theme} onClick={onOpenTemplates}>
                <LayoutTemplate className="size-[18px]" />
            </LeftToolbarButton>

            {createOpen ? (
                <div
                    className="creative-os-panel absolute left-12 top-3 z-50 w-[176px] rounded-lg border p-1.5"
                    style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow, color: theme.node.text }}
                >
                    <div className="px-2 pb-1.5 pt-1 text-xs font-medium opacity-60">创建节点</div>
                    {createEntries.map((entry) => (
                        <LeftMenuEntry key={entry.key} theme={theme} icon={entry.icon} label={entry.label} onClick={entry.onClick} onClose={closeCreate} />
                    ))}
                    <div className="mx-1 my-1 h-px" style={{ background: theme.ui.hairline }} />
                    <div className="px-2 pb-1.5 pt-1 text-xs font-medium opacity-60">添加资源</div>
                    <LeftMenuEntry theme={theme} icon={<Upload className="size-4" />} label="上传文件" onClick={onUpload} onClose={closeCreate} />
                </div>
            ) : null}
        </div>
    );
}

function LeftToolbarButton({ label, active = false, theme, onClick, children }: { label: string; active?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="grid size-9 place-items-center rounded-lg transition-colors"
            aria-label={label}
            title={label}
            style={{ color: active ? theme.toolbar.activeText : theme.toolbar.item, background: active ? theme.toolbar.activeBg : undefined }}
            onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = theme.toolbar.itemHover;
            }}
            onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = "transparent";
            }}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function LeftMenuEntry({ theme, icon, label, onClick, onClose }: { theme: CanvasTheme; icon: ReactNode; label: string; onClick: () => void; onClose: () => void }) {
    return (
        <button
            type="button"
            className="creative-os-menu-item flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors"
            style={{ color: theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={() => {
                onClick();
                onClose();
            }}
        >
            <span className="grid size-5 place-items-center opacity-80">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="my-1 h-px w-5" style={{ background: theme.ui.hairline }} />;
}
