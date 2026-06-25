package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.service.PublicImageService;
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

    public PublicImageController(PublicImageService publicImageService) {
        this.publicImageService = publicImageService;
    }

    @PostMapping
    public ApiResponse<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        String filename = publicImageService.saveImage(file);
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