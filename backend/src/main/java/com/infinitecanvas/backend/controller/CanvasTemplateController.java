package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.service.CanvasTemplateService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/canvas-templates")
public class CanvasTemplateController {

    private final CanvasTemplateService templateService;

    public CanvasTemplateController(CanvasTemplateService templateService) {
        this.templateService = templateService;
    }

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list(HttpServletRequest request) {
        return ApiResponse.ok(templateService.listTemplates(UserRequestContext.requireUser(request)));
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> save(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        User user = UserRequestContext.requireUser(request);
        String name = body.get("name") instanceof String s ? s : null;
        return ApiResponse.ok(templateService.saveTemplate(user, name, body.get("nodes"), body.get("connections")));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(HttpServletRequest request, @PathVariable String id) {
        boolean deleted = templateService.deleteTemplate(UserRequestContext.requireUser(request), id);
        return deleted ? ApiResponse.ok() : ApiResponse.fail("模板不存在");
    }
}
