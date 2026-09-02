import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { CanvasExportAsset, CanvasExportFile } from "../export-types";
import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

/** 导出选中节点（对齐上游）：媒体文件/文本导出实际内容，其余导出节点 JSON，打包 zip 下载。 */
export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = "画布节点") {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || "节点";
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    for (const node of nodes) {
        const title = node.title || node.type;
        const storageKey = node.metadata?.storageKey || "";
        if (storageKey) {
            const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (blob) {
                zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
                continue;
            }
        }
        if (node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Script) {
            zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.scriptBody || node.metadata?.prompt || "" });
            continue;
        }
        const content = node.metadata?.content;
        if (content && content.startsWith("data:")) {
            const blob = await (await fetch(content)).blob();
            zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            continue;
        }
        zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
    }

    const data = { app: "infinite-canvas", exportedAt: new Date().toISOString(), nodes: zipFiles };
    const zip = await createZip([{ name: "nodes.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}


export async function exportCanvasProjects(projects: CanvasProject[], fileName = "无限画布") {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectStorageKeys(project).map(async (storageKey) => {
                    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "infinite-canvas", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
