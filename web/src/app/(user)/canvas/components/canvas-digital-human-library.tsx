"use client";

import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { ImagePlus, LoaderCircle, Plus, Trash2, UserRound } from "lucide-react";
import { nanoid } from "nanoid";

import type { canvasThemes } from "@/lib/canvas-theme";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useConfigStore, type CanvasDigitalHuman } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { listCustomVoices } from "./canvas-voice-manager";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];

/** 分身缩略图：storageKey 走签名 URL 解析（后端存储会过期，需动态重签） */
function PersonaThumb({ persona, theme }: { persona: CanvasDigitalHuman; theme: Theme }) {
    const [src, setSrc] = useState(persona.imageUrl);
    useEffect(() => {
        let cancelled = false;
        if (persona.storageKey) {
            void resolveImageUrl(persona.storageKey, persona.imageUrl).then((url) => {
                if (!cancelled && url) setSrc(url);
            });
        }
        return () => {
            cancelled = true;
        };
    }, [persona.imageUrl, persona.storageKey]);
    return (
        <div className="aspect-[3/4] w-full overflow-hidden" style={{ background: theme.toolbar.itemHover }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={persona.name} className="size-full object-cover" />
        </div>
    );
}

/** 数字人资产库：管理分身形象照（+ 关联音色），可一键插入画布供「数字人分身口播」工作流引用 */
export function DigitalHumanPanel({ theme, onInsert, compact = false }: { theme: Theme; onInsert: (persona: CanvasDigitalHuman) => void; compact?: boolean }) {
    const { message } = App.useApp();
    const personas = useConfigStore((state) => state.config.digitalHumans) || [];
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [voices, setVoices] = useState<string[]>([]);
    const [name, setName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [adding, setAdding] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        void listCustomVoices().then((list) => {
            if (!cancelled) setVoices(list);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const addPersona = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning("先给分身起个名字");
            return;
        }
        if (!file) {
            message.warning("请选择一张分身形象照（正脸清晰、光线好）");
            return;
        }
        const token = useUserStore.getState().token.trim();
        if (!token) {
            message.warning("请先登录后端账号，再上传形象照");
            return;
        }
        setAdding(true);
        try {
            // 与画布图片同一存储通道（后端存储 + 签名 URL），避免 public-image 返回公网隧道地址导致本地无法加载
            const uploaded = await uploadImage(file);
            const persona: CanvasDigitalHuman = {
                id: nanoid(8),
                name: trimmed,
                imageUrl: uploaded.url,
                storageKey: uploaded.storageKey,
                naturalWidth: uploaded.width || undefined,
                naturalHeight: uploaded.height || undefined,
                createdAt: new Date().toISOString(),
            };
            updateConfig("digitalHumans", [persona, ...personas]);
            setName("");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            message.success(`已添加数字人「${trimmed}」`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "形象照上传失败");
        } finally {
            setAdding(false);
        }
    };

    const setPersonaVoice = (id: string, voice: string) => {
        updateConfig(
            "digitalHumans",
            personas.map((item) => (item.id === id ? { ...item, voice: voice || undefined } : item)),
        );
    };

    const removePersona = (persona: CanvasDigitalHuman) => {
        updateConfig(
            "digitalHumans",
            personas.filter((item) => item.id !== persona.id),
        );
        message.success(`已删除数字人「${persona.name}」`);
    };

    const inputStyle = { background: theme.node.fill, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text };

    return (
        <div className="space-y-4">
            {/* 新增分身 */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="分身名称（如：我的分身）"
                    className="h-8 min-w-40 flex-1 rounded-lg px-2 text-xs outline-none"
                    style={inputStyle}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        setFile(event.target.files?.[0] || null);
                        event.target.value = "";
                    }}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs"
                    style={inputStyle}
                >
                    <ImagePlus className="size-3.5" />
                    {file ? file.name : "选择形象照"}
                </button>
                <button
                    type="button"
                    disabled={adding}
                    onClick={() => void addPersona()}
                    className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-white disabled:opacity-60"
                    style={{ background: theme.toolbar.activeBg }}
                >
                    {adding ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    添加
                </button>
            </div>

            {/* 分身列表 */}
            {personas.length === 0 ? (
                <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed p-8 text-center" style={{ borderColor: theme.toolbar.border }}>
                    <div>
                        <UserRound className="mx-auto mb-3 size-8 opacity-45" />
                        <div className="text-sm font-medium">还没有数字人分身</div>
                        <div className="mt-2 text-xs leading-5 opacity-55">
                            上传一张正脸形象照创建分身，插入画布后
                            <br />
                            用「数字人分身口播（本地 InfiniteTalk）」工作流生成说话视频
                        </div>
                    </div>
                </div>
            ) : (
                <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
                    {personas.map((persona) => (
                        <div key={persona.id} className="group min-w-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                            <div className="relative">
                                <PersonaThumb persona={persona} theme={theme} />
                                <button
                                    type="button"
                                    onClick={() => removePersona(persona)}
                                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                                    title="删除分身"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                            <div className="space-y-2 p-2.5">
                                <div className="truncate text-sm font-medium">{persona.name}</div>
                                <select
                                    value={persona.voice || ""}
                                    onChange={(event) => setPersonaVoice(persona.id, event.target.value)}
                                    className="h-7 w-full rounded-lg px-1.5 text-[11px] outline-none"
                                    style={inputStyle}
                                    title="关联音色（配音时默认使用）"
                                >
                                    <option value="">未关联音色</option>
                                    {voices.map((voice) => (
                                        <option key={voice} value={voice}>
                                            {voice}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => onInsert(persona)}
                                    className="h-7 w-full rounded-lg text-[11px] font-medium text-white"
                                    style={{ background: theme.toolbar.activeBg }}
                                >
                                    插入画布
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
