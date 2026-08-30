"use client";

import { Alert, Switch, Tag, Tooltip } from "antd";
import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";

import { useFeatureCapabilities } from "@/hooks/use-model-feature-available";
import { invalidateFeatureCapabilities } from "@/services/api/feature-capabilities";
import { clearFrontendFeatureOverrides, readFrontendFeatureOverrides, writeFrontendFeatureOverride } from "@/constant/feature-flags";
import { CAPABILITY_KEYS, FEATURE_CAPABILITY_META, type CapabilityKey } from "@/app/(user)/canvas/utils/canvas-model-gate";

/**
 * 设置面板「模型接入 / 功能开关」区。
 * 依赖后端模型的功能（人物替换/视频复刻/声音工作室/绿幕/补帧高清/RunningHub）
 * 在未接后端时默认「未接入」。这里允许用前端覆盖开关临时开启以验证完整前端；
 * 后端真正接入后，开关与「未接入」标签会随 /api/model-capabilities/features 自动更新。
 */
export function CanvasFeatureFlagsPane() {
    const { flags, data, isLoading } = useFeatureCapabilities();
    const [frontend, setFrontend] = useState<ReturnType<typeof readFrontendFeatureOverrides>>(() => readFrontendFeatureOverrides());

    const refresh = () => setFrontend(readFrontendFeatureOverrides());

    const toggle = (key: CapabilityKey, enabled: boolean) => {
        writeFrontendFeatureOverride(key, enabled);
        refresh();
        invalidateFeatureCapabilities();
    };

    const clearAll = () => {
        clearFrontendFeatureOverrides();
        refresh();
        invalidateFeatureCapabilities();
    };

    // data 变化（后端接入）后刷新前端覆盖读数
    useEffect(() => {
        refresh();
    }, [data]);

    const activeCount = CAPABILITY_KEYS.filter((key) => frontend[key] !== undefined).length;

    return (
        <div className="space-y-4">
            <Alert
                type="info"
                showIcon
                icon={<FlaskConical className="size-4" />}
                message="模型接入 / 功能开关"
                description="以下创作能力依赖后端模型。未接入时在画布中显示「模型未接入」占位；开启前端开关可临时验证完整前端，后端接入后自动按真实能力启用。"
            />

            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">已开启覆盖：{activeCount} / {CAPABILITY_KEYS.length}</span>
                {activeCount > 0 ? (
                    <button type="button" className="text-xs text-red-500 hover:underline" onClick={clearAll}>
                        清除全部前端覆盖
                    </button>
                ) : null}
            </div>

            <div className="grid gap-2">
                {CAPABILITY_KEYS.map((key) => {
                    const meta = FEATURE_CAPABILITY_META[key];
                    const source = frontend[key] !== undefined ? "frontend" : data?.[key] === true ? "backend" : "default";
                    const available = flags[key] === true;
                    return (
                        <div key={key} className="flex items-start justify-between gap-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{meta.label}</span>
                                    <Tag
                                        color={available ? "green" : source === "frontend" ? "orange" : "default"}
                                        className="m-0 text-[11px]"
                                    >
                                        {source === "frontend" ? "前端覆盖" : source === "backend" ? "已接入" : "未接入"}
                                    </Tag>
                                </div>
                                <div className="mt-0.5 text-xs text-gray-500">{meta.description}</div>
                            </div>
                            <Tooltip title={isLoading ? "加载中" : source === "default" ? "后端未接入，可临时开启前端覆盖" : "前端覆盖开启后优先于后端能力标记"}>
                                <Switch
                                    checked={available}
                                    loading={isLoading}
                                    onChange={(checked) => toggle(key, checked)}
                                    checkedChildren="开"
                                    unCheckedChildren="关"
                                />
                            </Tooltip>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
