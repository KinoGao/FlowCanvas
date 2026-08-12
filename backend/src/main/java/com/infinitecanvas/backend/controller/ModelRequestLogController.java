package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.ModelRequestLog;
import com.infinitecanvas.backend.service.ModelRequestLogService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * 管理后台：模型请求日志查询。仅管理员可访问。
 */
@RestController
public class ModelRequestLogController {
    private final ModelRequestLogService service;

    public ModelRequestLogController(ModelRequestLogService service) {
        this.service = service;
    }

    @GetMapping("/api/admin/model-request-logs")
    public ApiResponse<Page<ModelRequestLog>> query(
            @RequestParam(required = false) String modelId,
            @RequestParam(required = false) Integer statusCode,
            @RequestParam(defaultValue = "false") boolean onlyErrors,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            HttpServletRequest request
    ) {
        if (!UserRequestContext.isAdmin(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
        }
        return ApiResponse.ok(service.query(modelId, statusCode, onlyErrors, page, size));
    }
}
