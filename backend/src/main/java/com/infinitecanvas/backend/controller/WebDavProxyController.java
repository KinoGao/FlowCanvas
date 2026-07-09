package com.infinitecanvas.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/api/webdav-proxy")
public class WebDavProxyController {
    private static final Duration WEBDAV_PROXY_TIMEOUT = Duration.ofMinutes(2);
    private static final List<String> RESPONSE_HEADERS = List.of("content-type", "etag", "last-modified", "dav");
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

    @PostMapping
    public ResponseEntity<?> proxy(HttpServletRequest request) throws IOException, InterruptedException {
        String target = request.getHeader("x-webdav-target");
        String method = request.getHeader("x-webdav-method") == null ? "GET" : request.getHeader("x-webdav-method").toUpperCase();
        if (target == null || target.isBlank()) return ResponseEntity.badRequest().body("Missing x-webdav-target");

        URI uri;
        try {
            uri = URI.create(target);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid x-webdav-target");
        }
        if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
            return ResponseEntity.badRequest().body("Unsupported WebDAV target");
        }

        byte[] body = ("GET".equals(method) || "HEAD".equals(method)) ? new byte[0] : request.getInputStream().readAllBytes();
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(WEBDAV_PROXY_TIMEOUT);
        copyProxyHeader(request, builder, "x-webdav-authorization", "Authorization");
        copyProxyHeader(request, builder, "x-webdav-depth", "Depth");
        copyProxyHeader(request, builder, "x-webdav-destination", "Destination");
        copyProxyHeader(request, builder, "x-webdav-overwrite", "Overwrite");
        copyProxyHeader(request, builder, "x-webdav-content-type", "Content-Type");
        builder.method(method, body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));

        try {
            HttpResponse<byte[]> upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            HttpHeaders headers = new HttpHeaders();
            upstream.headers().map().forEach((key, values) -> {
                if (RESPONSE_HEADERS.contains(key.toLowerCase())) values.forEach(value -> headers.add(key, value));
            });
            return new ResponseEntity<>("HEAD".equals(method) ? null : upstream.body(), headers, HttpStatus.valueOf(upstream.statusCode()));
        } catch (java.net.http.HttpTimeoutException e) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT).body("WebDAV proxy timeout");
        } catch (IOException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(e.getMessage());
        }
    }

    private void copyProxyHeader(HttpServletRequest request, HttpRequest.Builder builder, String from, String to) {
        String value = request.getHeader(from);
        if (value != null && !value.isBlank()) builder.header(to, value);
    }
}
