"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { encryptToken, decryptToken } from "@/lib/token-encryption";

// WebDAV 保存通道已移除，saveMode 仅保留后端账号一值（字段保留供
// 既有 `saveMode !== "backend"` 判断与 restoreKey 迁移兼容）。
export type SaveMode = "backend";
export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    role?: "USER" | "ADMIN";
    avatarUrl?: string;
};

type UserStore = {
    hydrated: boolean;
    user: LocalUser | null;
    token: string;
    saveMode: SaveMode;
    workspaceStatus: WorkspaceStatus;
    workspaceError: string;
    backendImportedAtByUser: Record<string, string>;
    finishHydration: () => void;
    setSession: (user: LocalUser, token: string) => void;
    updateUser: (user: LocalUser) => void;
    clearSession: () => void;
    setWorkspaceState: (workspaceStatus: WorkspaceStatus, workspaceError?: string) => void;
    markBackendImported: (userId: string) => void;
};

// 自定义加密存储适配器
const encryptedStorage = {
    getItem: async (name: string): Promise<string | null> => {
        try {
            const encrypted = localStorage.getItem(name + ":encrypted");
            if (encrypted) {
                const decrypted = await decryptToken(encrypted);
                if (decrypted) return decrypted;
            }
        } catch {
            // 解密失败，忽略
        }
        return null;
    },
    
    setItem: async (name: string, value: string): Promise<void> => {
        try {
            const encrypted = await encryptToken(value);
            localStorage.setItem(name + ":encrypted", encrypted);
        } catch {
            // 加密失败时静默降级（隐私模式等）
        }
    },
    
    removeItem: async (name: string): Promise<void> => {
        localStorage.removeItem(name + ":encrypted");
    },
};

export const useUserStore = create<UserStore>()(
    persist(
        (set) => ({
            hydrated: false,
            user: null,
            token: "",
            saveMode: "backend",
            workspaceStatus: "idle",
            workspaceError: "",
            backendImportedAtByUser: {},
            finishHydration: () => set({ hydrated: true }),
            setSession: (user, token) => set({ user, token, saveMode: "backend", workspaceStatus: "loading", workspaceError: "" }),
            updateUser: (user) => set({ user }),
            clearSession: () => set({ user: null, token: "", saveMode: "backend", workspaceStatus: "idle", workspaceError: "" }),
            setWorkspaceState: (workspaceStatus, workspaceError = "") => set({ workspaceStatus, workspaceError }),
            markBackendImported: (userId) =>
                set((state) => ({
                    backendImportedAtByUser: {
                        ...state.backendImportedAtByUser,
                        [userId]: new Date().toISOString(),
                    },
                })),
        }),
        {
            name: "infinite-canvas:user_store",
            storage: createJSONStorage(() => encryptedStorage),
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                saveMode: state.saveMode,
                backendImportedAtByUser: state.backendImportedAtByUser,
            }),
            merge: (persisted, current) => {
                const saved = (persisted || {}) as Partial<UserStore>;
                return {
                    ...current,
                    ...saved,
                    // 旧的 WebDAV 保存模式持久值一律迁移回后端账号。
                    saveMode: "backend",
                    workspaceStatus: "idle",
                    workspaceError: "",
                };
            },
            onRehydrateStorage: () => (state) => {
                // 加密存储是异步的，需要等待 hydration 完成
                if (state) {
                    state.finishHydration();
                }
            },
        },
    ),
);
