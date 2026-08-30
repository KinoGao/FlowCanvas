"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { peekCachedImageUrl, resolveImageUrl } from "@/services/image-storage";
import { Image as ImageIcon } from "lucide-react";
import type { CanvasNodeData } from "../types";

/**
 * 生成节点「节点内嵌 composer」：在节点本体内把「结果区 + 编辑器」纵向堆叠，
 * 并用 ResizeObserver 实测内容高，经 onHeightChange 让节点自动增高（对齐 SHUO）。
 * 结果媒体 URL 自行解析（storageKey/content）；编辑器为 prebuilt ReactNode（页面传入）。
 */
type CanvasNodeInlineComposerProps = {
    node: CanvasNodeData;
    /** 生成编辑器（CanvasNodePromptPanel，已带全部回调） */
    editor: ReactNode;
    onHeightChange?: (nodeId: string, height: number) => void;
};

export function CanvasNodeInlineComposer({ node, editor, onHeightChange }: CanvasNodeInlineComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const containerRef = useRef<HTMLDivElement>(null);
    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content || "";
    const [mediaUrl, setMediaUrl] = useState(() => (storageKey ? peekCachedImageUrl(storageKey) : content.startsWith("data:") || /^https?:/i.test(content) ? content : ""));

    useEffect(() => {
        if (!storageKey) {
            setMediaUrl(content.startsWith("data:") || /^https?:/i.test(content) ? content : "");
            return;
        }
        let cancelled = false;
        setMediaUrl(peekCachedImageUrl(storageKey) ?? "");
        void resolveImageUrl(storageKey, "")
            .then((url) => {
                if (!cancelled) setMediaUrl(url || "");
            })
            .catch(() => {
                if (!cancelled) setMediaUrl("");
            });
        return () => {
            cancelled = true;
        };
    }, [content, storageKey]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !onHeightChange) return;
        const report = () => onHeightChange(node.id, Math.max(120, Math.ceil(el.offsetHeight)));
        report();
        const observer = new ResizeObserver(report);
        observer.observe(el);
        return () => observer.disconnect();
    }, [node.id, onHeightChange]);

    return (
        <div
            ref={containerRef}
            className="flex h-full w-full flex-col overflow-hidden"
            style={{ background: theme.node.fill, color: theme.node.text }}
            data-canvas-no-zoom
        >
            {/* 结果区 */}
            <div className="relative shrink-0 overflow-hidden" style={{ minHeight: 96, maxHeight: 220 }}>
                {mediaUrl ? (
                    <img src={mediaUrl} alt="" className="h-full max-h-[220px] w-full object-contain" />
                ) : (
                    <div className="grid h-[96px] w-full place-items-center" style={{ color: theme.node.placeholder }}>
                        <ImageIcon className="size-7 opacity-50" />
                    </div>
                )}
            </div>
            {/* 编辑器区 */}
            <div className="min-h-0 flex-1">{editor}</div>
        </div>
    );
}
