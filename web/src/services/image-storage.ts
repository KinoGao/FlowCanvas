"use client";

import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { apiUrl } from "@/constant/env";
import { useUserStore } from "@/stores/use-user-store";
import { peekBackendFileUrl, resolveBackendFileUrl, uploadBackendFile } from "@/services/api/backend-storage";
import { createBlobStorage } from "./blob-storage";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const imageBlobs = createBlobStorage(store);

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await fetchImageBlob(input) : input;
    const { saveMode, token } = useUserStore.getState();
    if (saveMode === "backend") {
        if (!token) throw new Error("请先登录后端账号");
        const uploaded = await uploadBackendFile(token, blob, "image.png");
        const url = uploaded.url;
        const meta = await readImageMeta(url);
        return { url, storageKey: uploaded.storageKey, width: meta.width, height: meta.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType || blob.type || meta.mimeType };
    }
    const storageKey = `image:${nanoid()}`;
    const url = await imageBlobs.setBlob(storageKey, blob);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

/** Synchronous check for a cached blob URL. Returns undefined if not yet resolved. */
export function peekCachedImageUrl(storageKey?: string): string | undefined {
    if (storageKey?.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        return token ? peekBackendFileUrl(storageKey, token) : undefined;
    }
    return imageBlobs.peekUrl(storageKey);
}

export function resolveImageUrl(storageKey?: string, fallback = "") {
    if (storageKey?.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        return token ? resolveBackendFileUrl(storageKey, token) : Promise.resolve(fallback);
    }
    return imageBlobs.resolveUrl(storageKey, fallback);
}

export function getImageBlob(storageKey: string) {
    if (storageKey.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        if (!token) return Promise.resolve(null);
        return resolveBackendFileUrl(storageKey, token)
            .then((url) => fetch(url))
            .then((response) => (response.ok ? response.blob() : null));
    }
    return imageBlobs.getBlob(storageKey);
}

export function setImageBlob(storageKey: string, blob: Blob) {
    const { saveMode, token } = useUserStore.getState();
    if (storageKey.startsWith("backend:")) {
        if (!token) throw new Error("请先登录后端账号");
        return resolveBackendFileUrl(storageKey, token);
    }
    if (saveMode === "backend") throw new Error("后端工作区不允许写入浏览器媒体缓存");
    return imageBlobs.setBlob(storageKey, blob);
}

export async function imageToBlob(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    if (image.storageKey) {
        const blob = await getImageBlob(image.storageKey);
        if (blob) return blob;
    }
    const url = image.dataUrl || image.url || "";
    if (!url || url.startsWith("blob:")) throw new Error("图片引用已失效，请重新上传或重新生成图片");
    return fetchImageBlob(url);
}

export async function imageToFile(image: { name?: string; type?: string; url?: string; dataUrl?: string; storageKey?: string }) {
    const blob = await imageToBlob(image);
    return new File([blob], image.name || "reference.png", { type: blob.type || image.type || "image/png" });
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    if (image.dataUrl?.startsWith("data:")) return image.dataUrl;
    return blobToDataUrl(await imageToBlob(image));
}

export function deleteStoredImages(keys: Iterable<string>) {
    return imageBlobs.deleteBlobs(keys);
}

export async function cleanupUnusedImages(usedData: unknown) {
    await imageBlobs.removeUnused(collectImageStorageKeys(usedData));
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

async function fetchImageBlob(url: string): Promise<Blob> {
    if (shouldPreferImageProxy(url)) return fetchImageBlobThroughProxy(url);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
        return await response.blob();
    } catch (error) {
        // data: URL 和同源 URL 不需要 fallback；CORS / 网络错误时才尝试走服务端代理
        if (error instanceof TypeError && /^https?:/i.test(url)) {
            return fetchImageBlobThroughProxy(url);
        }
        throw error;
    }
}

async function fetchImageBlobThroughProxy(url: string): Promise<Blob> {
    const errors: string[] = [];
    for (const proxiedUrl of imageProxyCandidates(url)) {
        try {
            const response = await fetch(proxiedUrl);
            if (!response.ok) {
                errors.push(`${proxyOriginLabel(proxiedUrl)} HTTP ${response.status}`);
                continue;
            }
            const blob = await response.blob();
            if (!blob.type.startsWith("image/")) {
                errors.push(`${proxyOriginLabel(proxiedUrl)} 返回 ${blob.type || "未知类型"}`);
                continue;
            }
            return blob;
        } catch (proxyError) {
            errors.push(`${proxyOriginLabel(proxiedUrl)} ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`);
        }
    }
    throw new Error(`下载图片失败：代理不可用${errors.length ? `（${errors.join("；")}）` : ""}`);
}

function imageProxyCandidates(url: string) {
    const path = `/api/ai-proxy?target=${encodeURIComponent(url)}`;
    const candidates = new Set<string>();

    const configured = apiUrl(path);
    candidates.add(configured);
    if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
        const configuredUrl = new URL(configured, window.location.origin);
        if (configuredUrl.origin === window.location.origin) {
            candidates.add(`${window.location.protocol}//127.0.0.1:9801${path}`);
            candidates.add(`${window.location.protocol}//localhost:9801${path}`);
        }
    }
    return Array.from(candidates);
}

function shouldPreferImageProxy(url: string) {
    if (!/^https?:/i.test(url)) return false;
    try {
        const parsed = new URL(url);
        const { hostname } = parsed;
        return hostname === "platform-outputs.agnes-ai.space"
            || hostname.endsWith(".tos-cn-beijing.volces.com")
            || parsed.searchParams.has("X-Tos-Algorithm");
    } catch {
        return false;
    }
}

function isLocalDevHost(hostname: string) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function proxyOriginLabel(value: string) {
    try {
        const url = new URL(value, typeof window !== "undefined" ? window.location.href : undefined);
        return url.origin;
    } catch {
        return value;
    }
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}
