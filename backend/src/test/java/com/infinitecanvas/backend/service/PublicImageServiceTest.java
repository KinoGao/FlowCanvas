package com.infinitecanvas.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicImageServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void savesQuickTimeVideoWithMovExtension() {
        PublicImageService service = new PublicImageService(tempDir.toString());
        MockMultipartFile file = new MockMultipartFile(
                "file", "reference.mov", "video/quicktime", new byte[]{1, 2, 3});

        String filename = service.saveMedia(file);

        assertTrue(filename.endsWith(".mov"));
        assertEquals("video/quicktime", service.contentType(filename));
    }

    @Test
    void rejectsUnsupportedVideoMimeType() {
        PublicImageService service = new PublicImageService(tempDir.toString());
        MockMultipartFile file = new MockMultipartFile(
                "file", "reference.webm", "video/webm", new byte[]{1, 2, 3});

        assertThrows(IllegalArgumentException.class, () -> service.saveMedia(file));
    }

    @Test
    void reportsPublicVideoContentTypes() {
        PublicImageService service = new PublicImageService(tempDir.toString());

        assertEquals("video/mp4", service.contentType("clip.mp4"));
        assertEquals("video/quicktime", service.contentType("clip.mov"));
    }

    @Test
    void optimizesLargeModelReferenceImageAsBoundedJpeg() throws Exception {
        BufferedImage source = new BufferedImage(2400, 1200, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = source.createGraphics();
        graphics.setColor(Color.BLUE);
        graphics.fillRect(0, 0, source.getWidth(), source.getHeight());
        graphics.dispose();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(source, "png", bytes);

        PublicImageService service = new PublicImageService(tempDir.toString());
        String filename = service.saveModelReferenceImage(new MockMultipartFile(
                "file", "reference.png", "image/png", bytes.toByteArray()), 2048, 5 * 1024 * 1024);

        BufferedImage saved = ImageIO.read(tempDir.resolve(filename).toFile());
        assertTrue(filename.endsWith(".jpg"));
        assertEquals(2048, saved.getWidth());
        assertEquals(1024, saved.getHeight());
        assertTrue(tempDir.resolve(filename).toFile().length() <= 5 * 1024 * 1024);
    }
}
