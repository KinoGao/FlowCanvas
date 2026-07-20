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

const SIGNED_URL_REFRESH_SKEW_MS = 60_000;
const MAX_SIGNED_FILES_PER_REQUEST = 2000;

type BackendFileUrlCacheEntry = {
    url: string;
    expiresAt: number;
    token: string;
};

const backendFileUrlCache = new Map<string, BackendFileUrlCacheEntry>();

export async function uploadBackendFile(token: string, blob: Blob, fileName = "file"): Promise<BackendUploadedFile> {
    const form = new FormData();
    form.append("file", blob, fileName);
    const uploaded = await readApi<BackendUploadedFile>(
        await fetch(apiUrl("/api/user/files"), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        }),
    );
    cacheBackendFileUrl(uploaded.storageKey, uploaded.url, token);
    return uploaded;
}

export function cacheBackendFileUrl(storageKey: string, url: string, token: string) {
    if (!storageKey.startsWith("backend:") || !url || !token) return "";
    const normalizedUrl = normalizeBackendFileUrl(url);
    const expiresAt = signedUrlExpiry(normalizedUrl);
    backendFileUrlCache.set(storageKey, { url: normalizedUrl, expiresAt, token });
    return normalizedUrl;
}

export function peekBackendFileUrl(storageKey: string, token: string) {
    if (!storageKey.startsWith("backend:") || !token) return undefined;
    const cached = backendFileUrlCache.get(storageKey);
    if (!cached || cached.token !== token) return undefined;
    if (Date.now() + SIGNED_URL_REFRESH_SKEW_MS >= cached.expiresAt) {
        backendFileUrlCache.delete(storageKey);
        return undefined;
    }
    return cached.url;
}

export function clearBackendFileUrlCache() {
    backendFileUrlCache.clear();
}

export async function signBackendFiles(token: string, storageKeys: Iterable<string>) {
    if (!token) throw new Error("请先登录后端账号");
    const requested = Array.from(new Set(storageKeys)).filter((storageKey) => storageKey.startsWith("backend:"));
    const missing = requested.filter((storageKey) => !peekBackendFileUrl(storageKey, token));

    for (let offset = 0; offset < missing.length; offset += MAX_SIGNED_FILES_PER_REQUEST) {
        const batch = missing.slice(offset, offset + MAX_SIGNED_FILES_PER_REQUEST);
        const signed = await readApi<Record<string, string>>(
            await fetchWithTransientRetry(apiUrl("/api/user/files/sign"), {
                method: "POST",
                headers: bearerHeaders(token),
                body: JSON.stringify({ storageKeys: batch }),
            }),
        );
        Object.entries(signed || {}).forEach(([storageKey, url]) => cacheBackendFileUrl(storageKey, url, token));
    }

    return new Map(
        requested.flatMap((storageKey) => {
            const url = peekBackendFileUrl(storageKey, token);
            return url ? [[storageKey, url] as const] : [];
        }),
    );
}

export async function resolveBackendFileUrl(storageKey: string, token: string) {
    if (!storageKey.startsWith("backend:") || !token) return "";
    const cached = peekBackendFileUrl(storageKey, token);
    if (cached) return cached;
    const signed = await signBackendFiles(token, [storageKey]);
    const url = signed.get(storageKey);
    if (!url) throw new Error(`后端媒体文件不存在：${storageKey}`);
    return url;
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

        const url = cacheBackendFileUrl(uploaded.storageKey, uploaded.url, token);
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

function normalizeBackendFileUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    const configuredUrl = apiUrl(url);
    if (typeof window === "undefined") return configuredUrl;
    return new URL(configuredUrl, window.location.origin).toString();
}

function signedUrlExpiry(url: string) {
    try {
        const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
        const expires = Number(new URL(url, base).searchParams.get("expires"));
        if (Number.isFinite(expires) && expires > 0) return expires * 1000;
    } catch {
        // The backend always returns an expires parameter; use a short fallback for malformed responses.
    }
    return Date.now() + SIGNED_URL_REFRESH_SKEW_MS * 2;
}
