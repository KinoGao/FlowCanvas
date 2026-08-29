"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Play, Square, Trash2, Wand2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

/** 本地 TTS（Qwen3-TTS）服务地址 */
const TTS_MAIN = "http://127.0.0.1:8880/v1";
const TTS_DESIGN = "http://127.0.0.1:8881";

/** 拉取本地 TTS 已注册的自定义音色名列表；服务未启动时返回空数组 */
export async function listCustomVoices(): Promise<string[]> {
    try {
        const resp = await fetch(`${TTS_MAIN}/audio/voices/custom`);
        if (!resp.ok) return [];
        const data = (await resp.json()) as { custom?: string[] };
        return Array.isArray(data.custom) ? data.custom : [];
    } catch {
        return [];
    }
}

export type VoiceManagerSectionProps = {
    /** 当前选中的音色 */
    voice: string;
    /** 选择音色 */
    onSelectVoice: (voice: string) => void;
};

type DesignState = { name: string; instructions: string; refLine: string; audioUrl: string | null; wavBlob: Blob | null };
type CloneState = { name: string; file: File | null; transcript: string };

/**
 * 音色管理：列表 / 语音设计（文字描述 → 新音色）/ 克隆（上传参考录音）。
 * 直连本地 TTS 服务（127.0.0.1:8880 主服务 + 8881 设计服务，CORS 已开放）。
 */
export function VoiceManagerSection({ voice, onSelectVoice }: VoiceManagerSectionProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [voices, setVoices] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [previewing, setPreviewing] = useState<string | null>(null); // 正在合成试听的音色
    const [playingVoice, setPlayingVoice] = useState<string | null>(null); // 正在播放试听的音色
    const previewRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
    const previewReqRef = useRef(0); // 单调递增请求序号：新试听/停止时作废在途请求
    const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);
    const [tab, setTab] = useState<"design" | "clone" | null>(null);
    const [design, setDesign] = useState<DesignState>({ name: "", instructions: "", refLine: "大家好，欢迎使用画布数字人配音，很高兴认识你。", audioUrl: null, wavBlob: null });
    const [clone, setClone] = useState<CloneState>({ name: "", file: null, transcript: "" });

    const refresh = useCallback(async () => {
        setVoices(await listCustomVoices());
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const saveVoice = useCallback(
        async (name: string, blob: Blob, transcript: string) => {
            setBusy("save");
            setNotice(null);
            try {
                const b64 = btoa(
                    new Uint8Array(await blob.arrayBuffer()).reduce((acc, byte) => {
                        acc.push(String.fromCharCode(byte));
                        return acc;
                    }, [] as string[]).join(""),
                );
                const resp = await fetch(`${TTS_MAIN}/audio/voices/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, ref_audio_b64: b64, ref_text: transcript }),
                });
                const body = await resp.json().catch(() => ({}));
                if (!resp.ok) throw new Error(body.detail || `HTTP ${resp.status}`);
                setNotice({ type: "ok", text: `音色「${name}」已保存` });
                onSelectVoice(name);
                await refresh();
                setTab(null);
                setDesign((current) => {
                    if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
                    return { name: "", instructions: "", refLine: "大家好，欢迎使用画布数字人配音，很高兴认识你。", audioUrl: null, wavBlob: null };
                });
                setClone({ name: "", file: null, transcript: "" });
            } catch (error) {
                setNotice({ type: "err", text: String(error instanceof Error ? error.message : error) });
            } finally {
                setBusy(null);
            }
        },
        [onSelectVoice, refresh],
    );

    const generateDesign = useCallback(async () => {
        if (!design.instructions.trim()) {
            setNotice({ type: "err", text: "请先填写音色描述" });
            return;
        }
        setBusy("design");
        setNotice(null);
        try {
            const resp = await fetch(`${TTS_DESIGN}/design`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instructions: design.instructions, ref_line: design.refLine }),
            });
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.detail || `HTTP ${resp.status}`);
            }
            const blob = await resp.blob();
            setDesign((current) => {
                if (current.audioUrl) URL.revokeObjectURL(current.audioUrl);
                return { ...current, wavBlob: blob, audioUrl: URL.createObjectURL(blob) };
            });
            setNotice({ type: "ok", text: "已生成，试听满意后点击保存" });
        } catch (error) {
            setNotice({ type: "err", text: String(error instanceof Error ? error.message : error) });
        } finally {
            setBusy(null);
        }
    }, [design.instructions, design.refLine]);

    const deleteVoice = useCallback(
        async (name: string) => {
            setBusy(`del-${name}`);
            setNotice(null);
            try {
                const resp = await fetch(`${TTS_MAIN}/audio/voices/${encodeURIComponent(name)}`, { method: "DELETE" });
                if (!resp.ok) {
                    const body = await resp.json().catch(() => ({}));
                    throw new Error(body.detail || `HTTP ${resp.status}`);
                }
                await refresh();
            } catch (error) {
                setNotice({ type: "err", text: `删除失败：${error instanceof Error ? error.message : error}` });
            } finally {
                setBusy(null);
            }
        },
        [refresh],
    );

    const stopPreview = useCallback(() => {
        previewReqRef.current += 1; // 作废在途试听请求
        previewRef.current?.audio.pause();
        if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
        previewRef.current = null;
        setPlayingVoice(null);
        setPreviewing(null);
    }, []);

    /** 试听音色：用该音色合成一句样例并播放；新试听/停止会作废旧请求，防止两段音频同时播放 */
    const previewVoice = useCallback(
        async (name: string) => {
            if (playingVoice === name) {
                stopPreview();
                return;
            }
            stopPreview();
            const reqId = ++previewReqRef.current;
            setPreviewing(name);
            setNotice(null);
            try {
                const resp = await fetch(`${TTS_MAIN}/audio/speech`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "qwen3-tts", voice: name, input: "你好，这是我的声音试听。", response_format: "wav" }),
                });
                if (!resp.ok) {
                    const body = await resp.json().catch(() => ({}));
                    throw new Error(body.detail || `HTTP ${resp.status}`);
                }
                const blob = await resp.blob();
                if (reqId !== previewReqRef.current) return; // 已被新试听/停止取代，丢弃
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                previewRef.current = { audio, url };
                audio.onended = () => stopPreview();
                setPlayingVoice(name);
                try {
                    await audio.play();
                } catch {
                    stopPreview(); // 自动播放被拒/解码失败：清状态并回收
                    throw new Error("播放被浏览器拦截，请再次点击试听");
                }
            } catch (error) {
                if (reqId === previewReqRef.current) setNotice({ type: "err", text: `试听失败：${error instanceof Error ? error.message : error}` });
            } finally {
                if (reqId === previewReqRef.current) setPreviewing(null);
            }
        },
        [playingVoice, stopPreview],
    );

    useEffect(() => () => stopPreview(), [stopPreview]);

    const inputStyle = { background: theme.ui.controlFill, borderColor: theme.ui.hairline, color: theme.node.text };

    return (
        <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: theme.ui.hairline }}>
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>
                    音色管理（本地）
                </span>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:opacity-80"
                        style={{ background: theme.toolbar.activeBg, color: theme.node.text }}
                        onClick={() => setTab(tab === "design" ? null : "design")}
                    >
                        <Wand2 className="size-3" /> 设计
                    </button>
                    <button
                        type="button"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:opacity-80"
                        style={{ background: theme.toolbar.activeBg, color: theme.node.text }}
                        onClick={() => setTab(tab === "clone" ? null : "clone")}
                    >
                        <Mic className="size-3" /> 克隆
                    </button>
                </div>
            </div>

            {voices.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {voices.map((name) => (
                        <span key={name} className="group/voice inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: voice === name ? theme.ui.accent : theme.ui.hairline, color: theme.node.text }}>
                            <button
                                type="button"
                                title={playingVoice === name ? "停止试听" : "试听"}
                                className="opacity-70 transition hover:opacity-100"
                                disabled={previewing === name}
                                onClick={() => void previewVoice(name)}
                            >
                                {previewing === name ? <Loader2 className="size-3 animate-spin" /> : playingVoice === name ? <Square className="size-3" /> : <Play className="size-3" />}
                            </button>
                            <button type="button" className="max-w-[120px] truncate" onClick={() => onSelectVoice(name)} title="使用这个音色">
                                {name}
                                {voice === name ? " ✓" : ""}
                            </button>
                            <button
                                type="button"
                                title="删除"
                                className="opacity-40 transition hover:opacity-100"
                                disabled={busy === `del-${name}`}
                                onClick={() => void deleteVoice(name)}
                            >
                                {busy === `del-${name}` ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                            </button>
                        </span>
                    ))}
                </div>
            ) : (
                <div className="mb-2 text-xs" style={{ color: theme.node.faint }}>
                    暂无自定义音色，可通过「设计」或「克隆」创建
                </div>
            )}

            {tab === "design" ? (
                <div className="space-y-1.5 rounded-md border p-2" style={{ borderColor: theme.ui.hairline }}>
                    <input className="w-full rounded-md border px-2 py-1 text-xs outline-none" style={inputStyle} placeholder="音色名（英文/拼音，如 warm-male）" value={design.name} onChange={(e) => setDesign((c) => ({ ...c, name: e.target.value }))} />
                    <textarea className="w-full resize-none rounded-md border px-2 py-1 text-xs outline-none" rows={2} style={inputStyle} placeholder="音色描述，如：沉稳的中年男声，低沉有磁性，语速适中" value={design.instructions} onChange={(e) => setDesign((c) => ({ ...c, instructions: e.target.value }))} />
                    <textarea className="w-full resize-none rounded-md border px-2 py-1 text-xs outline-none" rows={2} style={inputStyle} placeholder="采样文本（用来生成音色参考片段）" value={design.refLine} onChange={(e) => setDesign((c) => ({ ...c, refLine: e.target.value }))} />
                    <div className="flex items-center gap-2">
                        <button type="button" disabled={busy === "design"} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition hover:opacity-80 disabled:opacity-50" style={{ background: theme.toolbar.activeBg, color: theme.node.text }} onClick={() => void generateDesign()}>
                            {busy === "design" ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />} 生成试听
                        </button>
                        {design.audioUrl ? <audio controls src={design.audioUrl} className="h-8 max-w-[180px]" /> : null}
                        <button
                            type="button"
                            disabled={!design.wavBlob || !design.name.trim() || busy === "save"}
                            className="ml-auto rounded-md px-2.5 py-1 text-xs transition hover:opacity-80 disabled:opacity-50"
                            style={{ background: theme.ui.accent, color: theme.canvas.background }}
                            onClick={() => design.wavBlob && void saveVoice(design.name.trim(), design.wavBlob, design.refLine)}
                        >
                            保存音色
                        </button>
                    </div>
                </div>
            ) : null}

            {tab === "clone" ? (
                <div className="space-y-1.5 rounded-md border p-2" style={{ borderColor: theme.ui.hairline }}>
                    <input className="w-full rounded-md border px-2 py-1 text-xs outline-none" style={inputStyle} placeholder="音色名（英文/拼音，如 my-voice）" value={clone.name} onChange={(e) => setClone((c) => ({ ...c, name: e.target.value }))} />
                    <input
                        type="file"
                        accept="audio/*"
                        className="w-full text-xs"
                        style={{ color: theme.node.muted }}
                        onChange={(e) => setClone((c) => ({ ...c, file: e.target.files?.[0] || null }))}
                    />
                    <div className="text-[10px]" style={{ color: theme.node.faint }}>
                        5-15 秒清晰录音，安静环境效果最佳
                    </div>
                    <textarea className="w-full resize-none rounded-md border px-2 py-1 text-xs outline-none" rows={2} style={inputStyle} placeholder="录音的文字内容（可选，提高相似度）" value={clone.transcript} onChange={(e) => setClone((c) => ({ ...c, transcript: e.target.value }))} />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            disabled={!clone.file || !clone.name.trim() || busy === "save"}
                            className="rounded-md px-2.5 py-1 text-xs transition hover:opacity-80 disabled:opacity-50"
                            style={{ background: theme.ui.accent, color: theme.canvas.background }}
                            onClick={() => clone.file && void saveVoice(clone.name.trim(), clone.file, clone.transcript)}
                        >
                            {busy === "save" ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
                            保存音色
                        </button>
                    </div>
                </div>
            ) : null}

            {notice ? (
                <div className="mt-1.5 text-xs" style={{ color: notice.type === "ok" ? theme.node.muted : "#f87171" }}>
                    {notice.text}
                </div>
            ) : null}
        </div>
    );
}
