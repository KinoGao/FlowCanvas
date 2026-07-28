import { apiUrl } from "@/constant/env";
import { useUserStore } from "@/stores/use-user-store";

export type DurableGenerationOptions = {
    signal?: AbortSignal;
    jobId?: string;
};

export function durableGenerationHeaders(url: string, jobId?: string) {
    if (!jobId || !isBackendGenerationUrl(url)) return {};
    const token = useUserStore.getState().token.trim();
    return {
        "X-FlowCanvas-Job-Id": jobId,
        ...(token ? { "X-FlowCanvas-Session": token } : {}),
    };
}

function isBackendGenerationUrl(url: string) {
    try {
        const target = new URL(url, window.location.origin);
        const backend = new URL(apiUrl("/"), window.location.origin);
        return target.origin === backend.origin
            && (target.pathname.includes("/api/model-runtime/") || target.pathname === "/api/comfyui-proxy");
    } catch {
        return false;
    }
}
