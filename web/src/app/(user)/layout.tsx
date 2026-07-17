import { Outlet } from "react-router-dom";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { BackendWorkspaceGate } from "@/components/layout/backend-workspace-gate";
import { useUserStore } from "@/stores/use-user-store";

export default function UserLayout() {
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const workspaceStatus = useUserStore((state) => state.workspaceStatus);
    const workspaceReady = saveMode === "webdav" || (hydrated && Boolean(user && token) && workspaceStatus === "ready");

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="min-h-0 flex-1 overflow-hidden">
                {workspaceReady ? <Outlet /> : <BackendWorkspaceGate title="账号工作区" />}
            </div>
        </div>
    );
}
