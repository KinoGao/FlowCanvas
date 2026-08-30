"use client";

import { useEffect, useState, type ReactNode } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { peekCachedImageUrl, resolveImageUrl } from "@/services/image-storage";
import { Image as ImageIcon } from "lucide-react";
import type { CanvasNodeData } from "../types";

/**
 * 生成节点「节点内嵌 composer」：在节点本体内把「结果区 + 编辑器」纵向堆叠。
 * 编辑器区内部滚动（避免自动增高与 Leafer 布局形成反馈死循环）；结果媒体自行解析。
 * 编辑器为 prebuilt ReactNode（由页面的 renderCanvasGenerationNodeContent 传入）。
 */
type CanvasNodeInlineComposerProps = {
    node: CanvasNodeData;
    editor: ReactNode;
};

export function CanvasNodeInlineComposer({ node, editor }: CanvasNodeInlineComposerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const storageKey = node.metadata?.storageKey;
    const content = node.metadata?.content || "";
    const [mediaUrl, setMediaUrl] = useState(() => (storageKey ? peekCachedImageUrl(storageKey) : isMediaUrl(content) ? content : ""));

    useEffect(() => {
        if (!storageKey) {
            setMediaUrl(isMediaUrl(content) ? content : "");
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

    return (
        <div
            className="flex h-full w-full flex-col overflow-hidden"
            style={{ background: theme.node.fill, color: theme.node.text }}
            data-canvas-no-zoom
        >
            {/* 结果区（有结果显示图，否则占位） */}
            <div className="relative shrink-0 overflow-hidden" style={{ height: 96 }}>
                {mediaUrl ? (
                    <img src={mediaUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                    <div className="grid h-full w-full place-items-center" style={{ color: theme.node.placeholder }}>
                        <ImageIcon className="size-7 opacity-50" />
                    </div>
                )}
            </div>
            {/* 编辑器区（内部滚动） */}
            <div className="min-h-0 flex-1 overflow-y-auto">{editor}</div>
        </div>
    );
}

function isMediaUrl(value: string) {
    return value.startsWith("data:") || /^https?:/i.test(value);
}
