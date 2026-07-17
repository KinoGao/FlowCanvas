"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SaveMode = "backend" | "webdav";
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
    setSaveMode: (saveMode: SaveMode) => void;
    setWorkspaceState: (workspaceStatus: WorkspaceStatus, workspaceError?: string) => void;
    markBackendImported: (userId: string) => void;
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
            setSaveMode: (saveMode) => set({ saveMode }),
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
                    saveMode: saved.saveMode === "webdav" ? "webdav" : "backend",
                    workspaceStatus: "idle",
                    workspaceError: "",
                };
            },
            onRehydrateStorage: (state) => () => state.finishHydration(),
        },
    ),
);
