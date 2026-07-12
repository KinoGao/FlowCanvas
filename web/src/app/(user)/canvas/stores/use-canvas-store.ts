import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasProjectDetail = Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">;
type CanvasProjectMeta = Pick<CanvasProject, "id" | "title" | "createdAt" | "updatedAt"> & { nodeCount: number; connectionCount: number };

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    projectTombstones: Record<string, string>;
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[], projectTombstones?: Record<string, string>) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const CANVAS_PROJECT_DETAIL_PREFIX = "infinite-canvas:canvas_project:";
type PersistedCanvasState = { projects: CanvasProjectMeta[]; projectTombstones?: Record<string, string> };
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedProjectListJson: string | null = null;
const detailSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function projectDetailKey(id: string) {
    return `${CANVAS_PROJECT_DETAIL_PREFIX}${id}`;
}

function emptyProjectDetail(): CanvasProjectDetail {
    return {
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: initialViewport,
    };
}

function createCanvasProject(title: string): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        title,
        createdAt: now,
        updatedAt: now,
        ...emptyProjectDetail(),
    };
}

function normalizeProject(source: Partial<CanvasProject>, fallbackTitle = "未命名画布"): CanvasProject {
    const now = new Date().toISOString();
    const id = source.id || nanoid();
    return {
        id,
        title: source.title || fallbackTitle,
        createdAt: source.createdAt || now,
        updatedAt: source.updatedAt || now,
        ...normalizeProjectDetail(source),
    };
}

function normalizeProjectDetail(source: Partial<CanvasProjectDetail> = {}): CanvasProjectDetail {
    return {
        nodes: Array.isArray(source?.nodes) ? source.nodes : [],
        connections: Array.isArray(source?.connections) ? source.connections : [],
        chatSessions: Array.isArray(source?.chatSessions) ? source.chatSessions : [],
        activeChatId: source?.activeChatId || null,
        backgroundMode: source?.backgroundMode || "lines",
        showImageInfo: Boolean(source?.showImageInfo),
        viewport: source?.viewport || initialViewport,
    };
}

function toProjectMeta(project: CanvasProject): CanvasProjectMeta {
    return {
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes.length,
        connectionCount: project.connections.length,
    };
}

function isProjectMetaOnly(project: Partial<CanvasProject> | CanvasProjectMeta): project is CanvasProjectMeta {
    return !("nodes" in project) && !("connections" in project) && !("chatSessions" in project);
}

function toPersistedProjectMeta(project: CanvasProject | CanvasProjectMeta): CanvasProjectMeta {
    if ("nodes" in project) return toProjectMeta(project);
    return {
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        nodeCount: project.nodeCount || 0,
        connectionCount: project.connectionCount || 0,
    };
}

function toProjectDetail(project: CanvasProject): CanvasProjectDetail {
    return {
        nodes: project.nodes,
        connections: project.connections,
        chatSessions: project.chatSessions,
        activeChatId: project.activeChatId,
        backgroundMode: project.backgroundMode,
        showImageInfo: project.showImageInfo,
        viewport: project.viewport,
    };
}

function queueProjectDetailSave(project: CanvasProject) {
    const current = detailSaveTimers.get(project.id);
    if (current) clearTimeout(current);
    const timer = setTimeout(() => {
        detailSaveTimers.delete(project.id);
        void localForageStorage.setItem(projectDetailKey(project.id), JSON.stringify(toProjectDetail(project)));
    }, 300);
    detailSaveTimers.set(project.id, timer);
}

// 模块级卸载/刷新钩子：避免热重载或页面卸载时遗留 timer 触发已销毁闭包写入
function clearAllPendingTimers() {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    detailSaveTimers.forEach((timer) => clearTimeout(timer));
    detailSaveTimers.clear();
}

if (typeof window !== "undefined") {
    // 仅注册一次：多次 hot reload 时旧的 listener 不会泄露（用变量标记）
    const FLUSH_HANDLER_KEY = "__infinite_canvas_beforeunload__";
    type WindowWithFlush = typeof window & { [FLUSH_HANDLER_KEY]?: boolean };
    const w = window as WindowWithFlush;
    if (!w[FLUSH_HANDLER_KEY]) {
        w[FLUSH_HANDLER_KEY] = true;
        window.addEventListener("beforeunload", () => {
            // 同步执行：把 timer 内的最新 payload 立即写盘
            clearAllPendingTimers();
            if (queuedProjectListJson) {
                void localForageStorage.setItem(CANVAS_STORE_KEY, queuedProjectListJson);
            }
        });
        // Vite HMR：清空 timer 防止对已卸载组件的写入
        if (import.meta && (import.meta as { hot?: { dispose: (cb: () => void) => void } }).hot) {
            (import.meta as { hot: { dispose: (cb: () => void) => void } }).hot.dispose(() => {
                clearAllPendingTimers();
            });
        }
    }
}

function removeProjectDetail(id: string) {
    const timer = detailSaveTimers.get(id);
    if (timer) clearTimeout(timer);
    detailSaveTimers.delete(id);
    void localForageStorage.removeItem(projectDetailKey(id));
}

async function readProjectDetail(id: string) {
    const value = await localForageStorage.getItem(projectDetailKey(id));
    if (!value) return null;
    try {
        return normalizeProjectDetail(JSON.parse(value) as Partial<CanvasProjectDetail>);
    } catch {
        return null;
    }
}

async function hydrateStoredProject(source: Partial<CanvasProject>): Promise<CanvasProject> {
    const project = normalizeProject(source);
    const storedDetail = await readProjectDetail(project.id);
    if (storedDetail) return { ...project, ...storedDetail };
    if (Array.isArray(source.nodes) || Array.isArray(source.connections) || Array.isArray(source.chatSessions)) queueProjectDetailSave(project);
    return project;
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        const rawProjects = Array.isArray((parsed.state as unknown as PersistedCanvasState).projects) ? (parsed.state as unknown as { projects: Partial<CanvasProject>[] }).projects : [];
        const projects = await Promise.all(rawProjects.map(hydrateStoredProject));
        const nextValue = { ...parsed, state: { ...parsed.state, projects } } as unknown as StorageValue<CanvasStore>;
        const isShardedRoot = rawProjects.every(isProjectMetaOnly);
        queuedProjectListJson = isShardedRoot ? value : null;
        return nextValue;
    },
    setItem: (name, value) => {
        const state = value.state as unknown as { projects?: Array<CanvasProject | CanvasProjectMeta>; projectTombstones?: Record<string, string> };
        const projects = Array.isArray(state.projects) ? state.projects : [];
        const nextValue = { ...value, state: { projects: projects.map(toPersistedProjectMeta), projectTombstones: state.projectTombstones || {} } } as unknown as StorageValue<CanvasStore>;
        const json = JSON.stringify(nextValue);
        if (queuedProjectListJson === json) return;
        queuedProjectListJson = json;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, json);
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            projectTombstones: {},
            createProject: (title = "未命名画布") => {
                const project = createCanvasProject(title);
                queueProjectDetailSave(project);
                set((state) => {
                    const { [project.id]: _removed, ...projectTombstones } = state.projectTombstones;
                    return { projects: [project, ...state.projects], projectTombstones };
                });
                return project.id;
            },
            importProject: (source) => {
                const project = normalizeProject({ ...source, id: nanoid(), updatedAt: new Date().toISOString() }, "导入画布");
                queueProjectDetailSave(project);
                set((state) => {
                    const { [project.id]: _removed, ...projectTombstones } = state.projectTombstones;
                    return { projects: [project, ...state.projects], projectTombstones };
                });
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const deletedAt = new Date().toISOString();
                    const projectTombstones = { ...state.projectTombstones };
                    ids.forEach((id) => {
                        removeProjectDetail(id);
                        projectTombstones[id] = deletedAt;
                    });
                    return { projects: state.projects.filter((project) => !ids.includes(project.id)), projectTombstones };
                }),
            replaceProjects: (projects, projectTombstones = get().projectTombstones) => {
                projects.forEach(queueProjectDetailSave);
                set({ projects, projectTombstones });
            },
            updateProject: (id, patch) =>
                set((state) => {
                    let changedProject: CanvasProject | null = null;
                    const projects = state.projects.map((project) => {
                        if (project.id !== id) return project;
                        changedProject = { ...project, ...patch, updatedAt: new Date().toISOString() };
                        return changedProject;
                    });
                    if (changedProject) queueProjectDetailSave(changedProject);
                    return { projects };
                }),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects.map(toProjectMeta),
                    projectTombstones: state.projectTombstones,
                }) as unknown as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);
