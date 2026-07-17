import { apiUrl } from "@/constant/env";
import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import { ApiError, bearerHeaders } from "./auth";

const TRANSIENT_RETRY_DELAYS_MS = [800, 2000];
const TRANSIENT_RETRY_STATUSES = new Set([502, 503, 504]);

export type BackendBootstrap = {
    config: { data: string; updatedAt: string } | null;
    projects: CanvasProject[];
    projectTombstones?: Record<string, string>;
    assets: Asset[];
};

export type BackendUploadedFile = {
    storageKey: string;
    url: string;
    bytes: number;
    mimeType: string;
    fileName: string;
};

async function readApi<T>(response: Response): Promise<T> {
    let body: { code?: number; data?: unknown; msg?: string } | null = null;
    try {
        body = (await response.json()) as { code?: number; data?: unknown; msg?: string };
    } catch {
        body = null;
    }
    if (!response.ok || body?.code !== 0) throw new ApiError(body?.msg || `请求失败：${response.status}`, response.status);
    return body.data as T;
}

async function fetchWithTransientRetry(input: RequestInfo | URL, init?: RequestInit) {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(input, init);
            if (!TRANSIENT_RETRY_STATUSES.has(response.status) || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) return response;
        } catch (error) {
            if (attempt >= TRANSIENT_RETRY_DELAYS_MS.length) throw error;
        }
        await new Promise((resolve) => window.setTimeout(resolve, TRANSIENT_RETRY_DELAYS_MS[attempt]));
    }
}

export async function fetchBackendBootstrap(token: string): Promise<BackendBootstrap> {
    return readApi<BackendBootstrap>(await fetchWithTransientRetry(apiUrl("/api/user/bootstrap"), { headers: bearerHeaders(token) }));
}

export async function pushBackendConfig(token: string, config: AiConfig): Promise<void> {
    await readApi<void>(
        await fetchWithTransientRetry(apiUrl("/api/user/config"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ data: JSON.stringify(config) }),
        }),
    );
}

export async function pushBackendProjects(token: string, projects: CanvasProject[], projectTombstones: Record<string, string> = {}): Promise<void> {
    await readApi<void>(
        await fetchWithTransientRetry(apiUrl("/api/user/projects"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ projects, projectTombstones }),
        }),
    );
}

export async function pushBackendAssets(token: string, assets: Asset[]): Promise<void> {
    await readApi<void>(
        await fetchWithTransientRetry(apiUrl("/api/user/assets"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ assets }),
        }),
    );
}

export type GenerationLogKind = "image" | "video";

export async function fetchBackendGenerationLogs<T>(token: string, kind: GenerationLogKind): Promise<T[]> {
    return readApi<T[]>(
        await fetchWithTransientRetry(apiUrl(`/api/user/generation-logs?kind=${encodeURIComponent(kind)}`), {
            headers: bearerHeaders(token),
        }),
    );
}

export async function putBackendGenerationLog<T>(token: string, kind: GenerationLogKind, id: string, log: T): Promise<void> {
    await readApi<void>(
        await fetchWithTransientRetry(apiUrl(`/api/user/generation-logs/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}`), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ log }),
        }),
    );
}

export async function deleteBackendGenerationLog(token: string, kind: GenerationLogKind, id: string): Promise<void> {
    await readApi<void>(
        await fetchWithTransientRetry(apiUrl(`/api/user/generation-logs/${encodeURIComponent(id)}?kind=${encodeURIComponent(kind)}`), {
            method: "DELETE",
            headers: bearerHeaders(token),
        }),
    );
}

export async function uploadBackendFile(token: string, blob: Blob, fileName = "file"): Promise<BackendUploadedFile> {
    const form = new FormData();
    form.append("file", blob, fileName);
    return readApi<BackendUploadedFile>(
        await fetch(apiUrl("/api/user/files"), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        }),
    );
}

export function backendFileUrl(storageKey: string, token: string) {
    const [prefix, id] = storageKey.split(":");
    if (!prefix || !id || !token) return "";
    return apiUrl(`/api/user/files/${encodeURIComponent(prefix)}:${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
}

export function replaceBackendStorageReferences<T>(value: T, uploads: ReadonlyMap<string, BackendUploadedFile>, token: string): T {
    const visit = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(visit);
        if (!input || typeof input !== "object") return input;

        const source = input as Record<string, unknown>;
        const next = Object.fromEntries(Object.entries(source).map(([key, item]) => [key, visit(item)]));
        const storageKey = typeof source.storageKey === "string" ? source.storageKey : "";
        const uploaded = uploads.get(storageKey);
        if (!uploaded) return next;

        const url = backendFileUrl(uploaded.storageKey, token);
        next.storageKey = uploaded.storageKey;
        next.bytes = uploaded.bytes;
        next.mimeType = uploaded.mimeType;
        for (const key of ["content", "dataUrl", "url", "coverUrl"]) {
            if (typeof source[key] === "string") next[key] = url;
        }
        return next;
    };

    return visit(value) as T;
}
