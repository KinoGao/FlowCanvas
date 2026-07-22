package com.infinitecanvas.backend.service.modelruntime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.PublicImageService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VolcengineSeedanceAdapterTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> createBody = new AtomicReference<>("");
    private HttpServer server;
    private String serverUrl;

    @TempDir
    Path tempDir;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/api/v3/contents/generations/tasks", exchange -> {
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                createBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                respond(exchange, 200, "application/json", "{\"id\":\"task-1\",\"status\":\"queued\"}".getBytes(StandardCharsets.UTF_8));
                return;
            }
            respond(exchange, 200, "application/json", ("{\"id\":\"task-1\",\"status\":\"succeeded\",\"content\":[{\"type\":\"video_url\",\"video_url\":{\"url\":\"" + serverUrl + "/media/result.mp4\"}}]}").getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/media/result.mp4", exchange -> respond(exchange, 200, "video/mp4", new byte[]{4, 3, 2, 1}));
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void translatesNormalizedSeedance20CreateRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"model\":\"client-model\",\"content\":[{\"type\":\"text\",\"text\":\"A slow camera move\"}],"
                + "\"ratio\":\"16:9\",\"resolution\":\"720p\",\"duration\":5,\"generate_audio\":true,"
                + "\"_flowcanvas_mode\":\"text-to-video\"}").getBytes(StandardCharsets.UTF_8));

        ResponseEntity<?> response = adapter().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("task-1", responseJson(response).path("id").asText());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals("doubao-seedance-2-0-pro", upstream.path("model").asText());
        assertEquals("16:9", upstream.path("ratio").asText());
        assertTrue(upstream.path("generate_audio").asBoolean());
        assertFalse(upstream.has("_flowcanvas_mode"));
    }

    @Test
    void rejectsSeedance20UnsupportedParametersInsteadOfDroppingThem() throws Exception {
        for (String field : List.of(
                "\"frames\":121",
                "\"seed\":11",
                "\"camera_fixed\":false",
                "\"service_tier\":\"flex\""
        )) {
            ResponseEntity<?> response = create(runtime(), """
                    {"content":[{"type":"text","text":"A slow camera move"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
        }
    }

    @Test
    void validatesSeedance20AdvancedOfficialParameters() throws Exception {
        for (String field : List.of(
                "\"priority\":-1",
                "\"priority\":10",
                "\"tools\":[{\"type\":\"unknown\"}]",
                "\"execution_expires_after\":3599",
                "\"safety_identifier\":\"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm\""
        )) {
            ResponseEntity<?> response = create(runtime(), """
                    {"content":[{"type":"text","text":"A current product film"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
        }

        ResponseEntity<?> response = create(runtime(), """
                {"content":[{"type":"text","text":"A current product film"}],
                 "ratio":"16:9","resolution":"720p","duration":5,
                 "priority":9,"tools":[{"type":"web_search"}],
                 "execution_expires_after":3600,"safety_identifier":"user-123",
                 "return_last_frame":true,"callback_url":"https://example.com/callback"}
                """);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals(9, upstream.path("priority").asInt());
        assertEquals("web_search", upstream.path("tools").path(0).path("type").asText());
        assertEquals(3600, upstream.path("execution_expires_after").asInt());
        assertTrue(upstream.path("return_last_frame").asBoolean());
    }

    @Test
    void validatesSeedance10FramesSeedServiceTierAndRejectsSeedance20OnlyTools() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video"));
        runtime.model().setRequestAdapter("seedance-v1");
        runtime.model().setRequestModel("doubao-seedance-1-0-pro-250528");

        for (String field : List.of(
                "\"frames\":28",
                "\"frames\":30",
                "\"seed\":4294967296",
                "\"service_tier\":\"turbo\"",
                "\"tools\":[{\"type\":\"web_search\"}]",
                "\"priority\":1"
        )) {
            ResponseEntity<?> response = create(runtime, """
                    {"content":[{"type":"text","text":"A slow camera move"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
        }

        ResponseEntity<?> response = create(runtime, """
                {"content":[{"type":"text","text":"A slow camera move"}],
                 "ratio":"16:9","resolution":"720p","frames":29,
                 "seed":4294967295,"service_tier":"flex","camera_fixed":true}
                """);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }
    @Test
    void acceptsValidSeedance15DraftRequest() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video"));
        runtime.model().setRequestAdapter("seedance-v1.5");
        runtime.model().setRequestModel("doubao-seedance-1-5-pro-251215");
        runtime.model().getVideoCapabilities().setDraft(true);
        runtime.model().getVideoCapabilities().setResolutions(List.of("480p", "720p", "1080p"));

        ResponseEntity<?> response = create(runtime, """
                {"content":[{"type":"text","text":"Draft clip"}],"duration":5,
                 "resolution":"480p","ratio":"16:9","draft":true}
                """);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals("480p", upstream.path("resolution").asText());
        assertTrue(upstream.path("draft").asBoolean());
    }

    @Test
    void rejectsInvalidSeedance15DraftCombinations() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video"));
        runtime.model().setRequestAdapter("seedance-v1.5");
        runtime.model().setRequestModel("doubao-seedance-1-5-pro-251215");
        runtime.model().getVideoCapabilities().setDraft(true);
        runtime.model().getVideoCapabilities().setResolutions(List.of("480p", "720p", "1080p"));

        for (String fields : List.of(
                "\"resolution\":\"1080p\"",
                "\"resolution\":\"480p\",\"return_last_frame\":true",
                "\"resolution\":\"480p\",\"service_tier\":\"flex\"",
                "\"resolution\":\"480p\",\"frames\":121"
        )) {
            ResponseEntity<?> response = create(runtime, """
                    {"content":[{"type":"text","text":"Draft clip"}],"duration":5,
                     "ratio":"16:9","draft":true,%s}
                    """.formatted(fields));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), fields);
        }
    }

    @Test
    void normalizesTaskAndDownloadsCompletedMediaThroughContentEndpoint() throws Exception {
        ResponseEntity<?> taskResponse = adapter().handle(
                new MockHttpServletRequest("GET", "/videos/task-1"), "/videos/task-1", runtime());
        assertEquals(HttpStatus.OK, taskResponse.getStatusCode());
        assertEquals("completed", responseJson(taskResponse).path("status").asText());

        ResponseEntity<?> contentResponse = adapter().handle(
                new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());
        assertEquals(HttpStatus.OK, contentResponse.getStatusCode());
        assertEquals("video/mp4", contentResponse.getHeaders().getContentType().toString());
        assertArrayEquals(new byte[]{4, 3, 2, 1}, (byte[]) contentResponse.getBody());
    }

    @Test
    void convertsLocalImageDataUrlToConfiguredPublicImageUrl() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"content\":[{\"type\":\"image_url\",\"role\":\"first_frame\",\"image_url\":{"
                + "\"url\":\"data:image/png;base64,AAECAw==\"}}],\"ratio\":\"16:9\",\"resolution\":\"720p\",\"duration\":5}").getBytes(StandardCharsets.UTF_8));

        adapter().handle(request, "/videos", runtime());

        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertTrue(upstream.path("content").get(0).path("image_url").path("url").asText().startsWith(serverUrl + "/api/public-image/"));
    }

    @Test
    void convertsLocalVideoDataUrlToConfiguredPublicMediaUrl() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"content\":[{\"type\":\"video_url\",\"role\":\"reference_video\",\"video_url\":{"
                + "\"url\":\"data:video/mp4;base64,AAECAw==\"}}],\"ratio\":\"16:9\",\"resolution\":\"720p\",\"duration\":5,"
                + "\"_flowcanvas_mode\":\"all-in-one-reference\"}").getBytes(StandardCharsets.UTF_8));

        adapter().handle(request, "/videos", runtime());

        JsonNode upstream = objectMapper.readTree(createBody.get());
        String videoUrl = upstream.path("content").get(0).path("video_url").path("url").asText();
        assertTrue(videoUrl.startsWith(serverUrl + "/api/public-image/"));
        assertTrue(videoUrl.endsWith(".mp4"));
    }

    @Test
    void convertsLocalMovDataUrlToConfiguredPublicMediaUrl() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"content\":[{\"type\":\"video_url\",\"role\":\"reference_video\",\"video_url\":{"
                + "\"url\":\"data:video/quicktime;base64,AAECAw==\"}}],\"ratio\":\"16:9\",\"resolution\":\"720p\",\"duration\":5,"
                + "\"_flowcanvas_mode\":\"all-in-one-reference\"}").getBytes(StandardCharsets.UTF_8));

        adapter().handle(request, "/videos", runtime());

        JsonNode upstream = objectMapper.readTree(createBody.get());
        String videoUrl = upstream.path("content").get(0).path("video_url").path("url").asText();
        assertTrue(videoUrl.startsWith(serverUrl + "/api/public-image/"));
        assertTrue(videoUrl.endsWith(".mov"));
    }

    @Test
    void rejectsUnsupportedLocalVideoDataUrlFormat() throws Exception {
        ResponseEntity<?> response = create(runtime(), """
                {"content":[{"type":"video_url","role":"reference_video",
                  "video_url":{"url":"data:video/webm;base64,AAECAw=="}}],
                 "ratio":"16:9","resolution":"720p","duration":5,
                 "_flowcanvas_mode":"all-in-one-reference"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("", createBody.get());
    }

    @Test
    void rejectsReferenceAudioWithoutReferenceImageOrVideo() throws Exception {
        ResponseEntity<?> response = create(runtime(), """
                {"content":[
                  {"type":"text","text":"Follow the rhythm"},
                  {"type":"audio_url","role":"reference_audio","audio_url":{"url":"https://example.com/a.mp3"}}
                ],"duration":5,"resolution":"720p","ratio":"16:9","_flowcanvas_mode":"all-in-one-reference"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void rejectsFrameAndReferenceMediaMixedTogether() throws Exception {
        ResponseEntity<?> response = create(runtime(), """
                {"content":[
                  {"type":"image_url","role":"first_frame","image_url":{"url":"https://example.com/first.png"}},
                  {"type":"video_url","role":"reference_video","video_url":{"url":"https://example.com/ref.mp4"}}
                ],"duration":5,"resolution":"720p","ratio":"16:9"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void rejectsInvalidFirstLastFrameRoles() throws Exception {
        ResponseEntity<?> response = create(runtime(), """
                {"content":[
                  {"type":"image_url","role":"first_frame","image_url":{"url":"https://example.com/first.png"}},
                  {"type":"image_url","role":"first_frame","image_url":{"url":"https://example.com/last.png"}}
                ],"duration":5,"resolution":"720p","ratio":"16:9","_flowcanvas_mode":"first-last-frame"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void acceptsMaximumSeedance20MultimodalReferencesAndSmartDuration() throws Exception {
        StringBuilder content = new StringBuilder("[{\"type\":\"text\",\"text\":\"Make a coherent film\"}");
        for (int i = 0; i < 9; i++) content.append(",{\"type\":\"image_url\",\"role\":\"reference_image\",\"image_url\":{\"url\":\"https://example.com/i").append(i).append(".png\"}}");
        for (int i = 0; i < 3; i++) content.append(",{\"type\":\"video_url\",\"role\":\"reference_video\",\"video_url\":{\"url\":\"https://example.com/v").append(i).append(".mp4\"}}");
        for (int i = 0; i < 3; i++) content.append(",{\"type\":\"audio_url\",\"role\":\"reference_audio\",\"audio_url\":{\"url\":\"https://example.com/a").append(i).append(".mp3\"}}");
        content.append(']');

        ResponseEntity<?> response = create(runtimeWithDurations(List.of(-1, 4, 5, 15)),
                "{\"content\":" + content + ",\"duration\":-1,\"resolution\":\"720p\",\"ratio\":\"adaptive\"}");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals(-1, upstream.path("duration").asInt());
        assertEquals(16, upstream.path("content").size());
    }

    @Test
    void infersSingleReferenceImageAsAllInOneReference() throws Exception {
        ResponseEntity<?> response = create(runtimeWithModes(List.of("all-in-one-reference")), """
                {"content":[
                  {"type":"image_url","role":"reference_image","image_url":{"url":"https://example.com/ref.png"}}
                ],"duration":5,"resolution":"720p","ratio":"16:9"}
                """);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void rejectsGenerateAudioForSeedance10() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video"));
        runtime.model().getVideoCapabilities().setGenerateAudio(false);
        runtime.model().setRequestAdapter("seedance-v1");
        runtime.model().setRequestModel("doubao-seedance-1-0-pro-250528");

        ResponseEntity<?> response = create(runtime, """
                {"content":[{"type":"text","text":"Silent clip"}],"duration":5,
                 "resolution":"720p","ratio":"16:9","generate_audio":true}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void rejectsFirstLastFrameForSeedance10ProFast() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video", "image-to-video"));
        runtime.model().setRequestAdapter("seedance-v1");
        runtime.model().setRequestModel("doubao-seedance-1-0-pro-fast-251015");
        runtime.model().getVideoCapabilities().setMaxImages(1);

        ResponseEntity<?> response = create(runtime, """
                {"content":[
                  {"type":"image_url","role":"first_frame","image_url":{"url":"https://example.com/first.png"}},
                  {"type":"image_url","role":"last_frame","image_url":{"url":"https://example.com/last.png"}}
                ],"duration":5,"resolution":"1080p","ratio":"adaptive","_flowcanvas_mode":"first-last-frame"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void standardSeedance20Accepts4kButFastRejects1080pAnd4k() throws Exception {
        PlatformConfigService.RuntimeModel standard = runtimeWithModes(List.of("text-to-video"));
        standard.model().getVideoCapabilities().setResolutions(List.of("480p", "720p", "1080p", "4k"));
        ResponseEntity<?> standardResponse = create(standard, """
                {"content":[{"type":"text","text":"Cinematic city"}],"duration":5,
                 "resolution":"4k","ratio":"16:9"}
                """);

        PlatformConfigService.RuntimeModel fast = runtimeWithModes(List.of("text-to-video"));
        fast.model().setRequestModel("doubao-seedance-2-0-fast-260128");
        fast.model().getVideoCapabilities().setResolutions(List.of("480p", "720p"));
        ResponseEntity<?> fast1080p = create(fast, """
                {"content":[{"type":"text","text":"Fast city"}],"duration":5,
                 "resolution":"1080p","ratio":"16:9"}
                """);
        ResponseEntity<?> fast4k = create(fast, """
                {"content":[{"type":"text","text":"Fast city"}],"duration":5,
                 "resolution":"4k","ratio":"16:9"}
                """);

        assertEquals(HttpStatus.OK, standardResponse.getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, fast1080p.getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, fast4k.getStatusCode());
    }

    @Test
    void validatesModelSpecificDurationRanges() throws Exception {
        PlatformConfigService.RuntimeModel seedance20 = runtimeWithDurations(List.of(-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15));
        ResponseEntity<?> seedance20TooShort = create(seedance20, """
                {"content":[{"type":"text","text":"Too short"}],"duration":2,
                 "resolution":"720p","ratio":"16:9"}
                """);

        PlatformConfigService.RuntimeModel seedance10 = runtimeWithDurations(List.of(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
        seedance10.model().setRequestAdapter("seedance-v1");
        seedance10.model().setRequestModel("doubao-seedance-1-0-pro-250528");
        ResponseEntity<?> seedance10TooLong = create(seedance10, """
                {"content":[{"type":"text","text":"Too long"}],"duration":15,
                 "resolution":"720p","ratio":"16:9"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, seedance20TooShort.getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, seedance10TooLong.getStatusCode());
    }

    @Test
    void rejectsMissingOrMalformedContentBeforeCallingUpstream() throws Exception {
        for (String json : List.of(
                "{\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"16:9\"}",
                "{\"content\":{},\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"16:9\"}",
                "{\"content\":[],\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"16:9\"}",
                "{\"content\":[{\"type\":\"text\",\"text\":\"   \"}],\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"16:9\"}",
                "{\"content\":[{\"type\":\"image_url\",\"role\":\"first_frame\",\"image_url\":{}}],\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"adaptive\"}",
                "{\"content\":[{\"type\":\"video_url\",\"role\":\"reference_video\",\"video_url\":{}}],\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"adaptive\"}",
                "{\"content\":[{\"type\":\"unknown\"}],\"duration\":5,\"resolution\":\"720p\",\"ratio\":\"16:9\"}"
        )) {
            ResponseEntity<?> response = create(runtime(), json);
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), json);
        }
        assertEquals("", createBody.get());
    }

    @Test
    void rejectsMoreThanOneTextItemInSeedanceContent() throws Exception {
        ResponseEntity<?> textToVideo = create(runtime(), """
                {"content":[
                    {"type":"text","text":"First prompt"},
                    {"type":"text","text":"Second prompt"}
                ],"duration":5,"resolution":"720p","ratio":"16:9","_flowcanvas_mode":"text-to-video"}
                """);
        ResponseEntity<?> multimodal = create(runtimeWithModes(List.of("all-in-one-reference")), """
                {"content":[
                    {"type":"text","text":"First prompt"},
                    {"type":"text","text":"Second prompt"},
                    {"type":"image_url","role":"reference_image","image_url":{"url":"https://example.com/reference.png"}}
                ],"duration":5,"resolution":"720p","ratio":"adaptive","_flowcanvas_mode":"all-in-one-reference"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, textToVideo.getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, multimodal.getStatusCode());
        assertEquals("", createBody.get());
    }

    @Test
    void acceptsSeedance15DraftTaskAndRejectsItForOtherModels() throws Exception {
        PlatformConfigService.RuntimeModel seedance15 = runtimeWithModes(List.of("text-to-video", "image-to-video", "first-last-frame"));
        seedance15.model().setRequestAdapter("seedance-v1.5");
        seedance15.model().setRequestModel("doubao-seedance-1-5-pro-251215");
        seedance15.model().getVideoCapabilities().setResolutions(List.of("480p", "720p", "1080p"));

        String request = """
                {"content":[{"type":"draft_task","draft_task":{"id":"draft-task-1"}}],
                 "resolution":"720p","ratio":"16:9"}
                """;
        ResponseEntity<?> accepted = create(seedance15, request);
        assertEquals(HttpStatus.OK, accepted.getStatusCode());
        assertEquals("draft-task-1", objectMapper.readTree(createBody.get()).path("content").path(0).path("draft_task").path("id").asText());

        ResponseEntity<?> rejected = create(runtime(), request);
        assertEquals(HttpStatus.BAD_REQUEST, rejected.getStatusCode());
    }

    @Test
    void validatesCallbackSafetyIdentifierAndLargeSeed() throws Exception {
        for (String field : List.of(
                "\"callback_url\":\"ftp://example.com/callback\"",
                "\"callback_url\":\"   \"",
                "\"safety_identifier\":\"   \"",
                "\"safety_identifier\":\"用户-1\""
        )) {
            ResponseEntity<?> response = create(runtime(), """
                    {"content":[{"type":"text","text":"A test clip"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
        }

        PlatformConfigService.RuntimeModel seedance10 = runtimeWithModes(List.of("text-to-video"));
        seedance10.model().setRequestAdapter("seedance-v1");
        seedance10.model().setRequestModel("doubao-seedance-1-0-pro-250528");
        ResponseEntity<?> oversizedSeed = create(seedance10, """
                {"content":[{"type":"text","text":"A test clip"}],
                 "ratio":"16:9","resolution":"720p","duration":5,"seed":18446744073709551615}
                """);
        assertEquals(HttpStatus.BAD_REQUEST, oversizedSeed.getStatusCode());
    }
    @Test
    void rejectsAdaptiveRatioForSeedance10TextToVideo() throws Exception {
        PlatformConfigService.RuntimeModel runtime = runtimeWithModes(List.of("text-to-video", "image-to-video"));
        runtime.model().setRequestAdapter("seedance-v1");
        runtime.model().setRequestModel("doubao-seedance-1-0-pro-250528");
        runtime.model().getVideoCapabilities().setRatios(List.of("adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"));

        ResponseEntity<?> response = create(runtime, """
                {"content":[{"type":"text","text":"A quiet lake"}],"duration":5,
                 "resolution":"720p","ratio":"adaptive","_flowcanvas_mode":"text-to-video"}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void rejectsMalformedOfficialBooleanParameters() throws Exception {
        PlatformConfigService.RuntimeModel seedance15 = runtimeWithModes(List.of("text-to-video"));
        seedance15.model().setRequestAdapter("seedance-v1.5");
        seedance15.model().setRequestModel("doubao-seedance-1-5-pro-251215");
        seedance15.model().getVideoCapabilities().setDraft(true);

        for (String field : List.of(
                "\"generate_audio\":\"true\"",
                "\"draft\":\"false\"",
                "\"watermark\":1",
                "\"camera_fixed\":\"false\"",
                "\"return_last_frame\":null"
        )) {
            ResponseEntity<?> response = create(seedance15, """
                    {"content":[{"type":"text","text":"A type validation clip"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
        }
    }

    @Test
    void rejectsUnknownTopLevelRequestFields() throws Exception {
        ResponseEntity<?> response = create(runtime(), """
                {"content":[{"type":"text","text":"A strict contract clip"}],
                 "ratio":"16:9","resolution":"720p","duration":5,
                 "unexpected_parameter":true}
                """);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(responseJson(response).path("error").path("message").asText().contains("unexpected_parameter"));
        assertEquals("", createBody.get());
    }

    @Test
    void rejectsExplicitNullForOfficialOptionalParameters() throws Exception {
        for (String field : List.of(
                "\"ratio\":null", "\"resolution\":null", "\"duration\":null", "\"tools\":null",
                "\"callback_url\":null", "\"safety_identifier\":null",
                "\"execution_expires_after\":null", "\"priority\":null"
        )) {
            createBody.set("");
            ResponseEntity<?> response = create(runtime(), """
                    {"content":[{"type":"text","text":"A strict null validation clip"}],%s}
                    """.formatted(field));
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
            assertEquals("", createBody.get(), field);
        }

        PlatformConfigService.RuntimeModel seedance10 = runtimeWithModes(List.of("text-to-video"));
        seedance10.model().setRequestAdapter("seedance-v1");
        seedance10.model().setRequestModel("doubao-seedance-1-0-pro-250528");
        for (String field : List.of("\"frames\":null", "\"seed\":null", "\"service_tier\":null")) {
            createBody.set("");
            ResponseEntity<?> response = create(seedance10, """
                    {"content":[{"type":"text","text":"A strict null validation clip"}],
                     "ratio":"16:9","resolution":"720p","duration":5,%s}
                    """.formatted(field));
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), field);
            assertEquals("", createBody.get(), field);
        }
    }

    @Test
    void rejectsMalformedSeedance20Tools() throws Exception {
        for (String tools : List.of("[]", "[{\"type\":\"web_search\",\"unexpected\":true}]")) {
            createBody.set("");
            ResponseEntity<?> response = create(runtime(), """
                    {"content":[{"type":"text","text":"A web search clip"}],
                     "ratio":"16:9","resolution":"720p","duration":5,"tools":%s}
                    """.formatted(tools));
            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), tools);
            assertEquals("", createBody.get(), tools);
        }
    }

    private VolcengineSeedanceAdapter adapter() {
        return new VolcengineSeedanceAdapter(
                objectMapper,
                new PublicImageService(tempDir.resolve("public-images").toString()),
                serverUrl,
                java.net.http.HttpClient.newHttpClient()
        );
    }

    private PlatformConfigService.RuntimeModel runtime() {
        PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
        provider.setBaseUrl(serverUrl + "/api/v3");
        provider.setApiKey("provider-secret");

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(List.of("text-to-video", "image-to-video", "first-last-frame", "all-in-one-reference"));
        capabilities.setRatios(List.of("adaptive", "16:9", "9:16"));
        capabilities.setResolutions(List.of("480p", "720p"));
        capabilities.setDurations(List.of(5));
        capabilities.setGenerateAudio(true);
        capabilities.setWatermark(true);
        capabilities.setMaxImages(9);
        capabilities.setMaxVideos(3);
        capabilities.setMaxAudios(3);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setCategory("video");
        model.setRequestAdapter("seedance-v2");
        model.setRequestModel("doubao-seedance-2-0-pro");
        model.setVideoCapabilities(capabilities);
        return new PlatformConfigService.RuntimeModel(provider, model);
    }

    private PlatformConfigService.RuntimeModel runtimeWithModes(List<String> modes) {
        PlatformConfigService.RuntimeModel runtime = runtime();
        runtime.model().getVideoCapabilities().setModes(modes);
        return runtime;
    }

    private PlatformConfigService.RuntimeModel runtimeWithDurations(List<Integer> durations) {
        PlatformConfigService.RuntimeModel runtime = runtime();
        runtime.model().getVideoCapabilities().setDurations(durations);
        return runtime;
    }

    private ResponseEntity<?> create(PlatformConfigService.RuntimeModel runtime, String json) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(json.getBytes(StandardCharsets.UTF_8));
        return adapter().handle(request, "/videos", runtime);
    }

    private JsonNode responseJson(ResponseEntity<?> response) throws IOException {
        return objectMapper.readTree((byte[]) response.getBody());
    }

    private static void respond(HttpExchange exchange, int status, String contentType, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
