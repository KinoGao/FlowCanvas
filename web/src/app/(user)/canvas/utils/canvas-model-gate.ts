/**
 * 画布「Model Gate」纯逻辑：把后端返回的模型能力标记、前端覆盖开关与默认值
 * 合并成一个每功能可判定是否可用的结果集。纯函数，便于单测。
 *
 * 背景：本轮不接入后端新 AI 模型适配器，因此依赖新模型的功能（声音工作室/
 * 绿幕抠像/补帧+高清/RunningHub）先做成结构完整的前端，并在此判定可用性；
 * 后端能力缺失时显示「模型未接入 · 请联系管理员」占位。
 */
export type CapabilityKey =
    | "asr"
    | "voice_clone"
    | "video_keying"
    | "frame_interpolation"
    | "video_hd"
    | "matting"
    | "scene_detection"
    | "runninghub_app";

export type FeatureCapabilityFlags = Partial<Record<CapabilityKey, boolean>>;

/** 每个功能 key 的 UI 文案（描述用于创建菜单 / 悬浮工具栏 / 占位提示）。 */
export const FEATURE_CAPABILITY_META: Record<CapabilityKey, { label: string; description: string }> = {
    asr: { label: "语音识别 (ASR)", description: "音频转录文字" },
    voice_clone: { label: "声音克隆", description: "克隆/合成语音，用于配音与旁白" },
    video_keying: { label: "绿幕抠像", description: "视频绿幕/色键抠像" },
    frame_interpolation: { label: "视频补帧", description: "提升视频帧率/流畅度" },
    video_hd: { label: "视频高清放大", description: "视频超分提升分辨率" },
    matting: { label: "高级抠图", description: "图像背景去除/主体提取增强" },
    scene_detection: { label: "场景检测", description: "自动切分视频分镜场景" },
    runninghub_app: { label: "RunningHub AI 应用", description: "AI 应用市场导入与预览" },
};

export const CAPABILITY_KEYS: CapabilityKey[] = [
    "asr",
    "voice_clone",
    "video_keying",
    "frame_interpolation",
    "video_hd",
    "matting",
    "scene_detection",
    "runninghub_app",
];

/** 默认：本轮均未接入后端模型，全部不可用。 */
export const DEFAULT_FEATURE_CAPABILITY_FLAGS: Record<CapabilityKey, boolean> = {
    asr: false,
    voice_clone: false,
    video_keying: false,
    frame_interpolation: false,
    video_hd: false,
    matting: false,
    scene_detection: false,
    runninghub_app: false,
};

export type FeatureAvailabilitySource = "backend" | "frontend" | "default";

export type FeatureAvailability = {
    available: boolean;
    source: FeatureAvailabilitySource;
};

/**
 * 判定单个功能是否可用：前端覆盖开关优先，其次后端能力标记，最后默认值。
 */
export function resolveFeatureAvailability(
    backend: FeatureCapabilityFlags | undefined,
    frontend: FeatureCapabilityFlags | undefined,
    key: CapabilityKey,
): FeatureAvailability {
    const frontendValue = frontend?.[key];
    if (typeof frontendValue === "boolean") return { available: frontendValue, source: "frontend" };
    const backendValue = backend?.[key];
    if (typeof backendValue === "boolean") return { available: backendValue, source: "backend" };
    return { available: DEFAULT_FEATURE_CAPABILITY_FLAGS[key], source: "default" };
}

/**
 * 合并出一个完整、每 key 都有明确 boolean 的结果集（便于批量/渲染判断）。
 */
export function mergeFeatureCapabilities(
    backend: FeatureCapabilityFlags | undefined,
    frontend: FeatureCapabilityFlags | undefined,
): FeatureCapabilityFlags {
    const merged: FeatureCapabilityFlags = {};
    for (const key of CAPABILITY_KEYS) merged[key] = resolveFeatureAvailability(backend, frontend, key).available;
    return merged;
}
