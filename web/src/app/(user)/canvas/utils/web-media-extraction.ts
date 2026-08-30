/**
 * 网页信息提取（纯函数，无 DOM 依赖，便于单测）。
 *
 * 背景：网页预览禁止使用 iframe。这里把「读取一个 URL 页面」降级为两张来源：
 *  1) 后端 reader 端点返回已解析的 HTML/link（见 services/api/web-preview），
 *  2) 前端拿 HTML 字符串用本模块提取 title / description / 图片 / 视频。
 * 提取是尽力而为（适用于绝大多数静态 HTML 与营销页），失败则给出空结果由上层降级。
 */

export type WebPageExtraction = {
    title: string;
    description: string;
    images: string[];
    videos: string[];
};

function decodeEntities(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** 从 HTML 头部提取 <title>（返回解码后的纯文本）。 */
export function extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? decodeEntities(match[1]) : "";
}

/** 提取 meta[name=description] / og:description 与 og:title（作为兜底）。 */
export function extractDescriptionAndOgTitle(html: string): { description: string; ogTitle: string } {
    const descriptionMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
    const ogTitleMatch = html.match(/<meta[^>]+(?:name|property)=["']og:title["'][^>]+content=["']([^"']*)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']og:title["']/i);
    return {
        description: descriptionMatch ? decodeEntities(descriptionMatch[1]) : "",
        ogTitle: ogTitleMatch ? decodeEntities(ogTitleMatch[1]) : "",
    };
}

/** 提取页面里所有 <img> 的 src（含 data-src / srcset 首项）。 */
export function extractImages(html: string): string[] {
    const results: string[] = [];
    const imgRe = /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRe.exec(html)) !== null) {
        if (results.length >= 200) break;
        const url = normalizeRelative(match[1]);
        if (url && !results.includes(url) && !isDataUri(url)) results.push(url);
    }
    return results;
}

/** 提取页面中的 <video> / <source> 与常见视频提供方（mp4/webm）。 */
export function extractVideos(html: string): string[] {
    const results: string[] = [];
    const videoRe = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = videoRe.exec(html)) !== null) {
        const url = normalizeRelative(match[1]);
        if (url && !results.includes(url) && !isDataUri(url)) results.push(url);
    }
    // 常用视频机位（iframe 视频我们不做嵌入，仅记录投递地址供外部打开）
    const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
    while ((match = iframeRe.exec(html)) !== null) {
        const url = normalizeRelative(match[1]);
        if (url && /(youtube|bilibili|youku|vimeo)/i.test(url)) results.push(url);
    }
    return results;
}

function isDataUri(url: string): boolean {
    return /^(data:|blob:)/i.test(url);
}

/** 相对地址补全：仅当能解析出绝对 URL 时返回，否则原样返回（由上层决定是否给 base）。 */
function normalizeRelative(url: string): string {
    return decodeEntities(url);
}

/** 一站式提取页面信息。 */
export function extractWebPageInfo(html: string): WebPageExtraction {
    const title = extractTitle(html);
    const { description, ogTitle } = extractDescriptionAndOgTitle(html);
    return {
        title: title || ogTitle,
        description: description || "",
        images: extractImages(html),
        videos: extractVideos(html),
    };
}
