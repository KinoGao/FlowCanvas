package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
public class PlatformConfigController {
    private final PlatformConfigService service;

    public PlatformConfigController(PlatformConfigService service) { this.service = service; }

    @GetMapping("/api/runtime-config")
    public ApiResponse<RuntimeConfigResponse> runtimeConfig() { return ApiResponse.ok(service.runtimeConfig()); }

    @GetMapping("/api/admin/platform-config")
    public ApiResponse<PlatformConfigDocument> adminConfig(HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.getAdminConfig());
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

    private void requireAdmin(HttpServletRequest request) {
        if (!UserRequestContext.isAdmin(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
    }
}
