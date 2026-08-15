"use client";

import { ArrowRight, ArrowUpRight, FileText, Images, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Image, Tag } from "antd";
import { Link } from "react-router-dom";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

const QUICK_ENTRIES = [
    { to: "/canvas", label: "画布", icon: Maximize2 },
    { to: "/prompts", label: "提示词", icon: FileText },
    { to: "/assets", label: "素材", icon: Images },
] as const;

const SUGGESTIONS = ["生成一张科幻城市概念图", "制作一段产品宣传视频", "创作一个短剧分镜脚本"];

export default function IndexPage() {
    const { message } = App.useApp();
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    return (
        <main className="relative h-full overflow-y-auto bg-background text-foreground">
            <section className="relative mx-auto flex min-h-full max-w-6xl flex-col px-6 pb-20">
                {/* Hero：居中大标题 + 中央创作入口卡（对齐 VOZEB 首页） */}
                <div className="relative flex flex-col items-center pb-16 pt-24 text-center">
                    <span className="rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground shadow-sm">开源 · 无限画布 + 节点式工作流</span>
                    <h1 className="mt-8 max-w-4xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                        一块画布 完成所有{" "}
                        <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">AI 创作</span>
                    </h1>
                    <p className="mt-6 max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
                        编排节点、组合素材、批量生成，让创作从单次生成变成连续推演
                    </p>

                    <div className="mt-12 w-full max-w-3xl rounded-3xl border border-border bg-card p-5 text-left shadow-[0_24px_70px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.4)]">
                        <p className="px-1 text-sm text-muted-foreground">描述你想创作的内容，比如：</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {SUGGESTIONS.map((text) => (
                                <Link
                                    key={text}
                                    to="/canvas"
                                    className="rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                                >
                                    {text}
                                </Link>
                            ))}
                        </div>
                        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                            <div className="flex flex-wrap gap-2">
                                {QUICK_ENTRIES.map((entry) => (
                                    <Link
                                        key={entry.to}
                                        to={entry.to}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-2 text-sm text-foreground transition hover:bg-accent"
                                    >
                                        <entry.icon className="size-4" />
                                        {entry.label}
                                    </Link>
                                ))}
                            </div>
                            <Link
                                to="/canvas"
                                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-85"
                                aria-label="进入画布"
                                title="进入画布"
                            >
                                <ArrowUpRight className="size-5" />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* 提示词灵感 */}
                <section className="relative border-t border-border pt-12">
                    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight">沉淀每一次好结果</h2>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">收藏稳定出图的提示词、参考风格和结果图片，让下一次创作从已有经验开始。</p>
                        </div>
                        <Link to="/prompts" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
                            查看提示词库
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-muted text-left",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                {item.coverUrl ? (
                                    <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <span className="text-sm text-muted-foreground">暂无封面</span>
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {promptShowcase
                        .filter((item) => item.coverUrl)
                        .map((item) => (
                            <Image key={item.id} src={item.coverUrl} alt={item.title} />
                        ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
