package com.infinitecanvas.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

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
}
