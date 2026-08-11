import { useState } from "react";
import { Button, Tooltip } from "antd";
import { CircleHelp, Grid3X3, LocateFixed, Map, Minus, Plus } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { clampCanvasZoom, stepCanvasZoom } from "./leafer-viewport";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    gridEnabled: boolean;
    onToggleGrid: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap, gridEnabled, onToggleGrid }: CanvasZoomControlsProps) {
    const [zoomOpen, setZoomOpen] = useState(false);
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.ui.material, borderColor: theme.ui.hairline, color: theme.toolbar.item, boxShadow: theme.ui.shadow };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const zoomPercent = Math.round(scale * 100);

    const setPercent = (percent: number) => {
        onScaleChange(clampCanvasZoom(percent / 100));
        setZoomOpen(false);
    };

    return (
        <div className="canvas-viewport-controls absolute bottom-2 left-2 z-50 flex items-end gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            {zoomOpen ? (
                <div className="creative-os-panel canvas-zoom-menu absolute bottom-14 left-0 w-[212px] rounded-2xl border p-2" style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                    <div className="mb-2 flex h-8 items-center rounded-md border px-2 text-sm" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                        <input
                            className="min-w-0 flex-1 bg-transparent outline-none"
                            aria-label="缩放比例"
                            value={zoomPercent}
                            onChange={(event) => {
                                const next = Number(event.target.value.replace(/\D/g, ""));
                                if (Number.isFinite(next)) onScaleChange(clampCanvasZoom(next / 100));
                            }}
                        />
                        <span className="text-xs opacity-50">%</span>
                    </div>
                    <ZoomMenuButton theme={theme} label="放大" shortcut="⌘ +" onClick={() => onScaleChange(stepCanvasZoom(scale, "in"))} />
                    <ZoomMenuButton theme={theme} label="缩小" shortcut="⌘ -" onClick={() => onScaleChange(stepCanvasZoom(scale, "out"))} />
                    <ZoomMenuButton theme={theme} label="适合屏幕" shortcut="⌘ 0" onClick={onReset} />
                    <div className="my-1 h-px" style={{ background: theme.toolbar.border }} />
                    <ZoomMenuButton theme={theme} label="缩放至50%" onClick={() => setPercent(50)} />
                    <ZoomMenuButton theme={theme} label="缩放至100%" onClick={() => setPercent(100)} />
                    <ZoomMenuButton theme={theme} label="缩放至125%" onClick={() => setPercent(125)} />
                    <ZoomMenuButton theme={theme} label="缩放至150%" onClick={() => setPercent(150)} />
                    <ZoomMenuButton theme={theme} label="缩放至200%" onClick={() => setPercent(200)} />
                    <ZoomMenuButton theme={theme} label="缩放至300%" onClick={() => setPercent(300)} />
                </div>
            ) : null}

            <div className="creative-os-zoom-cluster flex h-10 items-center gap-0.5 border px-1" style={dockStyle}>
                <Tooltip title={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <Button type="text" className="creative-os-icon-button !size-8 !min-w-8 !p-0" style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }} icon={<Map className="size-4" />} onClick={onToggleMiniMap} aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"} />
                </Tooltip>
                <Tooltip title={gridEnabled ? "隐藏画布网格" : "显示画布网格"}>
                    <Button type="text" className="creative-os-icon-button !size-8 !min-w-8 !p-0" style={gridEnabled ? activeStyle : { color: theme.toolbar.item }} icon={<Grid3X3 className="size-4" />} onClick={onToggleGrid} aria-label={gridEnabled ? "隐藏画布网格" : "显示画布网格"} />
                </Tooltip>
                <Tooltip title="适合屏幕">
                    <Button type="text" className="creative-os-icon-button !size-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<LocateFixed className="size-4" />} onClick={onReset} aria-label="适合屏幕" />
                </Tooltip>
                <input
                    type="range"
                    className="canvas-zoom-slider"
                    min={10}
                    max={300}
                    step={5}
                    value={zoomPercent}
                    aria-label="缩放滑杆"
                    style={{ accentColor: theme.ui.accent }}
                    onChange={(event) => onScaleChange(clampCanvasZoom(Number(event.target.value) / 100))}
                />
            </div>
            <Tooltip title={`缩放 ${zoomPercent}% · 点击打开选项`}>
                <button type="button" className="creative-os-help-button grid size-10 place-items-center rounded-full border" style={{ ...dockStyle, color: zoomOpen ? theme.ui.accent : theme.toolbar.item }} onClick={() => setZoomOpen((value) => !value)} aria-label="缩放与帮助">
                    <CircleHelp className="size-[18px]" />
                </button>
            </Tooltip>
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
