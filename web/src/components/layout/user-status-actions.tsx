"use client";

import type { CSSProperties } from "react";
import { App, Dropdown } from "antd";
import { BookOpen, Keyboard, LogIn, LogOut, Settings2, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { DOCS_URL } from "@/constant/env";
import { canvasThemes } from "@/lib/canvas-theme";
import { logoutUser } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts }: UserStatusActionsProps) {
    const { message } = App.useApp();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;

    const logout = async () => {
        try {
            if (token) await logoutUser(token);
        } catch {
            // 会话可能已失效，本地照常清理
        }
        clearSession();
        message.success("已退出登录");
    };

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                <BookOpen className="size-4" />
            </a>
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {user ? (
                <Dropdown
                    menu={{
                        items: [
                            { key: "account", icon: <UserRound className="size-4" />, label: "账号设置", onClick: () => openConfigDialog(false) },
                            { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", danger: true, onClick: () => void logout() },
                        ],
                    }}
                    trigger={["click"]}
                >
                    <button
                        type="button"
                        className="ml-1 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground transition hover:ring-2 hover:ring-border"
                        style={iconStyle}
                        aria-label="账号菜单"
                        title={user.displayName || user.username}
                    >
                        {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                    </button>
                </Dropdown>
            ) : (
                <Link to="/login" className={naturalIconClass} style={iconStyle} aria-label="登录" title="登录">
                    <LogIn className="size-4" />
                </Link>
            )}
        </div>
    );
}
