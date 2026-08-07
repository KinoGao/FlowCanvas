package com.infinitecanvas.backend.dto;

import java.util.List;

public record ImageModelCapabilityResponse(
        String id,
        String provider,
        String requestAdapter,
        List<String> modelPatterns,
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
) {
}
