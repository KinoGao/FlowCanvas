package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.service.WorkflowService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/workflows")
public class WorkflowController {

    private final WorkflowService workflowService;

    public WorkflowController(WorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.ok(workflowService.listWorkflows());
    }

    @GetMapping("/{id}")
    public ApiResponse<?> get(@PathVariable String id) {
        Map<String, Object> workflow = workflowService.getWorkflow(id);
        if (workflow == null) return ApiResponse.fail("工作流不存在");
        return ApiResponse.ok(workflow);
    }

    @PostMapping("/upload")
    public ApiResponse<?> upload(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        try {
            String name = (String) body.get("name");
            String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body.get("workflow"));
            return ApiResponse.ok(workflowService.uploadWorkflow(name, json));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        } catch (Exception e) {
            return ApiResponse.fail("无效的工作流 JSON");
        }
    }

    @PutMapping("/{id}/config")
    public ApiResponse<?> saveConfig(@PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        try {
            return ApiResponse.ok(workflowService.saveConfig(id, body));
        } catch (IllegalArgumentException e) {
            return ApiResponse.fail(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id, HttpServletRequest request) {
        requireAdmin(request);
        boolean deleted = workflowService.deleteWorkflow(id);
        return deleted ? ApiResponse.ok() : ApiResponse.fail("工作流不存在");
    }

    private void requireAdmin(HttpServletRequest request) {
        if (!UserRequestContext.isAdmin(request)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
    }
}
