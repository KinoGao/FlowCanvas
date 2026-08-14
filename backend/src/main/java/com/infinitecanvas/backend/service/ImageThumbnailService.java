package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.UserFile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

/**
 * 图片缩略图生成与磁盘缓存：
 * - 首次请求按 width 缩放（宽度对齐目标值）并重编码，结果缓存到磁盘；
 * - 带透明通道的图片输出 PNG，否则输出 JPEG（质量 0.85），避免透明图变黑底；
 * - 原图宽度小于等于目标宽度时返回 null（调用方回退原图，不做放大）；
 * - 解码失败（如 ImageIO 不支持的格式）返回 null（调用方回退原图）。
 */
@Service
public class ImageThumbnailService {
    private static final int MIN_WIDTH = 64;
    private static final int MAX_WIDTH = 2048;
    private static final float JPEG_QUALITY = 0.85f;

    private final Path thumbnailDir;

    public ImageThumbnailService(@Value("${app.thumbnail-dir:./data/thumbnails}") String dir) {
        this.thumbnailDir = Paths.get(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(thumbnailDir);
        } catch (IOException e) {
            throw new RuntimeException("无法创建缩略图目录: " + dir, e);
        }
    }

    public record Thumbnail(String contentType, Resource resource) {}

    public Thumbnail load(String userId, UserFile file, Resource original, int width) throws IOException {
        int targetWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
        BufferedImage source;
        try (var input = original.getInputStream()) {
            source = ImageIO.read(input);
        }
        if (source == null) return null;
        int sourceWidth = source.getWidth();
        if (sourceWidth <= targetWidth) return null;

        boolean hasAlpha = source.getColorModel().hasAlpha();
        String format = hasAlpha ? "png" : "jpeg";
        Path cacheFile = thumbnailDir.resolve(userId).resolve(file.getId() + "-w" + targetWidth + (hasAlpha ? ".png" : ".jpg"));
        if (Files.isRegularFile(cacheFile)) {
            return new Thumbnail(hasAlpha ? "image/png" : "image/jpeg", new FileSystemResource(cacheFile));
        }

        double scale = (double) targetWidth / sourceWidth;
        int targetHeight = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage scaled = new BufferedImage(targetWidth, targetHeight, hasAlpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = scaled.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null);
        } finally {
            graphics.dispose();
        }

        Path parent = cacheFile.getParent();
        if (parent != null) Files.createDirectories(parent);
        Path temp = Files.createTempFile(parent, ".thumb-", ".tmp");
        try (OutputStream output = Files.newOutputStream(temp)) {
            if (!ImageIO.write(scaled, format, output)) return null;
        }
        try {
            Files.move(temp, cacheFile, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException moveError) {
            // 并发请求可能已生成同尺寸缩略图
            Files.deleteIfExists(temp);
            if (!Files.isRegularFile(cacheFile)) throw moveError;
        }
        return new Thumbnail(hasAlpha ? "image/png" : "image/jpeg", new FileSystemResource(cacheFile));
    }
}
