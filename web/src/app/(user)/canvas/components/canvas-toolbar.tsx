import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, Segmented, Switch } from "antd";
import {
    BookOpen,
    Boxes,
    CircleDot,
    Clapperboard,
    Clock3,
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
    Settings2,
    Sparkles,
    Square,
    Sun,
    Trash2,
    Type,
    Undo2,
    Upload,
    UserRound,
    Video,
    WandSparkles,
    Wrench,
} from "lucide-react";

import { canvasThemes, type CanvasBackgroundMode, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export function CanvasToolbar({
    selectedCount,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddScript,
    onAddConfig,
    onAddVideoComposition,
    onAddDirector,
    onAddPanorama360,
    onUndo,
    onRedo,
    onUpload,
    onDelete,
    onClear,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onOpenMyAssets,
    onOpenMaterialLibrary,
    onOpenGenerationHistory,
    onTutorialAction,
    assetPanelOpen = false,
}: {
    selectedCount: number;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddScript: () => void;
    onAddConfig: () => void;
    onAddVideoComposition: () => void;
    onAddDirector: () => void;
    onAddPanorama360: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenMyAssets: () => void;
    onOpenMaterialLibrary: (tab?: "styles" | "effects" | "assets") => void;
    onOpenGenerationHistory: () => void;
    onTutorialAction: (action: "guide" | "support" | "sales" | "wechat") => void;
    assetPanelOpen?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const [hovered, setHovered] = useState<string | null>(null);
    const [tipX, setTipX] = useState(0);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [materialOpen, setMaterialOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [toolboxOpen, setToolboxOpen] = useState(false);
    const [characterOpen, setCharacterOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [panelX, setPanelX] = useState(0);
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 14px 36px rgba(0,0,0,.30)" : "0 14px 34px rgba(28,25,23,.10)" };
    const hoverStyle = { background: theme.toolbar.itemHover, color: theme.toolbar.activeText };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const tip = hovered ? toolLabel(hovered) : "";

    const closeDockPopovers = () => {
        setAddMenuOpen(false);
        setAppearanceOpen(false);
        setMaterialOpen(false);
        setHistoryOpen(false);
        setShortcutsOpen(false);
        setTutorialOpen(false);
    };

    const openPanelAt = (event: ReactMouseEvent<HTMLElement>, panel: "add" | "appearance" | "material" | "history" | "tutorial") => {
        setShortcutsOpen(false);
        setPanelX(getTipX(wrapRef.current, event.currentTarget));
        setAddMenuOpen(panel === "add" ? (value) => !value : false);
        setAppearanceOpen(panel === "appearance" ? (value) => !value : false);
        setMaterialOpen(panel === "material" ? (value) => !value : false);
        setHistoryOpen(panel === "history" ? (value) => !value : false);
        setTutorialOpen(panel === "tutorial" ? (value) => !value : false);
    };

    useEffect(() => {
        if (assetPanelOpen) closeDockPopovers();
    }, [assetPanelOpen]);

    return (
        <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-50 flex justify-center px-4">
            {tip ? <DockTip label={tip} x={tipX} theme={theme} /> : null}
            <div ref={wrapRef} className="thin-scrollbar pointer-events-auto flex h-12 max-w-full items-center gap-1 overflow-x-auto rounded-xl border px-2 backdrop-blur-xl [&>*]:shrink-0" style={dockStyle}>
                <ToolbarButton id="tool-add" label="添加节点" active={addMenuOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={(event) => openPanelAt(event, "add")}>
                    <Plus className="size-5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-toolbox" label="工具箱" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => { closeDockPopovers(); setToolboxOpen(true); }}>
                    <Wrench className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-material" label="素材库" active={materialOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={(event) => openPanelAt(event, "material")}>
                    <Boxes className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-character" label="角色库" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => { closeDockPopovers(); setCharacterOpen(true); }}>
                    <UserRound className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-history" label="历史" active={historyOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={(event) => openPanelAt(event, "history")}>
                    <Clock3 className="size-4.5" />
                </ToolbarButton>
                <Divider theme={theme} />
                <ToolbarButton id="tool-shortcuts" label="快捷键" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={() => { closeDockPopovers(); setShortcutsOpen(true); }}>
                    <Keyboard className="size-4.5" />
                </ToolbarButton>
                <ToolbarButton id="tool-tutorial" label="教程" active={tutorialOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={(event) => openPanelAt(event, "tutorial")}>
                    <BookOpen className="size-4.5" />
                </ToolbarButton>
                {selectedCount ? (
                    <>
                        <Divider theme={theme} />
                        <ToolbarButton id="tool-delete" label="删除选中" hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={onDelete} danger>
                            <Trash2 className="size-4.5" />
                        </ToolbarButton>
                    </>
                ) : null}
                <Divider theme={theme} />
                <ToolbarButton id="tool-style" label="画布外观" active={appearanceOpen} activeStyle={activeStyle} hovered={hovered} hoverStyle={hoverStyle} wrapRef={wrapRef} onTipX={setTipX} onHover={setHovered} onClick={(event) => openPanelAt(event, "appearance")}>
                    <Palette className="size-4.5" />
                </ToolbarButton>
            </div>

            {!assetPanelOpen && addMenuOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[64px] z-30 w-[196px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl"
                    style={{ left: panelX || "50%", background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <div className="px-2 pb-2 text-xs font-medium opacity-60">添加节点</div>
                    <AddNodeOption theme={theme} icon={<Type className="size-4" />} label="文本" onClick={onAddText} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<ImageIcon className="size-4" />} label="图片" onClick={onAddImage} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Video className="size-4" />} label="视频" onClick={onAddVideo} onClose={() => setAddMenuOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Settings2 className="size-4" />} label="生成配置" onClick={onAddConfig} onClose={() => setAddMenuOpen(false)} />
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
                    className="pointer-events-auto absolute bottom-[64px] z-30 w-[196px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl"
                    style={{ left: panelX || "50%", background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <AddNodeOption theme={theme} icon={<Sparkles className="size-4" />} label="风格库" tag="NEW" onClick={() => onOpenMaterialLibrary("styles")} onClose={() => setMaterialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<WandSparkles className="size-4" />} label="效果库" tag="NEW" onClick={() => onOpenMaterialLibrary("effects")} onClose={() => setMaterialOpen(false)} />
                    <DividerBlock theme={theme} />
                    <AddNodeOption theme={theme} icon={<FolderOpen className="size-4" />} label="我的素材" onClick={() => onOpenMaterialLibrary("assets")} onClose={() => setMaterialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Upload className="size-4" />} label="上传" onClick={onUpload} onClose={() => setMaterialOpen(false)} />
                </div>
            ) : null}

            {!assetPanelOpen && historyOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[64px] z-30 w-[196px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl"
                    style={{ left: panelX || "50%", background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <AddNodeOption theme={theme} icon={<Undo2 className="size-4" />} label="撤销" disabled={!canUndo} onClick={onUndo} onClose={() => setHistoryOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Redo2 className="size-4" />} label="重做" disabled={!canRedo} onClick={onRedo} onClose={() => setHistoryOpen(false)} />
                    <DividerBlock theme={theme} />
                    <AddNodeOption theme={theme} icon={<Eraser className="size-4" />} label="清空画布" danger onClick={onClear} onClose={() => setHistoryOpen(false)} />
                </div>
            ) : null}

            {!assetPanelOpen && tutorialOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[64px] z-30 w-[196px] -translate-x-1/2 rounded-2xl border p-2 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl"
                    style={{ left: panelX || "50%", background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <AddNodeOption theme={theme} icon={<BookOpen className="size-4" />} label="使用教程" onClick={() => onTutorialAction("guide")} onClose={() => setTutorialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Info className="size-4" />} label="联系客服" onClick={() => onTutorialAction("support")} onClose={() => setTutorialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Sparkles className="size-4" />} label="联系销售" onClick={() => onTutorialAction("sales")} onClose={() => setTutorialOpen(false)} />
                    <AddNodeOption theme={theme} icon={<Palette className="size-4" />} label="关注公众号" onClick={() => onTutorialAction("wechat")} onClose={() => setTutorialOpen(false)} />
                </div>
            ) : null}

            {!assetPanelOpen && appearanceOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[64px] z-30 w-[248px] -translate-x-1/2 rounded-2xl border p-2.5 shadow-[0_18px_46px_rgba(0,0,0,.30)] backdrop-blur-xl"
                    style={{ left: panelX || "50%", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
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
                            <Info className="size-3.5" />
                            图片信息
                        </span>
                        <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
                    </div>
                </div>
            ) : null}

            <CanvasToolboxModal open={toolboxOpen} theme={theme} onClose={() => setToolboxOpen(false)} onUse={onAddConfig} />
            <CanvasCharacterModal open={characterOpen} theme={theme} onClose={() => setCharacterOpen(false)} onOpenMyAssets={onOpenMyAssets} />
            <CanvasShortcutsModal open={!assetPanelOpen && shortcutsOpen} theme={theme} onClose={() => setShortcutsOpen(false)} />
        </div>
    );
}

function AddNodeOption({ theme, icon, label, tag, disabled = false, danger = false, onClick, onClose }: { theme: CanvasTheme; icon: ReactNode; label: string; tag?: string; disabled?: boolean; danger?: boolean; onClick: () => void; onClose: () => void }) {
    return (
        <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled}
            style={{ color: danger ? "#f87171" : theme.node.text }}
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
    onTipX,
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
    onTipX: (x: number) => void;
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
            className="!h-8 !w-8 !min-w-8 !rounded-md !p-0"
            disabled={disabled}
            style={active ? activeStyle : hovered === id && !disabled ? hoverStyle : { color: danger ? "#f87171" : theme.toolbar.item, opacity: disabled ? 0.35 : 1 }}
            icon={children}
            onMouseEnter={(event) => {
                onHover(id);
                onTipX(getTipX(wrapRef.current, event.currentTarget));
            }}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
        />
    );
}

function Divider({ theme }: { theme: CanvasTheme }) {
    return <div className="mx-1 h-6 w-px" style={{ background: theme.toolbar.border }} />;
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

function CanvasToolboxModal({ open, theme, onClose, onUse }: { open: boolean; theme: CanvasTheme; onClose: () => void; onUse: () => void }) {
    const presets = [
        { title: "周星驰经典名场面", accent: "#5f4033" },
        { title: "电影手机弹出效果", accent: "#64748b" },
        { title: "咖啡杯出场", accent: "#7c6f64" },
        { title: "360旋转展示", accent: "#b84f9f" },
        { title: "机械臂视角", accent: "#7f5af0" },
        { title: "Live 2D", accent: "#8b5cf6" },
    ];

    return (
        <Modal open={open} centered width={480} footer={null} onCancel={onClose} title={null} styles={{ body: { background: theme.node.panel, color: theme.node.text, padding: 16 } }}>
            <div className="mb-4 flex items-center gap-3">
                <div className="text-base font-semibold">我的工具箱</div>
                <div className="rounded-lg px-2 py-1 text-sm opacity-70" style={{ background: theme.toolbar.itemHover }}>周星驰经典名场面</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                {presets.map((preset) => (
                    <button key={preset.title} type="button" className="group min-w-0 text-left" onClick={() => { onUse(); onClose(); }}>
                        <span className="relative block aspect-square overflow-hidden rounded-lg" style={{ background: `linear-gradient(135deg, ${preset.accent}, ${theme.node.fill})` }}>
                            <span className="absolute inset-0 grid place-items-center bg-black/0 text-[13px] font-medium text-white opacity-0 transition group-hover:bg-black/65 group-hover:opacity-100">使用</span>
                        </span>
                        <span className="mt-1 line-clamp-2 block px-1 text-xs leading-snug text-white/70">【预设】{preset.title}</span>
                    </button>
                ))}
            </div>
        </Modal>
    );
}

function CanvasCharacterModal({ open, theme, onClose, onOpenMyAssets }: { open: boolean; theme: CanvasTheme; onClose: () => void; onOpenMyAssets: () => void }) {
    return (
        <Modal open={open} centered width={560} footer={null} onCancel={onClose} title={null} styles={{ body: { background: theme.node.panel, color: theme.node.text, padding: 16 } }}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <div className="text-base font-semibold">角色库</div>
                    <div className="mt-1 text-xs opacity-55">管理角色形象，并应用到画布节点</div>
                </div>
                <Button size="small" onClick={() => { onOpenMyAssets(); onClose(); }}>打开我的素材</Button>
            </div>
            <div className="grid grid-cols-[160px_1fr] gap-4">
                <div className="aspect-[3/4] rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }} />
                <div className="flex min-w-0 flex-col gap-2">
                    {["默认角色", "写实", "电影感", "可复用"].map((tag) => (
                        <span key={tag} className="w-fit rounded-lg px-2 py-1 text-xs" style={{ background: theme.toolbar.itemHover }}>{tag}</span>
                    ))}
                    <div className="mt-auto text-sm opacity-60">当前项目还没有角色素材。可以先从素材库导入图片，或把画布节点保存到我的素材。</div>
                </div>
            </div>
        </Modal>
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
        <div className="pointer-events-auto absolute bottom-[64px] left-1/2 z-40 w-[min(96vw,1120px)] -translate-x-1/2 rounded-2xl border p-6 shadow-[0_18px_46px_rgba(0,0,0,.32)] backdrop-blur-xl" style={{ background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <button type="button" className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-lg leading-none opacity-70 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label="关闭快捷键">
                ×
            </button>
            <div className="grid grid-cols-4 gap-5 pr-8 text-sm">
                {groups.map((group) => (
                    <div key={group.title} className="min-w-0 border-r last:border-r-0" style={{ borderColor: theme.toolbar.border }}>
                        <div className="mb-4 text-sm font-semibold text-cyan-300">{group.title}</div>
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
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-xs" style={{ color: "#f5f5f5" }}>
                {keys.map((key, index) => (
                    <span key={`${label}-${key}-${index}`} className="inline-flex items-center gap-1.5">
                        {index ? <span className="opacity-45">+</span> : null}
                        <span className="rounded-md px-2 py-1" style={{ background: themeChipBg() }}>{key}</span>
                    </span>
                ))}
            </span>
        </div>
    );
}

function themeChipBg() {
    return "rgba(255,255,255,.08)";
}

function DockTip({ label, x, theme }: { label: string; x: number; theme: CanvasTheme }) {
    return (
        <span className="absolute bottom-[calc(100%+8px)] -translate-x-1/2 rounded-md px-2 py-1 text-xs shadow-lg" style={{ left: x, background: theme.node.text, color: theme.node.panel }}>
            {label}
        </span>
    );
}

function toolLabel(id: string) {
    if (id === "tool-add") return "添加节点";
    if (id === "tool-toolbox") return "工具箱";
    if (id === "tool-material") return "素材库";
    if (id === "tool-character") return "角色库";
    if (id === "tool-history") return "历史";
    if (id === "tool-shortcuts") return "快捷键";
    if (id === "tool-tutorial") return "教程";
    if (id === "tool-style") return "画布外观";
    if (id === "tool-delete") return "删除选中";
    return "";
}

function getTipX(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}
