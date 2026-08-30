/**
 * 网页预览的「读取」服务：不再用 iframe 内嵌，而是请求后端 reader 端点解析页面。
 *
 * 本轮后端未实现 `/api/web-preview/read`，因此 fetcher 优雅降级返回 error；
 * 前端据此切换到「手动填写标题/摘要/缩略图 + 在浏览器打开」的可编辑引用卡。
 * 后续后端接入 reader 端点后，同一前端即可自动变为「读取到标题/描述/图片/视频」。
 */
import { apiUrl } from "@/constant/env";

type ApiResponse<T> = { code: number; data: T; msg?: string };

export type WebPageReadResult = {
    status: "success" | "error";
    /** 后端返回的页面原始 HTML（可选，前端再用 web-media-extraction 解析） */
    html?: string;
    title?: string;
    description?: string;
    images?: string[];
    videos?: string[];
    errorDetails?: string;
};

export async function fetchWebPageReader(url: string): Promise<WebPageReadResult> {
    try {
        const response = await fetch(apiUrl(`/api/web-preview/read?url=${encodeURIComponent(url)}`));
        if (!response.ok) return { status: "error", errorDetails: `读取失败 (${response.status})` };
        const body = (await response.json()) as ApiResponse<WebPageReadResult>;
        if (body.code !== 0) return { status: "error", errorDetails: body.msg || "读取失败" };
        return body.data ?? { status: "error", errorDetails: "空响应" };
    } catch {
        return { status: "error", errorDetails: "无法读取（跨域或未接入读取服务），请手动填写引用卡" };
    }
}
