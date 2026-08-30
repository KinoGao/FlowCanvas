/**
 * 前端功能覆盖开关：让「依赖后端模型的完整前端」在未接后端时也能被临时验证。
 *
 * 读取优先级：`VITE_FEATURE_<KEY>=1|0` 环境变量 → `localStorage["infinite-canvas:feature-flags"]` JSON。
 * 设置面板的「模型接入 / 功能开关」区会写 localStorage 并让功能键变为「前端覆盖」来源。
 * 生产环境默认不设置任何覆盖，完全以后端能力标记为准。
 */
import { CAPABILITY_KEYS, type CapabilityKey, type FeatureCapabilityFlags } from "@/app/(user)/canvas/utils/canvas-model-gate";

const STORAGE_KEY = "infinite-canvas:feature-flags";
const ENV_PREFIX = "VITE_FEATURE_";

export function readFrontendFeatureOverrides(): FeatureCapabilityFlags {
    const overrides: FeatureCapabilityFlags = {};

    // 1. 环境变量（构建期注入，优先级最高）
    for (const key of CAPABILITY_KEYS) {
        const raw = import.meta.env?.[`${ENV_PREFIX}${key.toUpperCase()}`];
        if (raw === "1" || raw === "true") overrides[key] = true;
        else if (raw === "0" || raw === "false") overrides[key] = false;
    }

    // 2. localStorage（运行时切换，覆盖环境变量）
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Partial<Record<CapabilityKey, unknown>>;
            for (const key of CAPABILITY_KEYS) {
                if (typeof parsed[key] === "boolean") overrides[key] = parsed[key];
            }
        }
    } catch {
        // localStorage 不可用/损坏：忽略
    }

    return overrides;
}

export function writeFrontendFeatureOverride(key: CapabilityKey, enabled: boolean) {
    try {
        const current = readFrontendFeatureOverrides();
        const next: FeatureCapabilityFlags = { ...current, [key]: enabled };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // 忽略写入失败
    }
}

export function clearFrontendFeatureOverrides() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // 忽略
    }
}
