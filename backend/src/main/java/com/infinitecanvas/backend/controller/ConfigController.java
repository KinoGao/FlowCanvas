package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.ConfigResponse;
import com.infinitecanvas.backend.entity.Config;
import com.infinitecanvas.backend.service.ConfigService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final ConfigService configService;

    public ConfigController(ConfigService configService) {
        this.configService = configService;
    }

    @GetMapping
    public ApiResponse<ConfigResponse> getConfig(HttpServletRequest request) {
        if (!UserRequestContext.isLegacyAuth(request)) return ApiResponse.fail("旧配置接口仅支持 AUTH_CODE");
        Config config = configService.getConfig();
        if (config == null) {
            return ApiResponse.ok(null);
        }
        return ApiResponse.ok(new ConfigResponse(config.getData(), config.getUpdatedAt().toString()));
    }

    @PutMapping
    public ApiResponse<Void> saveConfig(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        if (!UserRequestContext.isLegacyAuth(request)) return ApiResponse.fail("旧配置接口仅支持 AUTH_CODE");
        String data = body.get("data") instanceof String s ? s : body.toString();
        configService.saveConfig(data);
        return ApiResponse.ok();
    }
}
