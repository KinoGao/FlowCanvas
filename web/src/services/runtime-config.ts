import { apiUrl } from "@/constant/env";
import { invalidateVideoModelCapabilities } from "@/services/api/model-capabilities";
import { fetchRuntimeConfig } from "@/services/api/platform-admin";
import { encodeChannelModel, type ModelCapability, useConfigStore } from "@/stores/use-config-store";

export const RUNTIME_CONFIG_CHANGED_EVENT = "flowcanvas:runtime-config-changed";
const capabilities: ModelCapability[] = ["image", "video", "text", "audio"];

export async function refreshRuntimeConfig() {
    const runtime = await fetchRuntimeConfig();
    invalidateVideoModelCapabilities();
    const channels = runtime.providers.flatMap((provider) => provider.models.map((model) => ({
        id: `${provider.id}:${model.id}`,
        name: `${provider.name} · ${model.displayName}`,
        baseUrl: apiUrl(`/api/model-runtime/models/${encodeURIComponent(model.id)}`),
        apiKey: "backend-managed",
        apiFormat: provider.apiFormat,
        models: [model.id],
        modelLabels: { [model.id]: model.displayName },
        useProxy: false,
    })));
    const modelsByCapability = Object.fromEntries(capabilities.map((capability) => [
        capability,
        runtime.providers.flatMap((provider) => provider.models
            .filter((model) => model.category === capability)
            .map((model) => encodeChannelModel(`${provider.id}:${model.id}`, model.id))),
    ])) as Record<ModelCapability, string[]>;
    const allModels = capabilities.flatMap((capability) => modelsByCapability[capability]);

    useConfigStore.setState((state) => {
        const choose = (current: string, capability: ModelCapability) =>
            modelsByCapability[capability].includes(current) ? current : modelsByCapability[capability][0] || "";
        const imageModel = choose(state.config.imageModel, "image");
        return {
            config: {
                ...state.config,
                channelMode: "local",
                channels,
                models: allModels,
                imageModels: modelsByCapability.image,
                videoModels: modelsByCapability.video,
                textModels: modelsByCapability.text,
                audioModels: modelsByCapability.audio,
                imageModel,
                videoModel: choose(state.config.videoModel, "video"),
                textModel: choose(state.config.textModel, "text"),
                audioModel: choose(state.config.audioModel, "audio"),
                model: allModels.includes(state.config.model) ? state.config.model : imageModel || allModels[0] || "",
                baseUrl: channels[0]?.baseUrl || "",
                apiKey: channels.length ? "backend-managed" : "",
                apiFormat: channels[0]?.apiFormat || "openai",
            },
            comfyui: {
                ...state.comfyui,
                proxyMode: "backend",
                clientId: runtime.comfyui.clientId || "flow-canvas",
                defaultWorkflowId: runtime.comfyui.defaultWorkflowId || "",
                timeoutSeconds: String(runtime.comfyui.timeoutSeconds || 300),
                pollIntervalMs: String(runtime.comfyui.pollIntervalMs || 1200),
            },
        };
    });
    return runtime;
}

export function notifyRuntimeConfigChanged() {
    window.dispatchEvent(new Event(RUNTIME_CONFIG_CHANGED_EVENT));
}
