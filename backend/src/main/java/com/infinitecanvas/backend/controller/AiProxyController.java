package com.infinitecanvas.backend.controller;

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
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

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

        String method = request.getMethod().toUpperCase();
        byte[] body = ("GET".equals(method) || "HEAD".equals(method)) ? new byte[0] : request.getInputStream().readAllBytes();
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(PROXY_TIMEOUT);
        copyRequestHeader(request, builder, "Authorization");
        copyRequestHeader(request, builder, "Content-Type");
        copyRequestHeader(request, builder, "Accept");
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
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(e.getMessage());
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
