export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

/**
 * 黑白液态玻璃主题：仅黑/白/灰阶，无彩色。
 * 材质面（material/panel/fill）保持半透明，配合全局 .creative-os-* 的 backdrop-blur 呈现玻璃质感；
 * 高光用白色细描边（浅色主题用黑色细描边），accent 统一收敛为黑（浅色）/ 白（深色）。
 */
export const canvasThemes = {
    light: {
        canvas: {
            background: "#ececee",
            dot: "rgba(0,0,0,.14)",
            line: "rgba(0,0,0,.06)",
            selectionStroke: "#111113",
            selectionFill: "rgba(0,0,0,.06)",
        },
        node: {
            label: "#3a3a3c",
            fill: "rgba(255,255,255,.72)",
            panel: "rgba(255,255,255,.68)",
            stroke: "rgba(255,255,255,.65)",
            activeStroke: "#111113",
            placeholder: "#8e8e93",
            text: "#111113",
            muted: "#5c5c60",
            faint: "#aeaeb2",
        },
        toolbar: {
            panel: "rgba(255,255,255,.60)",
            border: "rgba(255,255,255,.70)",
            item: "#3a3a3c",
            itemHover: "rgba(0,0,0,.06)",
            activeBg: "rgba(0,0,0,.10)",
            activeText: "#111113",
        },
        ui: {
            material: "rgba(255,255,255,.58)",
            materialElevated: "rgba(255,255,255,.78)",
            hairline: "rgba(255,255,255,.70)",
            shadow: "0 24px 60px rgba(0,0,0,.16), 0 2px 10px rgba(0,0,0,.06), inset 0 1px 0 rgba(255,255,255,.85)",
            accent: "#111113",
            accentSoft: "rgba(0,0,0,.08)",
            controlFill: "rgba(0,0,0,.06)",
            danger: "#2c2c2e",
        },
        connection: {
            color: "rgba(60,60,64,.55)",
            activeColor: "#111113",
            width: 2.4,
            activeWidth: 3.1,
            tempWidth: 2.6,
            dash: [84, 240] as const,
        },
    },
    dark: {
        canvas: {
            background: "#050506",
            dot: "rgba(255,255,255,.22)",
            line: "rgba(255,255,255,.03)",
            selectionStroke: "#fafafa",
            selectionFill: "rgba(255,255,255,.08)",
        },
        node: {
            label: "#d4d4d8",
            fill: "rgba(18,18,20,.72)",
            panel: "rgba(14,14,16,.66)",
            stroke: "rgba(255,255,255,.14)",
            activeStroke: "#fafafa",
            placeholder: "#71717a",
            text: "#fafafa",
            muted: "#a1a1aa",
            faint: "#636366",
        },
        toolbar: {
            panel: "rgba(12,12,14,.58)",
            border: "rgba(255,255,255,.12)",
            item: "#d4d4d8",
            itemHover: "rgba(255,255,255,.10)",
            activeBg: "rgba(255,255,255,.14)",
            activeText: "#fafafa",
        },
        ui: {
            material: "rgba(12,12,14,.55)",
            materialElevated: "rgba(28,28,30,.78)",
            hairline: "rgba(255,255,255,.12)",
            shadow: "0 28px 70px rgba(0,0,0,.55), 0 2px 12px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.16)",
            accent: "#fafafa",
            accentSoft: "rgba(255,255,255,.12)",
            controlFill: "rgba(255,255,255,.10)",
            danger: "#e4e4e7",
        },
        connection: {
            color: "rgba(212,212,220,.70)",
            activeColor: "#ffffff",
            width: 2.4,
            activeWidth: 3.1,
            tempWidth: 2.6,
            dash: [84, 240] as const,
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
