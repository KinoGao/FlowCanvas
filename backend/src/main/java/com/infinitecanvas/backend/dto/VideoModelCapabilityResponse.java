package com.infinitecanvas.backend.dto;

import java.util.List;

public record VideoModelCapabilityResponse(
        String id,
        String provider,
        String requestAdapter,
        List<String> modelPatterns,
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
) {
}
