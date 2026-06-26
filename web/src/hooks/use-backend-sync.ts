"use client";

import { useEffect, useRef } from "react";
import { App } from "antd";
import { useConfigStore } from "@/stores/use-config-store";
import { fetchRemoteConfig, pushRemoteConfig } from "@/services/api/backend";

export function useBackendSync() {
    const { message } = App.useApp();
    const backend = useConfigStore((s) => s.backend);
    const config = useConfigStore((s) => s.config);
    const updateConfig = useConfigStore((s) => s.updateConfig);
    const pullingRef = useRef(false);
    const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const configRef = useRef(config);
    configRef.current = config;

    // 启动时拉取远端配置
    useEffect(() => {
        if (!backend.enabled || !backend.url.trim() || !backend.authCode.trim()) return;
        if (pullingRef.current) return;
        pullingRef.current = true;

        (async () => {
            try {
                const localUpdatedAtStr = localStorage.getItem("infinite-canvas:config_updated_at");
                const localUpdatedAt = localUpdatedAtStr ? Number(localUpdatedAtStr) : 0;

                // 首次同步：本地为 source of truth，直接推送而非拉取
                if (!localUpdatedAt) {
                    try {
                        await pushRemoteConfig(backend.url, backend.authCode, JSON.stringify(configRef.current));
                        localStorage.setItem("infinite-canvas:config_updated_at", String(Date.now()));
                    } catch {
                        // 推送失败静默处理，后续变更会重试
                    }
                    return;
                }

                const remote = await fetchRemoteConfig(backend.url, backend.authCode);
                if (!remote || !remote.data) return;
                const remoteConfig = JSON.parse(remote.data);
                const remoteUpdatedAt = new Date(remote.updatedAt).getTime();
                if (remoteUpdatedAt > localUpdatedAt) {
                    const fullConfig = { ...configRef.current, ...remoteConfig };
                    (Object.keys(fullConfig) as Array<keyof typeof config>).forEach((key) => {
                        updateConfig(key, fullConfig[key]);
                    });
                    localStorage.setItem("infinite-canvas:config_updated_at", String(remoteUpdatedAt));
                    message.success("已从后端同步最新配置");
                }
            } catch {
                // 静默失败，不打断用户
            } finally {
                pullingRef.current = false;
            }
        })();
    }, [backend.enabled, backend.url, backend.authCode, updateConfig]);

    // 配置变更后 debounce 推送
    useEffect(() => {
        if (!backend.enabled || !backend.url.trim() || !backend.authCode.trim()) return;
        if (pullingRef.current) return;

        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(async () => {
            try {
                const configJson = JSON.stringify(config);
                await pushRemoteConfig(backend.url, backend.authCode, configJson);
                localStorage.setItem("infinite-canvas:config_updated_at", String(Date.now()));
            } catch {
                message.warning("配置同步到后端失败，请检查后端连接");
            }
        }, 2000);

        return () => {
            if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        };
    }, [config, backend.enabled, backend.url, backend.authCode]);
}
