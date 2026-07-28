package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.UserRequestContext;
import com.infinitecanvas.backend.service.modelruntime.ModelProtocol;
import com.infinitecanvas.backend.service.modelruntime.ModelRequestAdapter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Comparator;

@RestController
public class PlatformConfigController {
    private final PlatformConfigService service;
    private final List<ModelRequestAdapter> adapters;

    public PlatformConfigController(PlatformConfigService service, List<ModelRequestAdapter> adapters) {
        this.service = service;
        this.adapters = adapters;
    }

    @GetMapping("/api/runtime-config")
    public ApiResponse<RuntimeConfigResponse> runtimeConfig() { return ApiResponse.ok(service.runtimeConfig()); }

    @GetMapping("/api/admin/platform-config")
    public ApiResponse<PlatformConfigDocument> adminConfig(HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.getAdminConfig());
    }

    @GetMapping("/api/admin/model-protocols")
    public ApiResponse<List<ModelProtocol>> modelProtocols(HttpServletRequest request) {
        requireAdmin(request);
        List<ModelProtocol> protocols = adapters.stream()
                .flatMap(adapter -> adapter.protocols().stream())
                .collect(java.util.stream.Collectors.toMap(ModelProtocol::id, value -> value, (left, right) -> left))
                .values().stream()
                .sorted(Comparator.comparing(ModelProtocol::name))
                .toList();
        return ApiResponse.ok(protocols);
    }

    @PutMapping("/api/admin/platform-config")
    public ApiResponse<PlatformConfigDocument> save(@RequestBody PlatformConfigDocument document, HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.save(document));
    }

    @PostMapping("/api/admin/providers/{providerId}/discover-models")
    public ApiResponse<List<String>> discoverModels(@PathVariable String providerId, HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.discoverModels(providerId));
    }

    @PostMapping("/api/admin/models/{modelId}/verify")
    public ApiResponse<PlatformConfigDocument> verifyModel(@PathVariable String modelId, HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.verifyModel(modelId));
    }

    private void requireAdmin(HttpServletRequest request) {
        if (!UserRequestContext.isAdmin(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
    }
}
