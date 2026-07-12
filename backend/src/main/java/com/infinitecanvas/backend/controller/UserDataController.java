package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.ConfigResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserConfig;
import com.infinitecanvas.backend.service.UserDataService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserDataController {
    private final UserDataService dataService;

    public UserDataController(UserDataService dataService) {
        this.dataService = dataService;
    }

    @GetMapping("/bootstrap")
    public ApiResponse<Map<String, Object>> bootstrap(HttpServletRequest request) {
        User user = UserRequestContext.requireUser(request);
        UserConfig config = dataService.getConfig(user);
        Map<String, Object> data = new HashMap<>();
        data.put("config", config == null ? null : new ConfigResponse(config.getData(), config.getUpdatedAt().toString()));
        data.put("projects", dataService.getProjects(user));
        data.put("projectTombstones", dataService.getProjectTombstones(user));
        data.put("assets", dataService.getAssets(user));
        return ApiResponse.ok(data);
    }

    @GetMapping("/config")
    public ApiResponse<ConfigResponse> getConfig(HttpServletRequest request) {
        UserConfig config = dataService.getConfig(UserRequestContext.requireUser(request));
        return ApiResponse.ok(config == null ? null : new ConfigResponse(config.getData(), config.getUpdatedAt().toString()));
    }

    @PutMapping("/config")
    public ApiResponse<Void> saveConfig(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        Object data = body.get("data");
        dataService.saveConfig(UserRequestContext.requireUser(request), data instanceof String s ? s : dataService.writeJson(data == null ? body : data));
        return ApiResponse.ok();
    }

    @GetMapping("/projects")
    public ApiResponse<List<Object>> getProjects(HttpServletRequest request) {
        return ApiResponse.ok(dataService.getProjects(UserRequestContext.requireUser(request)));
    }

    @PutMapping("/projects")
    public ApiResponse<Void> saveProjects(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        dataService.replaceProjects(UserRequestContext.requireUser(request), list(body.get("projects")), stringMap(body.get("projectTombstones")));
        return ApiResponse.ok();
    }

    @GetMapping("/assets")
    public ApiResponse<List<Object>> getAssets(HttpServletRequest request) {
        return ApiResponse.ok(dataService.getAssets(UserRequestContext.requireUser(request)));
    }

    @PutMapping("/assets")
    public ApiResponse<Void> saveAssets(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        dataService.replaceAssets(UserRequestContext.requireUser(request), list(body.get("assets")));
        return ApiResponse.ok();
    }

    @SuppressWarnings("unchecked")
    private List<Object> list(Object value) {
        if (value instanceof List<?> list) return (List<Object>) list;
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> stringMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) return Collections.emptyMap();
        Map<String, String> result = new HashMap<>();
        ((Map<Object, Object>) map).forEach((key, item) -> {
            if (key instanceof String k && item instanceof String v) result.put(k, v);
        });
        return result;
    }
}
