package com.infinitecanvas.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Value;
import com.infinitecanvas.backend.service.PlatformConfigService;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/comfyui-proxy")
public class ComfyUiProxyController {
    private static final Set<String> ALLOWED_PATHS = Set.of("/system_stats", "/object_info", "/prompt", "/history/", "/view", "/upload/image");
    private static final int COMFY_PROXY_MAX_IN_MEMORY_SIZE = 256 * 1024 * 1024;
    private final PlatformConfigService platformConfigService;
    private final WebClient webClient = WebClient.builder()
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(COMFY_PROXY_MAX_IN_MEMORY_SIZE))
            .build();

    public ComfyUiProxyController(PlatformConfigService platformConfigService) {
        this.platformConfigService = platformConfigService;
    }

    @GetMapping
    public ResponseEntity<byte[]> get(@RequestParam(defaultValue = "") String baseUrl, @RequestParam(defaultValue = "") String path) {
        return proxy(baseUrl, path, "GET", null, null);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> upload(@RequestParam(defaultValue = "") String baseUrl, @RequestParam("image") MultipartFile image) {
        MultiValueMap<String, Object> form = new org.springframework.util.LinkedMultiValueMap<>();
        form.add("image", image.getResource());
        return proxy(baseUrl, "/upload/image", "POST", null, form);
    }

    @PostMapping
    public ResponseEntity<byte[]> post(@RequestBody Map<String, Object> payload) {
        String baseUrl = String.valueOf(payload.getOrDefault("baseUrl", ""));
        String path = String.valueOf(payload.getOrDefault("path", ""));
        String method = "GET".equals(payload.get("method")) ? "GET" : "POST";
        Object body = payload.get("body");
        return proxy(baseUrl, path, method, body, null);
    }

    private ResponseEntity<byte[]> proxy(String baseUrl, String path, String method, Object body, MultiValueMap<String, Object> multipart) {
        URI target;
        try {
            target = buildTargetUrl(baseUrl, path);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(("{\"detail\":\"" + escapeJson(e.getMessage()) + "\"}").getBytes());
        }

        WebClient.RequestBodySpec request = webClient.method(org.springframework.http.HttpMethod.valueOf(method)).uri(target).headers(this::filterResponseRequestHeaders);
        WebClient.ResponseSpec responseSpec;
        if (multipart != null) {
            responseSpec = request.contentType(MediaType.MULTIPART_FORM_DATA).body(BodyInserters.fromMultipartData(multipart)).retrieve();
        } else if (body != null) {
            responseSpec = request.contentType(MediaType.APPLICATION_JSON).bodyValue(body).retrieve();
        } else {
            responseSpec = request.retrieve();
        }

        try {
            return responseSpec.toEntity(byte[].class).block(Duration.ofMinutes(10));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).contentType(MediaType.APPLICATION_JSON).body(("{\"detail\":\"" + escapeJson(e.getMessage()) + "\"}").getBytes());
        }
    }

    private URI buildTargetUrl(String baseUrl, String path) {
        String configuredBaseUrl = platformConfigService.comfyBaseUrl();
        String normalizedBase = !configuredBaseUrl.isBlank() ? configuredBaseUrl : (baseUrl == null || baseUrl.isBlank()) ? "http://127.0.0.1:8188" : baseUrl.trim();
        URI base = URI.create(normalizedBase);
        if (!"http".equalsIgnoreCase(base.getScheme()) && !"https".equalsIgnoreCase(base.getScheme())) throw new IllegalArgumentException("ComfyUI 地址只支持 http/https");
        if (base.getUserInfo() != null) throw new IllegalArgumentException("ComfyUI 地址不能包含用户名或密码");
        if (path == null || !path.startsWith("/") || path.contains("://")) throw new IllegalArgumentException("ComfyUI 路径无效");
        String pathname = path.split("\\?", 2)[0];
        boolean allowed = ALLOWED_PATHS.stream().anyMatch(item -> pathname.equals(item) || (item.endsWith("/") && pathname.startsWith(item)));
        if (!allowed) throw new IllegalArgumentException("ComfyUI 路径不在允许范围内");
        String baseString = normalizedBase.replaceAll("/+$", "");
        return URI.create(baseString + path);
    }

    private void filterResponseRequestHeaders(HttpHeaders headers) {
        headers.remove(HttpHeaders.CONTENT_LENGTH);
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
