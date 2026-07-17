"use client";

import { App } from "antd";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useBackendWorkspaceSync } from "@/hooks/use-backend-workspace-sync";
import { listComfyWorkflows } from "@/services/comfyui-workflows";
import { refreshRuntimeConfig, RUNTIME_CONFIG_CHANGED_EVENT } from "@/services/runtime-config";

export function ClientRootInit({ children }: { children: ReactNode }) {
    useBackendWorkspaceSync();
    const { message } = App.useApp();
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        const loadRuntime = () => void refreshRuntimeConfig()
            .catch((error) => message.warning(error instanceof Error ? error.message : "模型配置加载失败"));
        loadRuntime();
        window.addEventListener(RUNTIME_CONFIG_CHANGED_EVENT, loadRuntime);
        void listComfyWorkflows()
            .catch((error) => console.warn("Published workflows could not be loaded", error));
        return () => window.removeEventListener(RUNTIME_CONFIG_CHANGED_EVENT, loadRuntime);
    }, [message]);

    return <>{children}</>;
}
