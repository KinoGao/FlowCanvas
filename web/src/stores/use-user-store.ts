"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SaveMode = "local" | "backend" | "webdav";

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
    sessionOwnerId: string;
    saveMode: SaveMode;
    backendImportedAtByUser: Record<string, string>;
    setSession: (user: LocalUser, token: string) => void;
    clearSession: () => void;
    setSaveMode: (saveMode: SaveMode) => void;
    markBackendImported: (userId: string) => void;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set) => ({
            hydrated: false,
            user: null,
            token: "",
            sessionOwnerId: "",
            saveMode: "local",
            backendImportedAtByUser: {},
            setSession: (user, token) => set((state) => ({ user, token, sessionOwnerId: state.sessionOwnerId || createSessionOwnerId(), saveMode: "backend" })),
            clearSession: () => set({ user: null, token: "", sessionOwnerId: "", saveMode: "local" }),
            setSaveMode: (saveMode) => set({ saveMode }),
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
            onRehydrateStorage: () => () => {
                const state = useUserStore.getState();
                useUserStore.setState({ hydrated: true, sessionOwnerId: state.token ? createSessionOwnerId() : "" });
            },
        },
    ),
);

function createSessionOwnerId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
