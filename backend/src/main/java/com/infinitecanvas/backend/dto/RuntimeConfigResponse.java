package com.infinitecanvas.backend.dto;

import java.util.List;

public record RuntimeConfigResponse(List<Provider> providers, ComfyUi comfyui) {
    public record Provider(String id, String name, String baseUrl, String apiFormat, List<Model> models) {}
    public record Model(
            String id,
            String displayName,
            String category,
            String requestAdapter,
            List<String> modelPatterns,
            TextCapabilities textCapabilities,
            ImageCapabilities imageCapabilities,
            VideoCapabilities videoCapabilities
    ) {}
    public record TextCapabilities(List<String> modes) {}
    public record ImageCapabilities(
            List<String> modes,
            List<String> qualities,
            List<String> resolutions,
            List<String> ratios,
            List<Integer> counts
    ) {}
    public record VideoCapabilities(
            List<String> modes,
            List<String> ratios,
            List<String> resolutions,
            List<Integer> durations,
            List<Integer> counts,
            boolean generateAudio,
            boolean watermark,
            boolean draft,
            int maxImages,
            int maxVideos,
            int maxAudios
    ) {}
    public record ComfyUi(boolean enabled, String clientId, String defaultWorkflowId, int timeoutSeconds, int pollIntervalMs) {}
}
