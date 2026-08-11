package com.infinitecanvas.backend.dto;

import java.util.List;

public record RuntimeConfigResponse(List<Provider> providers, DefaultModels defaultModels, ComfyUi comfyui) {
    /** 后台为各分类设置的默认模型 ID（空串 = 不设置）。 */
    public record DefaultModels(String text, String image, String video, String audio) {}
    public record Provider(String id, String name, String baseUrl, String apiFormat, List<Model> models) {}
    public record Model(
            String id,
            String displayName,
            String category,
            String requestAdapter,
            List<String> modelPatterns,
            TextCapabilities textCapabilities,
            ImageCapabilities imageCapabilities,
            VideoCapabilities videoCapabilities,
            AudioCapabilities audioCapabilities
    ) {}
    public record TextCapabilities(List<String> modes) {}
    public record ImageCapabilities(
            List<String> modes,
            List<String> qualities,
            List<String> resolutions,
            List<String> ratios,
            List<Integer> counts,
            int maxImages,
            int maxOutputs,
            int maxTotalImages,
            boolean sequentialImageGeneration,
            boolean interactiveEdit,
            boolean watermark,
            String documentationUrl,
            String officialTemplate
    ) {}
    public record VideoCapabilities(
            List<String> modes,
            List<String> ratios,
            List<String> resolutions,
            List<Integer> durations,
            List<Integer> frameRates,
            List<Integer> counts,
            boolean generateAudio,
            boolean watermark,
            boolean draft,
            int maxImages,
            int maxVideos,
            int maxAudios
    ) {}
    public record AudioCapabilities(
            List<String> modes,
            List<String> voices,
            List<String> formats,
            List<Double> speeds,
            boolean instructions
    ) {}
    public record ComfyUi(boolean enabled, String clientId, String defaultWorkflowId, int timeoutSeconds, int pollIntervalMs) {}
}
