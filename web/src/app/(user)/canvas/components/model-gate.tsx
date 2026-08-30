"use client";

import React, { createContext, useContext } from "react";
import { Button, Tooltip } from "antd";
import { CircleAlert, FlaskConical } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useModelFeatureAvailable } from "@/hooks/use-model-feature-available";
import { FEATURE_CAPABILITY_META, type CapabilityKey } from "../utils/canvas-model-gate";

type ModelCapabilityContextValue = {
    /** 打开设置面板的诊断/模型接入 tab（占位按钮会调用） */
    openSettings?: () => void;
};

const ModelCapabilityContext = createContext<ModelCapabilityContextValue>({});

/** 包住整个画布 shell，向 ModelGate 提供打开设置诊断的回调。 */
export function ModelCapabilityProvider({ children, openSettings }: { children: React.ReactNode; openSettings?: () => void }) {
    return <ModelCapabilityContext.Provider value={{ openSettings }}>{children}</ModelCapabilityContext.Provider>;
}

/** 依赖后端模型的某个功能未接入时的占位：清晰提示 + 打开设置诊断。 */
export function FeatureUnavailablePlaceholder({ feature }: { feature: CapabilityKey }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { openSettings } = useContext(ModelCapabilityContext);
    const meta = FEATURE_CAPABILITY_META[feature];

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 px-5 text-center"
            style={{ background: theme.node.fill, color: theme.node.text }}
        >
            <span className="grid size-10 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <CircleAlert className="size-5" />
            </span>
            <div className="text-xs font-medium">{meta.label} 模型未接入</div>
            <div className="max-w-[240px] text-[11px] leading-5 opacity-70">请联系管理员接入对应模型能力后使用</div>
            {openSettings ? (
                <Tooltip title="查看已接入的模型能力">
                    <Button
                        type="default"
                        size="small"
                        className="mt-1 rounded-full border text-xs"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        icon={<FlaskConical className="size-3.5" />}
                        onClick={(event) => {
                            event.stopPropagation();
                            openSettings();
                        }}
                    >
                        查看已接入模型
                    </Button>
                </Tooltip>
            ) : null}
        </div>
    );
}

/**
 * 能力门控：feature 可用时渲染 children，否则渲染「模型未接入」占位。
 * 用于依赖后端新模型的工作室/动作/创建入口。
 */
export function ModelGate({
    feature,
    children,
}: {
    feature: CapabilityKey;
    children: React.ReactNode;
}) {
    const { available } = useModelFeatureAvailable(feature);
    if (available) return <>{children}</>;
    return <FeatureUnavailablePlaceholder feature={feature} />;
}
