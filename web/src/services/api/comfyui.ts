import { nanoid } from "nanoid";

import { apiUrl } from "@/constant/env";
import type { ComfyUiConfig } from "@/stores/use-config-store";
import type { ComfyWorkflowJson } from "@/services/comfyui-workflows";

export type ComfyPromptResponse = {
    prompt_id?: string;
    number?: number;
    node_errors?: Record<string, unknown>;
};

export type ComfyHistoryItem = {
    outputs?: Record<string, Record<string, unknown>>;
    status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
};

export type ComfyOutputFile = {
    filename: string;
    subfolder?: string;
    type?: string;
};

type ComfyRequestOptions = {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
};

export async function testComfyConnection(config: ComfyUiConfig) {
    try {
        return await comfyRequest<Record<string, unknown>>(config, "/system_stats");
    } catch {
        return comfyRequest<Record<string, unknown>>(config, "/object_info");
    }
}

export async function queueComfyPrompt(config: ComfyUiConfig, workflow: ComfyWorkflowJson, signal?: AbortSignal) {
    const payload = await comfyRequest<ComfyPromptResponse>(config, "/prompt", {
        method: "POST",
        body: {
            prompt: workflow,
            client_id: config.clientId.trim() || `flow-canvas-${nanoid(8)}`,
        },
        signal,
    });
    if (!payload.prompt_id) throw new Error("ComfyUI 没有返回 prompt_id");
    if (payload.node_errors && Object.keys(payload.node_errors).length) throw new Error("ComfyUI 工作流节点校验失败");
    return payload;
}

export async function getComfyHistory(config: ComfyUiConfig, promptId: string, signal?: AbortSignal) {
    return comfyRequest<Record<string, ComfyHistoryItem>>(config, `/history/${encodeURIComponent(promptId)}`, { signal });
}

export async function waitForComfyHistory(config: ComfyUiConfig, promptId: string, signal?: AbortSignal) {
    const timeoutMs = Math.max(10, Number(config.timeoutSeconds) || 300) * 1000;
    const intervalMs = Math.max(500, Number(config.pollIntervalMs) || 1200);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const history = await getComfyHistory(config, promptId, signal);
        const item = history[promptId];
        if (item?.outputs || item?.status?.completed) return item;
        await sleep(intervalMs, signal);
    }
    throw new Error("ComfyUI 任务等待超时");
}

export function extractComfyOutputImages(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, ["images", "image"]);
}

export function extractComfyOutputVideos(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, ["videos", "video", "gifs", "gif", "animated"]);
}

export function extractComfyOutputAudios(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, ["audio", "audios"]);
}

export type ComfyUploadResult = {
    name: string;
    subfolder?: string;
    type?: string;
};

export async function uploadComfyFile(config: ComfyUiConfig, blob: Blob, filename: string, signal?: AbortSignal): Promise<ComfyUploadResult> {
    const formData = new FormData();
    formData.append("image", blob, filename);
    let response: Response;
    if (config.proxyMode === "backend") {
        formData.append("baseUrl", normalizeComfyBaseUrl(config.baseUrl));
        response = await fetch(apiUrl("/api/comfyui-proxy"), { method: "POST", body: formData, signal });
    } else {
        const baseUrl = normalizeComfyBaseUrl(config.baseUrl);
        response = await fetch(`${baseUrl}/upload/image`, { method: "POST", body: formData, signal });
    }
    if (!response.ok) throw new Error(await readComfyError(response));
    return response.json() as Promise<ComfyUploadResult>;
}

export function buildComfyViewUrl(config: ComfyUiConfig, file: ComfyOutputFile) {
    const params = new URLSearchParams({
        filename: file.filename,
        type: file.type || "output",
    });
    if (file.subfolder) params.set("subfolder", file.subfolder);
    const path = `/view?${params}`;
    const proxyParams = new URLSearchParams({ baseUrl: normalizeComfyBaseUrl(config.baseUrl), path });
    return apiUrl(`/api/comfyui-proxy?${proxyParams}`);
}

export async function runComfyWorkflow(config: ComfyUiConfig, workflow: ComfyWorkflowJson, signal?: AbortSignal) {
    const queued = await queueComfyPrompt(config, workflow, signal);
    const history = await waitForComfyHistory(config, queued.prompt_id!, signal);
    const images = extractComfyOutputImages(history).map((file) => buildComfyViewUrl(config, file));
    const videos = extractComfyOutputVideos(history).map((file) => buildComfyViewUrl(config, file));
    const audios = extractComfyOutputAudios(history).map((file) => buildComfyViewUrl(config, file));
    return { promptId: queued.prompt_id!, history, images, videos, audios };
}

async function comfyRequest<T>(config: ComfyUiConfig, path: string, options: ComfyRequestOptions = {}): Promise<T> {
    const method = options.method || "GET";
    const baseUrl = normalizeComfyBaseUrl(config.baseUrl);
    const init: RequestInit = {
        method,
        signal: options.signal,
        headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    };
    const response =
        config.proxyMode === "backend"
            ? await fetch(apiUrl("/api/comfyui-proxy"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ baseUrl, path, method, body: options.body }),
                  signal: options.signal,
              })
            : await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) throw new Error(await readComfyError(response));
    return response.json() as Promise<T>;
}

function extractComfyOutputFiles(history: ComfyHistoryItem, keys: string[]) {
    return Object.values(history.outputs || {}).flatMap((output) =>
        keys.flatMap((key) => {
            const value = output[key];
            if (Array.isArray(value)) return value.filter(isComfyOutputFile);
            return isComfyOutputFile(value) ? [value] : [];
        }),
    );
}

function isComfyOutputFile(value: unknown): value is ComfyOutputFile {
    return Boolean(value && typeof value === "object" && "filename" in value && typeof (value as ComfyOutputFile).filename === "string");
}

export function normalizeComfyBaseUrl(baseUrl: string) {
    const value = baseUrl.trim().replace(/\/+$/, "");
    return value || "http://127.0.0.1:8188";
}

async function readComfyError(response: Response) {
    const text = await response.text();
    if (!text) return `ComfyUI 请求失败：HTTP ${response.status}`;
    try {
        const payload = JSON.parse(text) as { detail?: string; error?: string };
        return payload.detail || payload.error || `ComfyUI 请求失败：HTTP ${response.status}`;
    } catch {
        return text.slice(0, 300);
    }
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timer);
                reject(new DOMException("请求已取消", "AbortError"));
            },
            { once: true },
        );
    });
}
