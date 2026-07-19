"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, BadgePlus, Camera, ChevronDown, FileText, Languages, LoaderCircle, Maximize2, Sparkles, Square, Tag } from 'lucide-react';
import { App, Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea, normalizeAdjacentMentionLabels } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { useVideoModelCapability } from '@/hooks/use-video-model-capability';
import type { VideoGenerationMode } from '@/services/api/model-capabilities';

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const { capability: videoCapability } = useVideoModelCapability(config.model);
    const selectedVideoMode = supportedVideoMode(node.metadata?.videoGenerationMode, videoCapability?.modes);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [videoModeOpen, setVideoModeOpen] = useState(false);
    const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
    const mentionLabels = useMemo(() => Array.from(new Set(mentionReferences.filter((item) => item.active).map((item) => item.label))).sort((a, b) => b.length - a.length), [mentionReferences]);
    useEffect(() => {
        const rawPrompt = isEditingExistingContent ? "" : node.metadata?.prompt || "";
        const nextPrompt = normalizePromptReferences(rawPrompt, mentionReferences, mentionLabels);
        setPrompt((current) => (current === nextPrompt ? current : nextPrompt));
        if (!isEditingExistingContent && nextPrompt !== rawPrompt && node.metadata?.prompt !== nextPrompt) onPromptChange(node.id, nextPrompt);
    }, [isEditingExistingContent, mentionLabels, mentionReferences, node.id, node.metadata?.prompt, onPromptChange]);

    useEffect(() => {
        textareaRef.current?.focus();
    }, [node.id]);

    const updatePrompt = (value: string) => {
        const nextPrompt = normalizePromptReferences(value, mentionReferences, mentionLabels);
        setPrompt((current) => (current === nextPrompt ? current : nextPrompt));
        if (!isEditingExistingContent && node.metadata?.prompt !== nextPrompt) onPromptChange(node.id, nextPrompt);
    };

    const submit = () => {
        const text = normalizePromptReferences(prompt, mentionReferences, mentionLabels).trim();
        if (!text || isRunning) return;
        if (mode !== "comfyui" && !isAiConfigReady(config, config.model)) {
            message.warning("\u5f53\u524d\u6a21\u578b\u6e20\u9053\u7f3a\u5c11 API Key\uff0c\u8bf7\u5148\u5b8c\u6210\u6e20\u9053\u914d\u7f6e");
            openConfigDialog(true);
            return;
        }
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    return (
        <div
            className="creative-os-composer min-w-0 overflow-hidden border px-4 py-3"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
        >
            <div className="relative">
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    value={prompt}
                    references={mentionReferences}
                    onChange={updatePrompt}
                    onSubmit={submit}
                    className="h-[92px] w-full resize-none border-0 bg-transparent px-0 pb-3 pr-8 pt-0 text-[14px] leading-6 outline-none placeholder:opacity-35"
                    style={{ color: theme.node.text }}
                    placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
                />
                <button
                    type="button"
                    className="creative-os-icon-button absolute right-0 top-0 !size-7"
                    aria-label="展开输入框"
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Maximize2 className="size-4" />
                </button>
            </div>

            <div className="creative-os-composer-actions flex min-w-0 items-center gap-2 border-t pt-2" style={{ borderColor: theme.ui.hairline }}>
                <div className="canvas-composer-tools flex min-w-0 flex-1 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <div className="w-[150px] shrink-0">
                                <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                            </div>
                            <CanvasImageSettingsPopover
                                config={config}
                                referenceCount={mentionReferences.filter((reference) => reference.active && reference.kind === "image").length}
                                placement="topLeft"
                                buttonClassName="!h-8 !max-w-[150px] !justify-start !rounded-[8px] !border-transparent !px-2.5"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <div className="w-[150px] shrink-0">
                                <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                            </div>
                            <VideoGenerationModeMenu
                                open={videoModeOpen}
                                theme={theme}
                                value={selectedVideoMode}
                                modes={videoCapability?.modes || ['text-to-video']}
                                onOpenChange={(open) => {
                                    setVideoModeOpen(open);
                                    if (open) {
                                        setVideoSettingsOpen(false);
                                    }
                                }}
                                onChange={(value) => onConfigChange(node.id, { videoGenerationMode: value })}
                            />
                            <CanvasVideoSettingsPopover
                                config={config}
                                placement="bottomRight"
                                open={videoSettingsOpen}
                                buttonClassName="!h-8 !max-w-[200px] !justify-start !rounded-[8px] !border-transparent !px-2.5"
                                onOpenChange={(open) => {
                                    setVideoSettingsOpen(open);
                                    if (open) {
                                        setVideoModeOpen(false);
                                    }
                                }}
                                onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                            />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <div className="w-[150px] shrink-0">
                                <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                            </div>
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-8 !max-w-[150px] !justify-start !rounded-[8px] !border-transparent !px-2.5" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <div className="w-[150px] shrink-0">
                            <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                        </div>
                    )}
                </div>
                <button type="button" className="creative-os-icon-button !size-8" aria-label="翻译" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <Languages className="size-4" />
                </button>
                <Button
                    type="primary"
                    className="creative-os-primary-action !h-9 !min-w-9 shrink-0 !rounded-full !px-0"
                    danger={isRunning}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={isRunning ? "停止生成" : "生成"}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">停止</span>
                            </>
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
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
        videoDraft: node.metadata?.draft || globalConfig.videoDraft || defaultConfig.videoDraft,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

const VIDEO_GENERATION_MODES: Record<VideoGenerationMode, { label: string; icon: ReactNode }> = {
    "text-to-video": { label: "文生视频", icon: <FileText className="size-3.5" /> },
    "all-in-one-reference": { label: "全能参考", icon: <BadgePlus className="size-3.5" /> },
    "image-to-video": { label: "图生视频", icon: <Camera className="size-3.5" /> },
    "first-last-frame": { label: "首尾帧", icon: <Sparkles className="size-3.5" /> },
    "image-reference": { label: "图片参考", icon: <Tag className="size-3.5" /> },
};

function supportedVideoMode(value: VideoGenerationMode | undefined, modes: VideoGenerationMode[] | undefined): VideoGenerationMode {
    const supported: VideoGenerationMode[] = modes?.length ? modes : ["text-to-video"];
    return value && supported.includes(value) ? value : supported[0];
}

function VideoGenerationModeMenu({ open, value, modes, theme, onOpenChange, onChange }: { open: boolean; value: VideoGenerationMode; modes: VideoGenerationMode[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onOpenChange: (open: boolean) => void; onChange: (value: VideoGenerationMode) => void }) {
    const items = modes.map((mode) => ({ value: mode, ...VIDEO_GENERATION_MODES[mode] }));
    const selected = items.find((item) => item.value === value) || items[0] || { value: "text-to-video" as const, ...VIDEO_GENERATION_MODES["text-to-video"] };
    return (
        <div className="relative shrink-0" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold" style={{ background: theme.node.fill, color: theme.node.text }} onClick={() => onOpenChange(!open)}>
                {selected.icon}
                <span>{selected.label}</span>
                <ChevronDown className="size-3 opacity-70" />
            </button>
            {open ? (
                <div className="absolute bottom-full left-0 z-[1300] mb-2 w-[198px] rounded-2xl border p-2 shadow-2xl" style={{ background: theme.toolbar.panel, borderColor: theme.ui.hairline, color: theme.node.text }}>
                    <div className="px-2 pb-2 pt-1 text-xs" style={{ color: theme.node.muted }}>视频生成模式</div>
                    {items.map((item) => (
                        <button key={item.value} type="button" className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:opacity-85" style={{ background: item.value === selected.value ? theme.node.fill : "transparent", color: theme.node.text }} onClick={() => { onChange(item.value); onOpenChange(false); }}>
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述你想要生成的画面内容，@引用素材";
    if (mode === "audio") return "描述想要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想把这张图修改成什么" : "描述想要生成的图片内容";
    return hasTextContent ? "请输入你想要将这段文本修改成什么" : "写下你想讲的故事、场景或角色设定";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "count") return { count: Number(value) || 1 };
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoDraft") return { draft: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}

function normalizePromptReferences(value: string, references: CanvasResourceReference[], labels: string[]) {
    let next = normalizeAdjacentMentionLabels(value, labels);
    references
        .filter((reference) => reference.active && reference.kind === "text" && reference.text?.trim())
        .forEach((reference) => {
            const text = reference.text?.trim();
            if (!text) return;
            const label = `《${reference.label}》`;
            const textIndex = next.lastIndexOf(text);
            if (textIndex < 0) return;
            const prefix = next.slice(0, textIndex);
            if (!prefix.includes(label) || next.slice(textIndex).trim() !== text) return;
            next = prefix.trimEnd();
        });
    return next;
}
