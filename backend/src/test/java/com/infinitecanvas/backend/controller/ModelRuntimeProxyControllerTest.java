package com.infinitecanvas.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ModelRuntimeProxyControllerTest {
    private static final String BOUNDARY = "----flowcanvas-test-boundary";
    private final ModelRuntimeProxyController controller = new ModelRuntimeProxyController(null, new ObjectMapper());

    @Test
    void preservesExplicitVideoModesAndRemovesInternalControlField() throws Exception {
        byte[] binary = new byte[]{0, 1, 2, 13, 10, (byte) 0xff, 42};

        byte[] firstLast = controller.validateAndRewriteMultipart(
                multipart("first-last-frame", 2, binary), "/videos", videoModel(allModes()));
        byte[] multiFrame = controller.validateAndRewriteMultipart(
                multipart("multi-frame", 3, binary), "/videos", videoModel(allModes()));

        assertRewritten(firstLast, binary);
        assertRewritten(multiFrame, binary);
    }

    @Test
    void rejectsUnsupportedExplicitVideoMode() throws Exception {
        PlatformConfigDocument.Model model = videoModel(List.of("text-to-video"));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                controller.validateAndRewriteMultipart(multipart("multi-frame", 3, new byte[]{7}), "/videos", model));

        assertTrue(error.getMessage().contains("multi-frame"));
    }

    @Test
    void rewritesJsonImageModelWhenReferenceLimitAllowsInput() throws Exception {
        byte[] request = """
                {
                  "model": "client-selected-model",
                  "prompt": "test",
                  "n": 1,
                  "image": "https://example.invalid/reference.png"
                }
                """.getBytes(StandardCharsets.UTF_8);

        byte[] result = controller.validateAndRewriteJson(request, "/images/generations", imageModel(1), false);
        var json = new ObjectMapper().readTree(result);

        assertEquals("configured-image-model", json.get("model").asText());
        assertEquals("https://example.invalid/reference.png", json.get("image").asText());
    }

    @Test
    void rejectsJsonImageReferenceWhenConfiguredLimitIsZero() {
        byte[] request = """
                {
                  "model": "client-selected-model",
                  "prompt": "test",
                  "n": 1,
                  "image": "https://example.invalid/reference.png"
                }
                """.getBytes(StandardCharsets.UTF_8);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                controller.validateAndRewriteJson(request, "/images/generations", imageModel(0), false));

        assertEquals("参考图片数量超过当前模型上限: 0", error.getMessage());
    }

    @Test
    void infersVideoModeFromReferenceCountWhenControlFieldIsMissing() throws Exception {
        Map<Integer, String> expectedModes = Map.of(
                0, "text-to-video",
                1, "image-to-video",
                2, "first-last-frame",
                3, "multi-frame"
        );
        for (Map.Entry<Integer, String> entry : expectedModes.entrySet()) {
            PlatformConfigDocument.Model model = videoModel(List.of(entry.getValue()));
            byte[] result = controller.validateAndRewriteMultipart(
                    multipart(null, entry.getKey(), new byte[]{9, 8, 7}), "/videos", model);
            assertRewritten(result, entry.getKey() == 0 ? null : new byte[]{9, 8, 7});
        }
    }

    private static void assertRewritten(byte[] result, byte[] binary) {
        String payload = new String(result, StandardCharsets.ISO_8859_1);
        assertFalse(payload.contains("_flowcanvas_mode"));
        assertFalse(payload.contains("client-selected-model"));
        assertTrue(payload.contains("\r\nconfigured-request-model\r\n"));
        assertTrue(payload.startsWith("--" + BOUNDARY + "\r\n"));
        assertTrue(payload.endsWith("--" + BOUNDARY + "--\r\n"));
        if (binary != null) assertArrayEquals(binary, extractFirstFile(result));
    }

    private static PlatformConfigDocument.Model imageModel(int maxImages) {
        PlatformConfigDocument.ImageCapabilities capabilities = new PlatformConfigDocument.ImageCapabilities();
        capabilities.setModes(List.of("text-to-image", "image-to-image", "image-edit"));
        capabilities.setCounts(List.of(1));
        capabilities.setMaxImages(maxImages);
        capabilities.setMaxOutputs(1);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setCategory("image");
        model.setRequestModel("configured-image-model");
        model.setImageCapabilities(capabilities);
        return model;
    }

    private static PlatformConfigDocument.Model videoModel(List<String> modes) {
        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(modes);
        capabilities.setDurations(List.of(5));
        capabilities.setResolutions(List.of("720p"));
        capabilities.setMaxImages(8);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setCategory("video");
        model.setRequestModel("configured-request-model");
        model.setVideoCapabilities(capabilities);
        return model;
    }

    private static List<String> allModes() {
        return List.of("text-to-video", "image-to-video", "first-last-frame", "multi-frame");
    }

    private static byte[] multipart(String mode, int references, byte[] binary) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        field(output, "model", "client-selected-model");
        field(output, "seconds", "5");
        field(output, "resolution_name", "720p");
        if (mode != null) field(output, "_flowcanvas_mode", mode);
        for (int index = 0; index < references; index++) {
            ascii(output, "--" + BOUNDARY + "\r\n");
            ascii(output, "Content-Disposition: form-data; name=\"input_reference\"; filename=\"ref-" + index + ".bin\"\r\n");
            ascii(output, "Content-Type: application/octet-stream\r\n\r\n");
            output.write(binary);
            ascii(output, "\r\n");
        }
        ascii(output, "--" + BOUNDARY + "--\r\n");
        return output.toByteArray();
    }

    private static void field(ByteArrayOutputStream output, String name, String value) throws Exception {
        ascii(output, "--" + BOUNDARY + "\r\n");
        ascii(output, "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        ascii(output, value + "\r\n");
    }

    private static void ascii(ByteArrayOutputStream output, String value) throws Exception {
        output.write(value.getBytes(StandardCharsets.ISO_8859_1));
    }

    private static byte[] extractFirstFile(byte[] payload) {
        byte[] marker = "Content-Type: application/octet-stream\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1);
        int start = indexOf(payload, marker, 0) + marker.length;
        byte[] boundary = ("\r\n--" + BOUNDARY).getBytes(StandardCharsets.ISO_8859_1);
        int end = indexOf(payload, boundary, start);
        byte[] result = new byte[end - start];
        System.arraycopy(payload, start, result, 0, result.length);
        return result;
    }

    private static int indexOf(byte[] source, byte[] target, int from) {
        for (int index = from; index <= source.length - target.length; index++) {
            boolean match = true;
            for (int offset = 0; offset < target.length; offset++) {
                if (source[index + offset] != target[offset]) {
                    match = false;
                    break;
                }
            }
            if (match) return index;
        }
        throw new AssertionError("multipart marker not found");
    }
}
