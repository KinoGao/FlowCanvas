import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Modal, Segmented, Switch } from "antd";
import {
    Boxes,
    CircleDot,
    Clapperboard,
    Clock3,
    Crosshair,
    Eraser,
    FileText,
    FolderOpen,
    Grid2x2,
    Image as ImageIcon,
    Info,
    Keyboard,
    Layers3,
    Moon,
    Music2,
    PackagePlus,
    Palette,
    Plus,
    Redo2,
    Sparkles,
    Square,
    Sun,
    Trash2,
    Type,
    Undo2,
    Upload,
    Video,
    WandSparkles,
    Workflow,
    X,
} from "lucide-react";

import { canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export function CanvasToolbar({
    selectedCount,
    canUndo,
    canRedo,
    backgroundMode,
    snapToGrid,
    alignmentGuidesEnabled,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddScript,
    onAddComfyUI,
    onAddConfig,
    onAddVideoComposition,
    onAddDirector,
    onAddPanorama360,
    onUndo,
    onRedo,
    onUpload,
    onGroup,
    onStoryboardGroup,
    onDelete,
    onClear,
    onBackgroundModeChange,
    onSnapToGridChange,
    onAlignmentGuidesEnabledChange,
    onShowImageInfoChange,
    onOpenMyAssets,
    onOpenMaterialLibrary,
    onOpenGenerationHistory,
    onOpenWorkflowToolbox,
    assetPanelOpen = false,
}: {
    selectedCount: number;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    snapToGrid: boolean;
    alignmentGuidesEnabled: boolean;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddScript: () => void;
    onAddComfyUI?: () => void;
    /** @deprecated Use onAddComfyUI for newly created nodes. */
    onAddConfig?: () => void;
    onAddVideoComposition: () => void;
    onAddDirector: () => void;
    onAddPanorama360: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onGroup: () => void;
    onStoryboardGroup: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onSnapToGridChange: (enabled: boolean) => void;
    onAlignmentGuidesEnabledChange: (enabled: boolean) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenMyAssets: () => void;
    onOpenMaterialLibrary: (tab?: "styles" | "effects" | "assets") => void;
    onOpenGenerationHistory: () => void;
    onOpenWorkflowToolbox: () => void;
    assetPanelOpen?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const [hovered, setHovered] = useState<string | null>(null);
    const [tipPosition, setTipPosition] = useState<DockPosition>({ x: 0, y: 0 });
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [materialOpen, setMaterialOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [panelPosition, setPanelPosition] = useState<DockPosition>({ x: 0, y: 0 });
    const [panelTop, setPanelTop] = useState(16);
    const dockStyle = { background: theme.ui.material, borderColor: theme.ui.hairline, color: theme.toolbar.item, boxShadow: theme.ui.shadow };
    const hoverStyle = { background: theme.toolbar.itemHover, color: theme.toolbar.activeText };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const addComfyUI = onAddComfyUI ?? onAddConfig ?? (() => undefined);
    const tip = hovered ? toolLabel(hovered) : "";
    const dockPanelOpen = addMenuOpen || appearanceOpen || materialOpen;

    const closeDockPopovers = () => {
        setAddMenuOpen(false);
        setAppearanceOpen(false);
        setMaterialOpen(false);
        setShortcutsOpen(false);
    };

    const openPanelAt = (event: ReactMouseEvent<HTMLElement>, panel: "add" | "appearance" | "material") => {
        setShortcutsOpen(false);
        setPanelPosition(getDockPosition(wrapRef.current, event.currentTarget));
        setAddMenuOpen(panel === "add" ? (value) => !value : false);
        setAppearanceOpen(panel === "appearance" ? (value) => !value : false);
        setMaterialOpen(panel === "material" ? (value) => !value : false);
    };

    useEffect(() => {
        if (assetPanelOpen) closeDockPopovers();
    }, [assetPanelOpen]);

    useLayoutEffect(() => {
        if (!dockPanelOpen || !panelRef.current || window.matchMedia("(max-width: 760px)").matches) return;

        const updatePanelTop = () => {
            const root = wrapRef.current?.parentElement?.getBoundingClientRect();
            const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
            const viewportHeight = root?.height ?? window.innerHeight;
            const nextTop = Math.min(
                Math.max(16, viewportHeight - panelHeight - 16),
                Math.max(16, panelPosition.y - panelHeight / 2),
            );
            setPanelTop((current) => (Math.abs(current - nextTop) < 0.5 ? current : nextTop));
        };

        updatePanelTop();
        window.addEventListener("resize", updatePanelTop);
        return () => window.removeEventListener("resize", updatePanelTop);
    }, [dockPanelOpen, panelPosition.y]);

    return (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-end p-4 max-md:items-end max-md:justify-center max-md:px-4 max-md:pb-4">
            {tip ? <DockTip label={tip} position={tipPosition} theme={theme} /> : null}
            <div ref={wrapRef} className="creative-os-dock pointer-events-auto flex w-14 max-h-[calc(100vh-160px)] flex-col items-center gap-1 overflow-x-hidden overflow-y-auto border px-1 py-2 [&>*]:shrink-0 max-md:h-14 max-md:w-auto max-md:max-w-full max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden max-md:px-2 max-md:py-0" style={dockStyle}>
                <ToolbarButton id="tool-add" label="添加节点" active={addMenuOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={(event) => openPanelAt(event, "add")}>
                    <Plus className="size-5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-material" label="素材库" active={materialOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={(event) => openPanelAt(event, "material")}>
                    <Boxes className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-workflow-toolbox" label="工具箱" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={() => { closeDockPopovers(); onOpenWorkflowToolbox(); }}>
                    <Workflow className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-undo" label="撤销" disabled={!canUndo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={() => { closeDockPopovers(); onUndo(); }}>
                    <Undo2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-redo" label="重做" disabled={!canRedo} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={() => { closeDockPopovers(); onRedo(); }}>
                    <Redo2 className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-clear" label="清空画布" danger hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={() => { closeDockPopovers(); onClear(); }}>
                    <Eraser className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-shortcuts" label="快捷键" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={() => { closeDockPopovers(); setShortcutsOpen(true); }}>
                    <Keyboard className="size-4.5" />
                </ToolbarButton>
                {selectedCount >= 2 ? (
                    <>
                        <Divider theme={theme} />
                        <ToolbarButton id={'tool-group'} label={'成组'} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={onGroup}>
                            <Layers3 className={'size-4.5'} />
                        </ToolbarButton>
                        <ToolbarButton id={'tool-storyboard-group'} label={'分镜组'} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={onStoryboardGroup}>
                            <Clapperboard className={'size-4.5'} />
                        </ToolbarButton>
                    </>
                ) : null}
                {selectedCount ? (
                    <>
                        <Divider theme={theme} />
                        <ToolbarButton id="tool-delete" label="删除选中" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={onDelete} danger>
                            <Trash2 className="size-4.5" />
                        </ToolbarButton>
                    </>
                ) : null}
                <Divider theme={theme} />
                <ToolbarButton id="tool-style" label="画布外观" active={appearanceOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipPosition={setTipPosition} onHover={setHovered} onClick={(event) => openPanelAt(event, "appearance")}>
                    <Palette className="size-4.5" />
                </ToolbarButton>
            </div>

            {!assetPanelOpen && addMenuOpen ? (
                <div
                    ref={panelRef}
                    className="canvas-toolbar-popover creative-os-panel pointer-events-auto absolute z-30 w-[196px] rounded-[8px] border p-2"
                    style={{ left: panelPosition.x || "50%", top: panelTop, background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
                >
                    <div className="px-2 pb-2 text-xs font-medium opacity-60">添加节点</div>
                    <AddNodeOption theme={theme} icon={<Type className="size-4" />} label="文本" onClick={onAddText} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<ImageIcon className="size-4" />} label="图片" onClick={onAddImage} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Video className="size-4" />} label="视频" onClick={onAddVideo} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Workflow className="size-4" />} label="ComfyUI" onClick={addComfyUI} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Clapperboard className="size-4" />} label="视频合成" tag="Beta" onClick={onAddVideoComposition} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Layers3 className="size-4" />} label="导演台" tag="NEW" onClick={onAddDirector} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<CircleDot className="size-4" />} label="360场景" tag="NEW" onClick={onAddPanorama360} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Music2 className="size-4" />} label="音频" onClick={onAddAudio} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<FileText className="size-4" />} label="脚本" onClick={onAddScript} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<PackagePlus className="size-4" />} label="素材库" tag="NEW" onClick={() => onOpenMaterialLibrary("styles")} onClose={() => setAddMenuOpen(false)} />
                    <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-60">添加资源</div>
                    <AddNodeOption theme={theme} icon={<Upload className="size-4" />} label="上传" onClick={onUpload} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Clock3 className="size-4" />} label="从生成历史选择" onClick={onOpenGenerationHistory} onClose={() => setAddMenuOpen(false)} />
                </div>
            ) : null}

            {!assetPanelOpen && materialOpen ? (
                <div
                    ref={panelRef}
                    className="canvas-toolbar-popover creative-os-panel pointer-events-auto absolute z-30 w-[196px] rounded-[8px] border p-2"
                    style={{ left: panelPosition.x || "50%", top: panelTop, background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
                >
                    <AddNodeOption theme={theme} icon={<Sparkles className="size-4" />} label="风格库" tag="NEW" onClick={() => onOpenMaterialLibrary("styles")} onClose={() => setMaterialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<WandSparkles className="size-4" />} label="效果库" tag="NEW" onClick={() => onOpenMaterialLibrary("effects")} onClose={() => setMaterialOpen(false)} />
                    <DividerBlock theme={theme} />
                    <AddNodeOption theme={theme} icon={<FolderOpen className="size-4" />} label="我的素材" onClick={() => onOpenMaterialLibrary("assets")} onClose={() => setMaterialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Upload className="size-4" />} label="上传" onClick={onUpload} onClose={() => setMaterialOpen(false)} />
                </div>
            ) : null}

            {!assetPanelOpen && appearanceOpen ? (
                <div
                    ref={panelRef}
                    className="canvas-toolbar-popover creative-os-panel pointer-events-auto absolute z-30 w-[248px] rounded-[8px] border p-2.5"
                    style={{ left: panelPosition.x || "50%", top: panelTop, background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.toolbar.item }}
                >
                    <div className="px-1 pb-2 text-sm font-medium opacity-65">画布外观</div>
                    <div className="px-1 pb-1.5 text-[11px] font-medium opacity-50">主题模式</div>
                    <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: theme.toolbar.itemHover }}>
                        <CanvasThemeButton colorTheme={colorTheme} targetTheme="light" onThemeChange={setTheme}>
                            <Sun className="size-4" />
                            浅色
                        </CanvasThemeButton>
                        <CanvasThemeButton colorTheme={colorTheme} targetTheme="dark" onThemeChange={setTheme}>
                            <Moon className="size-4" />
                            深色
                        </CanvasThemeButton>
                    </div>
                    <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">网格样式</div>
                    <Segmented
                        className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8"
                        value={backgroundMode}
                        onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                        options={[
                            {
                                value: "dots",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <CircleDot className="size-4" />点
                                    </span>
                                ),
                            },
                            {
                                value: "lines",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Grid2x2 className="size-4" />线
                                    </span>
                                ),
                            },
                            {
                                value: "blank",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Square className="size-4" />
                                        空白
                                    </span>
                                ),
                            },
                        ]}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65">
                            <Grid2x2 className="size-3.5" />
                            对齐网格
                        </span>
                        <Switch size="small" checked={snapToGrid} onChange={onSnapToGridChange} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65">
                            <Crosshair className="size-3.5" />
                            辅助基准线
                        </span>
                        <Switch size="small" checked={alignmentGuidesEnabled} onChange={onAlignmentGuidesEnabledChange} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65">
                            <Info className="size-3.5" />
                            图片信息
                        </span>
                        <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
                    </div>
                </div>
            ) : null}
            <CanvasShortcutsModal open={!assetPanelOpen && shortcutsOpen} theme={theme} onClose={() => setShortcutsOpen(false)} />
        </div>
    );
}

function AddNodeOption({ theme, icon, label, tag, disabled = false, danger = false, onClick, onClose }: { theme: CanvasTheme; icon: ReactNode; label: string; tag?: string; disabled?: boolean; danger?: boolean; onClick: () => void; onClose: () => void }) {
    return (
        <button
            type="button"
            className="creative-os-menu-item flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            style={{ color: danger ? theme.ui.danger : theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={() => {
                if (disabled) return;
                onClick();
                onClose();
            }}
        >
            <span className="grid size-5 place-items-center opacity-80">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {tag ? <span className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-3" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>{tag}</span> : null}
        </button>
    );
}

function ToolbarButton({
    id,
    label,
    active,
    hovered,
    activeStyle,
    hoverStyle,
    wrapRef,
    onTipPosition,
    onHover,
    onClick,
    disabled = false,
    danger = false,
    children,
}: {
    id: string;
    label: string;
    active?: boolean;
    hovered: string | null;
    activeStyle?: CSSProperties;
    hoverStyle: CSSProperties;
    wrapRef: RefObject<HTMLDivElement | null>;
    onTipPosition: (position: DockPosition) => void;
    onHover: (id: string | null) => void;
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <Button
            type="text"
            aria-label={label}
            className="creative-os-dock-button !h-11 !w-11 !min-w-11 !p-0"
            disabled={disabled}
            style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? theme.ui.danger : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
            icon={children}
            onMouseEnter={(event) => {
                onHover(id);
                onTipPosition(getDockPosition(wrapRef.current, event.currentTarget));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
        />
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="my-1 h-px w-6 max-md:mx-1 max-md:my-0 max-md:h-6 max-md:w-px" style={{ background: theme.toolbar.border }} />;
}

function DividerBlock({ theme }: { theme: CanvasTheme }) {
    return <div className="my-1 h-px" style={{ background: theme.toolbar.border }} />;
}

function CanvasThemeButton({ colorTheme, targetTheme, onThemeChange, children }: { colorTheme: CanvasColorTheme; targetTheme: CanvasColorTheme; onThemeChange: (theme: CanvasColorTheme) => void; children: ReactNode }) {
    const theme = canvasThemes[colorTheme];
    const active = colorTheme === targetTheme;
    const activeStyle = colorTheme === "light" ? { background: "#111111", color: "#ffffff" } : { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <AnimatedThemeToggler
            theme={colorTheme}
            targetTheme={targetTheme}
            onThemeChange={onThemeChange}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition"
            style={active ? activeStyle : { color: theme.toolbar.item }}
            aria-label={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`}
            title={`切换到${targetTheme === "dark" ? "深色" : "浅色"}主题`}
        >
            {children}
        </AnimatedThemeToggler>
    );
}

function CanvasShortcutsModal({ open, theme, onClose }: { open: boolean; theme: CanvasTheme; onClose: () => void }) {
    const groups = [
        {
            title: "创作",
            items: [
                ["成组", "Ctrl/Alt + G"],
                ["合并分镜组", "Ctrl + Alt + G"],
                ["解组", "Ctrl/Alt + Shift + G"],
                ["连线", "Ctrl + L"],
                ["复制节点和连线", "Ctrl + D"],
                ["生成", "Ctrl + Enter"],
                ["新建节点", "Tab"],
                ["节点复制", "Alt + 拖动节点"],
                ["创建副本", "Ctrl + Alt + 拖动"],
            ],
        },
        {
            title: "缩放",
            items: [
                ["放大", "Ctrl + +"],
                ["缩小", "Ctrl + -"],
                ["适应画布", "Ctrl + 0"],
                ["触控板", "双指缩放"],
                ["鼠标", "Ctrl + 滚轮"],
            ],
        },
        {
            title: "移动画布",
            items: [
                ["键盘", "Space"],
                ["触控板", "双指拖移"],
                ["鼠标", "中键/空格拖移"],
                ["整理画布", "Alt + Shift + F"],
            ],
        },
        {
            title: "其他",
            items: [
                ["撤销", "Ctrl + Z"],
                ["重做", "Ctrl + Shift + Z"],
                ["删除", "Delete"],
            ],
        },
    ];

    if (!open) return null;

    return (
        <div className="creative-os-panel creative-os-shortcuts pointer-events-auto fixed left-1/2 top-1/2 z-40 w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 border p-5" style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}>
            <button type="button" className="creative-os-icon-button absolute right-3 top-3 !size-8 opacity-70 hover:opacity-100" onClick={onClose} aria-label="关闭快捷键">
                <X className="size-4" />
            </button>
            <div className="grid grid-cols-1 gap-5 pr-8 text-sm sm:grid-cols-2 xl:grid-cols-4">
                {groups.map((group) => (
                    <div key={group.title} className="min-w-0 border-r last:border-r-0" style={{ borderColor: theme.toolbar.border }}>
                        <div className="mb-4 text-sm font-semibold" style={{ color: theme.ui.accent }}>{group.title}</div>
                        <div className="space-y-3 pr-4">
                            {group.items.map(([label, value]) => (
                                <ShortcutLine key={label} label={label} value={value} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ShortcutLine({ label, value }: { label: string; value: string }) {
    const keys = value.split(" + ");
    return (
        <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 text-xs opacity-65">{label}</span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-xs" style={{ color: "var(--creative-text)" }}>
                {keys.map((key, index) => (
                    <span key={`${label}-${key}-${index}`} className="inline-flex items-center gap-1.5">
                        {index ? <span className="opacity-45">+</span> : null}
                        <span className="rounded-md px-2 py-1" style={{ background: "var(--creative-control-fill)" }}>{key}</span>
                    </span>
                ))}
            </span>
        </div>
    );
}


function DockTip({ label, position, theme }: { label: string; position: DockPosition; theme: CanvasTheme }) {
    return (
        <span
            className="canvas-toolbar-tip pointer-events-none absolute z-[60] whitespace-nowrap rounded-md px-2 py-1 text-xs shadow-lg"
            style={{ left: position.x, top: position.y, background: theme.node.text, color: theme.node.panel }}
        >
            {label}
        </span>
    );
}

function toolLabel(id: string) {
    if (id === 'tool-group') return '成组';
    if (id === 'tool-storyboard-group') return '分镜组';
    if (id === "tool-add") return "添加节点";
    if (id === "tool-material") return "素材库";
    if (id === "tool-workflow-toolbox") return "工具箱";
    if (id === "tool-undo") return "撤销";
    if (id === "tool-redo") return "重做";
    if (id === "tool-clear") return "清空画布";
    if (id === "tool-shortcuts") return "快捷键";
    if (id === "tool-style") return "画布外观";
    if (id === "tool-delete") return "删除选中";
    return "";
}

type DockPosition = { x: number; y: number };

function getDockPosition(wrap: HTMLDivElement | null, target: HTMLElement): DockPosition {
    if (!wrap) return { x: 0, y: 0 };
    const root = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return {
        x: box.left - root.left + box.width / 2,
        y: box.top - root.top + box.height / 2,
    };
}
