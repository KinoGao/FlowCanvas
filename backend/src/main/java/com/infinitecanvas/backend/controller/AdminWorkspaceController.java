package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.AdminWorkspaceResponse;
import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.service.AdminWorkspaceService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
public class AdminWorkspaceController {
    private final AdminWorkspaceService service;

    public AdminWorkspaceController(AdminWorkspaceService service) { this.service = service; }

    @GetMapping("/api/admin/workspaces")
    public ApiResponse<AdminWorkspaceResponse> workspaces(HttpServletRequest request) {
        requireAdmin(request);
        return ApiResponse.ok(service.summaries());
    }

    @GetMapping("/api/admin/workspaces/{userId}/projects/{projectId}")
    public ApiResponse<AdminWorkspaceResponse.ProjectDetail> project(
            @PathVariable String userId, @PathVariable String projectId, HttpServletRequest request
    ) {
        requireAdmin(request);
        return ApiResponse.ok(service.project(userId, projectId));
    }

    @PutMapping("/api/admin/users/{userId}")
    public ApiResponse<AdminWorkspaceResponse.UserWorkspace> updateUser(
            @PathVariable String userId, @RequestBody Map<String, Object> body, HttpServletRequest request
    ) {
        requireAdmin(request);
        return ApiResponse.ok(service.updateUser(userId, text(body.get("username")), text(body.get("displayName")), text(body.get("role"))));
    }

    @PutMapping("/api/admin/users/{userId}/password")
    public ApiResponse<Void> resetPassword(
            @PathVariable String userId, @RequestBody Map<String, Object> body, HttpServletRequest request
    ) {
        requireAdmin(request);
        service.resetPassword(userId, text(body.get("password")));
        return ApiResponse.ok();
    }

    @DeleteMapping("/api/admin/users/{userId}")
    public ApiResponse<Void> deleteUser(@PathVariable String userId, HttpServletRequest request) {
        requireAdmin(request);
        User current = UserRequestContext.currentUser(request);
        service.deleteUser(userId, current == null ? null : current.getId());
        return ApiResponse.ok();
    }

    @DeleteMapping("/api/admin/users/{userId}/projects/{projectId}")
    public ApiResponse<Void> deleteProject(
            @PathVariable String userId, @PathVariable String projectId, HttpServletRequest request
    ) {
        requireAdmin(request);
        service.deleteProject(userId, projectId);
        return ApiResponse.ok();
    }

    private void requireAdmin(HttpServletRequest request) {
        if (!UserRequestContext.isAdmin(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
    }

    private String text(Object value) { return value instanceof String text ? text : ""; }
}
