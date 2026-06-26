"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Square, Video, Workflow } from "lucide-react";
import { Button, Input, InputNumber, Segmented, Select, Switch } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { listComfyWorkflows, type ComfyWorkflow, type ComfyWorkflowField } from "@/services/comfyui-workflows";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputs: NodeGenerationInput[];
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputs, inputSummary, onConfigChange, onGenerate, onStop, onComposerToggle }: CanvasConfigNodePanelProps) {
    const globalConfig = useEffectiveConfig();
    const comfyui = useConfigStore((state) => state.comfyui);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const config = buildNodeConfig(globalConfig, node, mode);
    const [workflows, setWorkflows] = useState<ComfyWorkflow[]>([]);
    const selectedWorkflow = useMemo(() => workflows.find((workflow) => workflow.id === (node.metadata?.comfyWorkflowId || comfyui.defaultWorkflowId)) || workflows[0], [comfyui.defaultWorkflowId, node.metadata?.comfyWorkflowId, workflows]);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const credits = mode === "comfyui" ? 0 : requestCreditCost({ channelMode: config.channelMode, model: config.model, count: mode === "image" ? count : 1 });
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const canGenerate = mode === "comfyui" ? Boolean(selectedWorkflow) : hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);

    useEffect(() => {
        void listComfyWorkflows().then(setWorkflows);
    }, [mode]);

    useEffect(() => {
        if (mode === "comfyui" && selectedWorkflow && !node.metadata?.comfyWorkflowId && !comfyui.defaultWorkflowId) {
            onConfigChange(node.id, { comfyWorkflowId: selectedWorkflow.id });
        }
    }, [comfyui.defaultWorkflowId, mode, node.id, node.metadata?.comfyWorkflowId, onConfigChange, selectedWorkflow]);

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="shrink-0 text-sm font-semibold">生成配置</div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={mode}
                        onChange={(value) => onConfigChange(node.id, { generationMode: value as CanvasGenerationMode })}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="size-3.5" />
                                        生图
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        文本
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-3.5" />
                                        视频
                                    </span>
                                ),
                            },
                            {
                                value: "audio",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Music2 className="size-3.5" />
                                        音频
                                    </span>
                                ),
                            },
                            {
                                value: "comfyui",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Workflow className="size-3.5" />
                                        ComfyUI
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
                <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
                <InputChip label="参考音频" value={`${inputSummary.audioCount} 个`} style={chipStyle} />
                <button type="button" className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px]" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}>
                    <Settings2 className="size-3.5" />
                    组装提示词
                </button>
            </div>

            <div className={`mb-2 grid min-w-0 cursor-default items-center gap-2 ${mode === "image" || mode === "video" || mode === "audio" ? "grid-cols-[minmax(0,1fr)_148px]" : "grid-cols-1"}`} onMouseDown={(event) => event.stopPropagation()}>
                {mode === "comfyui" ? (
                    <ComfyWorkflowControls node={node} workflows={workflows} selectedWorkflow={selectedWorkflow} inputs={inputs} onConfigChange={onConfigChange} />
                ) : (
                    <>
                        <ModelPicker className="canvas-compact-control h-10" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
                        {mode === "video" ? (
                            <CanvasVideoSettingsPopover
                                config={config}
                                placement="topRight"
                                buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                            />
                        ) : mode === "image" ? (
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topRight"
                                autoAdjustOverflow={false}
                                buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                            />
                        ) : mode === "audio" ? (
                            <CanvasAudioSettingsPopover
                                config={config}
                                placement="topRight"
                                buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))}
                            />
                        ) : null}
                    </>
                )}
            </div>

            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg"
                danger={isRunning}
                disabled={!isRunning && !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
            >
                <span className="inline-flex items-center gap-1.5">
                    {isRunning ? (
                        <>
                            <LoaderCircle className="size-4 animate-spin" />
                            <Square className="size-3.5 fill-current" />
                            <span>停止</span>
                        </>
                    ) : (
                        <>
                            {mode === "comfyui" ? (
                                <span>本地工作流</span>
                            ) : (
                                <span className="inline-flex items-center gap-1">
                                    <CreditSymbol />
                                    {credits.toLocaleString()}
                                </span>
                            )}
                            <Play className="size-4" />
                            <span>开始生成</span>
                        </>
                    )}
                </span>
            </Button>
        </div>
    );
}

function ComfyWorkflowControls({
    node,
    workflows,
    selectedWorkflow,
    inputs,
    onConfigChange,
}: {
    node: CanvasNodeData;
    workflows: ComfyWorkflow[];
    selectedWorkflow?: ComfyWorkflow;
    inputs: NodeGenerationInput[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
}) {
    const values = node.metadata?.comfyFieldValues || {};
    const updateValue = (field: ComfyWorkflowField, value: unknown) => {
        onConfigChange(node.id, { comfyFieldValues: { ...values, [field.id]: value } });
    };

    return (
        <div className="grid min-w-0 gap-2">
            <Select
                className="canvas-compact-control h-10"
                popupMatchSelectWidth={false}
                placeholder="选择 ComfyUI 工作流"
                value={selectedWorkflow?.id}
                options={workflows.map((workflow) => ({ label: workflow.title, value: workflow.id }))}
                onChange={(comfyWorkflowId) => onConfigChange(node.id, { comfyWorkflowId })}
            />
            {selectedWorkflow?.fields.length ? (
                <div className="grid max-h-60 gap-2 overflow-y-auto pr-1">
                    {selectedWorkflow.fields.map((field) => (
                        <div key={field.id} className="grid gap-1 text-[11px]">
                            <span className="truncate opacity-70">{field.name || field.input}</span>
                            <ComfyFieldControl field={field} value={values[field.id] ?? field.default} inputs={inputs} onChange={(value) => updateValue(field, value)} />
                        </div>
                    ))}
                </div>
            ) : selectedWorkflow ? (
                <div className="text-[11px] opacity-50">该工作流没有暴露参数，请在 ComfyUI 管理页面配置</div>
            ) : null}
        </div>
    );
}

function ComfyFieldControl({ field, value, inputs, onChange }: { field: ComfyWorkflowField; value: unknown; inputs: NodeGenerationInput[]; onChange: (value: unknown) => void }) {
    if (field.type === "boolean") return <Switch size="small" checked={Boolean(value)} onChange={onChange} />;
    if (field.type === "number") return <InputNumber className="w-full" value={Number(value) || 0} onChange={(next) => onChange(Number(next) || 0)} />;
    if (field.type === "slider") return <InputNumber className="w-full" min={field.min ?? undefined} max={field.max ?? undefined} step={field.step ?? undefined} value={Number(value) || 0} onChange={(next) => onChange(Number(next) || 0)} />;
    if (field.type === "dropdown") return <Select value={String(value ?? "")} options={(field.options || []).map((option) => ({ label: option, value: option }))} onChange={onChange} />;
    if (field.type === "textarea") return <Input.TextArea autoSize={{ minRows: 2 }} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
    if (field.type === "image" || field.type === "video" || field.type === "audio") {
        const fieldType = field.type;
        const matched = inputs.filter((input) => input.type === fieldType);
        const currentValue = String(value ?? "");
        const isNodeRef = currentValue.startsWith("@[node:");
        return (
            <Select
                className="w-full"
                placeholder={matched.length ? "选择上游节点" : `没有可用的上游${fieldType === "image" ? "图片" : fieldType === "video" ? "视频" : "音频"}节点`}
                value={isNodeRef ? currentValue : undefined}
                options={matched.map((input) => ({ label: input.title, value: `@[node:${input.nodeId}]` }))}
                allowClear
                onChange={(next) => onChange(next ?? "")}
            />
        );
    }
    return <Input.TextArea autoSize={{ minRows: 1 }} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    return {
        ...globalConfig,
        model: node.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
