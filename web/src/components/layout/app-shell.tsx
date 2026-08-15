"use client";

import { CircleHelp, Menu, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { DOCS_URL } from "@/constant/env";
import { findNavigationTool, navigationGroups } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

/**
 * 工作台外壳（对齐 VOZEB 工作台）：左侧分组侧边栏 + 顶部当前页栏。
 * 画布编辑器（/canvas/:id）不经过此外壳，由 (user)/layout.tsx 直接放行。
 */
export function AppShell({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const activeTool = findNavigationTool(pathname);
    const pageLabel = pathname === "/" ? "首页" : (activeTool?.label ?? "");

    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
                <Link to="/" className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 transition hover:opacity-70">
                    <span
                        className="size-5 shrink-0 bg-current"
                        style={{
                            mask: "url(/logo.svg) center / contain no-repeat",
                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                        }}
                    />
                    <span className="text-base font-medium tracking-tight">FlowCanvas</span>
                </Link>

                <nav className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
                    {navigationGroups.map((group) => (
                        <div key={group.label} className="mb-5">
                            <div className="px-3 pb-1.5 text-xs text-muted-foreground">{group.label}</div>
                            <div className="space-y-0.5">
                                {group.tools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeTool?.slug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            to={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                                                active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                            )}
                                        >
                                            <Icon className="size-4 shrink-0" />
                                            <span className="truncate">{tool.label}</span>
                                            {active ? <span className="absolute right-1.5 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground/70" /> : null}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="shrink-0 space-y-0.5 border-t border-border px-3 py-3">
                    <a
                        href={DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
                    >
                        <CircleHelp className="size-4 shrink-0" />
                        <span>帮助</span>
                    </a>
                    <Link
                        to="/admin"
                        className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                            pathname.startsWith("/admin") ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                    >
                        <ShieldCheck className="size-4 shrink-0" />
                        <span>管理后台</span>
                    </Link>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl md:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground md:hidden"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="打开导航菜单"
                            title="导航菜单"
                        >
                            <Menu className="size-5" />
                        </button>
                        {activeTool ? <activeTool.icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                        <span className="truncate text-sm font-medium">{pageLabel}</span>
                    </div>
                    <UserStatusActions />
                </header>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeTool?.slug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </div>
    );
}
