import { apiUrl } from "@/constant/env";
import { ApiError } from "@/services/api/auth";
import type { ComfyWorkflow, ComfyWorkflowField, ComfyWorkflowJson } from "@/services/comfyui-workflows";

export type PlatformProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    modelsPath: string;
    enabled: boolean;
};

export type ModelCategory = "text" | "image" | "video";

export type TextCapabilities = {
    modes: Array<"text" | "vision">;
};

export type ImageCapabilities = {
    modes: Array<"text-to-image" | "image-to-image" | "image-edit">;
    qualities: Array<"low" | "standard" | "high">;
    resolutions: Array<"1k" | "2k" | "4k">;
    ratios: string[];
    counts: number[];
};

export type VideoCapabilities = {
    modes: Array<"text-to-video" | "all-in-one-reference" | "image-to-video" | "first-last-frame" | "image-reference" | "multi-frame">;
    ratios: string[];
    resolutions: string[];
    durations: number[];
    counts: number[];
    generateAudio: boolean;
    watermark: boolean;
    draft: boolean;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
};

export type PlatformModel = {
    id: string;
    providerId: string;
    displayName: string;
    requestModel: string;
    category: ModelCategory;
    requestAdapter: string;
    enabled: boolean;
    published: boolean;
    modelPatterns: string[];
    textCapabilities: TextCapabilities | null;
    imageCapabilities: ImageCapabilities | null;
    videoCapabilities: VideoCapabilities | null;
};

export type PlatformComfyUi = {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    defaultWorkflowId: string;
    timeoutSeconds: number;
    pollIntervalMs: number;
};

export type PlatformConfigDocument = {
    providers: PlatformProvider[];
    models: PlatformModel[];
    comfyui: PlatformComfyUi;
};

export type RuntimeModel = Omit<PlatformModel, "providerId" | "requestModel" | "enabled" | "published">;
export type RuntimeProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: "openai" | "gemini";
    models: RuntimeModel[];
};
export type RuntimeConfig = {
    providers: RuntimeProvider[];
    comfyui: Omit<PlatformComfyUi, "baseUrl">;
};

export type AdminProjectSummary = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type AdminUserWorkspace = {
    id: string;
    username: string;
    displayName: string;
    role: "USER" | "ADMIN";
    createdAt: string;
    updatedAt: string;
    projectCount: number;
    activeProjectCount: number;
    assetCount: number;
    fileCount: number;
    fileBytes: number;
    projects: AdminProjectSummary[];
};

export type AdminWorkspaceSummary = { users: AdminUserWorkspace[] };
export type AdminProjectDetail = AdminProjectSummary & { userId: string; project: unknown };

type ApiEnvelope<T> = { code: number; data: T; msg?: string };

async function readApi<T>(response: Response): Promise<T> {
    let body: ApiEnvelope<T> | null = null;
    try { body = (await response.json()) as ApiEnvelope<T>; } catch { body = null; }
    if (!response.ok || body?.code !== 0) throw new ApiError(body?.msg || `请求失败：${response.status}`, response.status);
    return body.data;
}

function adminHeaders(authCode: string): HeadersInit {
    return { Authorization: "Bearer " + authCode.trim(), "Content-Type": "application/json" };
}

export async function fetchRuntimeConfig() {
    return readApi<RuntimeConfig>(await fetch(apiUrl("/api/runtime-config")));
}

export async function fetchPlatformConfig(authCode: string) {
    return readApi<PlatformConfigDocument>(await fetch(apiUrl("/api/admin/platform-config"), { headers: adminHeaders(authCode) }));
}

export async function savePlatformConfig(authCode: string, config: PlatformConfigDocument) {
    return readApi<PlatformConfigDocument>(
        await fetch(apiUrl("/api/admin/platform-config"), { method: "PUT", headers: adminHeaders(authCode), body: JSON.stringify(config) }),
    );
}

export async function fetchAdminWorkspaces(authCode: string) {
    return readApi<AdminWorkspaceSummary>(await fetch(apiUrl("/api/admin/workspaces"), { headers: adminHeaders(authCode) }));
}

export async function discoverProviderModels(authCode: string, providerId: string) {
    return readApi<string[]>(
        await fetch(apiUrl("/api/admin/providers/" + encodeURIComponent(providerId) + "/discover-models"), {
            method: "POST",
            headers: adminHeaders(authCode),
        }),
    );
}

export async function fetchAdminProject(authCode: string, userId: string, projectId: string) {
    return readApi<AdminProjectDetail>(
        await fetch(apiUrl("/api/admin/workspaces/" + encodeURIComponent(userId) + "/projects/" + encodeURIComponent(projectId)), {
            headers: adminHeaders(authCode),
        }),
    );
}

export async function updateAdminUser(token: string, userId: string, input: { username: string; displayName: string; role: "USER" | "ADMIN" }) {
    return readApi<AdminUserWorkspace>(
        await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId)), {
            method: "PUT", headers: adminHeaders(token), body: JSON.stringify(input),
        }),
    );
}

export async function resetAdminUserPassword(token: string, userId: string, password: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId) + "/password"), {
        method: "PUT", headers: adminHeaders(token), body: JSON.stringify({ password }),
    }));
}

export async function deleteAdminUser(token: string, userId: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId)), {
        method: "DELETE", headers: adminHeaders(token),
    }));
}

export async function deleteAdminProject(token: string, userId: string, projectId: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId) + "/projects/" + encodeURIComponent(projectId)), {
        method: "DELETE", headers: adminHeaders(token),
    }));
}

export async function fetchPublishedWorkflows() {
    return readApi<ComfyWorkflow[]>(await fetch(apiUrl("/api/workflows")));
}

export async function uploadAdminWorkflow(authCode: string, name: string, workflow: ComfyWorkflowJson) {
    return readApi<ComfyWorkflow>(
        await fetch(apiUrl("/api/workflows/upload"), {
            method: "POST",
            headers: adminHeaders(authCode),
            body: JSON.stringify({ name, workflow }),
        }),
    );
}

export async function saveAdminWorkflowConfig(authCode: string, id: string, config: { title: string; fields: ComfyWorkflowField[] }) {
    return readApi<ComfyWorkflow>(
        await fetch(apiUrl("/api/workflows/" + encodeURIComponent(id) + "/config"), {
            method: "PUT",
            headers: adminHeaders(authCode),
            body: JSON.stringify(config),
        }),
    );
}

export async function deleteAdminWorkflow(authCode: string, id: string) {
    await readApi<null>(
        await fetch(apiUrl("/api/workflows/" + encodeURIComponent(id)), { method: "DELETE", headers: adminHeaders(authCode) }),
    );
}
