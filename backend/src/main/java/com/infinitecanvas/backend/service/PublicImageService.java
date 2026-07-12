package com.infinitecanvas.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class PublicImageService {

    private final Path imageDir;

    public PublicImageService(@Value("${app.public-image-dir:./data/public-images}") String dir) {
        this.imageDir = Paths.get(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.imageDir);
        } catch (IOException e) {
            throw new RuntimeException("无法创建公网图片目录: " + dir, e);
        }
    }

    public String saveImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("仅支持图片类型，收到: " + contentType);
        }
        String ext = switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> "";
        };
        String filename = UUID.randomUUID().toString().replace("-", "") + ext;
        Path target = imageDir.resolve(filename).normalize();
        if (!target.startsWith(imageDir)) throw new IllegalArgumentException("文件路径非法");
        try {
            Files.copy(file.getInputStream(), target);
        } catch (IOException e) {
            throw new RuntimeException("保存图片失败", e);
        }
        return filename;
    }

    public Resource loadImage(String filename) {
        Path path = imageDir.resolve(filename).normalize();
        if (!path.startsWith(imageDir)) {
            return null;
        }
        Resource resource = new FileSystemResource(path);
        return resource.exists() ? resource : null;
    }

    public String contentType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "application/octet-stream";
    }
}
