"use client";

import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
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
    const storageKey = `image:${nanoid()}`;
    const url = await imageBlobs.setBlob(storageKey, blob);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

/** Synchronous check for a cached blob URL. Returns undefined if not yet resolved. */
export function peekCachedImageUrl(storageKey?: string): string | undefined {
    return imageBlobs.peekUrl(storageKey);
}

export function resolveImageUrl(storageKey?: string, fallback = "") {
    return imageBlobs.resolveUrl(storageKey, fallback);
}

export function getImageBlob(storageKey: string) {
    return imageBlobs.getBlob(storageKey);
}

export function setImageBlob(storageKey: string, blob: Blob) {
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
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
        return await response.blob();
    } catch (error) {
        // data: URL 和同源 URL 不需要 fallback；CORS / 网络错误时才尝试走服务端代理
        if (error instanceof TypeError && /^https?:/i.test(url)) {
            const proxiedUrl = `/api/ai-proxy?target=${encodeURIComponent(url)}`;
            const response = await fetch(proxiedUrl);
            if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`);
            return await response.blob();
        }
        throw error;
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
