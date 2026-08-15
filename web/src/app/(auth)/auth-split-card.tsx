"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const SELLING_POINTS = ["无限画布与节点式工作流", "图片、视频与音频统一创作", "画布项目与提示词复用"];

/** 登录/注册共用的双栏卡片布局（对齐 VOZEB 认证页：左侧品牌卖点，右侧表单）。 */
export function AuthSplitCard({ eyebrow, title, subtitle, children, footer }: { eyebrow: string; title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-muted/50 px-4 py-10 text-foreground">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.4)] md:grid-cols-2">
                <div className="relative flex flex-col border-b border-border bg-muted/40 p-8 md:border-b-0 md:border-r md:p-10">
                    <div className="flex items-center justify-between gap-3">
                        <Link to="/" className="flex items-center gap-2 transition hover:opacity-70">
                            <span
                                className="size-6 shrink-0 bg-current"
                                style={{
                                    mask: "url(/logo.svg) center / contain no-repeat",
                                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                }}
                            />
                            <span className="text-lg font-medium tracking-tight">FlowCanvas</span>
                        </Link>
                        <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground">
                            <ArrowLeft className="size-3.5" />
                            返回首页
                        </Link>
                    </div>
                    <h2 className="mt-14 text-3xl font-semibold tracking-tight md:mt-20">回到你的视觉创作台</h2>
                    <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                        {SELLING_POINTS.map((point) => (
                            <li key={point} className="flex items-center gap-2.5">
                                <span className="size-1 rounded-full bg-muted-foreground/60" />
                                {point}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-auto pt-10 text-xs leading-5 text-muted-foreground">登录后从首页场景入口继续创作，项目、提示词和常用风格都能随时接着使用。</p>
                </div>
                <div className="flex flex-col p-8 md:p-10">
                    <p className="text-sm text-muted-foreground">{eyebrow}</p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
                    <div className="mt-8 flex-1">{children}</div>
                    <div className="pt-6 text-center text-sm text-muted-foreground">{footer}</div>
                </div>
            </div>
        </main>
    );
}
