// 仅供 node --test 运行 TypeScript 测试时解析 tsconfig 的 `@/*` 路径别名。
// 用法：NODE_TEST_MOCK_ENV=1 node --test --experimental-loader ./scripts/test-alias-loader.mjs <测试文件>
// 运行时仅对 `@/` 前缀做解析：先在 src/ 下按原样尝试，再补 .ts / .tsx 扩展名。
// NODE_TEST_MOCK_ENV=1 时把 @/constant/env 替换为测试桩（apiUrl 原样返回路径），
// 因为 env.ts 依赖 vite 注入的 import.meta.env，在纯 node 下无法加载。
const SRC_URL = new URL("../src/", import.meta.url);

const MOCK_ENV = process.env.NODE_TEST_MOCK_ENV === "1";
const ENV_STUB = "data:text/javascript," + encodeURIComponent("export const API_BASE_URL='';export function apiUrl(path){return path}");

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "@/constant/env" && MOCK_ENV) {
        return { url: ENV_STUB, shortCircuit: true };
    }
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const target = new URL(specifier.slice(2), SRC_URL);
    const candidates = [target.href, `${target.href}.ts`, `${target.href}.tsx`];
    let lastError;
    for (const href of candidates) {
        try {
            return await nextResolve(href, context);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError ?? new Error(`alias 解析失败: ${specifier}`);
}
