import { saveAs } from "file-saver";

import { createZip, readZip } from "@/lib/zip";
import { replaceBackendStorageReferences, uploadBackendFile, type BackendUploadedFile } from "@/services/api/backend-storage";
import { getMediaBlob, setMediaBlob } from "@/services/file-storage";
import { getImageBlob, setImageBlob } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";
import type { SaveMode } from "@/stores/use-user-store";

type AssetExportFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    assets: Asset[];
    files: AssetExportItem[];
};

type AssetExportItem = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export async function exportAssets(assets: Asset[]) {
    const files: AssetExportItem[] = [];
    const zipFiles: { name: string; data: BlobPart }[] = [];

    await Promise.all(
        assets.map(async (asset) => {
            if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
            const storageKey = asset.data.storageKey;
            if (!storageKey) return;
            const blob = asset.kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) return;
            const path = `files/${safeFileName(storageKey)}.${fileExtension(blob.type, asset.kind)}`;
            files.push({ storageKey, path, mimeType: blob.type || asset.data.mimeType, bytes: blob.size });
            zipFiles.push({ name: path, data: blob });
        }),
    );

    const data: AssetExportFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), assets, files };
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, "我的素材.zip");
}

export async function readAssetPackage(file: File, saveMode: SaveMode, token: string) {
    const zip = await readZip(file);
    const assetFile = zip.get("assets.json");
    if (!assetFile) throw new Error("missing assets.json");
    const data = JSON.parse(await assetFile.text()) as AssetExportFile;
    const packageFiles = new Map<string, { path: string; blob: Blob }>();
    data.files.forEach((item) => {
        if (packageFiles.has(item.storageKey)) return;
        const blob = zip.get(item.path);
        if (!blob) throw new Error(`missing media file: ${item.path}`);
        packageFiles.set(item.storageKey, {
            path: item.path,
            blob: blob.type ? blob : blob.slice(0, blob.size, item.mimeType),
        });
    });

    if (saveMode === "backend") {
        if (!token) throw new Error("请先登录后端账号");
        const uploads = new Map<string, BackendUploadedFile>();
        await Promise.all(
            Array.from(packageFiles.entries()).map(async ([storageKey, item]) => {
                const uploaded = await uploadBackendFile(token, item.blob, item.path.split("/").pop() || "file");
                uploads.set(storageKey, uploaded);
            }),
        );
        return replaceBackendStorageReferences(data.assets, uploads, token);
    }

    await Promise.all(
        Array.from(packageFiles.entries()).map(([storageKey, item]) =>
            storageKey.startsWith("image:") ? setImageBlob(storageKey, item.blob) : setMediaBlob(storageKey, item.blob),
        ),
    );
    return data.assets;
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, kind: Asset["kind"]) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (kind === "audio" && mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("aac")) return "aac";
    return kind === "image" ? "png" : kind === "audio" ? "mp3" : "bin";
}
