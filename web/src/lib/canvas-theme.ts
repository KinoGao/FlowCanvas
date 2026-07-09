export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#111111",
            dot: "rgba(255,255,255,.10)",
            line: "rgba(255,255,255,.025)",
            selectionStroke: "#8bdcff",
            selectionFill: "rgba(255,255,255,.08)",
        },
        node: {
            label: "#c8c8c8",
            fill: "#242424",
            panel: "#202020",
            stroke: "#3a3a3a",
            activeStroke: "#7dd3fc",
            placeholder: "#8a8a8a",
            text: "#f2f2f2",
            muted: "#b8b8b8",
            faint: "#666666",
        },
        toolbar: {
            panel: "rgba(32,32,32,.88)",
            border: "rgba(255,255,255,.12)",
            item: "#d0d0d0",
            itemHover: "rgba(125,211,252,.12)",
            activeBg: "rgba(125,211,252,.18)",
            activeText: "#ffffff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
