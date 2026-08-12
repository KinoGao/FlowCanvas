package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.GenerationJobService;
import com.infinitecanvas.backend.service.ModelRequestLogService;
import com.infinitecanvas.backend.service.UserRequestContext;
import com.infinitecanvas.backend.service.modelruntime.ModelRequestAdapter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Canvas-facing proxy for model requests. Resolves the runtime model from the
 * platform config, validates that the requested endpoint category matches the
 * model's category, then dispatches to the first {@link ModelRequestAdapter}
 * whose {@link ModelRequestAdapter#supports} returns true. The chain is built
 * dynamically by Spring, so adding or removing an adapter never requires
 * touching this class.
 */
@RestController
@RequestMapping("/api/model-runtime/models")
public class ModelRuntimeProxyController {
    private final PlatformConfigService configService;
    private final GenerationJobService generationJobService;
    private final ModelRequestLogService requestLogService;
    private final List<ModelRequestAdapter> adapters;

    public ModelRuntimeProxyController(PlatformConfigService configService, GenerationJobService generationJobService, ModelRequestLogService requestLogService, List<ModelRequestAdapter> adapters) {
        this.configService = configService;
        this.generationJobService = generationJobService;
        this.requestLogService = requestLogService;
        this.adapters = adapters.stream()
                .sorted(Comparator.comparingInt(ModelRequestAdapter::order))
                .toList();
    }

    @RequestMapping("/{modelId}/**")
    public ResponseEntity<?> proxy(HttpServletRequest request, HttpServletResponse servletResponse) throws Exception {
        String jobKey = request.getHeader("X-FlowCanvas-Job-Id");
        String modelId = pathModelId(request);
        String suffix = request.getRequestURI().substring(("/api/model-runtime/models/" + modelId).length());
        long startedAt = System.currentTimeMillis();
        try {
            ResponseEntity<?> response = generationJobService.execute(
                    UserRequestContext.currentUser(request),
                    jobKey,
                    () -> proxyNow(request, modelId, suffix, startedAt, jobKey)
            );
            // 流式响应：Spring 无法从 ResponseEntity<?> 擦除后的类型推断 StreamingResponseBody
            // converter（HttpMessageNotWritableException），这里手动把流写入 servletResponse：
            // 先回写响应头（chunked 传输立即生效），再由 writeTo 边读上游边写下游，
            // 前端无需等全部下载完即可收到数据。
            if (response != null && response.getBody() instanceof StreamingResponseBody stream) {
                servletResponse.setStatus(response.getStatusCode().value());
                response.getHeaders().forEach((name, values) ->
                        values.forEach(value -> servletResponse.setHeader(name, value)));
                String contentType = response.getHeaders().getContentType() == null
                        ? "application/octet-stream" : response.getHeaders().getContentType().toString();
                servletResponse.setContentType(contentType);
                servletResponse.flushBuffer();
                stream.writeTo(servletResponse.getOutputStream());
                servletResponse.getOutputStream().flush();
                return null;
            }
            return response;
        } catch (Exception error) {
            recordRequest(request, modelId, suffix, startedAt, 0, rootMessage(error), jobKey);
            throw error;
        }
    }

    private ResponseEntity<?> proxyNow(HttpServletRequest request, String modelId, String suffix, long startedAt, String jobKey) throws IOException, InterruptedException {
        PlatformConfigService.RuntimeModel runtime;
        try {
            runtime = configService.requireRuntimeModel(modelId);
        } catch (IllegalArgumentException error) {
            return recordAndRespond(request, modelId, suffix, startedAt, HttpStatus.NOT_FOUND, error.getMessage(), jobKey);
        }

        try {
            validateEndpointCategory(suffix, runtime.model().getCategory());
        } catch (IllegalArgumentException error) {
            return recordAndRespond(request, modelId, suffix, startedAt, HttpStatus.BAD_REQUEST, error.getMessage(), jobKey);
        }

        ModelRequestAdapter matched = null;
        for (ModelRequestAdapter adapter : adapters) {
            if (adapter.supports(runtime, suffix)) {
                matched = adapter;
                break;
            }
        }
        if (matched == null) {
            return recordAndRespond(request, modelId, suffix, startedAt, HttpStatus.BAD_REQUEST,
                    "当前模型没有可用的请求适配器: " + modelId, jobKey);
        }
        try {
            ResponseEntity<?> response = matched.handle(request, suffix, runtime);
            recordRequest(request, modelId, suffix, startedAt, response.getStatusCode().value(), null, jobKey);
            return response;
        } catch (Exception error) {
            recordRequest(request, modelId, suffix, startedAt, 0, rootMessage(error), jobKey);
            throw error;
        }
    }

    /** 记录并返回错误响应（适配器未命中 / 模型不存在等前置校验失败）。 */
    private ResponseEntity<?> recordAndRespond(HttpServletRequest request, String modelId, String suffix, long startedAt, HttpStatus status, String message, String jobKey) {
        recordRequest(request, modelId, suffix, startedAt, status.value(), message, jobKey);
        return ResponseEntity.status(status).body(message);
    }

    private void recordRequest(HttpServletRequest request, String modelId, String suffix, long startedAt, int statusCode, String errorMessage, String jobKey) {
        try {
            String userId = UserRequestContext.currentUser(request) == null ? null : UserRequestContext.currentUser(request).getId();
            requestLogService.record(
                    userId, modelId, request.getMethod(), suffix,
                    requestKind(request.getMethod(), suffix),
                    System.currentTimeMillis() - startedAt, statusCode, errorMessage, jobKey
            );
        } catch (Exception ignored) {
            // 日志失败不影响主流程。
        }
    }

    private String requestKind(String method, String path) {
        if (!"POST".equalsIgnoreCase(method)) {
            if (path.matches("/videos/[^/]+/content$")) return "content";
            if (path.matches("/videos/[^/]+$") || path.matches("/images/[^/]+$")) return "poll";
            return "other";
        }
        if (path.equals("/videos") || path.equals("/images/generations") || path.equals("/images/edits")
                || path.equals("/audio/speech") || path.equals("/chat/completions")) return "create";
        return "other";
    }

    private String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        return current.getMessage() == null || current.getMessage().isBlank() ? error.getClass().getSimpleName() : current.getMessage();
    }

    private void validateEndpointCategory(String path, String category) {
        String endpointCategory = endpointCategory(path);
        if (endpointCategory != null && !endpointCategory.equals(category)) {
            throw new IllegalArgumentException("当前模型分类为 " + category + "，不能调用 " + endpointCategory + " 接口");
        }
    }

    private String endpointCategory(String path) {
        String value = path.toLowerCase(Locale.ROOT);
        if (value.contains("/images/")) return "image";
        if (value.equals("/videos") || value.contains("/videos/") || value.contains("/video/")) return "video";
        if (value.contains("/audio/")) return "audio";
        if (value.contains("/chat/completions") || value.contains("/responses") || value.contains("/completions")) return "text";
        return null;
    }

    private String pathModelId(HttpServletRequest request) {
        String prefix = "/api/model-runtime/models/";
        String rest = request.getRequestURI().substring(prefix.length());
        int slash = rest.indexOf('/');
        return slash < 0 ? rest : rest.substring(0, slash);
    }
}
