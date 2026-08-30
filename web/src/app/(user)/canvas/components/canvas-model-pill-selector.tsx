"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Cpu } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

/**
 * SHUO 风格药丸模型选择器：一个「provider 图标 + 模型名 + caret」的药丸触发按钮，
 * 点击弹出模型列表。替代 Ant Select `ModelPicker`，观感对齐 SHUO 的 `.img-pill-btn` + `.floating-menu`。
 * 逻辑复用 `selectableModelsByCapability` / `modelOptionLabel`，互斥事件复用 `model-picker-open`。
 */
type CanvasModelPillSelectorProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    disabled?: boolean;
    className?: string;
    onMissingConfig?: () => void;
};

export function CanvasModelPillSelector({ config, value, onChange, capability, disabled = false, className = "", onMissingConfig }: CanvasModelPillSelectorProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const pickerId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);

    const models = useMemo(
        () => Array.from(new Set([value, ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))),
        [capability, config, value],
    );
    const current = value || "";
    const showEmpty = models.length === 0;

    useEffect(() => {
        const closeOther = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOther);
        return () => window.removeEventListener("model-picker-open", closeOther);
    }, [pickerId]);

    useEffect(() => {
        if (!open) return;
        const syncRect = () => setRect(triggerRef.current?.getBoundingClientRect() || null);
        const closeOutside = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) return;
            setOpen(false);
        };
        const syncScroll = () => setRect(triggerRef.current?.getBoundingClientRect() || null);
        syncRect();
        window.addEventListener("resize", syncRect);
        window.addEventListener("scroll", syncScroll, true);
        window.addEventListener("pointerdown", closeOutside, true);
        return () => {
            window.removeEventListener("resize", syncRect);
            window.removeEventListener("scroll", syncScroll, true);
            window.removeEventListener("pointerdown", closeOutside, true);
        };
    }, [open]);

    const toggle = (next: boolean) => {
        if (next) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
        setOpen(next);
        if (next && showEmpty) onMissingConfig?.();
    };

    const menuStyle = {
        position: "fixed" as const,
        zIndex: 1300,
        width: 320,
        top: rect ? rect.bottom + 8 : 0,
        left: rect ? Math.max(12, Math.min(window.innerWidth - 332, rect.left)) : 0,
        background: theme.ui.materialElevated,
        border: `1px solid ${theme.ui.hairline}`,
        borderRadius: 10,
        boxShadow: theme.ui.shadow,
        color: theme.node.text,
        backdropFilter: "blur(20px) saturate(1.2)",
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                data-canvas-no-zoom
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 pr-2 text-xs transition disabled:opacity-40 ${className}`}
                style={{ background: theme.toolbar.panel, borderColor: theme.ui.hairline, color: theme.node.text }}
                onClick={() => toggle(!open)}
                onMouseDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : "选择模型"}
            >
                <ModelIcon model={current} />
                <span className="max-w-40 truncate">{current ? modelOptionLabel(config, current) : "选择模型"}</span>
                <ChevronDown className={`size-3.5 shrink-0 opacity-60 transition ${open ? "rotate-180" : ""}`} />
            </button>

            {open && rect
                ? createPortal(
                      <div ref={menuRef} data-canvas-no-zoom className="thin-scrollbar max-h-80 overflow-y-auto p-1.5" style={menuStyle} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                          {showEmpty ? (
                              <div className="px-2.5 py-3 text-xs opacity-70">{emptyModelLabel(config, capability)}</div>
                          ) : (
                              models.map((model) => (
                                  <button
                                      key={model}
                                      type="button"
                                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${model === current ? "font-medium" : ""}`}
                                      style={{ color: model === current ? theme.ui.accent : theme.node.text, background: model === current ? theme.toolbar.activeBg : undefined }}
                                      onMouseEnter={(event) => (event.currentTarget.style.background = model === current ? theme.toolbar.activeBg : theme.toolbar.itemHover)}
                                      onMouseLeave={(event) => (event.currentTarget.style.background = model === current ? theme.toolbar.activeBg : "transparent")}
                                      onClick={() => {
                                          onChange(model);
                                          setOpen(false);
                                      }}
                                  >
                                      <ModelIcon model={model} />
                                      <span className="min-w-0 flex-1 truncate">{modelOptionLabel(config, model)}</span>
                                  </button>
                              ))
                          )}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability === "image" ? "生图" : capability === "video" ? "视频" : capability === "text" ? "文本" : capability === "audio" ? "音频" : "";
    if (capability && config.models.length) return "请先在上方配置可选模型";
    return config.models.length ? `暂无匹配的${label}模型` : "请先到配置里添加渠道和模型";
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}
