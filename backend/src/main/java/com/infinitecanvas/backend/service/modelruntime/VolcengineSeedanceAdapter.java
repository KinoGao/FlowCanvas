package com.infinitecanvas.backend.service.modelruntime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Translates the normalized video contract to Volcengine Seedance's async task API. */
@Service
public class VolcengineSeedanceAdapter implements ModelRequestAdapter {
    private static final Duration TIMEOUT = Duration.ofMinutes(20);
    private static final Pattern TASK_PATH = Pattern.compile("^/videos/([^/]+)(/content)?$");
    private static final Set<String> TRANSIENT_STATUSES = Set.of("queued", "pending", "processing", "running", "in_progress");
    private static final Set<String> CREATE_FIELDS = Set.of(
            "model", "content", "callback_url", "return_last_frame", "service_tier",
            "execution_expires_after", "generate_audio", "draft", "tools", "safety_identifier",
            "priority", "resolution", "ratio", "duration", "frames", "seed", "camera_fixed",
            "watermark", "_flowcanvas_mode", "mode"
    );
    private final ObjectMapper objectMapper;
    private final PublicImageService publicImageService;
    private final String publicBaseUrl;
    private final HttpClient httpClient;

    @Autowired
    public VolcengineSeedanceAdapter(
            ObjectMapper objectMapper,
            PublicImageService publicImageService,
            @Value("${app.public-base-url:}") String publicBaseUrl
    ) {
        this(objectMapper, publicImageService, publicBaseUrl,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).followRedirects(HttpClient.Redirect.NORMAL).build());
    }

    VolcengineSeedanceAdapter(ObjectMapper objectMapper, PublicImageService publicImageService, String publicBaseUrl, HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.publicImageService = publicImageService;
        this.publicBaseUrl = trimTrailingSlash(publicBaseUrl);
        this.httpClient = httpClient;
    }

    @Override
    public int order() { return 0; }

    @Override
    public boolean supports(PlatformConfigService.RuntimeModel runtime, String suffix) {
        return runtime != null
                && "video".equalsIgnoreCase(runtime.model().getCategory())
                && runtime.model().getRequestAdapter() != null
                && runtime.model().getRequestAdapter().toLowerCase(Locale.ROOT).startsWith("seedance")
                && ("/videos".equals(suffix) || TASK_PATH.matcher(suffix).matches());
    }

    @Override
    public ResponseEntity<?> handle(HttpServletRequest request, String suffix, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        try {
            if ("POST".equalsIgnoreCase(request.getMethod()) && "/videos".equals(suffix)) return createVideo(request, runtime);
            Matcher match = TASK_PATH.matcher(suffix);
            if ("GET".equalsIgnoreCase(request.getMethod()) && match.matches()) {
                String taskId = decodePathSegment(match.group(1));
                return match.group(2) == null ? getVideo(taskId, runtime) : getVideoContent(taskId, runtime);
            }
            return error(HttpStatus.METHOD_NOT_ALLOWED, "Seedance 视频适配器不支持该请求方法");
        } catch (IllegalArgumentException error) {
            return error(HttpStatus.BAD_REQUEST, error.getMessage());
        } catch (java.net.http.HttpTimeoutException error) {
            return error(HttpStatus.GATEWAY_TIMEOUT, "Seedance 视频服务请求超时");
        } catch (IOException error) {
            return error(HttpStatus.BAD_GATEWAY, "无法连接火山方舟 Seedance 服务");
        }
    }

    private ResponseEntity<?> createVideo(HttpServletRequest request, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        if (request.getContentType() == null || !request.getContentType().toLowerCase(Locale.ROOT).contains(MediaType.APPLICATION_JSON_VALUE)) {
            throw new IllegalArgumentException("Seedance 视频生成请求必须使用 application/json");
        }
        JsonNode parsed = readObject(request.getInputStream().readAllBytes(), "Seedance 视频生成请求不是有效 JSON");
        ObjectNode payload = (ObjectNode) parsed;
        validateCreateFields(payload);
        payload.put("model", runtime.model().getRequestModel());
        String mode = validateCapabilities(payload, runtime.model().getVideoCapabilities());
        validateModelSpecificParameters(payload, runtime, mode);
        normalizeImageDataUrls(payload);
        normalizeVideoDataUrls(payload);
        payload.remove("_flowcanvas_mode");
        payload.remove("mode");

        HttpResponse<byte[]> upstream = httpClient.send(
                authorized(URI.create(volcengineUrl(runtime.provider().getBaseUrl(), "/contents/generations/tasks")), runtime.provider().getApiKey())
                        .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .POST(HttpRequest.BodyPublishers.ofByteArray(objectMapper.writeValueAsBytes(payload)))
                        .build(),
                HttpResponse.BodyHandlers.ofByteArray()
        );
        if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) return upstreamError("创建", upstream);
        JsonNode result = readObject(upstream.body(), "Seedance 创建任务响应不是有效 JSON");
        JsonNode task = unwrapData(result);
        String taskId = firstText(task, "id", "task_id", "video_id");
        if (taskId.isBlank()) return error(HttpStatus.BAD_GATEWAY, "Seedance 接口没有返回任务 ID");
        return json(HttpStatus.OK, normalizedTask(taskId, task));
    }

    private ResponseEntity<?> getVideo(String taskId, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        HttpResponse<byte[]> upstream = query(taskId, runtime);
        if (upstream.statusCode() == 429 || upstream.statusCode() >= 500) return json(HttpStatus.OK, pendingTask(taskId));
        if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) return upstreamError("查询", upstream);
        return json(HttpStatus.OK, normalizedTask(taskId, unwrapData(readObject(upstream.body(), "Seedance 查询任务响应不是有效 JSON"))));
    }

    private ResponseEntity<?> getVideoContent(String taskId, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        HttpResponse<byte[]> upstream = query(taskId, runtime);
        if (upstream.statusCode() == 429 || upstream.statusCode() >= 500) return error(HttpStatus.CONFLICT, "Seedance 视频仍在生成中");
        if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) return upstreamError("查询", upstream);
        JsonNode task = unwrapData(readObject(upstream.body(), "Seedance 查询任务响应不是有效 JSON"));
        ObjectNode normalized = normalizedTask(taskId, task);
        if (!"completed".equals(normalized.path("status").asText())) {
            return error(HttpStatus.CONFLICT, normalized.path("error").path("message").asText("Seedance 视频仍在生成中"));
        }
        String url = resultUrl(task);
        if (url.isBlank()) return error(HttpStatus.BAD_GATEWAY, "Seedance 任务已完成，但没有返回视频地址");
        HttpResponse<byte[]> content = httpClient.send(
                HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray()
        );
        if (content.statusCode() < 200 || content.statusCode() >= 300) {
            return error(HttpStatus.BAD_GATEWAY, "Seedance 视频文件下载失败 (HTTP " + content.statusCode() + ")");
        }
        HttpHeaders headers = new HttpHeaders();
        String contentType = content.headers().firstValue("content-type").orElse(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        try {
            headers.setContentType(MediaType.parseMediaType(contentType));
        } catch (IllegalArgumentException ignored) {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        content.headers().firstValue("content-disposition").ifPresent(value -> headers.set("Content-Disposition", value));
        return new ResponseEntity<>(content.body(), headers, HttpStatus.OK);
    }

    private HttpResponse<byte[]> query(String taskId, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        return httpClient.send(
                authorized(URI.create(volcengineUrl(runtime.provider().getBaseUrl(), "/contents/generations/tasks/" + encode(taskId))), runtime.provider().getApiKey())
                        .GET().build(),
                HttpResponse.BodyHandlers.ofByteArray()
        );
    }

    private String validateCapabilities(ObjectNode payload, PlatformConfigDocument.VideoCapabilities capabilities) {
        if (capabilities == null) throw new IllegalArgumentException("视频模型尚未配置能力");
        ContentProfile profile = validateAndProfileContent(payload);
        String mode = normalizeMode(firstText(payload, "_flowcanvas_mode", "mode"));
        if (mode.isBlank()) mode = inferMode(profile);
        if (!"draft-task".equals(mode)
                && !capabilities.getModes().isEmpty()
                && capabilities.getModes().stream().noneMatch(mode::equalsIgnoreCase)) {
            throw new IllegalArgumentException("当前模型不支持视频生成模式: " + mode);
        }
        validateContentMode(mode, profile);
        validateString(payload, "ratio", capabilities.getRatios(), "画面比例");
        validateString(payload, "resolution", capabilities.getResolutions(), "分辨率");
        validateInteger(payload, "duration", capabilities.getDurations(), "时长");
        validateFlag(payload, "generate_audio", capabilities.isGenerateAudio(), "生成音频");
        validateFlag(payload, "watermark", capabilities.isWatermark(), "视频水印");
        validateFlag(payload, "draft", capabilities.isDraft(), "草稿模式");
        validateReferenceLimit(payload, "image_url", capabilities.getMaxImages(), "参考图片");
        validateReferenceLimit(payload, "video_url", capabilities.getMaxVideos(), "参考视频");
        validateReferenceLimit(payload, "audio_url", capabilities.getMaxAudios(), "参考音频");
        return mode;
    }

    private void validateModelSpecificParameters(
            ObjectNode payload,
            PlatformConfigService.RuntimeModel runtime,
            String mode
    ) {
        String adapter = String.valueOf(runtime.model().getRequestAdapter()).toLowerCase(Locale.ROOT);
        validateIntegerRange(payload, "execution_expires_after", 3600, 259200, "任务超时时间");
        validateCallbackUrl(payload);
        validateSafetyIdentifier(payload);
        validateBoolean(payload, "return_last_frame", "返回尾帧");
        validateBoolean(payload, "camera_fixed", "固定摄像头");
        if ("draft-task".equals(mode) && !adapter.startsWith("seedance-v1.5")) {
            throw new IllegalArgumentException("仅 Seedance 1.5 Pro 支持基于样片任务生成正式视频");
        }
        if (adapter.startsWith("seedance-v2")) {
            rejectFields(payload, List.of("frames", "seed", "camera_fixed", "service_tier"), "Seedance 2.0 系列不支持参数");
            validateIntegerRange(payload, "priority", 0, 9, "任务优先级");
            validateTools(payload);
            return;
        }
        rejectFields(payload, List.of("tools", "priority"), "仅 Seedance 2.0 系列支持参数");
        validateSeed(payload);
        validateServiceTier(payload);
        if (!adapter.startsWith("seedance-v1.5")
                && "text-to-video".equals(mode)
                && "adaptive".equalsIgnoreCase(payload.path("ratio").asText())) {
            throw new IllegalArgumentException("Seedance 1.0 系列文生视频不支持 adaptive 比例");
        }
        if (!"text-to-video".equals(mode) && !"draft-task".equals(mode) && payload.has("camera_fixed")) {
            throw new IllegalArgumentException("参考图、首帧和首尾帧场景不支持参数 camera_fixed");
        }
        if (!adapter.startsWith("seedance-v1.5")) {
            validateFrames(payload);
            return;
        }
        rejectFields(payload, List.of("frames"), "Seedance 1.5 Pro 不支持参数");
        if (!payload.path("draft").asBoolean(false)) return;
        if (!"480p".equalsIgnoreCase(payload.path("resolution").asText())) {
            throw new IllegalArgumentException("Seedance 1.5 Pro 样片模式仅支持 480p 分辨率");
        }
        if (payload.path("return_last_frame").asBoolean(false)) {
            throw new IllegalArgumentException("Seedance 1.5 Pro 样片模式不支持返回尾帧");
        }
        if (payload.has("service_tier")) {
            throw new IllegalArgumentException("Seedance 1.5 Pro 样片模式不支持参数 service_tier");
        }
    }

    private void validateFrames(ObjectNode payload) {
        if (!payload.hasNonNull("frames")) return;
        JsonNode value = payload.get("frames");
        if (!value.isIntegralNumber() || !value.canConvertToInt()) {
            throw new IllegalArgumentException("视频帧数必须是整数");
        }
        int frames = value.asInt();
        if (frames < 29 || frames > 289 || (frames - 25) % 4 != 0) {
            throw new IllegalArgumentException("视频帧数必须在 29 到 289 之间，并符合 25 + 4n");
        }
    }

    private void validateSeed(ObjectNode payload) {
        if (!payload.hasNonNull("seed")) return;
        JsonNode value = payload.get("seed");
        if (!value.isIntegralNumber() || !value.canConvertToLong()) throw new IllegalArgumentException("随机种子必须是整数");
        long seed = value.asLong();
        if (seed < -1 || seed > 4294967295L) {
            throw new IllegalArgumentException("随机种子必须在 -1 到 4294967295 之间");
        }
    }

    private void validateServiceTier(ObjectNode payload) {
        if (!payload.hasNonNull("service_tier")) return;
        JsonNode value = payload.get("service_tier");
        if (!value.isTextual() || !("default".equals(value.asText()) || "flex".equals(value.asText()))) {
            throw new IllegalArgumentException("服务等级仅支持 default 或 flex");
        }
    }

    private void validateTools(ObjectNode payload) {
        if (!payload.hasNonNull("tools")) return;
        JsonNode tools = payload.get("tools");
        if (!tools.isArray()) throw new IllegalArgumentException("Seedance 2.0 tools 必须是数组");
        if (tools.isEmpty()) throw new IllegalArgumentException("Seedance 2.0 tools 不能为空");
        for (JsonNode tool : tools) {
            if (!tool.isObject() || tool.size() != 1 || !"web_search".equals(tool.path("type").asText())) {
                throw new IllegalArgumentException("Seedance 2.0 目前仅支持 web_search 工具");
            }
        }
    }

    private void validateSafetyIdentifier(ObjectNode payload) {
        if (!payload.hasNonNull("safety_identifier")) return;
        JsonNode value = payload.get("safety_identifier");
        String identifier = value.isTextual() ? value.asText() : "";
        if (identifier.isBlank() || identifier.length() > 64
                || identifier.chars().anyMatch(character -> character < 0x20 || character > 0x7e)) {
            throw new IllegalArgumentException("终端用户标识必须是长度不超过 64 的英文字符串");
        }
    }

    private void validateCallbackUrl(ObjectNode payload) {
        if (!payload.hasNonNull("callback_url")) return;
        JsonNode value = payload.get("callback_url");
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("回调地址必须是有效的 HTTP 或 HTTPS URL");
        }
        try {
            URI uri = URI.create(value.asText().trim());
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getHost().isBlank()) {
                throw new IllegalArgumentException("回调地址必须是有效的 HTTP 或 HTTPS URL");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("回调地址必须是有效的 HTTP 或 HTTPS URL");
        }
    }

    private void validateBoolean(ObjectNode payload, String name, String label) {
        if (payload.has(name) && !payload.get(name).isBoolean()) {
            throw new IllegalArgumentException(label + "必须是布尔值");
        }
    }

    private void validateCreateFields(ObjectNode payload) {
        payload.fieldNames().forEachRemaining(name -> {
            if (!CREATE_FIELDS.contains(name)) throw new IllegalArgumentException("Seedance 请求包含未知参数: " + name);
            if (payload.get(name).isNull()) throw new IllegalArgumentException("Seedance 参数不能为空: " + name);
        });
    }

    private void validateIntegerRange(ObjectNode payload, String name, int min, int max, String label) {
        if (!payload.hasNonNull(name)) return;
        JsonNode value = payload.get(name);
        if (!value.isIntegralNumber() || !value.canConvertToInt()) {
            throw new IllegalArgumentException(label + "必须是整数");
        }
        int number = value.asInt();
        if (number < min || number > max) {
            throw new IllegalArgumentException(label + "必须在 " + min + " 到 " + max + " 之间");
        }
    }

    private void rejectFields(ObjectNode payload, List<String> fields, String message) {
        for (String field : fields) {
            if (payload.has(field)) throw new IllegalArgumentException(message + ": " + field);
        }
    }

    private void validateString(ObjectNode payload, String name, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty() || !payload.hasNonNull(name)) return;
        String value = payload.path(name).asText();
        if (allowed.stream().noneMatch(item -> item.equalsIgnoreCase(value))) throw new IllegalArgumentException(label + "不受当前模型支持: " + value);
    }

    private void validateInteger(ObjectNode payload, String name, List<Integer> allowed, String label) {
        if (allowed == null || allowed.isEmpty() || !payload.hasNonNull(name)) return;
        if (!payload.path(name).canConvertToInt() || !allowed.contains(payload.path(name).asInt())) throw new IllegalArgumentException(label + "不受当前模型支持: " + payload.path(name).asText());
    }

    private void validateFlag(ObjectNode payload, String name, boolean supported, String label) {
        validateBoolean(payload, name, label);
        if (payload.has(name) && !supported) throw new IllegalArgumentException("当前模型不支持" + label);
    }

    private void validateReferenceLimit(ObjectNode payload, String type, int max, String label) {
        if (max < 0) return;
        int count = 0;
        JsonNode content = payload.get("content");
        if (content != null && content.isArray()) {
            for (JsonNode item : content) if (item.path("type").asText().equalsIgnoreCase(type)) count += 1;
        }
        if (count > max) throw new IllegalArgumentException("当前模型最多支持 " + max + " 个" + label);
    }

    private String normalizeMode(String mode) {
        if (mode == null) return "";
        return switch (mode.trim().toLowerCase(Locale.ROOT)) {
            case "image-reference", "multi-frame" -> "all-in-one-reference";
            default -> mode.trim().toLowerCase(Locale.ROOT);
        };
    }

    private String inferMode(ContentProfile profile) {
        if (profile.draftTasks() > 0) return "draft-task";
        if (profile.referenceImages() > 0 || profile.referenceVideos() > 0 || profile.referenceAudios() > 0) {
            return "all-in-one-reference";
        }
        if (profile.lastFrames() > 0 || profile.images() > 1) return "first-last-frame";
        return profile.images() == 1 ? "image-to-video" : "text-to-video";
    }

    private void validateContentMode(String mode, ContentProfile profile) {
        if (profile.texts() > 1) throw new IllegalArgumentException("Seedance content 最多只能包含 1 条文本提示词");
        if (profile.invalidRoles() > 0) throw new IllegalArgumentException("Seedance 参考媒体包含不支持的 role");
        boolean hasFrameRoles = profile.firstFrames() > 0 || profile.lastFrames() > 0;
        boolean hasReferenceRoles = profile.referenceImages() > 0 || profile.referenceVideos() > 0 || profile.referenceAudios() > 0;
        if (hasFrameRoles && hasReferenceRoles) {
            throw new IllegalArgumentException("Seedance 首帧/首尾帧模式不能与多模态参考素材混用");
        }
        switch (mode) {
            case "text-to-video" -> {
                if (profile.texts() == 0 || profile.media() > 0 || profile.draftTasks() > 0) {
                    throw new IllegalArgumentException("文生视频模式必须传入提示词且不能传入参考媒体");
                }
            }
            case "image-to-video" -> {
                if (profile.images() != 1 || profile.videos() > 0 || profile.audios() > 0
                        || profile.lastFrames() > 0 || profile.referenceImages() > 0 || profile.draftTasks() > 0) {
                    throw new IllegalArgumentException("首帧图生视频必须传入 1 张首帧图片");
                }
            }
            case "first-last-frame" -> {
                if (profile.images() != 2 || profile.videos() > 0 || profile.audios() > 0
                        || profile.firstFrames() != 1 || profile.lastFrames() != 1 || profile.draftTasks() > 0) {
                    throw new IllegalArgumentException("首尾帧生视频必须分别传入 1 张 first_frame 和 1 张 last_frame");
                }
            }
            case "all-in-one-reference" -> {
                if (profile.media() == 0 || profile.unroledImages() > 0 || profile.firstFrames() > 0 || profile.lastFrames() > 0
                        || profile.referenceImages() != profile.images() || profile.referenceVideos() != profile.videos()
                        || profile.referenceAudios() != profile.audios() || profile.draftTasks() > 0) {
                    throw new IllegalArgumentException("多模态参考素材必须使用 reference_image/reference_video/reference_audio role");
                }
                if (profile.audios() > 0 && profile.images() + profile.videos() == 0) {
                    throw new IllegalArgumentException("Seedance 参考音频不能单独使用，至少需要 1 张参考图片或 1 个参考视频");
                }
            }
            case "draft-task" -> {
                if (profile.draftTasks() != 1 || profile.texts() > 0 || profile.media() > 0) {
                    throw new IllegalArgumentException("样片生成必须且只能传入 1 个 draft_task");
                }
            }
            default -> throw new IllegalArgumentException("不支持的 Seedance 视频生成模式: " + mode);
        }
    }

    private ContentProfile validateAndProfileContent(ObjectNode payload) {
        JsonNode content = payload.get("content");
        if (content == null || !content.isArray() || content.isEmpty()) {
            throw new IllegalArgumentException("Seedance content 必须是非空数组");
        }
        int texts = 0;
        int images = 0;
        int videos = 0;
        int audios = 0;
        int draftTasks = 0;
        int firstFrames = 0;
        int lastFrames = 0;
        int referenceImages = 0;
        int referenceVideos = 0;
        int referenceAudios = 0;
        int unroledImages = 0;
        int invalidRoles = 0;
        for (JsonNode item : content) {
            if (!item.isObject()) throw new IllegalArgumentException("Seedance content 每一项必须是对象");
            String type = item.path("type").asText("").toLowerCase(Locale.ROOT);
            String role = item.path("role").asText("").toLowerCase(Locale.ROOT);
            switch (type) {
                case "text" -> {
                    requireText(item, "text", "Seedance 文本提示词不能为空");
                    texts += 1;
                }
                case "image_url" -> {
                    requireNestedUrl(item, "image_url", "Seedance 图片地址不能为空");
                    images += 1;
                    if (role.isBlank()) unroledImages += 1;
                    else if ("first_frame".equals(role)) firstFrames += 1;
                    else if ("last_frame".equals(role)) lastFrames += 1;
                    else if ("reference_image".equals(role)) referenceImages += 1;
                    else invalidRoles += 1;
                }
                case "video_url" -> {
                    requireNestedUrl(item, "video_url", "Seedance 视频地址不能为空");
                    videos += 1;
                    if ("reference_video".equals(role)) referenceVideos += 1;
                    else invalidRoles += 1;
                }
                case "audio_url" -> {
                    requireNestedUrl(item, "audio_url", "Seedance 音频地址不能为空");
                    audios += 1;
                    if ("reference_audio".equals(role)) referenceAudios += 1;
                    else invalidRoles += 1;
                }
                case "draft_task" -> {
                    JsonNode draftTask = item.get("draft_task");
                    if (draftTask == null || !draftTask.isObject()) {
                        throw new IllegalArgumentException("Seedance draft_task 必须是对象");
                    }
                    requireText(draftTask, "id", "Seedance 样片任务 ID 不能为空");
                    draftTasks += 1;
                }
                default -> throw new IllegalArgumentException("Seedance content 包含不支持的类型: " + type);
            }
        }
        return new ContentProfile(texts, images, videos, audios, draftTasks, firstFrames, lastFrames,
                referenceImages, referenceVideos, referenceAudios, unroledImages, invalidRoles);
    }

    private void requireNestedUrl(JsonNode item, String field, String message) {
        JsonNode value = item.get(field);
        if (value == null || !value.isObject()) throw new IllegalArgumentException(message);
        requireText(value, "url", message);
    }

    private void requireText(JsonNode object, String field, String message) {
        JsonNode value = object.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException(message);
        }
    }

    private record ContentProfile(
            int texts,
            int images,
            int videos,
            int audios,
            int draftTasks,
            int firstFrames,
            int lastFrames,
            int referenceImages,
            int referenceVideos,
            int referenceAudios,
            int unroledImages,
            int invalidRoles
    ) {
        int media() { return images + videos + audios; }
    }
    private void normalizeImageDataUrls(ObjectNode payload) {
        JsonNode content = payload.get("content");
        if (content == null || !content.isArray()) return;
        for (JsonNode item : content) {
            if (!(item instanceof ObjectNode object) || !(object.get("image_url") instanceof ObjectNode image)) continue;
            String value = image.path("url").asText("");
            if (!value.startsWith("data:image/")) continue;
            if (publicBaseUrl.isBlank()) throw new IllegalArgumentException("Seedance 本地参考图需要配置后端公网地址 PUBLIC_BASE_URL");
            image.put("url", publicBaseUrl + "/api/public-image/" + publicImageService.saveDataUrl(value));
        }
    }

    private void normalizeVideoDataUrls(ObjectNode payload) {
        JsonNode content = payload.get("content");
        if (content == null || !content.isArray()) return;
        for (JsonNode item : content) {
            if (!(item instanceof ObjectNode object) || !(object.get("video_url") instanceof ObjectNode video)) continue;
            String value = video.path("url").asText("");
            if (!value.startsWith("data:video/")) continue;
            if (publicBaseUrl.isBlank()) throw new IllegalArgumentException("Seedance local reference videos require PUBLIC_BASE_URL");
            video.put("url", publicBaseUrl + "/api/public-image/" + publicImageService.saveVideoDataUrl(value));
        }
    }

    private ObjectNode normalizedTask(String taskId, JsonNode source) {
        ObjectNode task = objectMapper.createObjectNode();
        task.put("id", taskId);
        task.put("object", "video");
        String status = normalizeStatus(firstText(source, "status", "state"));
        task.put("status", status);
        task.put("progress", source.path("progress").asInt("completed".equals(status) ? 100 : 0));
        JsonNode error = source.get("error");
        if (error != null && !error.isNull()) task.set("error", normalizeError(error));
        else if ("failed".equals(status)) task.set("error", normalizeError(source));
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
        normalized.put("message", firstText(error, "message", "msg", "detail").isBlank() ? "Seedance 视频生成失败" : firstText(error, "message", "msg", "detail"));
        if (error.hasNonNull("code")) normalized.set("code", error.get("code"));
        return normalized;
    }

    private String resultUrl(JsonNode source) {
        if (source == null) return "";
        if (source.isTextual() && isHttpUrl(source.asText())) return source.asText();
        if (source.isObject()) {
            for (String field : List.of("video_url", "url", "uri")) {
                String value = resultUrl(source.get(field));
                if (!value.isBlank()) return value;
            }
            for (String field : List.of("content", "data", "output", "outputs")) {
                String value = resultUrl(source.get(field));
                if (!value.isBlank()) return value;
            }
        } else if (source.isArray()) {
            for (JsonNode value : source) {
                String url = resultUrl(value);
                if (!url.isBlank()) return url;
            }
        }
        return "";
    }

    private JsonNode unwrapData(JsonNode source) {
        return source.has("data") && source.path("data").isObject() ? source.path("data") : source;
    }

    private String firstText(JsonNode source, String... names) {
        if (source == null) return "";
        for (String name : names) {
            String value = source.path(name).asText("").trim();
            if (!value.isBlank()) return value;
        }
        return "";
    }

    private String normalizeStatus(String value) {
        String status = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (Set.of("succeeded", "success", "completed").contains(status)) return "completed";
        if (Set.of("failed", "cancelled", "canceled", "expired").contains(status)) return "failed";
        if (TRANSIENT_STATUSES.contains(status)) return "in_progress";
        return status.isBlank() ? "in_progress" : status;
    }

    private ResponseEntity<?> upstreamError(String action, HttpResponse<byte[]> response) {
        String detail = "";
        try {
            JsonNode body = objectMapper.readTree(response.body());
            detail = firstText(body.path("error"), "message", "msg", "detail");
            if (detail.isBlank()) detail = firstText(body, "message", "msg", "detail");
        } catch (Exception ignored) {
            // Keep provider HTML or malformed responses out of the client error.
        }
        String message = "Seedance 视频" + action + "失败 (HTTP " + response.statusCode() + ")";
        if (!detail.isBlank()) message += ": " + detail.replaceAll("(?i)bearer\\s+\\S+", "Bearer ***");
        return error(response.statusCode() >= 400 && response.statusCode() < 500 ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY, message);
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
        body.putObject("error").put("message", message == null || message.isBlank() ? "请求失败" : message);
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

    private static String volcengineUrl(String baseUrl, String suffix) {
        String base = trimTrailingSlash(baseUrl);
        if (base.endsWith("/api/v3")) return base + suffix;
        return base + "/api/v3" + suffix;
    }

    private static String trimTrailingSlash(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    private static String decodePathSegment(String value) {
        try {
            return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (Exception error) {
            return value;
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static boolean isHttpUrl(String value) {
        return value != null && value.matches("(?i)^https?://.+");
    }
}
