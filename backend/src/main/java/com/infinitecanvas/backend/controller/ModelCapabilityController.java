package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.VideoModelCapabilityResponse;
import com.infinitecanvas.backend.service.ModelCapabilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/model-capabilities")
public class ModelCapabilityController {
    private final ModelCapabilityService capabilityService;

    public ModelCapabilityController(ModelCapabilityService capabilityService) {
        this.capabilityService = capabilityService;
    }

    @GetMapping("/video")
    public ApiResponse<List<VideoModelCapabilityResponse>> videoCapabilities() {
        return ApiResponse.ok(capabilityService.videoCapabilities());
    }
}
