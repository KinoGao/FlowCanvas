"use client";

import { Button } from "antd";
import { CloudOff, LoaderCircle, LogIn, RotateCw } from "lucide-react";

import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function BackendWorkspaceGate({ title = "后端工作区" }: { title?: string }) {
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const workspaceError = useUserStore((state) => state.workspaceError);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    if (saveMode !== "backend" || (hydrated && user && token && workspaceStatus === "ready")) return null;

    const needsLogin = hydrated && (!user || !token);
    const failed = hydrated && Boolean(user && token) && workspaceStatus === "error";
    const Icon = needsLogin ? LogIn : failed ? CloudOff : LoaderCircle;

    return (
        <main className="flex h-full min-h-[420px] items-center justify-center bg-background px-6 text-foreground">
            <section className="w-full max-w-md text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground/[0.06]">
                    <Icon className={"size-5 " + (!needsLogin && !failed ? "animate-spin" : "")} />
                </span>
                <h1 className="mt-5 text-xl font-semibold">{needsLogin ? "登录后使用" + title : failed ? title + "暂不可用" : "正在加载" + title}</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {needsLogin
                        ? "画布、素材、配置和媒体文件只保存到当前账号的后端工作区，不会回退到浏览器本地数据。"
                        : failed
                          ? workspaceError || "后端工作区连接失败。为避免覆盖或丢失数据，当前页面已锁定且不会回退到浏览器本地数据。"
                          : "正在从账号后端恢复工作区，请稍候。"}
                </p>
                {needsLogin ? (
                    <Button className="mt-6" type="primary" icon={<LogIn className="size-4" />} onClick={() => openConfigDialog(false)}>
                        登录账号
                    </Button>
                ) : failed ? (
                    <div className="mt-6 flex justify-center gap-2">
                        <Button icon={<CloudOff className="size-4" />} onClick={() => openConfigDialog(false)}>
                            检查账号
                        </Button>
                        <Button type="primary" icon={<RotateCw className="size-4" />} onClick={() => window.location.reload()}>
                            重新连接
                        </Button>
                    </div>
                ) : null}
            </section>
        </main>
    );
}
