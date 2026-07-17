import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    server: {
        host: "0.0.0.0",
        port: 9800,
        // 画布生成任务是前端长请求；开发期 HMR/Fast Refresh 会重新挂载页面，
        // 导致进行中的 AbortController/回调丢失，从而打断生成。关闭自动热更新，
        // 改动代码后手动刷新页面，避免用户生成时被 dev server 自动刷新。
        hmr: false,
        watch: {
            ignored: ["**/dist/**", "../data/**", "../backend/data/**", "../backend/target/**"],
        },
        proxy: {
            "/api": {
                target: "http://127.0.0.1:9801",
                changeOrigin: true,
            },
        },
        // Vite expects hostnames without a protocol. The leading dot allows
        // cpolar's rotating subdomains while keeping host validation enabled.
        allowedHosts: [".nas.cpolar.cn"],
    },
    preview: {
        host: "0.0.0.0",
        port: 9800,
    },
});
