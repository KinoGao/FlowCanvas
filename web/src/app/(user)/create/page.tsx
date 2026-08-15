"use client";

import { App, Dropdown, Empty, Image as AntImage, Spin } from "antd";
import { AudioLines, Clapperboard, ImagePlus, LoaderCircle, MessageSquarePlus, Plus, Sparkles, Trash2, Video, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveMediaUrl } from "@/services/file-storage";
import { deleteBackendGenerationLog, fetchBackendGenerationLogs, putBackendGenerationLog } from "@/services/api/backend-storage";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { cn } from "@/lib/utils";
import { CREATE_AGENT_SYSTEM_PROMPT, newCreateReference, runCreateAgentTurn, runCreateGeneration, type CreateAttachment, type CreateMediaKind, type CreateMode, type CreateReference } from "./create-agent-runner";
import type { ResponseInputMessage } from "@/services/api/image";

type CreateMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    references?: CreateReference[];
    attachments?: CreateAttachment[];
    status?: "streaming" | "done" | "error";
    createdAt: number;
};

type CreateSession = {
    id: string;
    title: string;
    messages: CreateMessage[];
    createdAt: number;
    updatedAt: number;
};

const MODE_OPTIONS: Array<{ value: CreateMode; label: string; icon: typeof Sparkles }> = [
    { value: "agent", label: "智能模式", icon: Sparkles },
    { value: "image", label: "AI 绘图", icon: ImagePlus },
    { value: "video", label: "AI 视频", icon: Clapperboard },
    { value: "audio", label: "AI 音频", icon: AudioLines },
];

function createEmptySession(): CreateSession {
    const now = Date.now();
    return { id: nanoid(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}

/** 生成产物附件：storageKey 重新签名解析，签名 URL 过期也能显示。 */
function AttachmentView({ attachment }: { attachment: CreateAttachment }) {
    const [src, setSrc] = useState(attachment.url);
    useEffect(() => {
        let cancelled = false;
        if (attachment.storageKey) {
            void resolveMediaUrl(attachment.storageKey, attachment.url).then((resolved) => {
                if (!cancelled && resolved) setSrc(resolved);
            });
        }
        return () => {
            cancelled = true;
        };
    }, [attachment.storageKey, attachment.url]);
    if (attachment.kind === "image") return <AntImage src={src} alt={attachment.name || "生成的图片"} className="max-h-72 rounded-xl border border-border object-cover" />;
    if (attachment.kind === "video") return <video src={src} controls className="max-h-72 rounded-xl border border-border" />;
    return <audio src={src} controls className="w-72 max-w-full" />;
}

export default function CreatePage() {
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const token = useUserStore((state) => state.token);

    const [sessions, setSessions] = useState<CreateSession[]>([]);
    const [activeId, setActiveId] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [input, setInput] = useState("");
    const [mode, setMode] = useState<CreateMode>("agent");
    const [references, setReferences] = useState<CreateReference[]>([]);
    const [running, setRunning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const activeSession = useMemo(() => sessions.find((session) => session.id === activeId) ?? null, [sessions, activeId]);

    // 会话列表从账号工作区恢复（复用 generation-logs 通道，kind=chat）
    useEffect(() => {
        if (!token || loaded) return;
        void fetchBackendGenerationLogs<CreateSession>(token, "chat")
            .then((items) => {
                const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
                setSessions(sorted);
                setActiveId(sorted[0]?.id ?? "");
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "创作会话加载失败"))
            .finally(() => setLoaded(true));
    }, [token, loaded, message]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [activeSession?.messages.length, activeSession?.messages[activeSession.messages.length - 1]?.content]);

    const persistSession = (session: CreateSession) => {
        if (!token) return;
        void putBackendGenerationLog(token, "chat", session.id, session).catch(() => message.warning("会话保存失败，请检查后端连接"));
    };

    const updateSession = (id: string, updater: (session: CreateSession) => CreateSession, persist = false) => {
        setSessions((current) => {
            const next = current.map((session) => (session.id === id ? { ...updater(session), updatedAt: Date.now() } : session));
            if (persist) {
                const changed = next.find((session) => session.id === id);
                if (changed) persistSession(changed);
            }
            return next;
        });
    };

    const createSession = () => {
        const session = createEmptySession();
        setSessions((current) => [session, ...current]);
        setActiveId(session.id);
        persistSession(session);
    };

    const removeSession = (session: CreateSession) => {
        modal.confirm({
            title: "删除这个对话？",
            content: `「${session.title}」的 ${session.messages.length} 条消息将被删除。`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: () => {
                setSessions((current) => current.filter((item) => item.id !== session.id));
                if (activeId === session.id) setActiveId((current) => (current === session.id ? "" : current));
                if (token) void deleteBackendGenerationLog(token, "chat", session.id).catch(() => {});
            },
        });
    };

    const addReferenceFiles = (files: FileList | File[]) => {
        Array.from(files)
            .filter((file) => file.type.startsWith("image/"))
            .forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = typeof reader.result === "string" ? reader.result : "";
                    if (dataUrl) setReferences((current) => [...current, newCreateReference(file.name, dataUrl)]);
                };
                reader.readAsDataURL(file);
            });
    };

    const ensureConfig = (checkModel: string) => {
        if (isAiConfigReady(effectiveConfig, checkModel)) return true;
        message.warning("请先完成模型配置");
        openConfigDialog(true);
        return false;
    };

    const send = async () => {
        const text = input.trim();
        if (!text || running) return;
        const checkModel = mode === "agent" ? effectiveConfig.textModel || effectiveConfig.model : mode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : mode === "video" ? effectiveConfig.videoModel || effectiveConfig.model : effectiveConfig.audioModel || effectiveConfig.model;
        if (!ensureConfig(checkModel)) return;

        let session = activeSession;
        if (!session) {
            session = createEmptySession();
            setSessions((current) => [session!, ...current]);
            setActiveId(session.id);
        }
        const sessionId = session.id;
        const turnReferences = references;
        const userMessage: CreateMessage = { id: nanoid(), role: "user", content: text, references: turnReferences.length ? turnReferences : undefined, status: "done", createdAt: Date.now() };
        const assistantId = nanoid();
        const assistantMessage: CreateMessage = { id: assistantId, role: "assistant", content: "", status: "streaming", createdAt: Date.now() };
        const title = session.messages.length ? session.title : text.slice(0, 24);
        updateSession(sessionId, (current) => ({ ...current, title, messages: [...current.messages, userMessage, assistantMessage] }));
        setInput("");
        setReferences([]);
        setRunning(true);

        try {
            if (mode === "agent") {
                const history: ResponseInputMessage[] = [
                    { role: "system", content: CREATE_AGENT_SYSTEM_PROMPT },
                    ...session.messages.slice(-16).map((item) => ({
                        role: item.role,
                        content: item.content + (item.attachments?.length ? `\n（本条已生成 ${item.attachments.length} 个附件）` : ""),
                    })),
                ];
                const result = await runCreateAgentTurn({
                    config: effectiveConfig,
                    history,
                    userText: text,
                    references: turnReferences,
                    onDelta: (streamed) => {
                        updateSession(sessionId, (current) => ({
                            ...current,
                            messages: current.messages.map((item) => (item.id === assistantId ? { ...item, content: streamed } : item)),
                        }));
                    },
                });
                updateSession(
                    sessionId,
                    (current) => ({
                        ...current,
                        messages: current.messages.map((item) => (item.id === assistantId ? { ...item, content: result.content || "已完成。", attachments: result.attachments.length ? result.attachments : undefined, status: "done" } : item)),
                    }),
                    true,
                );
            } else {
                const produced = await runCreateGeneration(mode as CreateMediaKind, effectiveConfig, text, turnReferences);
                updateSession(
                    sessionId,
                    (current) => ({
                        ...current,
                        messages: current.messages.map((item) => (item.id === assistantId ? { ...item, content: `已生成 ${produced.length} 个${MODE_OPTIONS.find((option) => option.value === mode)?.label.replace("AI ", "") ?? "结果"}`, attachments: produced, status: "done" } : item)),
                    }),
                    true,
                );
            }
        } catch (error) {
            updateSession(
                sessionId,
                (current) => ({
                    ...current,
                    messages: current.messages.map((item) => (item.id === assistantId ? { ...item, content: error instanceof Error ? error.message : "生成失败", status: "error" } : item)),
                }),
                true,
            );
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex h-full overflow-hidden bg-background text-foreground">
            {/* 会话栏 */}
            <aside className="hidden w-60 shrink-0 flex-col border-r border-border md:flex">
                <div className="border-b border-border p-3">
                    <button type="button" onClick={createSession} className="btn-solid-primary flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:opacity-85">
                        <MessageSquarePlus className="size-4" />
                        新建对话
                    </button>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveId(session.id)}
                            onKeyDown={(event) => event.key === "Enter" && setActiveId(session.id)}
                            className={cn(
                                "group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition",
                                session.id === activeId ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                        >
                            <span className="min-w-0 flex-1 truncate">{session.title}</span>
                            <button
                                type="button"
                                className="shrink-0 opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                                aria-label="删除对话"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeSession(session);
                                }}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                    {loaded && !sessions.length ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无历史对话</p> : null}
                </div>
            </aside>

            {/* 对话区 */}
            <div className="flex min-w-0 flex-1 flex-col">
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                    {!activeSession || !activeSession.messages.length ? (
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                            <span className="grid size-12 place-items-center rounded-2xl border border-border bg-card shadow-sm">
                                <Sparkles className="size-5 text-muted-foreground" />
                            </span>
                            <h1 className="mt-5 text-2xl font-semibold tracking-tight">统一创作 Agent</h1>
                            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">文字问答、图片、视频和音频在同一个对话里完成；也可以切换下方模式直接生成。</p>
                        </div>
                    ) : (
                        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
                            {activeSession.messages.map((item) => (
                                <div key={item.id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                                    <div className={cn("max-w-[85%]", item.role === "user" ? "rounded-2xl rounded-br-md bg-muted px-4 py-3" : "px-1")}>
                                        {item.references?.length ? (
                                            <div className="mb-2 flex flex-wrap gap-2">
                                                {item.references.map((reference) => (
                                                    <img key={reference.id} src={reference.dataUrl} alt={reference.name} className="h-16 w-16 rounded-lg border border-border object-cover" />
                                                ))}
                                            </div>
                                        ) : null}
                                        {item.content ? <p className={cn("whitespace-pre-wrap text-sm leading-6", item.status === "error" && "text-red-500")}>{item.content}</p> : null}
                                        {item.status === "streaming" && !item.content ? (
                                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <LoaderCircle className="size-4 animate-spin" />
                                                正在思考与创作…
                                            </p>
                                        ) : null}
                                        {item.attachments?.length ? (
                                            <div className="mt-2 flex flex-wrap gap-3">
                                                {item.attachments.map((attachment, index) => (
                                                    <AttachmentView key={`${item.id}-${index}`} attachment={attachment} />
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Composer */}
                <div className="shrink-0 px-4 pb-4">
                    <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                        {references.length ? (
                            <div className="flex flex-wrap gap-2 px-1 pb-2">
                                {references.map((reference) => (
                                    <span key={reference.id} className="relative">
                                        <img src={reference.dataUrl} alt={reference.name} className="h-14 w-14 rounded-lg border border-border object-cover" />
                                        <button type="button" className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-foreground text-background" aria-label="移除参考图" onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}>
                                            <X className="size-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <textarea
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    void send();
                                }
                            }}
                            onPaste={(event) => {
                                const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                                if (files.length) {
                                    event.preventDefault();
                                    addReferenceFiles(files);
                                }
                            }}
                            rows={3}
                            placeholder={mode === "agent" ? "描述你想创作的内容，Enter 发送…" : "输入生成提示词，Enter 发送…"}
                            className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/60"
                        />
                        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                                {MODE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setMode(option.value)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
                                            mode === option.value ? "btn-solid-primary font-medium" : "bg-muted text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        <option.icon className="size-3.5" />
                                        {option.label}
                                    </button>
                                ))}
                                <button type="button" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground" onClick={() => fileInputRef.current?.click()} title="添加参考图" aria-label="添加参考图">
                                    <Plus className="size-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                disabled={!input.trim() || running}
                                onClick={() => void send()}
                                className="btn-solid-primary grid size-9 shrink-0 place-items-center rounded-full transition hover:opacity-85 disabled:opacity-40"
                                aria-label="发送"
                                title="发送"
                            >
                                {running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addReferenceFiles(event.target.files ?? []); event.target.value = ""; }} />
        </div>
    );
}
