package com.infinitecanvas.backend.service.modelruntime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.service.PlatformConfigService;
import com.infinitecanvas.backend.service.PublicImageService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AgnesOpenAiAdapter implements ModelRequestAdapter {
    private static final Duration TIMEOUT = Duration.ofMinutes(30);
    private static final List<Duration> CREATE_RETRY_DELAYS = List.of(Duration.ofSeconds(1), Duration.ofSeconds(2));
    private static final Set<Integer> TRANSIENT_CREATE_STATUSES = Set.of(429, 502, 503, 504);
    private static final Pattern TASK_PATH = Pattern.compile("^/videos/([^/]+)(/content)?$");
    private static final Set<String> TRANSIENT_POLL_STATUSES = Set.of("queued", "pending", "processing", "running", "in_progress");
    private final ObjectMapper objectMapper;
    private final PublicImageService publicImageService;
    private final String publicBaseUrl;
    private final HttpClient httpClient;
    private final RetrySleeper retrySleeper;

    @Autowired
    public AgnesOpenAiAdapter(
            ObjectMapper objectMapper,
            PublicImageService publicImageService,
            @Value("${app.public-base-url:}") String publicBaseUrl
    ) {
        this(objectMapper, publicImageService, publicBaseUrl,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).followRedirects(HttpClient.Redirect.NORMAL).build(),
                delay -> Thread.sleep(delay.toMillis()));
    }

    AgnesOpenAiAdapter(ObjectMapper objectMapper, PublicImageService publicImageService, String publicBaseUrl, HttpClient httpClient) {
        this(objectMapper, publicImageService, publicBaseUrl, httpClient, delay -> Thread.sleep(delay.toMillis()));
    }

    AgnesOpenAiAdapter(
            ObjectMapper objectMapper,
            PublicImageService publicImageService,
            String publicBaseUrl,
            HttpClient httpClient,
            RetrySleeper retrySleeper
    ) {
        this.objectMapper = objectMapper;
        this.publicImageService = publicImageService;
        this.publicBaseUrl = trimTrailingSlash(publicBaseUrl);
        this.httpClient = httpClient;
        this.retrySleeper = retrySleeper;
    }

    @Override
    public int order() { return 0; }

    @Override
    public List<ModelProtocol> protocols() {
        return List.of(new ModelProtocol("agnes-v2", "异步协议 · Agnes Video V2", "Agnes 视频创建、轮询与媒体回传接口"));
    }

    @Override
    public boolean supports(PlatformConfigService.RuntimeModel runtime, String suffix) {
        return runtime != null
                && "video".equals(runtime.model().getCategory())
                && "agnes-v2".equalsIgnoreCase(runtime.model().getRequestAdapter())
                && ("/videos".equals(suffix) || TASK_PATH.matcher(suffix).matches());
    }

    @Override
    public ResponseEntity<?> handle(HttpServletRequest request, String suffix, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        try {
            if ("POST".equalsIgnoreCase(request.getMethod()) && "/videos".equals(suffix)) {
                return createVideo(request, runtime);
            }
            Matcher match = TASK_PATH.matcher(suffix);
            if ("GET".equalsIgnoreCase(request.getMethod()) && match.matches()) {
                String taskId = decodePathSegment(match.group(1));
                return match.group(2) == null ? getVideo(taskId, runtime) : getVideoContent(taskId, runtime);
            }
            return error(HttpStatus.METHOD_NOT_ALLOWED, "Agnes 视频适配器不支持该请求方法");
        } catch (IllegalArgumentException error) {
            return error(HttpStatus.BAD_REQUEST, error.getMessage());
        } catch (java.net.http.HttpTimeoutException error) {
            return error(HttpStatus.GATEWAY_TIMEOUT, "Agnes 视频服务请求超时");
        } catch (IOException error) {
            return error(HttpStatus.BAD_GATEWAY, "无法连接 Agnes 视频服务");
        }
    }

    private ResponseEntity<?> createVideo(HttpServletRequest request, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        ObjectNode payload = buildCreatePayload(request, runtime.model());
        URI target = URI.create(joinUrl(runtime.provider().getBaseUrl(), "/videos"));
        HttpRequest upstreamRequest = authorized(target, runtime.provider().getApiKey())
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .POST(HttpRequest.BodyPublishers.ofByteArray(objectMapper.writeValueAsBytes(payload)))
                .build();
        HttpResponse<byte[]> upstream = sendCreateWithRetry(upstreamRequest);
        if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) {
            return upstreamError("创建", upstream, runtime.provider().getApiKey());
        }
        JsonNode result = readObject(upstream.body(), "Agnes 创建任务响应不是有效 JSON");
        String taskId = firstText(result, "video_id", "task_id", "id");
        if (taskId.isBlank()) return error(HttpStatus.BAD_GATEWAY, "Agnes 视频接口没有返回任务 ID");
        return json(HttpStatus.OK, normalizedTask(taskId, result));
    }

    private HttpResponse<byte[]> sendCreateWithRetry(HttpRequest request) throws IOException, InterruptedException {
        for (int attempt = 0; ; attempt++) {
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 200 && response.statusCode() < 300) return response;
            if (!isTransientCreateFailure(response) || attempt >= CREATE_RETRY_DELAYS.size()) return response;
            retrySleeper.sleep(retryDelay(response, CREATE_RETRY_DELAYS.get(attempt)));
        }
    }

    private boolean isTransientCreateFailure(HttpResponse<byte[]> response) {
        if (TRANSIENT_CREATE_STATUSES.contains(response.statusCode())) return true;
        if (response.statusCode() < 500 || response.statusCode() >= 600) return false;
        return upstreamMessage(response.body()).toLowerCase(Locale.ROOT).contains("queue");
    }

    private Duration retryDelay(HttpResponse<byte[]> response, Duration fallback) {
        return response.headers().firstValue("Retry-After")
                .map(value -> {
                    try {
                        long seconds = Long.parseLong(value.trim());
                        return Duration.ofSeconds(Math.max(0, Math.min(seconds, 30)));
                    } catch (NumberFormatException ignored) {
                        return fallback;
                    }
                })
                .orElse(fallback);
    }

    private ResponseEntity<?> getVideo(String taskId, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        PollResult result = poll(taskId, runtime);
        if (result.transientFailure()) return json(HttpStatus.OK, pendingTask(taskId));
        if (result.response().statusCode() < 200 || result.response().statusCode() >= 300) {
            return upstreamError("查询", result.response(), runtime.provider().getApiKey());
        }
        return json(HttpStatus.OK, normalizedTask(taskId, result.body()));
    }

    private ResponseEntity<?> getVideoContent(String taskId, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        PollResult result = poll(taskId, runtime);
        if (result.transientFailure()) return error(HttpStatus.CONFLICT, "Agnes 视频仍在生成中");
        if (result.response().statusCode() < 200 || result.response().statusCode() >= 300) {
            return upstreamError("查询", result.response(), runtime.provider().getApiKey());
        }
        ObjectNode task = normalizedTask(taskId, result.body());
        if (!"completed".equals(task.path("status").asText())) {
            String message = task.path("error").path("message").asText("Agnes 视频仍在生成中");
            return error(HttpStatus.CONFLICT, message);
        }
        String url = resultUrl(result.body());
        if (url.isBlank()) return error(HttpStatus.BAD_GATEWAY, "Agnes 任务已完成，但没有返回视频地址");
        HttpResponse<byte[]> content = httpClient.send(
                HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray()
        );
        if (content.statusCode() < 200 || content.statusCode() >= 300) {
            return error(HttpStatus.BAD_GATEWAY, "Agnes 视频文件下载失败 (HTTP " + content.statusCode() + ")");
        }
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(content.headers().firstValue("content-type").orElse("video/mp4")));
        content.headers().firstValue("content-disposition").ifPresent(value -> headers.set("Content-Disposition", value));
        return new ResponseEntity<>(content.body(), headers, HttpStatus.OK);
    }

    ObjectNode buildCreatePayload(HttpServletRequest request, PlatformConfigDocument.Model model) throws IOException {
        if (request instanceof MultipartHttpServletRequest multipart) {
            List<String> referenceUrls = publishReferences(multipart);
            return buildCreatePayload(fields(multipart), referenceUrls, model);
        }
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).contains(MediaType.APPLICATION_JSON_VALUE)) {
            throw new IllegalArgumentException("视频生成请求必须使用 multipart/form-data 或 application/json");
        }
        JsonNode json = readObject(request.getInputStream().readAllBytes(), "视频生成请求不是有效 JSON");
        Map<String, String> fields = new LinkedHashMap<>();
        json.fields().forEachRemaining(entry -> {
            if (entry.getValue().isValueNode()) fields.put(entry.getKey(), entry.getValue().asText());
        });
        List<String> references = new ArrayList<>();
        addReferenceUrls(references, json.get("input_reference"));
        addReferenceUrls(references, json.get("input_reference[]"));
        return buildCreatePayload(fields, references, model);
    }

    ObjectNode buildCreatePayload(Map<String, String> fields, List<String> referenceUrls, PlatformConfigDocument.Model model) {
        String prompt = value(fields, "prompt");
        if (prompt.isBlank()) throw new IllegalArgumentException("请输入视频提示词");
        int seconds = positiveInt(value(fields, "seconds"), 5, "时长");
        String resolution = defaultValue(value(fields, "resolution_name"), "720p").toLowerCase(Locale.ROOT);
        String size = defaultValue(value(fields, "size"), "16:9");
        String mode = defaultValue(value(fields, "_flowcanvas_mode"), inferredMode(referenceUrls.size())).toLowerCase(Locale.ROOT);
        validateCapabilities(model.getVideoCapabilities(), mode, seconds, resolution, size, referenceUrls.size());

        Dimensions dimensions = dimensions(size, resolution);
        int frameRate = boundedInt(value(fields, "frame_rate"), 24, 1, 60, "帧率");
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", model.getRequestModel());
        payload.put("prompt", prompt);
        payload.put("width", dimensions.width());
        payload.put("height", dimensions.height());
        payload.put("num_frames", frameCount(seconds, frameRate));
        payload.put("frame_rate", frameRate);
        copyOptionalInteger(payload, fields, "num_inference_steps");
        copyOptionalInteger(payload, fields, "seed");
        copyOptionalText(payload, fields, "negative_prompt");
        if (referenceUrls.size() == 1) {
            payload.put("image", referenceUrls.getFirst());
        } else if (referenceUrls.size() > 1) {
            ObjectNode extra = payload.putObject("extra_body");
            ArrayNode images = extra.putArray("image");
            referenceUrls.forEach(images::add);
            extra.put("mode", "keyframes");
        }
        return payload;
    }

    static int frameCount(int seconds, int frameRate) {
        int target = Math.min(441, Math.max(1, seconds * frameRate));
        int frames = Math.round((target - 1) / 8.0f) * 8 + 1;
        return Math.min(441, Math.max(1, frames));
    }

    static Dimensions dimensions(String size, String resolution) {
        int shortSide = switch (resolution.toLowerCase(Locale.ROOT)) {
            case "480p" -> 480;
            case "1080p" -> 1080;
            default -> 720;
        };
        double ratio = parseRatio(size);
        int width;
        int height;
        if (ratio >= 1) {
            height = shortSide;
            width = align16((int) Math.round(shortSide * ratio));
        } else {
            width = shortSide;
            height = align16((int) Math.round(shortSide / ratio));
        }
        return new Dimensions(width, height);
    }

    private PollResult poll(String taskId, PlatformConfigService.RuntimeModel runtime) throws IOException, InterruptedException {
        String root = trimTrailingV1(runtime.provider().getBaseUrl());
        String query = "video_id=" + encode(taskId) + "&model_name=" + encode(runtime.model().getRequestModel());
        HttpResponse<byte[]> response = httpClient.send(
                authorized(URI.create(root + "/agnesapi?" + query), runtime.provider().getApiKey()).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray()
        );
        if (response.statusCode() == 404 || response.statusCode() == 405) {
            response = httpClient.send(
                    authorized(URI.create(joinUrl(runtime.provider().getBaseUrl(), "/videos/" + encode(taskId))), runtime.provider().getApiKey()).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray()
            );
        }
        if (response.statusCode() == 429 || response.statusCode() >= 500) {
            return new PollResult(response, objectMapper.createObjectNode(), true);
        }
        JsonNode body = response.statusCode() >= 200 && response.statusCode() < 300
                ? readObject(response.body(), "Agnes 查询任务响应不是有效 JSON")
                : objectMapper.createObjectNode();
        return new PollResult(response, body, false);
    }

    private ObjectNode normalizedTask(String taskId, JsonNode source) {
        ObjectNode task = objectMapper.createObjectNode();
        task.put("id", taskId);
        task.put("object", "video");
        String status = normalizeStatus(source.path("status").asText());
        task.put("status", status);
        task.put("progress", source.path("progress").asInt(status.equals("completed") ? 100 : 0));
        JsonNode error = source.get("error");
        if (error != null && !error.isNull()) task.set("error", normalizeError(error));
        else if ("failed".equals(status)) task.set("error", normalizeError(source.path("message")));
        else task.putNull("error");
        return task;
    }

    private ObjectNode pendingTask(String taskId) {
        ObjectNode task = objectMapper.createObjectNode();
        task.put("id", taskId);
        task.put("object", "video");
        task.put("status", "in_progress");
        task.put("progress", 0);
        task.putNull("error");
        return task;
    }

    private ObjectNode normalizeError(JsonNode error) {
        ObjectNode normalized = objectMapper.createObjectNode();
        String message = error.isTextual() ? error.asText() : error.path("message").asText("Agnes 视频生成失败");
        normalized.put("message", sanitize(message, ""));
        if (error.isObject() && error.hasNonNull("code")) normalized.set("code", error.get("code"));
        return normalized;
    }

    private List<String> publishReferences(MultipartHttpServletRequest request) {
        List<MultipartFile> files = new ArrayList<>();
        files.addAll(request.getFiles("input_reference"));
        files.addAll(request.getFiles("input_reference[]"));
        if (!files.isEmpty() && publicBaseUrl.isBlank()) {
            throw new IllegalArgumentException("当前模型需要公网参考图，请先在后端配置 PUBLIC_BASE_URL");
        }
        List<String> urls = new ArrayList<>();
        for (MultipartFile file : files) {
            String filename = publicImageService.saveImage(file);
            urls.add(publicBaseUrl + "/api/public-image/" + filename);
        }
        addReferenceValues(urls, request.getParameterValues("input_reference"));
        addReferenceValues(urls, request.getParameterValues("input_reference[]"));
        return urls;
    }

    private Map<String, String> fields(MultipartHttpServletRequest request) {
        Map<String, String> fields = new LinkedHashMap<>();
        request.getParameterMap().forEach((name, values) -> {
            if (values != null && values.length > 0) fields.put(name, values[0]);
        });
        return fields;
    }

    private void validateCapabilities(PlatformConfigDocument.VideoCapabilities capabilities, String mode, int seconds,
                                      String resolution, String size, int references) {
        if (capabilities == null) throw new IllegalArgumentException("视频模型尚未配置能力");
        if (!capabilities.getModes().isEmpty() && !capabilities.getModes().contains(mode)) {
            throw new IllegalArgumentException("当前模型不支持" + modeLabel(mode));
        }
        if (!capabilities.getDurations().isEmpty() && !capabilities.getDurations().contains(seconds)) {
            throw new IllegalArgumentException("当前模型不支持 " + seconds + " 秒时长");
        }
        if (!capabilities.getResolutions().isEmpty() && !capabilities.getResolutions().contains(resolution)) {
            throw new IllegalArgumentException("当前模型不支持 " + resolution + " 分辨率");
        }
        String ratio = normalizeRatioToken(size);
        if (!capabilities.getRatios().isEmpty() && !capabilities.getRatios().contains(ratio)) {
            throw new IllegalArgumentException("当前模型不支持 " + size + " 画面比例");
        }
        if (capabilities.getMaxImages() > 0 && references > capabilities.getMaxImages()) {
            throw new IllegalArgumentException("当前模型最多支持 " + capabilities.getMaxImages() + " 张参考图");
        }
    }

    private ResponseEntity<?> upstreamError(String action, HttpResponse<byte[]> response, String apiKey) {
        String detail = upstreamMessage(response.body());
        String message = "Agnes 视频" + action + "失败 (HTTP " + response.statusCode() + ")";
        if (!detail.isBlank()) message += ": " + sanitize(detail, apiKey);
        HttpStatus status = switch (response.statusCode()) {
            case 429 -> HttpStatus.TOO_MANY_REQUESTS;
            case 503 -> HttpStatus.SERVICE_UNAVAILABLE;
            case 504 -> HttpStatus.GATEWAY_TIMEOUT;
            case 502 -> HttpStatus.BAD_GATEWAY;
            default -> response.statusCode() >= 400 && response.statusCode() < 500
                    ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY;
        };
        return error(status, message);
    }

    private String upstreamMessage(byte[] body) {
        try {
            JsonNode json = objectMapper.readTree(body);
            String value = firstText(json.path("error"), "message", "detail");
            if (value.isBlank()) value = firstText(json, "message", "msg", "detail");
            return value;
        } catch (Exception ignored) {
            return "";
        }
    }

    private ResponseEntity<byte[]> json(HttpStatus status, JsonNode body) {
        try {
            return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(objectMapper.writeValueAsBytes(body));
        } catch (IOException error) {
            throw new IllegalStateException("响应序列化失败", error);
        }
    }

    private ResponseEntity<byte[]> error(HttpStatus status, String message) {
        ObjectNode body = objectMapper.createObjectNode();
        ObjectNode error = body.putObject("error");
        error.put("message", message == null || message.isBlank() ? "请求失败" : message);
        return json(status, body);
    }

    private HttpRequest.Builder authorized(URI target, String apiKey) {
        return HttpRequest.newBuilder(target).timeout(TIMEOUT).header("Authorization", "Bearer " + apiKey);
    }

    private JsonNode readObject(byte[] body, String message) {
        try {
            JsonNode json = objectMapper.readTree(body);
            if (json == null || !json.isObject()) throw new IllegalArgumentException(message);
            return json;
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException(message, error);
        }
    }

    private static void addReferenceUrls(List<String> target, JsonNode source) {
        if (source == null || source.isNull()) return;
        if (source.isArray()) source.forEach(value -> addHttpUrl(target, value.asText()));
        else addHttpUrl(target, source.asText());
    }

    private static void addReferenceValues(List<String> target, String[] values) {
        if (values == null) return;
        for (String value : values) addHttpUrl(target, value);
    }

    private static void addHttpUrl(List<String> target, String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) target.add(normalized);
    }

    private static String normalizeStatus(String value) {
        String status = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if ("completed".equals(status) || "succeeded".equals(status) || "success".equals(status)) return "completed";
        if ("failed".equals(status) || "cancelled".equals(status) || "expired".equals(status)) return "failed";
        if (TRANSIENT_POLL_STATUSES.contains(status)) return "in_progress";
        return status.isBlank() ? "in_progress" : status;
    }

    private static String resultUrl(JsonNode source) {
        String value = source.path("metadata").path("url").asText("");
        if (isHttpUrl(value)) return value;
        for (String field : List.of("video_url", "url", "remixed_from_video_id")) {
            value = source.path(field).asText("");
            if (isHttpUrl(value)) return value;
        }
        return "";
    }

    private static String firstText(JsonNode source, String... fields) {
        for (String field : fields) {
            String value = source.path(field).asText("").trim();
            if (!value.isBlank()) return value;
        }
        return "";
    }

    private static String inferredMode(int references) {
        if (references > 2) return "multi-frame";
        if (references == 2) return "first-last-frame";
        if (references == 1) return "image-to-video";
        return "text-to-video";
    }

    private static String modeLabel(String mode) {
        return switch (mode) {
            case "image-to-video" -> "图生视频";
            case "first-last-frame" -> "首尾帧视频";
            case "multi-frame" -> "智能多帧视频";
            case "image-reference" -> "图片参考视频";
            case "all-in-one-reference" -> "全能参考视频";
            default -> "文生视频";
        };
    }

    private static int positiveInt(String value, int fallback, String label) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int parsed = Integer.parseInt(value.trim());
            if (parsed <= 0) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + "必须是正整数");
        }
    }

    private static int boundedInt(String value, int fallback, int min, int max, String label) {
        int parsed = positiveInt(value, fallback, label);
        if (parsed < min || parsed > max) throw new IllegalArgumentException(label + "必须在 " + min + " 到 " + max + " 之间");
        return parsed;
    }

    private static void copyOptionalInteger(ObjectNode target, Map<String, String> fields, String name) {
        String value = value(fields, name);
        if (!value.isBlank()) target.put(name, positiveInt(value, 1, name));
    }

    private static void copyOptionalText(ObjectNode target, Map<String, String> fields, String name) {
        String value = value(fields, name);
        if (!value.isBlank()) target.put(name, value);
    }

    private static double parseRatio(String value) {
        Matcher dimensions = Pattern.compile("^(\\d+)\\s*[xX]\\s*(\\d+)$").matcher(value == null ? "" : value.trim());
        if (dimensions.matches()) return ratio(Integer.parseInt(dimensions.group(1)), Integer.parseInt(dimensions.group(2)));
        Matcher ratio = Pattern.compile("^(\\d+(?:\\.\\d+)?)\\s*:\\s*(\\d+(?:\\.\\d+)?)$").matcher(value == null ? "" : value.trim());
        if (ratio.matches()) return ratio(Double.parseDouble(ratio.group(1)), Double.parseDouble(ratio.group(2)));
        return 16.0 / 9.0;
    }

    private static String normalizeRatioToken(String value) {
        String normalized = value == null ? "" : value.trim();
        Matcher dimensions = Pattern.compile("^(\\d+)\\s*[xX]\\s*(\\d+)$").matcher(normalized);
        if (!dimensions.matches()) return normalized;
        int width = Integer.parseInt(dimensions.group(1));
        int height = Integer.parseInt(dimensions.group(2));
        int divisor = greatestCommonDivisor(width, height);
        return (width / divisor) + ":" + (height / divisor);
    }

    private static int greatestCommonDivisor(int left, int right) {
        int a = Math.abs(left);
        int b = Math.abs(right);
        while (b != 0) {
            int next = a % b;
            a = b;
            b = next;
        }
        return Math.max(1, a);
    }

    private static double ratio(double width, double height) {
        return width > 0 && height > 0 ? width / height : 16.0 / 9.0;
    }

    private static int align16(int value) {
        return Math.max(16, Math.round(value / 16.0f) * 16);
    }

    private static String value(Map<String, String> fields, String name) {
        String value = fields.get(name);
        return value == null ? "" : value.trim();
    }

    private static String defaultValue(String value, String fallback) {
        return value == null || value.isBlank() || "auto".equalsIgnoreCase(value) || "adaptive".equalsIgnoreCase(value) ? fallback : value;
    }

    private static String trimTrailingSlash(String value) {
        return value == null ? "" : value.trim().replaceAll("/+$", "");
    }

    private static String trimTrailingV1(String value) {
        return trimTrailingSlash(value).replaceFirst("(?i)/v1$", "");
    }

    private static String joinUrl(String base, String path) {
        return trimTrailingSlash(base) + (path.startsWith("/") ? path : "/" + path);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String decodePathSegment(String value) {
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static boolean isHttpUrl(String value) {
        return value != null && (value.startsWith("http://") || value.startsWith("https://"));
    }

    private static String sanitize(String value, String apiKey) {
        String sanitized = value == null ? "" : value;
        if (apiKey != null && !apiKey.isBlank()) sanitized = sanitized.replace(apiKey, "[密钥已隐藏]");
        sanitized = sanitized.replaceAll("(?i)Bearer\\s+[A-Za-z0-9._-]+", "Bearer [密钥已隐藏]");
        return sanitized.replaceAll("https?://\\S+", "[地址已隐藏]");
    }

    @FunctionalInterface
    interface RetrySleeper {
        void sleep(Duration delay) throws InterruptedException;
    }

    record Dimensions(int width, int height) {}
    private record PollResult(HttpResponse<byte[]> response, JsonNode body, boolean transientFailure) {}
}
