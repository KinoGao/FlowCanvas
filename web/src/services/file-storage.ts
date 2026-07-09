"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";
import { backendFileUrl, uploadBackendFile } from "@/services/api/backend-storage";
import { useUserStore } from "@/stores/use-user-store";
import { createBlobStorage } from "./blob-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const mediaBlobs = createBlobStorage(store);

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const { saveMode, token } = useUserStore.getState();
    if (saveMode === "backend" && token) {
        const uploaded = await uploadBackendFile(token, blob, `${prefix}.${fileExtension(blob.type)}`);
        const url = backendFileUrl(uploaded.storageKey, token);
        const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
        return { url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType || blob.type || "application/octet-stream", ...meta };
    }
    const storageKey = `${prefix}:${nanoid()}`;
    const url = await mediaBlobs.setBlob(storageKey, blob);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

/** Synchronous check for a cached blob URL. Returns undefined if not yet resolved. */
export function peekCachedMediaUrl(storageKey?: string): string | undefined {
    if (storageKey?.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        return token ? backendFileUrl(storageKey, token) : undefined;
    }
    return mediaBlobs.peekUrl(storageKey);
}

export function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (storageKey?.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        return Promise.resolve(token ? backendFileUrl(storageKey, token) : fallback);
    }
    return mediaBlobs.resolveUrl(storageKey, fallback);
}

export function getMediaBlob(storageKey: string) {
    if (storageKey.startsWith("backend:")) {
        const token = useUserStore.getState().token;
        if (!token) return Promise.resolve(null);
        return fetch(backendFileUrl(storageKey, token)).then((response) => (response.ok ? response.blob() : null));
    }
    return mediaBlobs.getBlob(storageKey);
}

export function setMediaBlob(storageKey: string, blob: Blob) {
    if (storageKey.startsWith("backend:")) return Promise.resolve(backendFileUrl(storageKey, useUserStore.getState().token));
    return mediaBlobs.setBlob(storageKey, blob);
}

export function deleteStoredMedia(keys: Iterable<string>) {
    return mediaBlobs.deleteBlobs(keys);
}

export async function cleanupUnusedMedia(usedData: unknown) {
    await mediaBlobs.removeUnused(collectMediaStorageKeys(usedData));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}

function fileExtension(mimeType: string) {
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    return "bin";
}
