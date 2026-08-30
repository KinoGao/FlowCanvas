import { create } from "zustand";

export const CANVAS_SIDE_PANEL_MOTION_MS = 500;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 220;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 480;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 280;

const WIDTH_KEY = "canvas-side-panel-width";
const OPEN_KEY = "canvas-side-panel-open";
const SIDE_KEY = "canvas-side-panel-side";

function initialWidth() {
    if (typeof window === "undefined") return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    if (!stored) return CANVAS_SIDE_PANEL_DEFAULT_WIDTH;
    return Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH, Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH, stored));
}

function initialOpen() {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(OPEN_KEY) !== "0";
}

function initialSide(): "left" | "right" {
    if (typeof window === "undefined") return "left";
    return localStorage.getItem(SIDE_KEY) === "right" ? "right" : "left";
}

type CanvasSidePanelStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    side: "left" | "right";
    setWidth: (width: number) => void;
    setSide: (side: "left" | "right") => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
};

/** 画布左侧资产面板状态（对齐 infinite-canvas 上游）：开合/挂载/宽度，宽度与开合状态持久化。 */
export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    width: initialWidth(),
    panelOpen: initialOpen(),
    panelMounted: initialOpen(),
    panelClosing: false,
    side: initialSide(),
    setWidth: (width) => set({ width }),
    setSide: (side) => {
        if (typeof window !== "undefined") localStorage.setItem(SIDE_KEY, side);
        set({ side });
    },
    openPanel: () => {
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "1");
        set({ panelOpen: true, panelMounted: true, panelClosing: false });
    },
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "0");
        set({ panelOpen: false, panelClosing: true });
        setTimeout(() => {
            if (get().panelClosing) set({ panelMounted: false, panelClosing: false });
        }, CANVAS_SIDE_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
}));
