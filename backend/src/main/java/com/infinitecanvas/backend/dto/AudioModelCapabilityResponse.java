package com.infinitecanvas.backend.dto;

import java.util.List;

public record AudioModelCapabilityResponse(
        String id,
        String provider,
        String requestAdapter,
        List<String> modelPatterns,
        List<String> modes,
        List<String> voices,
        List<String> formats,
        List<Double> speeds,
        boolean instructions
) {}
