"use client";

import { useEffect, useRef } from "react";
import { App } from "antd";

import { fetchCurrentUser } from "@/services/api/auth";
import { backendFileUrl, fetchBackendBootstrap, pushBackendAssets, pushBackendConfig, pushBackendProjects, uploadBackendFile } from "@/services/api/backend-storage";
import { getImageBlob } from "@/services/image-storage";
import { getMediaBlob } from "@/services/file-storage";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function useBackendWorkspaceSync() {
    const { message, modal } = App.useApp();
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const backendImportedAtByUser = useUserStore((state) => state.backendImportedAtByUser);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);
    const markBackendImported = useUserStore((state) => state.markBackendImported);
    const projects = useCanvasStore((state) => state.projects);
    const assets = useAssetStore((state) => state.assets);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const replaceAssets = useAssetStore((state) => state.replaceAssets);
    const readyRef = useRef(false);
    const applyingRef = useRef(false);
    const lastPushedRef = useRef({ config: "", projects: "", assets: "" });

    useEffect(() => {
        if (!token) return;
        void fetchCurrentUser(token)
            .then((nextUser) => setSession(nextUser, token))
            .catch(() => {
                clearSession();
                message.warning("登录已失效，请重新登录");
            });
    }, [clearSession, message, setSession, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !user) {
            readyRef.current = false;
            return;
        }

        let cancelled = false;
        readyRef.current = false;
        applyingRef.current = true;

        void (async () => {
            const localProjects = useCanvasStore.getState().projects;
            const localAssets = useAssetStore.getState().assets;
            const localConfig = useConfigStore.getState().config;
            const imported = Boolean(backendImportedAtByUser[user.id]);
            const shouldOfferImport = !imported && (localProjects.length > 0 || localAssets.length > 0);

            const remote = await fetchBackendBootstrap(token);
            if (cancelled) return;

            if (shouldOfferImport) {
                modal.confirm({
                    title: "导入本地数据到当前账号？",
                    content: "检测到浏览器里已有画布或素材。导入后会上传到当前后端账号，本地数据不会删除。",
                    okText: "一键导入",
                    cancelText: "先看后端数据",
                    onOk: async () => {
                        try {
                        const migratedProjects = (await migrateStorageKeysToBackend(localProjects, token)) as typeof localProjects;
                        const migratedAssets = (await migrateStorageKeysToBackend(localAssets, token)) as typeof localAssets;
                        await Promise.all([pushBackendConfig(token, localConfig), pushBackendProjects(token, migratedProjects), pushBackendAssets(token, migratedAssets)]);
                        replaceProjects(migratedProjects);
                        replaceAssets(migratedAssets);
                        markBackendImported(user.id);
                        lastPushedRef.current = {
                            config: stableStringify(localConfig),
                            projects: stableStringify(migratedProjects),
                            assets: stableStringify(migratedAssets),
                        };
                        message.success("本地数据已导入后端账号");
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "导入失败");
                            throw error;
                        }
                    },
                    onCancel: () => applyRemote(remote),
                });
            } else {
                applyRemote(remote);
            }
        })()
            .catch((error) => {
                message.error(error instanceof Error ? error.message : "后端工作区同步失败");
            })
            .finally(() => {
                applyingRef.current = false;
                readyRef.current = true;
            });

        function applyRemote(remote: Awaited<ReturnType<typeof fetchBackendBootstrap>>) {
            applyingRef.current = true;
            if (remote.config?.data) {
                const remoteConfig = JSON.parse(remote.config.data) as Partial<AiConfig>;
                const merged = { ...useConfigStore.getState().config, ...remoteConfig };
                (Object.keys(merged) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, merged[key]));
                lastPushedRef.current.config = stableStringify(merged);
            }
            replaceProjects(remote.projects || []);
            replaceAssets(remote.assets || []);
            lastPushedRef.current.projects = stableStringify(remote.projects || []);
            lastPushedRef.current.assets = stableStringify(remote.assets || []);
        }

        return () => {
            cancelled = true;
        };
    }, [backendImportedAtByUser, markBackendImported, message, modal, replaceAssets, replaceProjects, saveMode, token, updateConfig, user]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(async () => {
            const next = stableStringify(config);
            if (lastPushedRef.current.config === next) return;
            await pushBackendConfig(token, config);
            lastPushedRef.current.config = next;
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [config, saveMode, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(async () => {
            const next = stableStringify(projects);
            if (lastPushedRef.current.projects === next) return;
            await pushBackendProjects(token, projects);
            lastPushedRef.current.projects = next;
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [projects, saveMode, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(async () => {
            const next = stableStringify(assets);
            if (lastPushedRef.current.assets === next) return;
            await pushBackendAssets(token, assets);
            lastPushedRef.current.assets = next;
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [assets, saveMode, token]);
}

async function migrateStorageKeysToBackend(value: unknown, token: string): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map((item) => migrateStorageKeysToBackend(item, token)));
    if (!value || typeof value !== "object") return value;
    const record = { ...(value as Record<string, unknown>) };
    const storageKey = typeof record.storageKey === "string" ? record.storageKey : "";
    if (storageKey && !storageKey.startsWith("backend:")) {
        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (blob) {
            const uploaded = await uploadBackendFile(token, blob, storageKey.replace(/[:/\\]/g, "_"));
            const url = backendFileUrl(uploaded.storageKey, token);
            record.storageKey = uploaded.storageKey;
            record.bytes = uploaded.bytes;
            record.mimeType = uploaded.mimeType;
            if (typeof record.content === "string") record.content = url;
            if (typeof record.dataUrl === "string") record.dataUrl = url;
            if (typeof record.url === "string") record.url = url;
            if (typeof record.coverUrl === "string" && record.coverUrl.startsWith("blob:")) record.coverUrl = url;
        }
    }
    for (const key of Object.keys(record)) {
        if (key === "storageKey") continue;
        record[key] = await migrateStorageKeysToBackend(record[key], token);
    }
    return record;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
