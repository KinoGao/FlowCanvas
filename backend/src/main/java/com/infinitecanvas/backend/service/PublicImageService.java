package com.infinitecanvas.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.StandardOpenOption;
import java.util.Base64;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Iterator;
import java.util.UUID;

@Service
public class PublicImageService {

    private static final int MAX_PUBLIC_VIDEO_BYTES = 200 * 1024 * 1024;

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

    public String saveModelReferenceImage(MultipartFile file, int maxEdge, int maxBytes) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("参考图为空");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("参考图必须是图片类型，收到: " + contentType);
        }

        BufferedImage source;
        try {
            source = ImageIO.read(file.getInputStream());
        } catch (IOException error) {
            throw new IllegalArgumentException("参考图无法读取，请转换为 PNG 或 JPEG 后重试", error);
        }
        if (source == null) {
            if (file.getSize() <= maxBytes) return saveImage(file);
            throw new IllegalArgumentException("参考图格式无法压缩且文件过大，请转换为 PNG 或 JPEG 后重试");
        }

        double scale = Math.min(1.0, (double) maxEdge / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage compatible = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = compatible.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }

        byte[] encoded = encodeJpeg(compatible, maxBytes);
        String filename = UUID.randomUUID().toString().replace("-", "") + ".jpg";
        Path target = imageDir.resolve(filename).normalize();
        if (!target.startsWith(imageDir)) throw new IllegalArgumentException("文件路径非法");
        try {
            Files.write(target, encoded, StandardOpenOption.CREATE_NEW);
        } catch (IOException error) {
            throw new RuntimeException("保存参考图失败", error);
        }
        return filename;
    }

    private byte[] encodeJpeg(BufferedImage image, int maxBytes) {
        for (float quality : new float[]{0.9f, 0.82f, 0.74f, 0.66f}) {
            byte[] encoded = encodeJpeg(image, quality);
            if (encoded.length <= maxBytes) return encoded;
        }
        throw new IllegalArgumentException("参考图压缩后仍超过 5 MB，请先缩小图片后重试");
    }

    private byte[] encodeJpeg(BufferedImage image, float quality) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) throw new IllegalStateException("当前运行环境缺少 JPEG 编码器");
        ImageWriter writer = writers.next();
        try (ByteArrayOutputStream output = new ByteArrayOutputStream();
             ImageOutputStream imageOutput = ImageIO.createImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            ImageWriteParam params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(quality);
            writer.write(null, new IIOImage(image, null, null), params);
            return output.toByteArray();
        } catch (IOException error) {
            throw new RuntimeException("压缩参考图失败", error);
        } finally {
            writer.dispose();
        }
    }

    public String saveMedia(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Media file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || (!contentType.startsWith("image/")
                && !contentType.equals("video/mp4")
                && !contentType.equals("video/quicktime"))) {
            throw new IllegalArgumentException("Only images, MP4, and MOV media are supported: " + contentType);
        }
        if (contentType.startsWith("image/")) return saveImage(file);
        if (file.getSize() > MAX_PUBLIC_VIDEO_BYTES) {
            throw new IllegalArgumentException("Reference video must not exceed 200 MB");
        }
        String ext = contentType.equals("video/mp4") ? ".mp4" : ".mov";
        String filename = UUID.randomUUID().toString().replace("-", "") + ext;
        Path target = imageDir.resolve(filename).normalize();
        if (!target.startsWith(imageDir)) throw new IllegalArgumentException("Invalid media file path");
        try {
            Files.copy(file.getInputStream(), target);
        } catch (IOException error) {
            throw new RuntimeException("Failed to save media file", error);
        }
        return filename;
    }

    public String saveDataUrl(String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:image/")) {
            throw new IllegalArgumentException("仅支持图片 Data URL");
        }
        int separator = dataUrl.indexOf(",");
        if (separator < 0) throw new IllegalArgumentException("图片 Data URL 格式无效");
        String metadata = dataUrl.substring("data:".length(), separator).toLowerCase();
        String encoded = dataUrl.substring(separator + 1);
        if (!metadata.contains(";base64")) throw new IllegalArgumentException("图片 Data URL 必须使用 base64");
        String contentType = metadata.substring(0, metadata.indexOf(';'));
        String ext = switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            default -> throw new IllegalArgumentException("不支持的图片类型: " + contentType);
        };
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("图片 Data URL 的 base64 内容无效", error);
        }
        if (bytes.length == 0) throw new IllegalArgumentException("图片内容为空");
        String filename = UUID.randomUUID().toString().replace("-", "") + ext;
        Path target = imageDir.resolve(filename).normalize();
        if (!target.startsWith(imageDir)) throw new IllegalArgumentException("文件路径非法");
        try {
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
        } catch (IOException error) {
            throw new RuntimeException("保存图片失败", error);
        }
        return filename;
    }

    public String saveVideoDataUrl(String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:video/")) {
            throw new IllegalArgumentException("Only video Data URLs are supported");
        }
        int separator = dataUrl.indexOf(',');
        if (separator < 0) throw new IllegalArgumentException("Invalid video Data URL");
        String metadata = dataUrl.substring("data:".length(), separator).toLowerCase();
        String encoded = dataUrl.substring(separator + 1);
        if (!metadata.contains(";base64")) throw new IllegalArgumentException("Video Data URL must use base64 encoding");
        String contentType = metadata.substring(0, metadata.indexOf(';'));
        String ext = switch (contentType) {
            case "video/mp4" -> ".mp4";
            case "video/quicktime" -> ".mov";
            default -> throw new IllegalArgumentException("Seedance reference videos must be MP4 or MOV: " + contentType);
        };
        long maximumEncodedLength = ((long) MAX_PUBLIC_VIDEO_BYTES + 2L) / 3L * 4L;
        if (encoded.length() > maximumEncodedLength) {
            throw new IllegalArgumentException("Reference video must not exceed 200 MB");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Invalid base64 content in video Data URL", error);
        }
        if (bytes.length == 0) throw new IllegalArgumentException("Video content is empty");
        if (bytes.length > MAX_PUBLIC_VIDEO_BYTES) throw new IllegalArgumentException("Reference video must not exceed 200 MB");
        String filename = UUID.randomUUID().toString().replace("-", "") + ext;
        Path target = imageDir.resolve(filename).normalize();
        if (!target.startsWith(imageDir)) throw new IllegalArgumentException("Invalid media file path");
        try {
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
        } catch (IOException error) {
            throw new RuntimeException("Failed to save media file", error);
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
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".mov")) return "video/quicktime";
        return "application/octet-stream";
    }
}
