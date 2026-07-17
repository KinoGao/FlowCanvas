"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2, Image as ImageIcon, Video, Music, FileText, SlidersHorizontal } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "../types";

export function CanvasNodeContextMenu({
    menu,
    onClose,
    onDuplicate,
    onDelete,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddConfig,
}: {
    menu: ContextMenuState;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onAddImage?: () => void;
    onAddVideo?: () => void;
    onAddAudio?: () => void;
    onAddText?: () => void;
    onAddConfig?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "canvas" ? (
                <>
                    <MenuButton icon={<ImageIcon className="size-4" />} label="添加图片" onClick={onAddImage} />
                    <MenuButton icon={<Video className="size-4" />} label="添加视频" onClick={onAddVideo} />
                    <MenuButton icon={<Music className="size-4" />} label="添加音频" onClick={onAddAudio} />
                    <MenuButton icon={<FileText className="size-4" />} label="添加文本" onClick={onAddText} />
                    <MenuButton icon={<SlidersHorizontal className="size-4" />} label="添加配置节点" onClick={onAddConfig} />
                </>
            ) : (
                <>
                    {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="Duplicate" onClick={onDuplicate} /> : null}
                    <MenuButton icon={<Trash2 className="size-4" />} label="Delete" onClick={onDelete} danger />
                </>
            )}
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
