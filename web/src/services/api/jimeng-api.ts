import axios from "axios";

import type { JimengConfig } from "@/stores/use-config-store";

// ===== 即梦原生 API 调用 =====
// 域名: visual.volcengineapi.com
// 认证: AK/SK HMAC-SHA256（由 /api/jimeng-proxy 服务端签名）
// 所有请求都经 Next.js 代理，前端不直连即梦

const JIMENG_PROXY = "/api/jimeng-proxy";
const JIMENG_VERSION = "2022-08-31";

// ===== 即梦能力（req_key）定义 =====
// 即梦原生 API 用 req_key 区分能力，不用模型名
// 每个能力的请求参数结构不同，按类型分组

// ----- 图片能力 -----

/** 文生图能力（只传 prompt，可选传宽高/面积） */
type JimengT2ICapability = {
    type: "t2i";
    reqKey: string;
    label: string;
    /** v4.0/v4.6 的 scale 是 float 0-1；v3.0 没有 scale */
    hasScale?: "float" | "int";
    /** v4.0/v4.6 支持 force_single、size；v3.0 不支持 */
    hasSize?: boolean;
    /** v3.0 支持 use_pre_llm */
    hasPreLlm?: boolean;
};

/** 图生图能力（需传 1 张参考图 + prompt） */
type JimengI2ICapability = {
    type: "i2i";
    reqKey: string;
    label: string;
    inputImageCount: 1;
};

/** 局部重绘/消除（需传 2 张图：原图 + mask） */
type JimengInpaintCapability = {
    type: "inpaint";
    reqKey: string;
    label: string;
    inputImageCount: 2;
};

/** 智能扩图 outpainting（传 1 张图 + top/bottom/left/right；或 2 张图做画布扩展） */
type JimengOutpaintCapability = {
    type: "outpaint";
    reqKey: string;
    label: string;
};

/** 素材提取（传 1 张图 + image_edit_prompt） */
type JimengExtractCapability = {
    type: "extract";
    reqKey: string;
    label: string;
};

/** 智能超清（传 1 张图，可选 resolution） */
type JimengUHDRCapability = {
    type: "uhdr";
    reqKey: string;
    label: string;
};

type JimengImageCapability =
    | JimengT2ICapability
    | JimengI2ICapability
    | JimengInpaintCapability
    | JimengOutpaintCapability
    | JimengExtractCapability
    | JimengUHDRCapability;

const JIMENG_IMAGE_CAPABILITIES: JimengImageCapability[] = [
    // 文生图
    { type: "t2i", reqKey: "jimeng_t2i_v40", label: "即梦图片4.0", hasScale: "float", hasSize: true },
    { type: "t2i", reqKey: "jimeng_seedream46_cvtob", label: "即梦图片4.6", hasScale: "int", hasSize: true },
    { type: "t2i", reqKey: "jimeng_t2i_v30", label: "即梦文生图3.0/3.1", hasPreLlm: true },
    // 图生图
    { type: "i2i", reqKey: "jimeng_i2i_v30", label: "即梦图生图3.0智能参考", inputImageCount: 1 },
    // 智能扩图
    { type: "outpaint", reqKey: "jimeng_img2img_seed3_painting_edit", label: "即梦智能扩图" },
    // 局部重绘/消除
    { type: "inpaint", reqKey: "jimeng_image2image_dream_inpaint", label: "即梦交互编辑", inputImageCount: 2 },
    // 素材提取
    { type: "extract", reqKey: "i2i_material_extraction", label: "即梦素材提取" },
    // 智能超清
    { type: "uhdr", reqKey: "jimeng_i2i_seed3_tilesr_cvtob", label: "即梦智能超清" },
];

// ----- 视频能力 -----

type JimengVideoCapability = {
    type: "t2v" | "i2v_first" | "i2v_first_tail" | "i2v_recamera";
    reqKey: string;
    label: string;
};

const JIMENG_VIDEO_CAPABILITIES: JimengVideoCapability[] = [
    { type: "t2v", reqKey: "jimeng_ti2v_v30_pro", label: "即梦视频3.0Pro(1080P)" },
    { type: "t2v", reqKey: "jimeng_t2v_v30", label: "即梦视频3.0(720P)" },
    // 以下暂不在 UI 展示，但保留判断支持
    { type: "i2v_first", reqKey: "jimeng_i2v_first_v30", label: "即梦图生视频3.0-首帧" },
    { type: "i2v_first_tail", reqKey: "jimeng_i2v_first_tail_v30", label: "即梦图生视频3.0-首尾帧" },
    { type: "i2v_recamera", reqKey: "jimeng_i2v_recamera_v30", label: "即梦图生视频3.0-运镜" },
];

// ----- 导出常量 -----

export const JIMENG_IMAGE_REQ_KEYS = JIMENG_IMAGE_CAPABILITIES.map((c) => c.reqKey);
export const JIMENG_VIDEO_REQ_KEYS = JIMENG_VIDEO_CAPABILITIES.map((c) => c.reqKey);

/** 即梦图片能力列表，供 UI 展示 */
export function getJimengImageCapabilities() {
    return JIMENG_IMAGE_CAPABILITIES;
}

/** 即梦视频能力列表，供 UI 展示 */
export function getJimengVideoCapabilities() {
    return JIMENG_VIDEO_CAPABILITIES;
}

/** 判断 req_key 是否为即梦图片能力 */
export function isJimengImageModel(reqKey: string): boolean {
    return JIMENG_IMAGE_REQ_KEYS.includes(reqKey);
}

/** 判断 req_key 是否为即梦视频能力 */
export function isJimengVideoModel(reqKey: string): boolean {
    return JIMENG_VIDEO_REQ_KEYS.includes(reqKey);
}

/** 判断 req_key 是否属于即梦原生 API */
export function isJimengModel(reqKey: string): boolean {
    return isJimengImageModel(reqKey) || isJimengVideoModel(reqKey);
}

// ===== 类型 =====

type JimengTaskResponse = {
    code: number;
    data?: { task_id?: string };
    message?: string;
    request_id?: string;
};

type JimengImageResultData = {
    status?: string;
    binary_data_base64?: string[] | null;
    image_urls?: string[] | null;
};

type JimengVideoResultData = {
    status?: string;
    video_url?: string;
    aigc_meta_tagged?: boolean;
};

type JimengResultResponse = {
    code: number;
    data?: JimengImageResultData | JimengVideoResultData;
    message?: string;
    request_id?: string;
    status?: number;
};

export type JimengImageResult = { id: string; dataUrl: string };
export type JimengVideoResult = { url: string };

type RequestOptions = { signal?: AbortSignal };

// ===== 请求工具 =====

function jimengHeaders(jimeng: JimengConfig) {
    return {
        "Content-Type": "application/json",
        "X-Jimeng-AK": jimeng.ak,
        "X-Jimeng-SK": jimeng.sk,
    };
}

function jimengSubmitUrl() {
    return `${JIMENG_PROXY}?Action=CVSync2AsyncSubmitTask&Version=${JIMENG_VERSION}`;
}

function jimengResultUrl() {
    return `${JIMENG_PROXY}?Action=CVSync2AsyncGetResult&Version=${JIMENG_VERSION}`;
}

function readJimengError(error: unknown, fallback: string): string {
    if (axios.isCancel(error)) return "请求已取消";
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    if (axios.isAxiosError<{ code?: number; message?: string; msg?: string }>(error)) {
        const data = error.response?.data;
        const status = error.response?.status;
        if (data) {
            if (data.message) return `即梦 ${data.code || status || "错误"}：${data.message}`;
            if (data.msg) return `即梦 ${data.code || status || "错误"}：${data.msg}`;
        }
        if (status === 401 || status === 403) return "即梦鉴权失败，请检查 AK/SK 或服务权限";
        if (status === 429) return "即梦请求被限流，请稍后重试";
        return status ? `${fallback}（${status}）` : fallback;
    }
    return error instanceof Error ? error.message : fallback;
}

function assertJimengConfig(jimeng: JimengConfig) {
    if (!jimeng.ak.trim() || !jimeng.sk.trim()) throw new Error("请先在即梦 Tab 配置 AK/SK");
    if (!jimeng.enabled) throw new Error("请先启用即梦");
}

// ===== 图片生成 =====

export async function requestJimengImageGeneration(
    jimeng: JimengConfig,
    reqKey: string,
    prompt: string,
    options?: RequestOptions & {
        width?: number;
        height?: number;
        imageUrls?: string[];
        /** 图生图 scale (0-1 float) */
        scale?: number;
        /** v3.0 use_pre_llm */
        usePreLlm?: boolean;
    },
): Promise<JimengImageResult[]> {
    assertJimengConfig(jimeng);
    if (!isJimengImageModel(reqKey)) throw new Error(`即梦不支持图片能力 ${reqKey}`);

    const capability = JIMENG_IMAGE_CAPABILITIES.find((c) => c.reqKey === reqKey);
    if (!capability) throw new Error(`未知的即梦图片能力 ${reqKey}`);

    const body: Record<string, unknown> = { req_key: reqKey };

    // 按能力类型构建参数
    switch (capability.type) {
        case "t2i":
            body.prompt = prompt;
            if (options?.width) body.width = options.width;
            if (options?.height) body.height = options.height;
            if (capability.hasSize && !options?.width && !options?.height) {
                // 不传宽高时，v4.0/v4.6 默认 size=4194304 (2048*2048)
            }
            if (capability.hasScale === "float" && options?.scale !== undefined) {
                body.scale = options.scale;
            }
            if (capability.hasScale === "int" && options?.scale !== undefined) {
                body.scale = Math.round(options.scale * 100);
            }
            if (capability.hasPreLlm && options?.usePreLlm !== undefined) {
                body.use_pre_llm = options.usePreLlm;
            }
            if (options?.imageUrls?.length) body.image_urls = options.imageUrls;
            break;

        case "i2i":
            if (!options?.imageUrls?.length) throw new Error("图生图需要传入参考图");
            body.image_urls = options.imageUrls;
            body.prompt = prompt;
            if (options?.scale !== undefined) body.scale = options.scale;
            if (options?.width) body.width = options.width;
            if (options?.height) body.height = options.height;
            break;

        case "inpaint":
            if (!options?.imageUrls?.length || options.imageUrls.length < 2) {
                throw new Error("局部重绘需要传入 2 张图：原图 + mask");
            }
            body.image_urls = options.imageUrls;
            body.prompt = prompt;
            break;

        case "outpaint":
            if (!options?.imageUrls?.length) throw new Error("智能扩图需要传入原图");
            body.image_urls = options.imageUrls;
            if (prompt) body.prompt = prompt;
            // outpaint 的 top/bottom/left/right 扩展比例暂不传，使用默认等比扩展
            break;

        case "extract":
            if (!options?.imageUrls?.length) throw new Error("素材提取需要传入原图");
            body.image_urls = options.imageUrls;
            body.image_edit_prompt = prompt;
            break;

        case "uhdr":
            if (!options?.imageUrls?.length) throw new Error("智能超清需要传入原图");
            body.image_urls = options.imageUrls;
            body.resolution = "4k";
            break;
    }

    const taskId = await submitJimengTask(jimeng, body, options?.signal);
    const resultData = await pollJimengImageResult(jimeng, reqKey, taskId, options?.signal);

    // 图片结果: image_urls 是 URL 数组（24h 有效），binary_data_base64 是 base64 数组
    const urls = resultData.image_urls?.filter(Boolean) || [];
    if (!urls.length) throw new Error("即梦图片生成成功但未返回图片 URL");

    return urls.map((url: string) => ({
        id: `jimeng-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl: url,
    }));
}

// ===== 视频生成 =====

export async function requestJimengVideoGeneration(
    jimeng: JimengConfig,
    reqKey: string,
    prompt: string,
    options?: RequestOptions & {
        imageUrls?: string[];
        aspectRatio?: string;
        frames?: number;
    },
): Promise<JimengVideoResult> {
    assertJimengConfig(jimeng);
    if (!isJimengVideoModel(reqKey)) throw new Error(`即梦不支持视频能力 ${reqKey}`);

    const capability = JIMENG_VIDEO_CAPABILITIES.find((c) => c.reqKey === reqKey);
    if (!capability) throw new Error(`未知的即梦视频能力 ${reqKey}`);

    const body: Record<string, unknown> = { req_key: reqKey };

    switch (capability.type) {
        case "t2v":
            body.prompt = prompt;
            if (options?.imageUrls?.length) body.image_urls = options.imageUrls;
            if (options?.aspectRatio) body.aspect_ratio = options.aspectRatio;
            if (options?.frames) body.frames = options.frames;
            break;

        case "i2v_first":
            if (!options?.imageUrls?.length) throw new Error("图生视频-首帧需要传入首帧图");
            body.image_urls = options.imageUrls;
            body.prompt = prompt;
            if (options?.frames) body.frames = options.frames;
            break;

        case "i2v_first_tail":
            if (!options?.imageUrls?.length || options.imageUrls.length < 2) {
                throw new Error("图生视频-首尾帧需要传入 2 张图");
            }
            body.image_urls = options.imageUrls;
            body.prompt = prompt;
            if (options?.frames) body.frames = options.frames;
            break;

        case "i2v_recamera":
            if (!options?.imageUrls?.length) throw new Error("图生视频-运镜需要传入图片");
            body.image_urls = options.imageUrls;
            body.prompt = prompt;
            if (options?.frames) body.frames = options.frames;
            // template_id 和 camera_strength 暂不暴露
            break;
    }

    const taskId = await submitJimengTask(jimeng, body, options?.signal);
    const resultData = await pollJimengVideoResult(jimeng, reqKey, taskId, options?.signal);

    const videoUrl = resultData.video_url;
    if (!videoUrl) throw new Error("即梦视频生成成功但未返回视频 URL");

    return { url: videoUrl };
}

// ===== 公共：提交任务 =====

async function submitJimengTask(
    jimeng: JimengConfig,
    body: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<string> {
    try {
        const resp = await axios.post<JimengTaskResponse>(jimengSubmitUrl(), body, {
            headers: jimengHeaders(jimeng),
            signal,
        });
        const data = resp.data;
        if (data.code !== 10000) throw new Error(data.message || `即梦提交任务失败（code=${data.code}）`);
        const taskId = data.data?.task_id;
        if (!taskId) throw new Error("即梦提交任务未返回 task_id");
        return taskId;
    } catch (error) {
        throw new Error(readJimengError(error, "即梦提交任务失败"));
    }
}

// ===== 公共：轮询结果 =====
// 文档关键：status 有 in_queue / generating / done / not_found / expired
// 判断成功/失败：先看 code==10000，再看 status=="done"

async function pollJimengImageResult(
    jimeng: JimengConfig,
    reqKey: string,
    taskId: string,
    signal?: AbortSignal,
): Promise<JimengImageResultData> {
    const maxAttempts = 360; // 360 * 5s = 30min
    const delayMs = 5000;

    // 图片查询请求中带 return_url=true，让返回 image_urls 而不是 binary_data_base64
    const queryBody = {
        req_key: reqKey,
        task_id: taskId,
        req_json: JSON.stringify({ return_url: true }),
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            const resp = await axios.post<JimengResultResponse>(
                jimengResultUrl(),
                queryBody,
                { headers: jimengHeaders(jimeng), signal },
            );
            const respData = resp.data;
            if (respData.code !== 10000) {
                // code != 10000 说明出错了
                throw new Error(respData.message || `即梦查询失败（code=${respData.code}）`);
            }
            const result = respData.data as JimengImageResultData | undefined;
            if (!result) throw new Error("即梦查询未返回数据");

            if (result.status === "done") return result;
            if (result.status === "not_found" || result.status === "expired") {
                throw new Error(`即梦任务${result.status === "not_found" ? "未找到" : "已过期"}`);
            }
            // in_queue / generating → 继续轮询
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status && status >= 500) { /* 5xx 继续轮询 */ }
                else if (status === 429) { /* 限流继续轮询 */ }
                else throw new Error(readJimengError(error, "即梦查询失败"));
            } else if (!(error instanceof DOMException)) {
                throw error;
            } else if (error.name !== "AbortError") {
                throw error;
            }
        }
        await delay(delayMs, signal);
    }
    throw new Error("即梦生成超过 30 分钟仍未完成");
}

async function pollJimengVideoResult(
    jimeng: JimengConfig,
    reqKey: string,
    taskId: string,
    signal?: AbortSignal,
): Promise<JimengVideoResultData> {
    const maxAttempts = 360;
    const delayMs = 5000;

    const queryBody = {
        req_key: reqKey,
        task_id: taskId,
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
            const resp = await axios.post<JimengResultResponse>(
                jimengResultUrl(),
                queryBody,
                { headers: jimengHeaders(jimeng), signal },
            );
            const respData = resp.data;
            if (respData.code !== 10000) {
                throw new Error(respData.message || `即梦查询失败（code=${respData.code}）`);
            }
            const result = respData.data as JimengVideoResultData | undefined;
            if (!result) throw new Error("即梦查询未返回数据");

            if (result.status === "done") return result;
            if (result.status === "not_found" || result.status === "expired") {
                throw new Error(`即梦任务${result.status === "not_found" ? "未找到" : "已过期"}`);
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status && status >= 500) { /* 5xx 继续轮询 */ }
                else if (status === 429) { /* 限流继续轮询 */ }
                else throw new Error(readJimengError(error, "即梦查询失败"));
            } else if (!(error instanceof DOMException)) {
                throw error;
            } else if (error.name !== "AbortError") {
                throw error;
            }
        }
        await delay(delayMs, signal);
    }
    throw new Error("即梦生成超过 30 分钟仍未完成");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}