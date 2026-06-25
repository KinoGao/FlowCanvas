package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.ConfigResponse;
import com.infinitecanvas.backend.entity.Config;
import com.infinitecanvas.backend.service.ConfigService;
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
    public ApiResponse<ConfigResponse> getConfig() {
        Config config = configService.getConfig();
        if (config == null) {
            return ApiResponse.ok(null);
        }
        return ApiResponse.ok(new ConfigResponse(config.getData(), config.getUpdatedAt().toString()));
    }

    @PutMapping
    public ApiResponse<Void> saveConfig(@RequestBody Map<String, Object> body) {
        String data = body.get("data") instanceof String s ? s : body.toString();
        configService.saveConfig(data);
        return ApiResponse.ok();
    }
}