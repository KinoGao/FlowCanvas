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
        return files.save(entity);
    }

    public Resource load(User user, String storageKey) {
        UserFile file = files.findByStorageKey(storageKey).orElse(null);
        if (file == null || !file.getUser().getId().equals(user.getId())) return null;
        Path path = fileDir.resolve(file.getRelativePath()).normalize();
        if (!path.startsWith(fileDir)) return null;
        Resource resource = new FileSystemResource(path);
        return resource.exists() ? resource : null;
    }

    public UserFile find(User user, String storageKey) {
        UserFile file = files.findByStorageKey(storageKey).orElse(null);
        return file != null && file.getUser().getId().equals(user.getId()) ? file : null;
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
