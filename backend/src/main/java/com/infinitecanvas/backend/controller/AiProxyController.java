package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

@RestController
@RequestMapping("/api/ai-proxy")
public class AiProxyController {
    private static final Duration PROXY_TIMEOUT = Duration.ofMinutes(10);
    private static final Set<String> HOP_BY_HOP_HEADERS = Set.of("connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "trailers", "transfer-encoding", "upgrade", "content-encoding", "content-length");
    // 强制 HTTP/1.1：Java HttpClient 默认对纯 HTTP 地址发 h2c Upgrade，uvicorn 等服务器会拒绝
    // 升级并丢失请求体（本地自建模型服务如 Qwen3-TTS 会收到空 body）。HTTPS 厂商走 ALPN 不受影响。
    private final HttpClient httpClient = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(30)).build();
    private final PlatformConfigService platformConfigService;

    public AiProxyController(PlatformConfigService platformConfigService) {
        this.platformConfigService = platformConfigService;
    }

    @RequestMapping
    public ResponseEntity<?> proxy(@RequestParam(name = "target", required = false) String target, HttpServletRequest request) throws IOException, InterruptedException {
        if (target == null || target.isBlank()) return ResponseEntity.badRequest().body("Missing target");
        URI uri;
        try {
            uri = URI.create(target);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid target");
        }
        if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
            return ResponseEntity.badRequest().body("Unsupported target protocol");
        }

        // SSRF 防护：所有请求（无论登录与否）都必须经过白名单校验。
        // AI 代理只能访问后台配置的模型厂商地址，不允许访问任意内网地址。
        if (!platformConfigService.isAllowedProxyTarget(target)) {
            return ResponseEntity.badRequest().body("代理目标不在允许列表中（必须使用后台配置的模型厂商地址）");
        }
        // 说明：配置的模型厂商地址（如上表 whitelist）由操作员显式信任，且生成代理已能访问
        // （生成请求走 ModelRuntimeProxy，不经本代理）。部署环境可能通过内网网关/隧道解析到私网 IP
        // （如 img.junliai.org → 私网），故此处不再对白名单内的目标做「解析到私网即拒绝」的额外复核，
        // 避免图片下载被误拦。非白名单目标已在上方拒绝。

        String method = request.getMethod().toUpperCase();
        byte[] body = ("GET".equals(method) || "HEAD".equals(method)) ? new byte[0] : request.getInputStream().readAllBytes();
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(PROXY_TIMEOUT);
        copyRequestHeader(request, builder, "Authorization");
        copyRequestHeader(request, builder, "Content-Type");
        copyRequestHeader(request, builder, "Accept");
        copyRequestHeader(request, builder, "Range");
        builder.method(method, body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));

        try {
            HttpResponse<byte[]> upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            HttpHeaders headers = new HttpHeaders();
            upstream.headers().map().forEach((key, values) -> {
                if (shouldForwardResponseHeader(key)) values.forEach(value -> headers.add(key, value));
            });
            return new ResponseEntity<>(upstream.body(), headers, HttpStatus.valueOf(upstream.statusCode()));
        } catch (java.net.http.HttpTimeoutException e) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT).body("AI proxy timeout");
        } catch (IOException e) {
            // 不向客户端透出网络细节（主机 / 端口 / 内网地址等）。
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("上游请求失败");
        }
    }

    private void copyRequestHeader(HttpServletRequest request, HttpRequest.Builder builder, String name) {
        String value = request.getHeader(name);
        if (value != null && !value.isBlank()) builder.header(name, value);
    }

    private boolean shouldForwardResponseHeader(String name) {
        String normalized = name.toLowerCase();
        return !normalized.startsWith(":") && !HOP_BY_HOP_HEADERS.contains(normalized);
    }
}
