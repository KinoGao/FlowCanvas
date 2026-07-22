package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.service.PublicImageService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/public-image")
public class PublicImageController {

    private final PublicImageService publicImageService;
    private final String publicBaseUrl;

    public PublicImageController(PublicImageService publicImageService, @Value("${app.public-base-url:}") String publicBaseUrl) {
        this.publicImageService = publicImageService;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim().replaceAll("/+$", "");
    }

    @PostMapping
    public ApiResponse<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        String filename = publicImageService.saveMedia(file);
        if (!publicBaseUrl.isBlank()) {
            return ApiResponse.ok(Map.of("filename", filename, "url", publicBaseUrl + "/api/public-image/" + filename));
        }
        return ApiResponse.ok(Map.of("filename", filename));
    }

    @PostMapping(value = "/data", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<Map<String, String>> uploadDataUrl(@RequestBody Map<String, ?> body) {
        Object value = body.get("dataUrl");
        if (!(value instanceof String dataUrl) || dataUrl.isBlank()) {
            throw new IllegalArgumentException("dataUrl field is required");
        }
        String filename = publicImageService.saveDataUrl(dataUrl);
        if (!publicBaseUrl.isBlank()) {
            return ApiResponse.ok(Map.of("filename", filename, "url", publicBaseUrl + "/api/public-image/" + filename));
        }
        return ApiResponse.ok(Map.of("filename", filename));
    }

    @GetMapping("/{filename}")
    public ResponseEntity<Resource> get(@PathVariable String filename) {
        Resource resource = publicImageService.loadImage(filename);
        if (resource == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(publicImageService.contentType(filename)))
                .body(resource);
    }
}
