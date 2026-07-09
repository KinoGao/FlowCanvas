"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SaveMode = "local" | "backend" | "webdav";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
};

type UserStore = {
    user: LocalUser | null;
    token: string;
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
            user: null,
            token: "",
            saveMode: "local",
            backendImportedAtByUser: {},
            setSession: (user, token) => set({ user, token }),
            clearSession: () => set({ user: null, token: "", saveMode: "local" }),
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
        },
    ),
);
