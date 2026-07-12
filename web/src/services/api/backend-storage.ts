import { apiUrl } from "@/constant/env";
import type { CanvasProject } from "@/app/(user)/canvas/stores/use-canvas-store";
import type { Asset } from "@/stores/use-asset-store";
import type { AiConfig } from "@/stores/use-config-store";
import { bearerHeaders } from "./auth";

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
    if (!response.ok || body?.code !== 0) throw new Error(body?.msg || `请求失败：${response.status}`);
    return body.data as T;
}

export async function fetchBackendBootstrap(token: string): Promise<BackendBootstrap> {
    return readApi<BackendBootstrap>(await fetch(apiUrl("/api/user/bootstrap"), { headers: bearerHeaders(token) }));
}

export async function pushBackendConfig(token: string, config: AiConfig): Promise<void> {
    await readApi<void>(
        await fetch(apiUrl("/api/user/config"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ data: JSON.stringify(config) }),
        }),
    );
}

export async function pushBackendProjects(token: string, projects: CanvasProject[], projectTombstones: Record<string, string> = {}): Promise<void> {
    await readApi<void>(
        await fetch(apiUrl("/api/user/projects"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ projects, projectTombstones }),
        }),
    );
}

export async function pushBackendAssets(token: string, assets: Asset[]): Promise<void> {
    await readApi<void>(
        await fetch(apiUrl("/api/user/assets"), {
            method: "PUT",
            headers: bearerHeaders(token),
            body: JSON.stringify({ assets }),
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
