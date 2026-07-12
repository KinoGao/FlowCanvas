export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2f3f5",
            dot: "rgba(60,60,67,.20)",
            line: "rgba(60,60,67,.09)",
            selectionStroke: "#0a84ff",
            selectionFill: "rgba(10,132,255,.08)",
        },
        node: {
            label: "#3a3a3c",
            fill: "#f7f7f8",
            panel: "rgba(255,255,255,.94)",
            stroke: "rgba(60,60,67,.18)",
            activeStroke: "#0a84ff",
            placeholder: "#8e8e93",
            text: "#1d1d1f",
            muted: "#636366",
            faint: "#aeaeb2",
        },
        toolbar: {
            panel: "rgba(250,250,252,.82)",
            border: "rgba(60,60,67,.16)",
            item: "#48484a",
            itemHover: "rgba(118,118,128,.12)",
            activeBg: "rgba(10,132,255,.14)",
            activeText: "#0071e3",
        },
        ui: {
            material: "rgba(250,250,252,.78)",
            materialElevated: "rgba(255,255,255,.94)",
            hairline: "rgba(60,60,67,.16)",
            shadow: "0 18px 50px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)",
            accent: "#0a84ff",
            accentSoft: "rgba(10,132,255,.14)",
            controlFill: "rgba(118,118,128,.12)",
            danger: "#ff3b30",
        },
    },
    dark: {
        canvas: {
            background: "#111111",
            dot: "rgba(255,255,255,.10)",
            line: "rgba(255,255,255,.025)",
            selectionStroke: "#0a84ff",
            selectionFill: "rgba(10,132,255,.12)",
        },
        node: {
            label: "#d1d1d6",
            fill: "#242426",
            panel: "rgba(36,36,38,.96)",
            stroke: "rgba(255,255,255,.14)",
            activeStroke: "#0a84ff",
            placeholder: "#8e8e93",
            text: "#f5f5f7",
            muted: "#aeaeb2",
            faint: "#636366",
        },
        toolbar: {
            panel: "rgba(30,30,32,.78)",
            border: "rgba(255,255,255,.14)",
            item: "#d1d1d6",
            itemHover: "rgba(255,255,255,.10)",
            activeBg: "rgba(10,132,255,.22)",
            activeText: "#ffffff",
        },
        ui: {
            material: "rgba(30,30,32,.74)",
            materialElevated: "rgba(42,42,44,.94)",
            hairline: "rgba(255,255,255,.14)",
            shadow: "0 20px 56px rgba(0,0,0,.42), 0 2px 10px rgba(0,0,0,.24)",
            accent: "#0a84ff",
            accentSoft: "rgba(10,132,255,.22)",
            controlFill: "rgba(255,255,255,.10)",
            danger: "#ff453a",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
