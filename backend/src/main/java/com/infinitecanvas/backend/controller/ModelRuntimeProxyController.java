package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.modelruntime.ModelRequestAdapter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    private final List<ModelRequestAdapter> adapters;

    public ModelRuntimeProxyController(PlatformConfigService configService, List<ModelRequestAdapter> adapters) {
        this.configService = configService;
        this.adapters = adapters.stream()
                .sorted(Comparator.comparingInt(ModelRequestAdapter::order))
                .toList();
    }

    @RequestMapping("/{modelId}/**")
    public ResponseEntity<?> proxy(HttpServletRequest request) throws IOException, InterruptedException {
        String modelId = pathModelId(request);
        PlatformConfigService.RuntimeModel runtime;
        try {
            runtime = configService.requireRuntimeModel(modelId);
        } catch (IllegalArgumentException error) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error.getMessage());
        }

        String prefix = "/api/model-runtime/models/" + modelId;
        String suffix = request.getRequestURI().substring(prefix.length());
        try {
            validateEndpointCategory(suffix, runtime.model().getCategory());
        } catch (IllegalArgumentException error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }

        ModelRequestAdapter matched = null;
        for (ModelRequestAdapter adapter : adapters) {
            if (adapter.supports(runtime, suffix)) {
                matched = adapter;
                break;
            }
        }
        if (matched == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("当前模型没有可用的请求适配器: " + modelId);
        }
        return matched.handle(request, suffix, runtime);
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