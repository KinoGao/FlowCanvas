package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserFile;
import com.infinitecanvas.backend.repository.UserFileRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.UUID;

@Service
public class UserFileService {
    private final Path fileDir;
    private final UserFileRepository files;

    public UserFileService(@Value("${app.user-file-dir:./data/user-files}") String dir, UserFileRepository files) {
        this.fileDir = Paths.get(dir).toAbsolutePath().normalize();
        this.files = files;
        try {
            Files.createDirectories(fileDir);
        } catch (IOException e) {
            throw new RuntimeException("无法创建用户文件目录: " + dir, e);
        }
    }


    public UserFile saveDataUrl(User user, String dataUrl, String fileName, String contentType) {
        if (dataUrl == null || !dataUrl.startsWith("data:")) throw new IllegalArgumentException("only data URL is supported");
        int separator = dataUrl.indexOf(",");
        if (separator < 0) throw new IllegalArgumentException("invalid data URL format");
        String header = dataUrl.substring("data:".length(), separator).toLowerCase();
        String encoded = dataUrl.substring(separator + 1);
        if (!header.contains(";base64")) throw new IllegalArgumentException("data URL must be base64");
        String detectedType = header.substring(0, header.indexOf(";"));
        String effectiveType = (contentType == null || contentType.isBlank()) ? detectedType : contentType;
        byte[] bytes;
        try {
            bytes = java.util.Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("invalid base64 in data URL", error);
        }
        if (bytes.length == 0) throw new IllegalArgumentException("data URL has no bytes");
        return saveBytes(user, bytes, fileName, effectiveType);
    }

    /** 直接保存字节内容（Agent Run 服务端执行器落盘生成产物使用）。 */
    public UserFile saveBytes(User user, byte[] bytes, String fileName, String contentType) {
        if (bytes == null || bytes.length == 0) throw new IllegalArgumentException("文件内容为空");
        String effectiveType = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;
        String id = UUID.randomUUID().toString().replace("-", "");
        String ext = extension(effectiveType, fileName);
        String storageKey = "backend:" + id;
        String relativePath = user.getId() + "/" + id + ext;
        java.nio.file.Path target = fileDir.resolve(relativePath).normalize();
        if (!target.startsWith(fileDir)) throw new IllegalArgumentException("invalid target path");
        try {
            java.nio.file.Files.createDirectories(target.getParent());
            java.nio.file.Files.write(target, bytes, java.nio.file.StandardOpenOption.CREATE_NEW);
        } catch (java.io.IOException error) {
            throw new RuntimeException("failed to save file", error);
        }
        com.infinitecanvas.backend.entity.UserFile entity = new com.infinitecanvas.backend.entity.UserFile();
        entity.setId(id);
        entity.setUser(user);
        entity.setStorageKey(storageKey);
        entity.setFileName((fileName == null || fileName.isBlank()) ? ("file" + ext) : fileName);
        entity.setContentType(effectiveType);
        entity.setBytes((long) bytes.length);
        entity.setRelativePath(relativePath);
        entity.setCreatedAt(java.time.Instant.now());
        try {
            return files.save(entity);
        } catch (RuntimeException error) {
            try {
                java.nio.file.Files.deleteIfExists(target);
            } catch (java.io.IOException cleanupError) {
                error.addSuppressed(cleanupError);
            }
            throw error;
        }
    }

    public UserFile save(User user, MultipartFile file) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("文件为空");
        String id = UUID.randomUUID().toString().replace("-", "");
        String contentType = file.getContentType() == null || file.getContentType().isBlank() ? "application/octet-stream" : file.getContentType();
        String ext = extension(contentType, file.getOriginalFilename());
        String storageKey = "backend:" + id;
        String relativePath = user.getId() + "/" + id + ext;
        Path target = fileDir.resolve(relativePath).normalize();
        if (!target.startsWith(fileDir)) throw new IllegalArgumentException("文件路径非法");
        try {
            Files.createDirectories(target.getParent());
            Files.copy(file.getInputStream(), target);
        } catch (IOException e) {
            throw new RuntimeException("保存文件失败", e);
        }

        UserFile entity = new UserFile();
        entity.setId(id);
        entity.setUser(user);
        entity.setStorageKey(storageKey);
        entity.setFileName(file.getOriginalFilename() == null ? "file" + ext : file.getOriginalFilename());
        entity.setContentType(contentType);
        entity.setBytes(file.getSize());
        entity.setRelativePath(relativePath);
        entity.setCreatedAt(Instant.now());
        try {
            return files.save(entity);
        } catch (RuntimeException error) {
            try {
                Files.deleteIfExists(target);
            } catch (IOException cleanupError) {
                error.addSuppressed(cleanupError);
            }
            throw error;
        }
    }

    public Resource load(User user, String storageKey) {
        return loadByOwnerId(user.getId(), storageKey);
    }

    public Resource loadByOwnerId(String userId, String storageKey) {
        UserFile file = findByOwnerId(userId, storageKey);
        if (file == null) return null;
        Path path = fileDir.resolve(file.getRelativePath()).normalize();
        if (!path.startsWith(fileDir)) return null;
        Resource resource = new FileSystemResource(path);
        return resource.exists() && resource.isReadable() ? resource : null;
    }

    public UserFile find(User user, String storageKey) {
        return findByOwnerId(user.getId(), storageKey);
    }

    public UserFile findByOwnerId(String userId, String storageKey) {
        UserFile file = files.findByStorageKey(storageKey).orElse(null);
        return file != null && file.getUser().getId().equals(userId) ? file : null;
    }

    private String extension(String contentType, String fileName) {
        if (contentType.contains("png")) return ".png";
        if (contentType.contains("jpeg")) return ".jpg";
        if (contentType.contains("webp")) return ".webp";
        if (contentType.contains("gif")) return ".gif";
        if (contentType.contains("mp4")) return ".mp4";
        if (contentType.contains("webm")) return ".webm";
        if (contentType.contains("mpeg")) return ".mp3";
        if (contentType.contains("wav")) return ".wav";
        if (fileName != null) {
            int dot = fileName.lastIndexOf('.');
            if (dot >= 0 && dot < fileName.length() - 1) return fileName.substring(dot).replaceAll("[^A-Za-z0-9.]", "");
        }
        return ".bin";
    }
}
