package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserFile;
import com.infinitecanvas.backend.service.ImageThumbnailService;
import com.infinitecanvas.backend.service.MediaAccessService;
import com.infinitecanvas.backend.service.UserFileService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
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
    private final ImageThumbnailService thumbnails;

    public UserFileController(UserFileService fileService, MediaAccessService mediaAccess, ImageThumbnailService thumbnails) {
        this.fileService = fileService;
        this.mediaAccess = mediaAccess;
        this.thumbnails = thumbnails;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> upload(HttpServletRequest request, @RequestParam("file") MultipartFile file) {
        User user = UserRequestContext.requireUser(request);
        UserFile saved = fileService.save(user, file);
        return ApiResponse.ok(toUploadResponse(user, saved));
    }

    /** JSON/dataURL upload — preferred through cpolar tunnels that break multipart boundaries. */
    @PostMapping(value = "/data", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ApiResponse<Map<String, Object>> uploadDataUrl(HttpServletRequest request, @RequestBody DataUrlUploadRequest body) {
        User user = UserRequestContext.requireUser(request);
        if (body == null || body.dataUrl() == null || body.dataUrl().isBlank()) {
            throw new IllegalArgumentException("dataUrl field is required");
        }
        UserFile saved = fileService.saveDataUrl(user, body.dataUrl(), body.fileName(), body.contentType());
        return ApiResponse.ok(toUploadResponse(user, saved));
    }

    @PostMapping("/sign")
    public ApiResponse<Map<String, String>> sign(HttpServletRequest request, @RequestBody SignRequest body) {
        User user = UserRequestContext.requireUser(request);
        List<String> storageKeys = body == null || body.storageKeys() == null ? List.of() : body.storageKeys().stream().distinct().toList();
        if (storageKeys.size() > MAX_SIGNED_FILES_PER_REQUEST) throw new IllegalArgumentException("too many storage keys per request: max " + MAX_SIGNED_FILES_PER_REQUEST);

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
            @RequestParam("signature") String signature,
            @RequestParam(name = "width", required = false) Integer width
    ) {
        String storageKey = prefix + ":" + id;
        if (!mediaAccess.verify(userId, storageKey, expires, signature)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        UserFile file = fileService.findByOwnerId(userId, storageKey);
        Resource resource = file == null ? null : fileService.loadByOwnerId(userId, storageKey);
        if (file == null || resource == null) return ResponseEntity.notFound().build();
        // 缩略图：仅对图片生效，签名之外的白名单参数，生成失败（不可解码/已足够小）时回退原图
        if (width != null && file.getContentType() != null && file.getContentType().startsWith("image/")) {
            try {
                ImageThumbnailService.Thumbnail thumbnail = thumbnails.load(userId, file, resource, width);
                if (thumbnail != null) {
                    return ResponseEntity.ok()
                            .cacheControl(CacheControl.maxAge(Duration.ofHours(24)).cachePrivate())
                            .contentType(MediaType.parseMediaType(thumbnail.contentType()))
                            .header("X-Content-Type-Options", "nosniff")
                            .body(thumbnail.resource());
                }
            } catch (Exception ignored) {
                // 缩略图生成失败不影响原图访问
            }
        }
        // contentType 来自客户端上传，不可信：白名单外一律按二进制附件返回，
        // 并始终加 nosniff，防止存储型 XSS（伪造 text/html 在源站执行）。
        MediaType mediaType = safeMediaType(file.getContentType());
        boolean inline = isInlineMedia(mediaType);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .contentType(mediaType)
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, inline ? "inline" : "attachment")
                .body(resource);
    }

    private MediaType safeMediaType(String contentType) {
        if (contentType != null) {
            try {
                MediaType parsed = MediaType.parseMediaType(contentType);
                if (isInlineMedia(parsed)) return parsed;
            } catch (Exception ignored) {
            }
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    private boolean isInlineMedia(MediaType type) {
        String value = type.getType() + "/" + type.getSubtype();
        return value.startsWith("image/")
                || value.startsWith("video/")
                || value.startsWith("audio/")
                || value.equals("application/pdf")
                || value.equals("application/json")
                || value.equals("application/octet-stream")
                || value.equals("text/plain")
                || value.equals("text/markdown")
                || value.equals("text/csv");
    }

    private Map<String, Object> toUploadResponse(User user, UserFile saved) {
        return Map.of(
                "storageKey", saved.getStorageKey(),
                "url", mediaAccess.signedPath(user, saved.getStorageKey()),
                "bytes", saved.getBytes(),
                "mimeType", saved.getContentType(),
                "fileName", saved.getFileName()
        );
    }

    public record SignRequest(List<String> storageKeys) {}

    public record DataUrlUploadRequest(String dataUrl, String fileName, String contentType) {}
}
