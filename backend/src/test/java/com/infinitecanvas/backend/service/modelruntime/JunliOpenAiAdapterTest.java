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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JunliOpenAiAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> createBody = new AtomicReference<>("");
    private final AtomicReference<String> createContentType = new AtomicReference<>("");
    private final AtomicReference<String> pollBody = new AtomicReference<>("{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"queued\"}");
    private final AtomicInteger pollStatus = new AtomicInteger(200);
    private final AtomicInteger createAttempts = new AtomicInteger();
    private final AtomicInteger createFailuresRemaining = new AtomicInteger();
    private final AtomicInteger createFailureStatus = new AtomicInteger(503);
    private final AtomicReference<String> createFailureBody = new AtomicReference<>("{\"error\":{\"message\":\"queue is full, please retry later\"}}");
    private HttpServer server;
    private String serverUrl;

    @TempDir
    Path tempDir;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/v1/videos", exchange -> {
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                createAttempts.incrementAndGet();
                createContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
                createBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                if (createFailuresRemaining.getAndUpdate(value -> Math.max(0, value - 1)) > 0) {
                    respond(exchange, createFailureStatus.get(), "application/json", createFailureBody.get().getBytes(StandardCharsets.UTF_8));
                    return;
                }
                respond(exchange, 200, "application/json", "{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"queued\"}".getBytes(StandardCharsets.UTF_8));
                return;
            }
            respond(exchange, pollStatus.get(), "application/json", pollBody.get().getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/v1/videos/task-1/content", exchange ->
                respond(exchange, 200, "video/mp4", new byte[]{1, 2, 3, 4}));
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void translatesMultipartCreateToJunliJsonContract() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "A paper boat sailing down a rainy street");
        request.addParameter("seconds", "4");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "text-to-video");

        ResponseEntity<?> response = adapter().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(createContentType.get().startsWith("application/json"));
        assertEquals("task-1", responseJson(response).path("id").asText());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals("veo-3.1", upstream.path("model").asText());
        assertEquals("A paper boat sailing down a rainy street", upstream.path("prompt").asText());
        assertEquals(4, upstream.path("seconds").asInt());
        assertEquals("1280x720", upstream.path("size").asText());
        assertEquals("url", upstream.path("response_format").asText());
        assertFalse(upstream.has("_flowcanvas_mode"));
        assertFalse(upstream.has("reference_images"));
    }

    @Test
    void mapsFirstLastFrameReferencesToStartAndEndFrame() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "Two frames");
        request.addParameter("seconds", "6");
        request.addParameter("size", "9:16");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "first-last-frame");
        request.addFile(new MockMultipartFile("input_reference", "first.png", "image/png", new byte[]{1}));
        request.addFile(new MockMultipartFile("input_reference", "last.png", "image/png", new byte[]{2}));

        JsonNode upstream = adapter().buildCreatePayload(request, runtime().model());

        assertEquals("720x1280", upstream.path("size").asText());
        assertTrue(upstream.path("start_frame").asText().startsWith(serverUrl + "/api/public-image/"));
        assertTrue(upstream.path("end_frame").asText().startsWith(serverUrl + "/api/public-image/"));
        assertFalse(upstream.has("reference_images"));
    }

    @Test
    void mapsMultipleReferencesToReferenceImages() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "Three frames");
        request.addParameter("seconds", "6");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "multi-frame");
        request.addFile(new MockMultipartFile("input_reference", "a.png", "image/png", new byte[]{1}));
        request.addFile(new MockMultipartFile("input_reference", "b.png", "image/png", new byte[]{2}));
        request.addFile(new MockMultipartFile("input_reference", "c.png", "image/png", new byte[]{3}));

        JsonNode upstream = adapter().buildCreatePayload(request, runtime().model());

        assertEquals(3, upstream.path("reference_images").size());
        assertTrue(upstream.path("reference_images").get(0).asText().startsWith(serverUrl + "/api/public-image/"));
        assertFalse(upstream.has("start_frame"));
    }

    @Test
    void acceptsJsonCreateRequestWithReferenceUrls() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/videos");
        request.setContentType("application/json");
        request.setContent(("{\"model\":\"client-model\",\"prompt\":\"A camera move\","
                + "\"seconds\":8,\"size\":\"1280x720\",\"resolution_name\":\"1080p\","
                + "\"_flowcanvas_mode\":\"image-to-video\","
                + "\"input_reference\":[\"https://example.com/ref.png\"]}").getBytes(StandardCharsets.UTF_8));

        ResponseEntity<?> response = adapter().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode upstream = objectMapper.readTree(createBody.get());
        assertEquals("veo-3.1", upstream.path("model").asText());
        assertEquals(8, upstream.path("seconds").asInt());
        assertEquals("1920x1080", upstream.path("size").asText());
        assertEquals("https://example.com/ref.png", upstream.path("reference_images").get(0).asText());
    }

    @Test
    void downloadsCompletedMediaFromPublicUrlWhenPresent() throws Exception {
        pollBody.set("{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"completed\",\"url\":\"" + serverUrl + "/media/result.mp4\"}");
        server.createContext("/media/result.mp4", exchange -> respond(exchange, 200, "video/mp4", new byte[]{9, 8, 7, 6}));

        ResponseEntity<?> contentResponse = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());

        assertEquals(HttpStatus.OK, contentResponse.getStatusCode());
        assertEquals("video/mp4", contentResponse.getHeaders().getContentType().toString());
        assertArrayEquals(new byte[]{9, 8, 7, 6}, (byte[]) contentResponse.getBody());
    }

    @Test
    void contentFailureSurfacesUpstreamDetail() throws Exception {
        pollBody.set("{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"completed\"}");
        server.removeContext("/v1/videos/task-1/content");
        server.createContext("/v1/videos/task-1/content", exchange ->
                respond(exchange, 503, "application/json", "{\"detail\":\"provider temporary unavailable: upstream video status 401\"}".getBytes(StandardCharsets.UTF_8)));

        ResponseEntity<?> contentResponse = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());

        assertEquals(HttpStatus.BAD_GATEWAY, contentResponse.getStatusCode());
        assertTrue(responseJson(contentResponse).path("error").path("message").asText().contains("upstream video status 401"));
    }

    @Test
    void normalizesTaskAndDownloadsCompletedMediaThroughContentEndpoint() throws Exception {
        pollBody.set("{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"completed\"}");

        ResponseEntity<?> taskResponse = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1"), "/videos/task-1", runtime());
        assertEquals(HttpStatus.OK, taskResponse.getStatusCode());
        assertEquals("completed", responseJson(taskResponse).path("status").asText());

        ResponseEntity<?> contentResponse = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());
        assertEquals(HttpStatus.OK, contentResponse.getStatusCode());
        assertEquals("video/mp4", contentResponse.getHeaders().getContentType().toString());
        assertArrayEquals(new byte[]{1, 2, 3, 4}, (byte[]) contentResponse.getBody());
    }

    @Test
    void refusesContentForTaskStillInProgress() throws Exception {
        pollBody.set("{\"id\":\"task-1\",\"object\":\"video\",\"status\":\"in_progress\"}");

        ResponseEntity<?> contentResponse = adapter().handle(new MockHttpServletRequest("GET", "/videos/task-1/content"), "/videos/task-1/content", runtime());

        assertEquals(HttpStatus.CONFLICT, contentResponse.getStatusCode());
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
    void rejectsUnsupportedSeconds() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "Too long");
        request.addParameter("seconds", "30");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "text-to-video");

        ResponseEntity<?> response = adapter().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(responseJson(response).path("error").path("message").asText().contains("时长"));
    }

    @Test
    void rejectsExcessiveReferenceImages() throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "Too many refs");
        request.addParameter("seconds", "6");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "multi-frame");
        for (int index = 0; index < 5; index++) {
            request.addFile(new MockMultipartFile("input_reference", "ref-" + index + ".png", "image/png", new byte[]{1}));
        }

        ResponseEntity<?> response = adapter().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(responseJson(response).path("error").path("message").asText().contains("参考图"));
    }

    @Test
    void retriesQueueCongestionUntilCreateSucceeds() throws Exception {
        createFailuresRemaining.set(2);

        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setMethod("POST");
        request.addParameter("prompt", "A paper boat");
        request.addParameter("seconds", "4");
        request.addParameter("size", "16:9");
        request.addParameter("resolution_name", "720p");
        request.addParameter("_flowcanvas_mode", "text-to-video");

        ResponseEntity<?> response = adapterWithoutRetryDelay().handle(request, "/videos", runtime());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(3, createAttempts.get());
        assertEquals("task-1", responseJson(response).path("id").asText());
    }

    private JunliOpenAiAdapter adapter() {
        return new JunliOpenAiAdapter(
                objectMapper,
                new PublicImageService(tempDir.resolve("public-images").toString()),
                serverUrl,
                java.net.http.HttpClient.newHttpClient()
        );
    }

    private JunliOpenAiAdapter adapterWithoutRetryDelay() {
        return new JunliOpenAiAdapter(
                objectMapper,
                new PublicImageService(tempDir.resolve("public-images").toString()),
                serverUrl,
                java.net.http.HttpClient.newHttpClient(),
                delay -> { }
        );
    }

    private PlatformConfigService.RuntimeModel runtime() {
        PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
        provider.setBaseUrl(serverUrl + "/v1");
        provider.setApiKey("provider-secret");

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(List.of("text-to-video", "image-to-video", "first-last-frame", "multi-frame"));
        capabilities.setRatios(List.of("16:9", "9:16"));
        capabilities.setResolutions(List.of("480p", "720p", "1080p"));
        capabilities.setDurations(List.of(4, 6, 8));
        capabilities.setMaxImages(4);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setCategory("video");
        model.setRequestAdapter("junli_openai");
        model.setRequestModel("veo-3.1");
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
