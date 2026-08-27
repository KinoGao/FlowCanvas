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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockMultipartHttpServletRequest;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AgnesOpenAiAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> createBody = new AtomicReference<>("");
    private final AtomicReference<String> createContentType = new AtomicReference<>("");
    private final AtomicReference<String> pollQuery = new AtomicReference<>("");
    private final AtomicReference<String> pollBody = new AtomicReference<>("{\"status\":\"processing\"}");
    private final AtomicInteger pollStatus = new AtomicInteger(200);
    private final AtomicInteger createAttempts = new AtomicInteger();
    private final AtomicInteger createFailuresRemaining = new AtomicInteger();
    private final AtomicInteger createFailureStatus = new AtomicInteger(503);
    private final AtomicReference<String> createFailureBody = new AtomicReference<>("{\"error\":{\"message\":\"video queue is full, please retry later\"}}");
    private HttpServer server;
    private String serverUrl;

    @TempDir
    Path tempDir;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/v1/videos", exchange -> {
            createAttempts.incrementAndGet();
            createContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            createBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            if (createFailuresRemaining.getAndUpdate(value -> Math.max(0, value - 1)) > 0) {
                respond(exchange, createFailureStatus.get(), "application/json", createFailureBody.get().getBytes(StandardCharsets.UTF_8));
                return;
            }
            respond(exchange, 200, "application/json", "{\"video_id\":\"video-priority\",\"task_id\":\"task-fallback\",\"id\":\"id-fallback\"}".getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/agnesapi", exchange -> {
            pollQuery.set(exchange.getRequestURI().getRawQuery());
            respond(exchange, pollStatus.get(), "application/json", pollBody.get().getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/media/result.mp4", exchange ->
                respond(exchange, 200, "video/mp4", new byte[]{1, 2, 3, 4}));
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void convertsOpenAiJsonRequestToAgnesCreateContract() throws Exception {
        AgnesOpenAiAdapter adapter = adapter();
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"model\":\"client-model\",\"prompt\":\"A camera move\","
                + "\"seconds\":5,\"size\":\"1280x720\",\"resolution_name\":\"720p\","
                + "\"frame_rate\":24,\"_flowcanvas_mode\":\"image-to-video\","
                + "\"input_reference\":[\"https://example.com/ref.png\"]}").getBytes(StandardCharsets.UTF_8));

        ResponseEntity<?> response = adapter.handle(request, "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(createContentType.get().startsWith("application/json"));
        JsonNode normalized = responseJson(response);
        assertEquals("video-priority", normalized.path("id").asText());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals("agnes-video-v2.0", upstream.path("model").asText());
        assertEquals("A camera move", upstream.path("prompt").asText());
        assertFalse(upstream.has("mode"));
        assertEquals(1280, upstream.path("width").asInt());
        assertEquals(720, upstream.path("height").asInt());
        assertEquals(121, upstream.path("num_frames").asInt());
        assertEquals(24, upstream.path("frame_rate").asInt());
        assertEquals("https://example.com/ref.png", upstream.path("image").asText());
        assertFalse(upstream.has("_flowcanvas_mode"));
    }

    @Test
    void publishesMultipartReferencesAndMapsMultipleImagesToKeyframes() throws Exception {
        AgnesOpenAiAdapter adapter = adapter();
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "Two frames");
        request.addParameter("seconds", "5");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "first-last-frame");
        request.addFile(new MockMultipartFile("input_reference", "first.png", "image/png", new byte[]{1}));
        request.addFile(new MockMultipartFile("input_reference", "last.png", "image/png", new byte[]{2}));

        JsonNode upstream = adapter.buildCreatePayload(request, runtime().model());

        assertFalse(upstream.has("mode"));
        assertEquals("keyframes", upstream.path("extra_body").path("mode").asText());
        assertEquals(2, upstream.path("extra_body").path("image").size());
        assertTrue(upstream.path("extra_body").path("image").get(0).asText().startsWith(serverUrl + "/api/public-image/"));
        assertFalse(upstream.has("image"));
    }

    @Test
    void pollsAgnesEndpointAndNormalizesCompletedTask() throws Exception {
        pollBody.set("{\"status\":\"succeeded\",\"progress\":100,\"metadata\":{\"url\":\"" + serverUrl + "/media/result.mp4\"}}");

        ResponseEntity<?> response = adapter().handle(new MockHttpServletRequest("GET", "/videos/task%20one"), "/videos/task%20one", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode body = responseJson(response);
        assertEquals("task one", body.path("id").asText());
        assertEquals("completed", body.path("status").asText());
        assertEquals("video_id=task+one&model_name=agnes-video-v2.0", pollQuery.get());
    }

    @Test
    void proxiesCompletedMediaThroughOpenAiContentEndpoint() throws Exception {
        pollBody.set("{\"status\":\"completed\",\"metadata\":{\"url\":\"" + serverUrl + "/media/result.mp4\"}}");

        ResponseEntity<?> response = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("video/mp4", response.getHeaders().getContentType().toString());
        org.junit.jupiter.api.Assertions.assertArrayEquals(new byte[]{1, 2, 3, 4}, (byte[]) response.getBody());
    }

    @Test
    void treatsRateLimitAndServerErrorsAsInProgress() throws Exception {
        pollStatus.set(429);
        pollBody.set("not-json");

        ResponseEntity<?> response = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1"), "/videos/task-1", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("in_progress", responseJson(response).path("status").asText());
    }

    @Test
    void retriesQueueCongestionUntilCreateSucceeds() throws Exception {
        createFailuresRemaining.set(2);

        ResponseEntity<?> response = adapterWithoutRetryDelay().handle(createRequest(), "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(3, createAttempts.get());
        assertEquals("video-priority", responseJson(response).path("id").asText());
    }

    @Test
    void returnsServiceUnavailableAfterQueueRetriesAreExhausted() throws Exception {
        createFailuresRemaining.set(10);

        ResponseEntity<?> response = adapterWithoutRetryDelay().handle(createRequest(), "/videos", runtime());

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals(3, createAttempts.get());
        assertTrue(responseJson(response).path("error").path("message").asText().contains("queue is full"));
    }

    @Test
    void doesNotRetrySemanticBadRequest() throws Exception {
        createFailuresRemaining.set(10);
        createFailureStatus.set(400);
        createFailureBody.set("{\"error\":{\"message\":\"invalid prompt\"}}");

        ResponseEntity<?> response = adapterWithoutRetryDelay().handle(createRequest(), "/videos", runtime());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(1, createAttempts.get());
    }

    @Test
    void rejectsUnsupportedModeResolutionDurationAndReferenceCount() {
        AgnesOpenAiAdapter adapter = adapter();
        PlatformConfigDocument.Model model = runtime().model();

        assertThrows(IllegalArgumentException.class, () -> adapter.buildCreatePayload(
                Map.of("prompt", "x", "seconds", "6", "size", "16:9", "resolution_name", "720p", "_flowcanvas_mode", "text-to-video"), List.of(), model));
        assertThrows(IllegalArgumentException.class, () -> adapter.buildCreatePayload(
                Map.of("prompt", "x", "seconds", "5", "size", "16:9", "resolution_name", "4k", "_flowcanvas_mode", "text-to-video"), List.of(), model));
        assertThrows(IllegalArgumentException.class, () -> adapter.buildCreatePayload(
                Map.of("prompt", "x", "seconds", "5", "size", "21:9", "resolution_name", "720p", "_flowcanvas_mode", "text-to-video"), List.of(), model));
        assertThrows(IllegalArgumentException.class, () -> adapter.buildCreatePayload(
                Map.of("prompt", "x", "seconds", "5", "size", "16:9", "resolution_name", "720p", "_flowcanvas_mode", "multi-frame"),
                List.of("https://example.com/1.png", "https://example.com/2.png", "https://example.com/3.png", "https://example.com/4.png", "https://example.com/5.png"), model));
    }

    @Test
    void frameCountAlwaysUsesEightNPlusOneWithinProviderLimit() {
        assertEquals(121, AgnesOpenAiAdapter.frameCount(5, 24));
        assertEquals(441, AgnesOpenAiAdapter.frameCount(30, 24));
        assertEquals(1, AgnesOpenAiAdapter.frameCount(0, 24));
    }

    private AgnesOpenAiAdapter adapter() {
        return new AgnesOpenAiAdapter(
                objectMapper,
                new PublicImageService(tempDir.resolve("public-images").toString()),
                serverUrl,
                java.net.http.HttpClient.newHttpClient()
        );
    }

    private AgnesOpenAiAdapter adapterWithoutRetryDelay() {
        return new AgnesOpenAiAdapter(
                objectMapper,
                new PublicImageService(tempDir.resolve("public-images").toString()),
                serverUrl,
                java.net.http.HttpClient.newHttpClient(),
                delay -> { }
        );
    }

    private MockHttpServletRequest createRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"prompt\":\"A camera move\",\"seconds\":5,\"size\":\"16:9\","
                + "\"resolution_name\":\"720p\",\"frame_rate\":24,\"_flowcanvas_mode\":\"text-to-video\"}")
                .getBytes(StandardCharsets.UTF_8));
        return request;
    }

    private PlatformConfigService.RuntimeModel runtime() {
        PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
        provider.setBaseUrl(serverUrl + "/v1");
        provider.setApiKey("provider-secret");

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(List.of("text-to-video", "image-to-video", "first-last-frame", "multi-frame"));
        capabilities.setRatios(List.of("16:9", "9:16", "1:1", "4:3", "3:4"));
        capabilities.setResolutions(List.of("480p", "720p", "1080p"));
        capabilities.setDurations(List.of(5));
        capabilities.setFrameRates(List.of(24));
        capabilities.setMaxImages(4);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setCategory("video");
        model.setRequestAdapter("agnes-v2");
        model.setRequestModel("agnes-video-v2.0");
        model.setVideoCapabilities(capabilities);
        return new PlatformConfigService.RuntimeModel(provider, model);
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
