import { useState } from "react";
import { Button, Tooltip } from "antd";
import { Compass, Focus, FolderOpen, Minus, Plus } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    onOpenMyAssets: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap, onOpenMyAssets }: CanvasZoomControlsProps) {
    const [zoomOpen, setZoomOpen] = useState(false);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 14px 34px rgba(0,0,0,.26)" : "0 12px 30px rgba(28,25,23,.10)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const zoomPercent = Math.round(scale * 100);

    const setPercent = (percent: number) => {
        onScaleChange(Math.min(5, Math.max(0.05, percent / 100)));
        setZoomOpen(false);
    };

    return (
        <div className="absolute bottom-3 left-4 z-50 flex items-end gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            {zoomOpen ? (
                <div className="absolute bottom-11 left-[150px] w-[212px] rounded-2xl border p-2 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl" style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                    <div className="mb-2 flex h-8 items-center rounded-md border px-2 text-sm" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                        <input
                            className="min-w-0 flex-1 bg-transparent outline-none"
                            aria-label="缩放比例"
                            value={zoomPercent}
                            onChange={(event) => {
                                const next = Number(event.target.value.replace(/\D/g, ""));
                                if (Number.isFinite(next)) onScaleChange(Math.min(5, Math.max(0.05, next / 100)));
                            }}
                        />
                        <span className="text-xs opacity-50">%</span>
                    </div>
                    <ZoomMenuButton theme={theme} label="放大" shortcut="⌘ +" onClick={() => onScaleChange(Math.min(5, scale + 0.1))} />
                    <ZoomMenuButton theme={theme} label="缩小" shortcut="⌘ -" onClick={() => onScaleChange(Math.max(0.05, scale - 0.1))} />
                    <ZoomMenuButton theme={theme} label="适合屏幕" shortcut="⌘ 0" onClick={onReset} />
                    <div className="my-1 h-px" style={{ background: theme.toolbar.border }} />
                    <ZoomMenuButton theme={theme} label="缩放至50%" onClick={() => setPercent(50)} />
                    <ZoomMenuButton theme={theme} label="缩放至100%" onClick={() => setPercent(100)} />
                    <ZoomMenuButton theme={theme} label="缩放至500%" onClick={() => setPercent(500)} />
                </div>
            ) : null}

            <div className="flex h-10 items-center gap-1 rounded-xl border px-1.5 backdrop-blur-xl" style={dockStyle}>
                <Tooltip title="资产管理">
                    <button type="button" className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] transition" style={{ color: theme.toolbar.item }} onClick={onOpenMyAssets} aria-label="资产管理">
                        <FolderOpen className="size-4" />
                        <span className="whitespace-nowrap">资产管理</span>
                    </button>
                </Tooltip>
                <Tooltip title={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <Button type="text" className="!h-7 !w-7 !min-w-7 !rounded-md !p-0" style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }} icon={<Compass className="size-4" />} onClick={onToggleMiniMap} aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"} />
                </Tooltip>
                <Tooltip title="重置视图">
                    <Button type="text" className="!h-7 !w-7 !min-w-7 !rounded-md !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label="重置视图" />
                </Tooltip>
                <button type="button" className="h-7 rounded-md px-2 text-xs tabular-nums transition" style={zoomOpen ? activeStyle : { color: theme.toolbar.item }} onClick={() => setZoomOpen((value) => !value)} aria-label="缩放选项">
                    {zoomPercent}%
                </button>
            </div>
        </div>
    );
}

function ZoomMenuButton({ theme, label, shortcut, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; label: string; shortcut?: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm transition"
            style={{ color: theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={onClick}
        >
            <span className="inline-flex items-center gap-2">
                {label === "放大" ? <Plus className="size-3.5 opacity-60" /> : label === "缩小" ? <Minus className="size-3.5 opacity-60" /> : null}
                {label}
            </span>
            {shortcut ? <span className="text-xs opacity-45">{shortcut}</span> : null}
        </button>
    );
}
