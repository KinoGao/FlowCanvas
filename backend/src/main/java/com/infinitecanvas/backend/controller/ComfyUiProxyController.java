package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.GenerationJobService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/comfyui-proxy")
public class ComfyUiProxyController {
    private static final Set<String> ALLOWED_PATHS = Set.of("/system_stats", "/object_info", "/prompt", "/history/", "/view", "/upload/image");
    private static final int COMFY_PROXY_MAX_IN_MEMORY_SIZE = 16 * 1024 * 1024;
    private static final Set<String> MEDIA_REQUEST_HEADERS = Set.of(HttpHeaders.RANGE, HttpHeaders.IF_RANGE, HttpHeaders.IF_NONE_MATCH, HttpHeaders.IF_MODIFIED_SINCE);
    private static final Set<String> MEDIA_RESPONSE_HEADERS = Set.of(
            HttpHeaders.CONTENT_TYPE,
            HttpHeaders.CONTENT_LENGTH,
            HttpHeaders.CONTENT_DISPOSITION,
            HttpHeaders.CONTENT_RANGE,
            HttpHeaders.CONTENT_ENCODING,
            HttpHeaders.ACCEPT_RANGES,
            HttpHeaders.ETAG,
            HttpHeaders.LAST_MODIFIED,
            HttpHeaders.CACHE_CONTROL
    );

    private final PlatformConfigService platformConfigService;
    private final GenerationJobService generationJobService;
    private final WebClient webClient = WebClient.builder()
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(COMFY_PROXY_MAX_IN_MEMORY_SIZE))
            .build();
    private final HttpClient mediaClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public ComfyUiProxyController(PlatformConfigService platformConfigService, GenerationJobService generationJobService) {
        this.platformConfigService = platformConfigService;
        this.generationJobService = generationJobService;
    }

    @GetMapping
    public void get(
            @RequestParam(defaultValue = "") String baseUrl,
            @RequestParam(defaultValue = "") String path,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        URI target;
        try {
            target = buildTargetUrl(baseUrl, path);
        } catch (IllegalArgumentException e) {
            writeJsonError(response, HttpStatus.BAD_REQUEST.value(), e.getMessage());
            return;
        }

        if (requestPath(path).equals("/view")) {
            proxyMedia(target, request, response);
            return;
        }
        writeBufferedResponse(response, proxyBuffered(target, HttpMethod.GET, null, null));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> upload(@RequestParam(defaultValue = "") String baseUrl, @RequestParam("image") MultipartFile image) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("image", image.getResource());
        try {
            return proxyBuffered(buildTargetUrl(baseUrl, "/upload/image"), HttpMethod.POST, null, form);
        } catch (IllegalArgumentException e) {
            return jsonResponse(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }

    @PostMapping
    public ResponseEntity<?> post(@RequestBody Map<String, Object> payload, HttpServletRequest request) throws Exception {
        String baseUrl = String.valueOf(payload.getOrDefault("baseUrl", ""));
        String path = String.valueOf(payload.getOrDefault("path", ""));
        HttpMethod method = "GET".equals(payload.get("method")) ? HttpMethod.GET : HttpMethod.POST;
        String jobKey = "/prompt".equals(requestPath(path)) ? request.getHeader("X-FlowCanvas-Job-Id") : null;
        return generationJobService.execute(UserRequestContext.currentUser(request), jobKey, () -> {
            try {
                return proxyBuffered(buildTargetUrl(baseUrl, path), method, payload.get("body"), null);
            } catch (IllegalArgumentException e) {
                return jsonResponse(HttpStatus.BAD_REQUEST, e.getMessage());
            }
        });
    }

    private ResponseEntity<byte[]> proxyBuffered(URI target, HttpMethod method, Object body, MultiValueMap<String, Object> multipart) {
        WebClient.RequestBodySpec request = webClient.method(method).uri(target);
        if (multipart != null) {
            request.contentType(MediaType.MULTIPART_FORM_DATA).body(BodyInserters.fromMultipartData(multipart));
        } else if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).bodyValue(body);
        }

        try {
            ResponseEntity<byte[]> result = request.exchangeToMono(clientResponse -> clientResponse.toEntity(byte[].class))
                    .block(Duration.ofMinutes(10));
            return result == null ? jsonResponse(HttpStatus.BAD_GATEWAY, "ComfyUI returned an empty response") : result;
        } catch (Exception e) {
            return jsonResponse(HttpStatus.BAD_GATEWAY, rootMessage(e));
        }
    }

    private void proxyMedia(URI target, HttpServletRequest servletRequest, HttpServletResponse servletResponse) throws IOException {
        HttpRequest.Builder request = HttpRequest.newBuilder(target)
                .timeout(Duration.ofMinutes(10))
                .GET();
        MEDIA_REQUEST_HEADERS.forEach(name -> {
            String value = servletRequest.getHeader(name);
            if (value != null && !value.isBlank()) request.header(name, value);
        });

        try {
            HttpResponse<InputStream> upstream = mediaClient.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            servletResponse.setStatus(upstream.statusCode());
            MEDIA_RESPONSE_HEADERS.forEach(name -> upstream.headers().firstValue(name).ifPresent(value -> servletResponse.setHeader(name, value)));
            try (InputStream input = upstream.body()) {
                input.transferTo(servletResponse.getOutputStream());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (!servletResponse.isCommitted()) writeJsonError(servletResponse, HttpStatus.BAD_GATEWAY.value(), "ComfyUI media request was interrupted");
        } catch (Exception e) {
            if (!servletResponse.isCommitted()) writeJsonError(servletResponse, HttpStatus.BAD_GATEWAY.value(), rootMessage(e));
            else throw e instanceof IOException ioException ? ioException : new IOException(e);
        }
    }

    private URI buildTargetUrl(String baseUrl, String path) {
        String configuredBaseUrl = platformConfigService.comfyBaseUrl();
        String normalizedBase = !configuredBaseUrl.isBlank()
                ? configuredBaseUrl
                : (baseUrl == null || baseUrl.isBlank()) ? "http://127.0.0.1:8188" : baseUrl.trim();
        URI base = URI.create(normalizedBase);
        if (!"http".equalsIgnoreCase(base.getScheme()) && !"https".equalsIgnoreCase(base.getScheme())) {
            throw new IllegalArgumentException("ComfyUI address only supports http/https");
        }
        if (base.getUserInfo() != null) throw new IllegalArgumentException("ComfyUI address must not contain credentials");
        if (path == null || !path.startsWith("/") || path.contains("://")) throw new IllegalArgumentException("Invalid ComfyUI path");
        String pathname = requestPath(path);
        boolean allowed = ALLOWED_PATHS.stream().anyMatch(item -> pathname.equals(item) || (item.endsWith("/") && pathname.startsWith(item)));
        if (!allowed) throw new IllegalArgumentException("ComfyUI path is not allowed");
        return URI.create(normalizedBase.replaceAll("/+$", "") + path);
    }

    private String requestPath(String path) {
        int queryIndex = path.indexOf('?');
        return queryIndex < 0 ? path : path.substring(0, queryIndex);
    }

    private void writeBufferedResponse(HttpServletResponse response, ResponseEntity<byte[]> upstream) throws IOException {
        response.setStatus(upstream.getStatusCode().value());
        upstream.getHeaders().forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
        byte[] body = upstream.getBody();
        if (body != null) response.getOutputStream().write(body);
    }

    private void writeJsonError(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getOutputStream().write(jsonBody(detail));
    }

    private ResponseEntity<byte[]> jsonResponse(HttpStatus status, String detail) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(jsonBody(detail));
    }

    private byte[] jsonBody(String detail) {
        return ("{\"detail\":\"" + escapeJson(detail) + "\"}").getBytes(StandardCharsets.UTF_8);
    }

    private String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        return current.getMessage() == null || current.getMessage().isBlank() ? error.getClass().getSimpleName() : current.getMessage();
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
