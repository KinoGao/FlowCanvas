package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserFile;
import com.infinitecanvas.backend.service.MediaAccessService;
import com.infinitecanvas.backend.service.UserFileService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user/files")
public class UserFileController {
    private static final int MAX_SIGNED_FILES_PER_REQUEST = 2000;

    private final UserFileService fileService;
    private final MediaAccessService mediaAccess;

    public UserFileController(UserFileService fileService, MediaAccessService mediaAccess) {
        this.fileService = fileService;
        this.mediaAccess = mediaAccess;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> upload(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        User user = UserRequestContext.requireUser(request);
        UserFile saved = fileService.save(user, file);
        return ApiResponse.ok(Map.of(
                "storageKey", saved.getStorageKey(),
                "url", mediaAccess.signedPath(user, saved.getStorageKey()),
                "bytes", saved.getBytes(),
                "mimeType", saved.getContentType(),
                "fileName", saved.getFileName()
        ));
    }

    @PostMapping("/sign")
    public ApiResponse<Map<String, String>> sign(HttpServletRequest request, @RequestBody SignRequest body) {
        User user = UserRequestContext.requireUser(request);
        List<String> storageKeys = body == null || body.storageKeys() == null ? List.of() : body.storageKeys().stream().distinct().toList();
        if (storageKeys.size() > MAX_SIGNED_FILES_PER_REQUEST) throw new IllegalArgumentException("单次最多签名 " + MAX_SIGNED_FILES_PER_REQUEST + " 个媒体文件");

        Map<String, String> urls = new LinkedHashMap<>();
        for (String storageKey : storageKeys) {
            if (storageKey != null && storageKey.startsWith("backend:") && fileService.find(user, storageKey) != null) {
                urls.put(storageKey, mediaAccess.signedPath(user, storageKey));
            }
        }
        return ApiResponse.ok(urls);
    }

    @GetMapping("/{prefix}:{id}")
    public ResponseEntity<Resource> get(
            @PathVariable String prefix,
            @PathVariable String id,
            @RequestParam("uid") String userId,
            @RequestParam("expires") long expires,
            @RequestParam("signature") String signature
    ) {
        String storageKey = prefix + ":" + id;
        if (!mediaAccess.verify(userId, storageKey, expires, signature)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        UserFile file = fileService.findByOwnerId(userId, storageKey);
        Resource resource = file == null ? null : fileService.loadByOwnerId(userId, storageKey);
        if (file == null || resource == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .contentType(MediaType.parseMediaType(file.getContentType()))
                .body(resource);
    }

    public record SignRequest(List<String> storageKeys) {}
}
