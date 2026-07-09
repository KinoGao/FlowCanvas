package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserFile;
import com.infinitecanvas.backend.service.UserFileService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/user/files")
public class UserFileController {
    private final UserFileService fileService;

    public UserFileController(UserFileService fileService) {
        this.fileService = fileService;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> upload(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        UserFile saved = fileService.save(UserRequestContext.requireUser(request), file);
        return ApiResponse.ok(Map.of(
                "storageKey", saved.getStorageKey(),
                "url", "/api/user/files/" + saved.getStorageKey(),
                "bytes", saved.getBytes(),
                "mimeType", saved.getContentType(),
                "fileName", saved.getFileName()
        ));
    }

    @GetMapping("/{prefix}:{id}")
    public ResponseEntity<Resource> get(HttpServletRequest request, @PathVariable String prefix, @PathVariable String id) {
        User user = UserRequestContext.requireUser(request);
        String storageKey = prefix + ":" + id;
        UserFile file = fileService.find(user, storageKey);
        Resource resource = file == null ? null : fileService.load(user, storageKey);
        if (file == null || resource == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.getContentType())).body(resource);
    }
}
