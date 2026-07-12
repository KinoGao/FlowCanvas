"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { ApiError, fetchCurrentUser } from "@/services/api/auth";
import { backendFileUrl, fetchBackendBootstrap, pushBackendAssets, pushBackendConfig, pushBackendProjects, uploadBackendFile } from "@/services/api/backend-storage";
import { getImageBlob } from "@/services/image-storage";
import { getMediaBlob } from "@/services/file-storage";
import { useCanvasStore, type CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type Tombstones = Record<string, string>;
const USER_SESSION_LOCK_PREFIX = "infinite-canvas:user-session:";
const USER_SESSION_LOCK_TTL = 8000;
const USER_SESSION_LOCK_HEARTBEAT = 2500;
const BACKEND_SYNC_DEBOUNCE_MS = 500;

type UserSessionLock = {
    ownerId: string;
    updatedAt: number;
};

export function useBackendWorkspaceSync() {
    const { message } = App.useApp();
    const userHydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const sessionOwnerId = useUserStore((state) => state.sessionOwnerId);
    const saveMode = useUserStore((state) => state.saveMode);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const assetHydrated = useAssetStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const projectTombstones = useCanvasStore((state) => state.projectTombstones);
    const assets = useAssetStore((state) => state.assets);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const replaceAssets = useAssetStore((state) => state.replaceAssets);
    const readyRef = useRef(false);
    const applyingRef = useRef(false);
    const bootstrappedUserRef = useRef("");
    const versionRef = useRef({ config: 0, projects: 0, assets: 0 });
    const lastPushedVersionRef = useRef({ config: -1, projects: -1, assets: -1 });
    const pushingRef = useRef({ config: false, projects: false, assets: false });
    const accountSessionExpired = useBackendAccountSingleSessionLock(user?.id || "", sessionOwnerId, saveMode === "backend" && Boolean(token && user));
    const canSync = useCallback(() => saveMode === "backend" && Boolean(token) && !accountSessionExpired && readyRef.current && !applyingRef.current, [accountSessionExpired, saveMode, token]);

    const syncConfigNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.config) return;
        const version = versionRef.current.config;
        if (lastPushedVersionRef.current.config === version) return;
        pushingRef.current.config = true;
        try {
            await pushBackendConfig(token, useConfigStore.getState().config);
            lastPushedVersionRef.current.config = version;
        } catch (error) {
            console.error("[backend-sync] config push failed", error);
        } finally {
            pushingRef.current.config = false;
            if (lastPushedVersionRef.current.config !== versionRef.current.config) void syncConfigNow();
        }
    }, [canSync, token]);

    const syncProjectsNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.projects) return;
        const version = versionRef.current.projects;
        if (lastPushedVersionRef.current.projects === version) return;
        pushingRef.current.projects = true;
        try {
            const state = useCanvasStore.getState();
            const migratedProjects = (await migrateStorageKeysToBackend(state.projects, token)) as CanvasProject[];
            if (migratedProjects !== state.projects) replaceProjects(migratedProjects, state.projectTombstones);
            await pushBackendProjects(token, migratedProjects, state.projectTombstones);
            lastPushedVersionRef.current.projects = version;
        } catch (error) {
            console.error("[backend-sync] projects push failed", error);
        } finally {
            pushingRef.current.projects = false;
            if (lastPushedVersionRef.current.projects !== versionRef.current.projects) void syncProjectsNow();
        }
    }, [canSync, replaceProjects, token]);

    const syncAssetsNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.assets) return;
        const version = versionRef.current.assets;
        if (lastPushedVersionRef.current.assets === version) return;
        pushingRef.current.assets = true;
        try {
            const currentAssets = useAssetStore.getState().assets;
            const migratedAssets = (await migrateStorageKeysToBackend(currentAssets, token)) as Asset[];
            if (migratedAssets !== currentAssets) replaceAssets(migratedAssets);
            await pushBackendAssets(token, migratedAssets);
            lastPushedVersionRef.current.assets = version;
        } catch (error) {
            console.error("[backend-sync] assets push failed", error);
        } finally {
            pushingRef.current.assets = false;
            if (lastPushedVersionRef.current.assets !== versionRef.current.assets) void syncAssetsNow();
        }
    }, [canSync, replaceAssets, token]);

    useEffect(() => {
        if (!userHydrated || !token) return;
        void fetchCurrentUser(token)
            .then((nextUser) => setSession(nextUser, token))
            .catch((error) => {
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    clearSession();
                    message.warning("登录已失效，请重新登录");
                    return;
                }
                message.warning("后端账号暂时无法校验，已保留当前登录状态");
            });
    }, [clearSession, message, setSession, token, userHydrated]);

    useEffect(() => {
        if (!userHydrated || !canvasHydrated || !assetHydrated) return;
        if (saveMode !== "backend" || !token || !user || accountSessionExpired) {
            readyRef.current = false;
            bootstrappedUserRef.current = "";
            return;
        }
        if (bootstrappedUserRef.current === user.id) return;

        let cancelled = false;
        readyRef.current = false;
        applyingRef.current = true;

        void (async () => {
            const localProjects = useCanvasStore.getState().projects;
            const localTombstones = useCanvasStore.getState().projectTombstones;
            const localAssets = useAssetStore.getState().assets;
            const localConfig = useConfigStore.getState().config;
            const remote = await fetchBackendBootstrap(token);
            if (cancelled) return;

            const mergedConfig = remote.config?.data ? { ...localConfig, ...(JSON.parse(remote.config.data) as Partial<AiConfig>) } : localConfig;
            const mergedTombstones = mergeTombstones(localTombstones, remote.projectTombstones || {});
            const mergedProjects = mergeProjectsById(localProjects, remote.projects || [], mergedTombstones);
            const mergedAssets = mergeById(localAssets, remote.assets || [], "updatedAt");
            const migratedProjects = (await migrateStorageKeysToBackend(mergedProjects, token)) as CanvasProject[];
            const migratedAssets = (await migrateStorageKeysToBackend(mergedAssets, token)) as Asset[];

            if (cancelled) return;
            (Object.keys(mergedConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, mergedConfig[key]));
            replaceProjects(migratedProjects, mergedTombstones);
            replaceAssets(migratedAssets);

            await Promise.all([pushBackendConfig(token, mergedConfig), pushBackendProjects(token, migratedProjects, mergedTombstones), pushBackendAssets(token, migratedAssets)]);
            bootstrappedUserRef.current = user.id;
            lastPushedVersionRef.current = {
                config: versionRef.current.config,
                projects: versionRef.current.projects,
                assets: versionRef.current.assets,
            };
        })()
            .catch((error) => {
                message.error(error instanceof Error ? error.message : "后端工作区同步失败");
            })
            .finally(() => {
                applyingRef.current = false;
                readyRef.current = true;
            });

        return () => {
            cancelled = true;
        };
    }, [accountSessionExpired, assetHydrated, canvasHydrated, message, replaceAssets, replaceProjects, saveMode, token, updateConfig, user, userHydrated]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || accountSessionExpired) return;
        const unsubConfig = useConfigStore.subscribe((state, previous) => {
            if (state.config !== previous.config) versionRef.current.config++;
        });
        const unsubProjects = useCanvasStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects || state.projectTombstones !== previous.projectTombstones) versionRef.current.projects++;
        });
        const unsubAssets = useAssetStore.subscribe((state, previous) => {
            if (state.assets !== previous.assets) versionRef.current.assets++;
        });
        return () => {
            unsubConfig();
            unsubProjects();
            unsubAssets();
        };
    }, [accountSessionExpired, saveMode, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || accountSessionExpired || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncConfigNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [accountSessionExpired, config, saveMode, syncConfigNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || accountSessionExpired || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncProjectsNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [accountSessionExpired, projectTombstones, projects, saveMode, syncProjectsNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || accountSessionExpired || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncAssetsNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [accountSessionExpired, assets, saveMode, syncAssetsNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || accountSessionExpired) return;
        const flush = () => {
            void syncConfigNow();
            void syncProjectsNow();
            void syncAssetsNow();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", flush);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", flush);
        };
    }, [accountSessionExpired, saveMode, syncAssetsNow, syncConfigNow, syncProjectsNow, token]);

    useEffect(() => {
        if (!accountSessionExpired) return;
        message.warning("账号会话已在另一个窗口中打开，当前窗口已停止后端同步");
    }, [accountSessionExpired, message]);
}

function useBackendAccountSingleSessionLock(userId: string, ownerId: string, enabled: boolean) {
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        if (!enabled || !userId || !ownerId || typeof window === "undefined") return;
        const key = `${USER_SESSION_LOCK_PREFIX}${userId}`;
        const readLock = () => {
            try {
                const raw = window.localStorage.getItem(key);
                return raw ? (JSON.parse(raw) as UserSessionLock) : null;
            } catch {
                return null;
            }
        };
        const writeLock = () => window.localStorage.setItem(key, JSON.stringify({ ownerId, updatedAt: Date.now() } satisfies UserSessionLock));
        const isOtherLiveLock = (lock: UserSessionLock | null) => Boolean(lock && lock.ownerId !== ownerId && Date.now() - lock.updatedAt < USER_SESSION_LOCK_TTL);

        if (isOtherLiveLock(readLock())) {
            setExpired(true);
            return;
        }
        setExpired(false);
        writeLock();
        const timer = window.setInterval(() => {
            if (isOtherLiveLock(readLock())) {
                setExpired(true);
                return;
            }
            writeLock();
        }, USER_SESSION_LOCK_HEARTBEAT);
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== key) return;
            if (isOtherLiveLock(readLock())) setExpired(true);
        };
        window.addEventListener("storage", handleStorage);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("storage", handleStorage);
            const lock = readLock();
            if (lock?.ownerId === ownerId) window.localStorage.removeItem(key);
        };
    }, [enabled, ownerId, userId]);

    return expired;
}

function mergeProjectsById(local: CanvasProject[], remote: CanvasProject[], tombstones: Tombstones) {
    const byId = new Map<string, CanvasProject>();
    remote.forEach((project) => {
        if (project.id) byId.set(project.id, project);
    });
    local.forEach((project) => {
        if (!project.id) return;
        const current = byId.get(project.id);
        if (!current || timeOf(project.updatedAt) >= timeOf(current.updatedAt)) byId.set(project.id, project);
    });
    const visible: CanvasProject[] = [];
    for (const project of byId.values()) {
        const deletedAt = tombstones[project.id];
        if (deletedAt && timeOf(deletedAt) >= timeOf(project.updatedAt)) continue;
        visible.push(project);
    }
    return visible.sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt));
}

function mergeById<T extends { id?: string }>(local: T[], remote: T[], timeKey: string) {
    const byId = new Map<string, T>();
    remote.forEach((item) => {
        if (item.id) byId.set(item.id, item);
    });
    local.forEach((item) => {
        if (!item.id) return;
        const current = byId.get(item.id);
        if (!current || timeOf((item as Record<string, unknown>)[timeKey]) >= timeOf((current as Record<string, unknown>)[timeKey])) byId.set(item.id, item);
    });
    return Array.from(byId.values()).sort((a, b) => timeOf((b as Record<string, unknown>)[timeKey]) - timeOf((a as Record<string, unknown>)[timeKey]));
}

function mergeTombstones(local: Tombstones, remote: Tombstones) {
    const merged = { ...remote };
    Object.entries(local).forEach(([id, deletedAt]) => {
        if (!merged[id] || timeOf(deletedAt) > timeOf(merged[id])) merged[id] = deletedAt;
    });
    return merged;
}

async function migrateStorageKeysToBackend(value: unknown, token: string): Promise<unknown> {
    if (Array.isArray(value)) {
        const nextItems = await Promise.all(value.map((item) => migrateStorageKeysToBackend(item, token)));
        return nextItems.every((item, index) => item === value[index]) ? value : nextItems;
    }
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    let record: Record<string, unknown> | null = null;
    const setRecordValue = (key: string, nextValue: unknown) => {
        if (source[key] === nextValue) return;
        if (!record) record = { ...source };
        record[key] = nextValue;
    };
    const storageKey = typeof source.storageKey === "string" ? source.storageKey : "";
    if (storageKey && !storageKey.startsWith("backend:")) {
        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (blob) {
            const uploaded = await uploadBackendFile(token, blob, storageKey.replace(/[:/\\]/g, "_"));
            const url = backendFileUrl(uploaded.storageKey, token);
            setRecordValue("storageKey", uploaded.storageKey);
            setRecordValue("bytes", uploaded.bytes);
            setRecordValue("mimeType", uploaded.mimeType);
            if (typeof source.content === "string") setRecordValue("content", url);
            if (typeof source.dataUrl === "string") setRecordValue("dataUrl", url);
            if (typeof source.url === "string") setRecordValue("url", url);
            if (typeof source.coverUrl === "string" && source.coverUrl.startsWith("blob:")) setRecordValue("coverUrl", url);
        }
    }
    for (const key of Object.keys(source)) {
        if (key === "storageKey") continue;
        const nextValue = await migrateStorageKeysToBackend(source[key], token);
        setRecordValue(key, nextValue);
    }
    return record || value;
}

function timeOf(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
}
