"use client";

import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";

import type { CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType } from "../types";

export type CanvasMediaStats = { images: number; videos: number; audios: number; total: number };

/** 统计画布中的媒体节点数量，用于加载动画文案。 */
export function countProjectMedia(project: CanvasProject): CanvasMediaStats {
    let images = 0;
    let videos = 0;
    let audios = 0;
    for (const node of project.nodes) {
        if (node.type === CanvasNodeType.Image) images++;
        else if (node.type === CanvasNodeType.Video) videos++;
        else if (node.type === CanvasNodeType.Audio) audios++;
    }
    return { images, videos, audios, total: images + videos + audios };
}

/**
 * 预加载画布媒体内容：
 * - data:image 图片节点：uploadImage 转存（带 dataUrl 缓存，画布页恢复时不会重复上传）
 * - 带 storageKey 的图片 / 视频 / 音频：预热签名 URL（后端）或本地 blob URL 缓存
 * - 助手会话引用同步预热
 * 单项失败不抛出（组件渲染时降级显示占位），返回成功 / 失败统计。
 */
export async function preloadCanvasMedia(project: CanvasProject): Promise<{ resolved: number; failed: number }> {
    const tasks: Promise<unknown>[] = [];
    for (const node of project.nodes) {
        const content = node.metadata?.content;
        if (node.type === CanvasNodeType.Image) {
            if (content?.startsWith("data:image/")) tasks.push(uploadImage(content));
            else if (node.metadata?.storageKey) tasks.push(resolveImageUrl(node.metadata.storageKey, ""));
        } else if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey) {
            tasks.push(resolveMediaUrl(node.metadata.storageKey, ""));
        }
    }
    for (const session of project.chatSessions || []) {
        for (const message of session.messages) {
            for (const ref of message.references || []) {
                if (!ref.storageKey) continue;
                tasks.push(ref.type === CanvasNodeType.Video ? resolveMediaUrl(ref.storageKey, "") : resolveImageUrl(ref.storageKey, ""));
            }
        }
    }
    const results = await Promise.allSettled(tasks);
    return {
        resolved: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
    };
}
