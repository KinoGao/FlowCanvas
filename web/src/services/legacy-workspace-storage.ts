import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import { localForageStorage } from "@/lib/localforage-storage";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";

const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
const CANVAS_PROJECT_DETAIL_PREFIX = "infinite-canvas:canvas_project:";
const ASSET_STORE_KEY = "infinite-canvas:asset_store";
const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";

export type LegacyWorkspace = {
    projects: CanvasProject[];
    projectTombstones: Record<string, string>;
    assets: Asset[];
    config: AiConfig | null;
    projectDetailKeys: string[];
    hasData: boolean;
};

export async function readLegacyWorkspace(): Promise<LegacyWorkspace> {
    const canvasState = readPersistedState(await readLegacyValue(CANVAS_STORE_KEY), CANVAS_STORE_KEY) as {
        projects?: Array<Partial<CanvasProject>>;
        projectTombstones?: Record<string, string>;
    } | null;
    const rawProjects = Array.isArray(canvasState?.projects) ? canvasState.projects : [];
    const projectDetailKeys = rawProjects.flatMap((project) => (project.id ? [CANVAS_PROJECT_DETAIL_PREFIX + project.id] : []));
    const projects = await Promise.all(
        rawProjects.map(async (project) => {
            const detailKey = project.id ? CANVAS_PROJECT_DETAIL_PREFIX + project.id : "";
            const detail = detailKey ? readPlainObject(await readLegacyValue(detailKey), detailKey) : null;
            return normalizeLegacyProject({ ...project, ...(detail || {}) });
        }),
    );

    const assetState = readPersistedState(await readLegacyValue(ASSET_STORE_KEY), ASSET_STORE_KEY) as { assets?: Asset[] } | null;
    const assets = Array.isArray(assetState?.assets) ? assetState.assets : [];
    const configState = readPersistedState(await readLegacyValue(CONFIG_STORE_KEY), CONFIG_STORE_KEY) as { config?: AiConfig } | null;
    const config = configState?.config && typeof configState.config === "object" ? configState.config : null;
    const projectTombstones = canvasState?.projectTombstones && typeof canvasState.projectTombstones === "object" ? canvasState.projectTombstones : {};

    return {
        projects,
        projectTombstones,
        assets,
        config,
        projectDetailKeys,
        hasData: projects.length > 0 || assets.length > 0 || Boolean(config) || Object.keys(projectTombstones).length > 0,
    };
}

export async function clearLegacyWorkspace(workspace: LegacyWorkspace): Promise<void> {
    await Promise.all([CANVAS_STORE_KEY, ASSET_STORE_KEY, CONFIG_STORE_KEY, ...workspace.projectDetailKeys].map(removeLegacyValue));
}

async function readLegacyValue(key: string) {
    const stored = await localForageStorage.getItem(key);
    if (stored !== null) return stored;
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
}

async function removeLegacyValue(key: string) {
    await localForageStorage.removeItem(key);
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
}

function readPersistedState(value: string | null, key: string): unknown {
    if (!value) return null;
    const parsed = parseJson(value, key);
    if (!parsed || typeof parsed !== "object") throw new Error("旧工作区数据格式无效：" + key);
    return "state" in parsed ? (parsed as { state?: unknown }).state ?? null : parsed;
}

function readPlainObject(value: string | null, key: string): Record<string, unknown> | null {
    if (!value) return null;
    const parsed = parseJson(value, key);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("旧画布详情格式无效：" + key);
    return parsed as Record<string, unknown>;
}

function parseJson(value: string, key: string): Record<string, unknown> {
    try {
        return JSON.parse(value) as Record<string, unknown>;
    } catch {
        throw new Error("旧工作区数据无法解析：" + key);
    }
}

function normalizeLegacyProject(source: Partial<CanvasProject>): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: source.id || crypto.randomUUID(),
        title: source.title || "未命名画布",
        createdAt: source.createdAt || now,
        updatedAt: source.updatedAt || source.createdAt || now,
        nodes: Array.isArray(source.nodes) ? source.nodes : [],
        connections: Array.isArray(source.connections) ? source.connections : [],
        nodeSequenceCounters: source.nodeSequenceCounters || {},
        referenceOrderCounter: source.referenceOrderCounter || 0,
        chatSessions: Array.isArray(source.chatSessions) ? source.chatSessions : [],
        activeChatId: source.activeChatId || null,
        backgroundMode: source.backgroundMode || "lines",
        connectionStyle: source.connectionStyle || "curve",
        inputPreference: source.inputPreference || { wheelMode: "zoom" as const, wheelDirection: "normal" as const },
        toolbarDock: source.toolbarDock || "bottom",
        snapToGrid: Boolean(source.snapToGrid),
        alignmentGuidesEnabled: source.alignmentGuidesEnabled !== false,
        showImageInfo: Boolean(source.showImageInfo),
        showConnections: source.showConnections !== false,
        versionHistory: Array.isArray(source.versionHistory) ? source.versionHistory.slice(0, 5) : [],
        viewport: source.viewport || { x: 0, y: 0, k: 1 },
    };
}
