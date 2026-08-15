import { Outlet, useLocation } from "react-router-dom";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { AppShell } from "@/components/layout/app-shell";
import { BackendWorkspaceGate } from "@/components/layout/backend-workspace-gate";
import { useUserStore } from "@/stores/use-user-store";

export default function UserLayout() {
    const { pathname } = useLocation();
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const workspaceReady = hydrated && Boolean(user && token) && workspaceStatus === "ready";
    // 画布编辑器全屏自持，不渲染工作台外壳（保留配置弹窗与工作区门禁）
    const isCanvasEditor = /^\/canvas\/[^/]+/.test(pathname);

    if (isCanvasEditor) {
        return (
            <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
                <div className="min-h-0 flex-1 overflow-hidden">{workspaceReady ? <Outlet /> : <BackendWorkspaceGate title="账号工作区" />}</div>
                <AppConfigModal />
            </div>
        );
    }

    return <AppShell>{workspaceReady ? <Outlet /> : <BackendWorkspaceGate title="账号工作区" />}</AppShell>;
}
