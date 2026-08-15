package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.service.AgentRunService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent-runs")
public class AgentRunController {
    private final AgentRunService agentRuns;

    public AgentRunController(AgentRunService agentRuns) {
        this.agentRuns = agentRuns;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        Map<String, Object> created = agentRuns.create(UserRequestContext.requireUser(request), sessionToken(request), body);
        // 事务提交后再启动派发循环（服务层 @Transactional 内启动会读不到未提交的 run）
        agentRuns.startLoop(String.valueOf(created.get("id")));
        return ApiResponse.ok(created);
    }

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list(HttpServletRequest request, @RequestParam String projectId) {
        return ApiResponse.ok(agentRuns.list(UserRequestContext.requireUser(request), projectId));
    }

    @GetMapping("/{id}")
    public ApiResponse<Map<String, Object>> get(HttpServletRequest request, @PathVariable String id) {
        return ApiResponse.ok(agentRuns.get(UserRequestContext.requireUser(request), id));
    }

    @PostMapping("/{id}/{action}")
    public ApiResponse<Map<String, Object>> action(HttpServletRequest request, @PathVariable String id, @PathVariable String action) {
        Map<String, Object> run = agentRuns.action(UserRequestContext.requireUser(request), id, action);
        if ("resume".equals(action)) agentRuns.startLoop(id);
        return ApiResponse.ok(run);
    }

    @PostMapping("/{id}/tasks/{taskId}/retry")
    public ApiResponse<Map<String, Object>> retryTask(HttpServletRequest request, @PathVariable String id, @PathVariable String taskId) {
        Map<String, Object> run = agentRuns.retryTask(UserRequestContext.requireUser(request), id, taskId);
        agentRuns.startLoop(id);
        return ApiResponse.ok(run);
    }

    /** 生成代理自调用鉴权用 X-FlowCanvas-Session；浏览器侧也可能只带 Authorization Bearer。 */
    private String sessionToken(HttpServletRequest request) {
        String token = request.getHeader("X-FlowCanvas-Session");
        if (token != null && !token.isBlank()) return token.trim();
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) return authorization.substring(7).trim();
        return "";
    }
}
