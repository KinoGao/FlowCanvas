package com.infinitecanvas.backend.service.modelruntime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.service.PlatformConfigService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
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

/**
 * Fallback adapter that proxies any model request to a vendor speaking the
 * OpenAI or Gemini HTTP conventions, validating against the model's
 * configured capabilities. It is registered with the highest {@link #order}
 * value so vendor-specific adapters (such as Agnes) get
 * the first chance to claim a request.
 *
 * <p>Capability validation here is intentionally generic: it checks that the
 * request fields declared by the model's {@code textCapabilities},
 * {@code imageCapabilities} or {@code videoCapabilities} are respected. Field
 * naming and request shape follow the OpenAI / Gemini conventions because
 * vendor-specific adapters handle every other protocol.
 */
@Service
public class GenericOpenAiAdapter implements ModelRequestAdapter {
    private static final Duration TIMEOUT = Duration.ofMinutes(30);
    private static final Duration CREATE_TIMEOUT = Duration.ofSeconds(90);
    private static final Set<String> HOP_HEADERS = Set.of(
            "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "trailers", "transfer-encoding", "upgrade",
            "content-encoding", "content-length"
    );

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            // 强制 HTTP/1.1：默认 HTTP/2 会对纯 HTTP 自建服务发 h2c Upgrade，uvicorn 类服务器拒绝升级并丢失请求体
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(30))
            // 不跟随重定向：上游 3xx 可能指向内网任意地址（重定向型 SSRF）。
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public GenericOpenAiAdapter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public int order() { return Integer.MAX_VALUE; }

    @Override
    public List<ModelProtocol> protocols() {
        return List.of(
                new ModelProtocol("openai", "OpenAI 直连", "OpenAI 兼容的同步或异步接口"),
                new ModelProtocol("gemini", "Gemini 协议", "Gemini 原生接口；厂商协议需选择 Gemini")
        );
    }

    @Override
    public boolean supports(PlatformConfigService.RuntimeModel runtime, String suffix) {
        return runtime != null;
    }

    @Override
    public ResponseEntity<?> handle(HttpServletRequest request, String suffix, PlatformConfigService.RuntimeModel runtime)
            throws IOException, InterruptedException {
        boolean gemini = "gemini".equalsIgnoreCase(runtime.provider().getApiFormat());
        String targetSuffix = gemini ? rewriteGeminiModelPath(suffix, runtime.model().getRequestModel()) : suffix;
        String query = request.getQueryString();
        URI target = URI.create(joinUrl(runtime.provider().getBaseUrl(), targetSuffix)
                + (query == null ? "" : "?" + query));
        byte[] body = ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod()))
                ? new byte[0] : request.getInputStream().readAllBytes();
        String contentType = request.getContentType();
        boolean isMultipart = contentType != null && contentType.toLowerCase(Locale.ROOT).contains("multipart/form-data");

        // Spring Boot's StandardMultipartHttpServletRequest may have already
        // parsed the multipart body on first access, consuming the raw input
        // stream. When the body returns empty but the Content-Type declares
        // multipart, rebuild the raw bytes from the parsed parts so downstream
        // validation and rewriting keep working.
        if (body.length == 0 && isMultipart) {
            try {
                body = rebuildMultipartBody(request.getParts(), contentType);
            } catch (Exception ignored) {
                // Parts not available — propagate the empty body as-is (the
                // upstream gateway will reject it, preserving the error).
            }
        }
        try {
            if (body.length > 0 && contentType != null && contentType.toLowerCase(Locale.ROOT).contains("application/json")) {
                body = validateAndRewriteJson(body, suffix, runtime.model(), gemini);
            } else if (body.length > 0 && contentType != null && contentType.toLowerCase(Locale.ROOT).contains("multipart/form-data")) {
                body = validateAndRewriteMultipart(body, suffix, runtime.model());
            }
        } catch (IllegalArgumentException error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }

        // 非顺序图片模型（如 gpt-image / nano-banana）上游会忽略 `n`，恒只返回 1 张。
        // 前端请求 n>1 时由后端拆成 n 次 n=1 调用并合并，真实产出多张。
        if (shouldBatchImageCreate(request, suffix, runtime, body, contentType)) {
            return batchImageCreate(request, target, runtime, body);
        }

        boolean videoCreate = "POST".equalsIgnoreCase(request.getMethod()) && "/videos".equals(suffix);
        boolean mediaDownload = "GET".equalsIgnoreCase(request.getMethod()) && isDownloadEndpoint(suffix);
        HttpRequest.Builder builder = HttpRequest.newBuilder(target).timeout(videoCreate ? CREATE_TIMEOUT : TIMEOUT);
        if (gemini) builder.header("x-goog-api-key", runtime.provider().getApiKey());
        else builder.header("Authorization", "Bearer " + runtime.provider().getApiKey());
        copyHeader(request, builder, "Content-Type");
        copyHeader(request, builder, "Accept");
        builder.method(request.getMethod(), body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        try {
            // 媒体下载（视频 /content、任务查询）采用流式透传：响应头先返回、body 边收边发。
            // 上游 CDN 下载可能很慢（如 Junli ~15KB/s），若等全部下载完再返回，
            // 前端会因长时间收不到数据而判定超时。
            if (mediaDownload) {
                HttpResponse<InputStream> upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
                HttpHeaders headers = new HttpHeaders();
                upstream.headers().map().forEach((name, values) -> {
                    if (!HOP_HEADERS.contains(name.toLowerCase(Locale.ROOT)) && !name.startsWith(":")) {
                        values.forEach(value -> headers.add(name, value));
                    }
                });
                if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) {
                    String detail = new String(upstream.body().readNBytes(4096), StandardCharsets.UTF_8);
                    return new ResponseEntity<>(detail.getBytes(StandardCharsets.UTF_8), headers, HttpStatus.valueOf(upstream.statusCode()));
                }
                return streamingMediaResponse(headers, upstream.body());
            }
            HttpResponse<byte[]> upstream = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            HttpHeaders headers = new HttpHeaders();
            upstream.headers().map().forEach((name, values) -> {
                if (!HOP_HEADERS.contains(name.toLowerCase(Locale.ROOT)) && !name.startsWith(":")) {
                    values.forEach(value -> headers.add(name, value));
                }
            });
            return new ResponseEntity<>(upstream.body(), headers, HttpStatus.valueOf(upstream.statusCode()));
        } catch (java.net.http.HttpTimeoutException error) {
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT).body("上游模型请求超时");
        } catch (IOException error) {
            // 不向客户端透出网络细节（主机 / 端口 / 内网地址等）。
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("上游模型请求失败");
        }
    }

    /** 媒体下载流式透传：显式声明 StreamingResponseBody 泛型，避免类型擦除后 Spring 找不到 converter。 */
    private ResponseEntity<StreamingResponseBody> streamingMediaResponse(HttpHeaders headers, InputStream body) {
        return new ResponseEntity<>(
                (StreamingResponseBody) output -> {
                    try (InputStream input = body) {
                        input.transferTo(output);
                    } catch (IOException ignored) {
                        // 客户端断开时静默结束。
                    }
                },
                headers,
                HttpStatus.OK
        );
    }

    private boolean isDownloadEndpoint(String suffix) {
        // 只流式透传媒体文件下载端点；任务轮询（/videos/{id}）返回小 JSON，保持整包读取。
        return suffix.endsWith("/content")
                || suffix.matches("/images/[^/]+/(file|bytes)$")
                || suffix.matches("/audio/[^/]+/(file|bytes)$");
    }

    /**
     * 是否需要把一次图片创建请求拆成多次 n=1 调用：
     * 仅当「POST + 图片分类 + 非顺序 + JSON 请求体 + n>1」时成立。
     * 顺序模型（如 Seedream 走 sequential_image_generation_options）、multipart 编辑、
     * n=1、以及其他分类一律走原有单请求透传。
     */
    private boolean shouldBatchImageCreate(HttpServletRequest request, String suffix,
                                           PlatformConfigService.RuntimeModel runtime, byte[] body, String contentType) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) return false;
        if (!"image".equals(runtime.model().getCategory())) return false;
        PlatformConfigDocument.ImageCapabilities caps = runtime.model().getImageCapabilities();
        if (caps == null || caps.isSequentialImageGeneration()) return false;
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).contains("application/json")) return false;
        if (!suffix.toLowerCase(Locale.ROOT).contains("/images/")) return false;
        try {
            JsonNode parsed = objectMapper.readTree(body);
            if (!(parsed instanceof ObjectNode json)) return false;
            return requestedImageOutputCount(json) > 1;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * 把 n>1 的图片创建请求拆成 n 次 n=1 调用并合并返回（保留最后一个响应的外框与 data）。
     * 任一单次失败即回吐该次上游错误，避免静默丢图。
     */
    private ResponseEntity<?> batchImageCreate(HttpServletRequest request, URI target,
                                               PlatformConfigService.RuntimeModel runtime, byte[] body)
            throws IOException, InterruptedException {
        ObjectNode json = (ObjectNode) objectMapper.readTree(body);
        int n = requestedImageOutputCount(json);
        ObjectNode single = json.deepCopy();
        single.put("n", 1);
        single.remove("sequential_image_generation");
        single.remove("sequential_image_generation_options");
        byte[] singleBody = objectMapper.writeValueAsBytes(single);
        boolean gemini = "gemini".equalsIgnoreCase(runtime.provider().getApiFormat());
        String method = request.getMethod();

        List<ObjectNode> items = new ArrayList<>();
        ObjectNode lastOuter = null;
        int lastStatus = 200;
        HttpHeaders lastHeaders = new HttpHeaders();
        for (int i = 0; i < n; i++) {
            HttpRequest.Builder rb = HttpRequest.newBuilder(target).timeout(TIMEOUT);
            if (gemini) rb.header("x-goog-api-key", runtime.provider().getApiKey());
            else rb.header("Authorization", "Bearer " + runtime.provider().getApiKey());
            rb.header("Content-Type", "application/json");
            copyHeader(request, rb, "Accept");
            rb.method(method, HttpRequest.BodyPublishers.ofByteArray(singleBody));
            HttpResponse<byte[]> upstream = httpClient.send(rb.build(), HttpResponse.BodyHandlers.ofByteArray());
            if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) {
                HttpHeaders headers = new HttpHeaders();
                forwardResponseHeaders(upstream, headers);
                return new ResponseEntity<>(upstream.body(), headers, HttpStatus.valueOf(upstream.statusCode()));
            }
            lastStatus = upstream.statusCode();
            forwardResponseHeaders(upstream, lastHeaders);
            ObjectNode parsed = (ObjectNode) objectMapper.readTree(upstream.body());
            JsonNode data = parsed.path("data");
            if (data.isArray() && data.size() > 0) items.add((ObjectNode) data.get(0));
            lastOuter = parsed;
        }
        ObjectNode merged = lastOuter == null ? objectMapper.createObjectNode() : lastOuter.deepCopy();
        ArrayNode all = merged.putArray("data");
        items.forEach(all::add);
        return new ResponseEntity<>(objectMapper.writeValueAsBytes(merged), lastHeaders, HttpStatus.valueOf(lastStatus));
    }

    private void forwardResponseHeaders(HttpResponse<?> upstream, HttpHeaders headers) {
        upstream.headers().map().forEach((name, values) -> {
            if (!HOP_HEADERS.contains(name.toLowerCase(Locale.ROOT)) && !name.startsWith(":")) {
                values.forEach(value -> headers.set(name, value));
            }
        });
    }

    // ---------- request validation & rewrite ----------

    byte[] validateAndRewriteJson(byte[] body, String path, PlatformConfigDocument.Model model, boolean gemini) {
        try {
            JsonNode parsed = objectMapper.readTree(body);
            if (!(parsed instanceof ObjectNode json)) throw new IllegalArgumentException("请求体必须是 JSON 对象");
            switch (model.getCategory()) {
                case "text" -> validateText(json, model.getTextCapabilities());
                case "image" -> validateImage(json, path, model.getImageCapabilities());
                case "video" -> validateVideo(json, model.getVideoCapabilities());
                case "audio" -> validateAudio(json, path, model.getAudioCapabilities());
                default -> throw new IllegalArgumentException("不支持的模型分类: " + model.getCategory());
            }
            json.remove("_flowcanvas_mode");
            if (gemini) json.remove("model");
            else json.put("model", model.getRequestModel());
            return objectMapper.writeValueAsBytes(json);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("请求 JSON 解析失败", error);
        }
    }

    byte[] validateAndRewriteMultipart(byte[] body, String path, PlatformConfigDocument.Model model) {
        String payload = new String(body, StandardCharsets.ISO_8859_1);
        if ("image".equals(model.getCategory())) {
            String mode = path.toLowerCase(Locale.ROOT).contains("/images/edits") ? "image-edit" : multipartFileCount(payload, "image") > 0 ? "image-to-image" : "text-to-image";
            validateRequiredMode(mode, model.getImageCapabilities() == null ? null : model.getImageCapabilities().getModes(), "图像生成模式");
            PlatformConfigDocument.ImageCapabilities capabilities = model.getImageCapabilities();
            validateMultipartString(payload, "quality", capabilities.getQualities(), "画质");
            validateMultipartInteger(payload, "n", capabilities.getCounts(), "生成数量");
            int inputCount = multipartFileCount(payload, "image");
            int outputCount = multipartPositiveInteger(payload, "n", 1, "生成数量");
            validateReferenceLimit(inputCount, capabilities.getMaxImages(), "参考图片");
            validateConfiguredLimit(outputCount, capabilities.getMaxOutputs(), "生成图片");
            validateConfiguredLimit(inputCount + outputCount, capabilities.getMaxTotalImages(), "输入与输出图片总数");
            validateMultipartFlag(payload, "watermark", capabilities.isWatermark(), "添加水印");
        } else if ("video".equals(model.getCategory())) {
            PlatformConfigDocument.VideoCapabilities capabilities = model.getVideoCapabilities();
            if (capabilities == null) throw new IllegalArgumentException("视频模型尚未配置能力");
            int references = multipartFileCount(payload, "input_reference");
            String mode = multipartField(payload, "_flowcanvas_mode");
            if (mode == null || mode.isBlank()) {
                mode = references > 2 ? "multi-frame"
                        : references == 2 ? "first-last-frame"
                        : references == 1 ? "image-to-video"
                        : "text-to-video";
            } else {
                mode = mode.trim();
            }
            validateRequiredMode(mode, capabilities.getModes(), "视频生成模式");
            validateMultipartInteger(payload, "seconds", capabilities.getDurations(), "时长");
            validateMultipartString(payload, "resolution_name", capabilities.getResolutions(), "分辨率");
            validateReferenceLimit(references, capabilities.getMaxImages(), "参考图片");
            payload = removeMultipartField(payload, "_flowcanvas_mode");
        } else if (!"text".equals(model.getCategory())) {
            throw new IllegalArgumentException("不支持的模型分类: " + model.getCategory());
        }
        return replaceMultipartField(payload, "model", model.getRequestModel()).getBytes(StandardCharsets.ISO_8859_1);
    }

    private void validateText(ObjectNode json, PlatformConfigDocument.TextCapabilities capabilities) {
        if (capabilities == null) throw new IllegalArgumentException("文本模型尚未配置能力");
        String requested = explicitMode(json);
        if (requested != null) validateRequiredMode(requested, capabilities.getModes(), "文本能力");
        if (containsImageInput(json) && !capabilities.getModes().contains("vision")) {
            throw new IllegalArgumentException("当前文本模型不支持识图或多模态输入");
        }
        if (!containsImageInput(json) && !capabilities.getModes().contains("text")) {
            throw new IllegalArgumentException("当前文本模型不支持纯文本输入");
        }
    }

    private void validateImage(ObjectNode json, String path, PlatformConfigDocument.ImageCapabilities capabilities) {
        if (capabilities == null) throw new IllegalArgumentException("图像模型尚未配置能力");
        String mode = explicitMode(json);
        if (mode == null) {
            if (path.toLowerCase(Locale.ROOT).contains("/images/edits")) mode = "image-edit";
            else mode = containsImageInput(json) ? "image-to-image" : "text-to-image";
        }
        validateRequiredMode(mode, capabilities.getModes(), "图像生成模式");
        validateString(json, List.of("quality"), capabilities.getQualities(), "画质");
        validateStringIgnoreCase(json, List.of("resolution", "size_quality"), capabilities.getResolutions(), "清晰度");
        validateString(json, List.of("ratio", "aspect_ratio"), capabilities.getRatios(), "画面比例");
        int inputCount = countMediaInputs(json, "image");
        int outputCount = requestedImageOutputCount(json);
        validateAllowedInteger(outputCount, capabilities.getCounts(), "生成数量");
        validateReferenceLimit(inputCount, capabilities.getMaxImages(), "参考图片");
        validateConfiguredLimit(outputCount, capabilities.getMaxOutputs(), "生成图片");
        validateConfiguredLimit(inputCount + outputCount, capabilities.getMaxTotalImages(), "输入与输出图片总数");
        validateSequentialImageGeneration(json, capabilities.isSequentialImageGeneration());
        validateFlag(json, List.of("watermark"), capabilities.isWatermark(), "添加水印");
    }

    private void validateVideo(ObjectNode json, PlatformConfigDocument.VideoCapabilities capabilities) {
        if (capabilities == null) throw new IllegalArgumentException("视频模型尚未配置能力");
        String mode = explicitMode(json);
        if (mode == null) mode = inferVideoMode(json);
        validateRequiredMode(mode, capabilities.getModes(), "视频生成模式");
        validateString(json, List.of("ratio", "aspect_ratio"), capabilities.getRatios(), "画面比例");
        validateString(json, List.of("resolution", "quality"), capabilities.getResolutions(), "分辨率");
        validateInteger(json, List.of("duration", "seconds"), capabilities.getDurations(), "时长");
        validateInteger(json, List.of("frame_rate", "fps"), capabilities.getFrameRates(), "帧率");
        validateInteger(json, List.of("n", "count"), capabilities.getCounts(), "生成数量");
        validateFlag(json, List.of("generate_audio", "audio"), capabilities.isGenerateAudio(), "生成音频");
        validateFlag(json, List.of("watermark"), capabilities.isWatermark(), "添加水印");
        validateFlag(json, List.of("draft"), capabilities.isDraft(), "草稿模式");
        validateReferenceLimit(countMediaInputs(json, "image"), capabilities.getMaxImages(), "参考图片");
        validateReferenceLimit(countMediaInputs(json, "video"), capabilities.getMaxVideos(), "参考视频");
        validateReferenceLimit(countMediaInputs(json, "audio"), capabilities.getMaxAudios(), "参考音频");
    }

    private void validateAudio(ObjectNode json, String path, PlatformConfigDocument.AudioCapabilities capabilities) {
        if (capabilities == null) throw new IllegalArgumentException("音频模型尚未配置能力");
        if (!path.toLowerCase(Locale.ROOT).contains("/audio/speech")) {
            throw new IllegalArgumentException("当前 OpenAI 兼容音频模型仅支持 /audio/speech");
        }
        if (!capabilities.getModes().contains("text-to-speech")) {
            throw new IllegalArgumentException("当前音频模型不支持文生语音");
        }
        if (json.path("input").asText("").trim().isEmpty()) throw new IllegalArgumentException("音频生成内容不能为空");
        validateString(json, List.of("voice"), capabilities.getVoices(), "音色");
        validateString(json, List.of("response_format"), capabilities.getFormats(), "输出格式");
        validateDecimal(json, List.of("speed"), capabilities.getSpeeds(), "语速");
        if (json.hasNonNull("instructions") && !capabilities.isInstructions()) {
            throw new IllegalArgumentException("当前音频模型不支持语音指令");
        }
    }

    private String inferVideoMode(JsonNode json) {
        if (containsRole(json, "reference_video") || containsRole(json, "reference_audio") || containsMediaInput(json, "video") || containsMediaInput(json, "audio")) return "all-in-one-reference";
        if (containsRole(json, "reference_image")) return "image-reference";
        if (containsRole(json, "last_frame") || hasFieldRecursive(json, "last_frame")) return "first-last-frame";
        int imageCount = countMediaInputs(json, "image");
        if (hasKeyframes(json)) return imageCount <= 2 ? "first-last-frame" : "multi-frame";
        if (imageCount > 2) return "multi-frame";
        if (containsRole(json, "first_frame") || containsImageInput(json)) return "image-to-video";
        return "text-to-video";
    }

    private void validateRequiredMode(String mode, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) throw new IllegalArgumentException(label + "尚未配置");
        if (!allowed.contains(mode)) throw new IllegalArgumentException(label + "不受当前模型支持: " + mode);
    }

    private boolean containsImageInput(JsonNode node) {
        return containsMediaInput(node, "image");
    }

    private boolean containsMediaInput(JsonNode node, String media) {
        if (node == null) return false;
        if (node.isObject()) {
            var fields = node.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String key = entry.getKey().toLowerCase(Locale.ROOT);
                JsonNode value = entry.getValue();
                if ((key.equals(media) || key.equals(media + "_url") || key.equals("input_" + media) || key.equals(media + "s")) && !value.isNull() && !(value.isArray() && value.isEmpty())) return true;
                if (key.equals("type") && value.isTextual() && value.asText().toLowerCase(Locale.ROOT).contains(media)) return true;
                if (containsMediaInput(value, media)) return true;
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) if (containsMediaInput(item, media)) return true;
        }
        return false;
    }

    private int countMediaInputs(JsonNode node, String media) {
        if (node == null) return 0;
        if (node.isObject()) {
            JsonNode type = node.get("type");
            if (type != null && type.isTextual() && type.asText().toLowerCase(Locale.ROOT).contains(media)) {
                return 1;
            }
            int count = 0;
            var fields = node.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String key = entry.getKey().toLowerCase(Locale.ROOT);
                JsonNode value = entry.getValue();
                if ((key.equals(media) || key.equals(media + "_url") || key.equals("input_" + media) || key.equals(media + "s")) && !value.isNull()) {
                    count += value.isArray() ? value.size() : 1;
                } else if (!key.equals("type")) {
                    count += countMediaInputs(value, media);
                }
            }
            return count;
        }
        if (node.isArray()) {
            int count = 0;
            for (JsonNode item : node) count += countMediaInputs(item, media);
            return count;
        }
        return 0;
    }

    private boolean containsRole(JsonNode node, String role) {
        if (node == null) return false;
        if (node.isObject()) {
            if (node.has("role") && role.equalsIgnoreCase(node.path("role").asText())) return true;
            var fields = node.fields();
            while (fields.hasNext()) if (containsRole(fields.next().getValue(), role)) return true;
        } else if (node.isArray()) {
            for (JsonNode item : node) if (containsRole(item, role)) return true;
        }
        return false;
    }

    private boolean hasFieldRecursive(JsonNode node, String field) {
        if (node == null) return false;
        if (node.isObject()) {
            if (node.hasNonNull(field)) return true;
            var fields = node.fields();
            while (fields.hasNext()) if (hasFieldRecursive(fields.next().getValue(), field)) return true;
        } else if (node.isArray()) {
            for (JsonNode item : node) if (hasFieldRecursive(item, field)) return true;
        }
        return false;
    }

    private boolean hasKeyframes(JsonNode node) {
        if (node == null) return false;
        if (node.isObject()) {
            if (node.has("mode") && "keyframes".equalsIgnoreCase(node.path("mode").asText())) return true;
            var fields = node.fields();
            while (fields.hasNext()) if (hasKeyframes(fields.next().getValue())) return true;
        } else if (node.isArray()) {
            for (JsonNode item : node) if (hasKeyframes(item)) return true;
        }
        return false;
    }

    private String explicitMode(ObjectNode json) {
        JsonNode value = first(json, List.of("_flowcanvas_mode", "mode", "task_type", "generation_type"));
        return value != null && value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
    }

    private int requestedImageOutputCount(ObjectNode json) {
        JsonNode options = json.path("sequential_image_generation_options");
        JsonNode sequentialCount = options.isObject() ? options.get("max_images") : null;
        JsonNode value = sequentialCount != null ? sequentialCount : first(json, List.of("n", "count"));
        if (value == null || value.isNull()) return 1;
        if (!value.canConvertToInt() || value.asInt() < 1) throw new IllegalArgumentException("生成数量必须是正整数");
        return value.asInt();
    }

    private void validateAllowedInteger(int value, List<Integer> allowed, String label) {
        if (allowed != null && !allowed.isEmpty() && !allowed.contains(value)) {
            throw new IllegalArgumentException(label + "不受当前模型支持: " + value);
        }
    }

    private void validateConfiguredLimit(int count, int max, String label) {
        if (max > 0 && count > max) throw new IllegalArgumentException(label + "数量超过当前模型上限: " + max);
    }

    private void validateReferenceLimit(int count, int max, String label) {
        if (max >= 0 && count > max) throw new IllegalArgumentException(label + "数量超过当前模型上限: " + max);
    }

    private void validateSequentialImageGeneration(ObjectNode json, boolean supported) {
        JsonNode value = json.get("sequential_image_generation");
        if (value == null || value.isNull()) return;
        boolean requested = value.isBoolean() ? value.asBoolean() : !Set.of("", "false", "off", "none", "disabled").contains(value.asText("").toLowerCase(Locale.ROOT));
        if (requested && !supported) throw new IllegalArgumentException("当前模型不支持连续多图生成");
    }

    private int multipartPositiveInteger(String payload, String name, int fallback, String label) {
        String value = multipartField(payload, name);
        if (value == null || value.isBlank()) return fallback;
        try {
            int number = Integer.parseInt(value);
            if (number < 1) throw new NumberFormatException();
            return number;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + "必须是正整数");
        }
    }

    private void validateMultipartFlag(String payload, String name, boolean supported, String label) {
        String value = multipartField(payload, name);
        if (value != null && Boolean.parseBoolean(value) && !supported) {
            throw new IllegalArgumentException("当前模型不支持" + label);
        }
    }

    private void validateString(ObjectNode json, List<String> keys, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        // "*" 为通配约定，仅限音色（voice）语义：平台配置声明任意音色均可（如本地 TTS 的自定义音色）。
        // 不得放宽到画质/比例/分辨率/格式等其他枚举（非白名单清理会保留 *，会意外绕过整类校验）。
        if (allowed.contains("*") && keys.contains("voice")) return;
        JsonNode value = first(json, keys);
        if (value != null && value.isTextual() && !allowed.contains(value.asText())) throw new IllegalArgumentException(label + "不受当前模型支持: " + value.asText());
    }

    private void validateStringIgnoreCase(ObjectNode json, List<String> keys, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        JsonNode value = first(json, keys);
        if (value != null && value.isTextual() && allowed.stream().noneMatch(item -> item.equalsIgnoreCase(value.asText()))) {
            throw new IllegalArgumentException(label + "不受当前模型支持: " + value.asText());
        }
    }

    private void validateInteger(ObjectNode json, List<String> keys, List<Integer> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        JsonNode value = first(json, keys);
        if (value != null && value.canConvertToInt() && !allowed.contains(value.asInt())) throw new IllegalArgumentException(label + "不受当前模型支持: " + value.asInt());
    }

    private void validateDecimal(ObjectNode json, List<String> keys, List<Double> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        JsonNode value = first(json, keys);
        if (value != null && value.isNumber() && allowed.stream().noneMatch(item -> Math.abs(item - value.asDouble()) < 0.0001)) {
            throw new IllegalArgumentException(label + "不受当前模型支持: " + value.asDouble());
        }
    }

    private void validateFlag(ObjectNode json, List<String> keys, boolean supported, String label) {
        JsonNode value = first(json, keys);
        if (value != null && value.asBoolean(false) && !supported) throw new IllegalArgumentException("当前模型不支持" + label);
    }

    private JsonNode first(ObjectNode json, List<String> keys) {
        for (String key : keys) if (json.hasNonNull(key)) return json.get(key);
        return null;
    }

    private String multipartField(String payload, String name) {
        Pattern pattern = Pattern.compile("(?s)Content-Disposition:[^\r\n]*name=\"" + Pattern.quote(name) + "\"[^\r\n]*\r\n(?:Content-Type:[^\r\n]*\r\n)?\r\n([^\r\n]*)");
        Matcher matcher = pattern.matcher(payload);
        return matcher.find() ? matcher.group(1) : null;
    }

    private int multipartFileCount(String payload, String name) {
        Pattern pattern = Pattern.compile("Content-Disposition:[^\r\n]*name=\"" + Pattern.quote(name) + "(?:\\[\\])?\"[^\r\n]*filename=\"");
        Matcher matcher = pattern.matcher(payload);
        int count = 0;
        while (matcher.find()) count += 1;
        return count;
    }

    private String replaceMultipartField(String payload, String name, String value) {
        Pattern pattern = Pattern.compile("(?s)(Content-Disposition:[^\r\n]*name=\"" + Pattern.quote(name) + "\"[^\r\n]*\r\n(?:Content-Type:[^\r\n]*\r\n)?\r\n)([^\r\n]*)");
        Matcher matcher = pattern.matcher(payload);
        if (!matcher.find()) throw new IllegalArgumentException("multipart 请求缺少 " + name + " 字段");
        return matcher.replaceFirst(Matcher.quoteReplacement(matcher.group(1) + value));
    }

    private String removeMultipartField(String payload, String name) {
        int firstLineEnd = payload.indexOf("\r\n");
        if (firstLineEnd <= 0 || !payload.startsWith("--")) return payload;
        String boundary = payload.substring(0, firstLineEnd);
        int partStart = 0;
        while (partStart >= 0 && partStart < payload.length()) {
            int headerStart = partStart + boundary.length() + 2;
            if (headerStart >= payload.length() || payload.startsWith("--", partStart + boundary.length())) break;
            int headerEnd = payload.indexOf("\r\n\r\n", headerStart);
            if (headerEnd < 0) break;
            String headers = payload.substring(headerStart, headerEnd);
            int nextBoundaryPrefix = payload.indexOf("\r\n" + boundary, headerEnd + 4);
            if (nextBoundaryPrefix < 0) break;
            Pattern disposition = Pattern.compile("(?s).*Content-Disposition:[^\r\n]*name=\"" + Pattern.quote(name) + "\"[^\r\n]*.*");
            if (disposition.matcher(headers).matches()) {
                return payload.substring(0, partStart) + payload.substring(nextBoundaryPrefix + 2);
            }
            partStart = nextBoundaryPrefix + 2;
        }
        return payload;
    }

    private void validateMultipartString(String payload, String name, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        String value = multipartField(payload, name);
        if (value != null && allowed.stream().noneMatch(item -> item.equalsIgnoreCase(value))) {
            throw new IllegalArgumentException(label + "不受当前模型支持: " + value);
        }
    }

    private void validateMultipartInteger(String payload, String name, List<Integer> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
        String value = multipartField(payload, name);
        if (value == null) return;
        try {
            int number = Integer.parseInt(value);
            if (!allowed.contains(number)) throw new IllegalArgumentException(label + "不受当前模型支持: " + number);
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + "必须是整数");
        }
    }

    // ---------- URL helpers ----------

    private String rewriteGeminiModelPath(String suffix, String requestModel) {
        int marker = suffix.indexOf("/models/");
        if (marker < 0) return suffix;
        int start = marker + "/models/".length();
        int colon = suffix.indexOf(':', start);
        int slash = suffix.indexOf('/', start);
        int end = colon >= 0 ? colon : slash >= 0 ? slash : suffix.length();
        String normalized = requestModel.replaceFirst("^models/", "");
        return suffix.substring(0, start) + normalized + suffix.substring(end);
    }

    private String joinUrl(String baseUrl, String suffix) {
        String normalizedBase = baseUrl.replaceAll("/+$", "");
        String normalizedSuffix = suffix.isBlank() ? "/" : suffix.startsWith("/") ? suffix : "/" + suffix;
        if (normalizedBase.endsWith("/v1beta") && normalizedSuffix.startsWith("/v1beta/")) normalizedSuffix = normalizedSuffix.substring("/v1beta".length());
        if (normalizedBase.endsWith("/v1") && normalizedSuffix.startsWith("/v1/")) normalizedSuffix = normalizedSuffix.substring("/v1".length());
        return normalizedBase + normalizedSuffix;
    }

    private void copyHeader(HttpServletRequest request, HttpRequest.Builder builder, String name) {
        String value = request.getHeader(name);
        if (value != null && !value.isBlank()) builder.header(name, value);
    }

    /**
     * Rebuild the raw multipart body from already-parsed servlet parts.
     * Called as a fallback when Spring's MultipartResolver has consumed the
     * original input stream.
     */
    private byte[] rebuildMultipartBody(java.util.Collection<Part> parts, String contentType) throws IOException {
        String boundary = extractMultipartBoundary(contentType);
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        byte[] crlf = "\r\n".getBytes(StandardCharsets.ISO_8859_1);
        byte[] dashes = "--".getBytes(StandardCharsets.ISO_8859_1);
        for (Part part : parts) {
            os.write(dashes);
            os.write(boundary.getBytes(StandardCharsets.ISO_8859_1));
            os.write(crlf);
            StringBuilder disposition = new StringBuilder("Content-Disposition: form-data; name=\"")
                    .append(part.getName()).append('"');
            String filename = part.getSubmittedFileName();
            if (filename != null) disposition.append("; filename=\"").append(filename).append('"');
            os.write(disposition.toString().getBytes(StandardCharsets.ISO_8859_1));
            os.write(crlf);
            String partContentType = part.getContentType();
            if (partContentType != null && !partContentType.isBlank()) {
                os.write(("Content-Type: " + partContentType).getBytes(StandardCharsets.ISO_8859_1));
                os.write(crlf);
            }
            os.write(crlf);
            part.getInputStream().transferTo(os);
            os.write(crlf);
        }
        os.write(dashes);
        os.write(boundary.getBytes(StandardCharsets.ISO_8859_1));
        os.write(dashes);
        os.write(crlf);
        return os.toByteArray();
    }

    private String extractMultipartBoundary(String contentType) {
        for (String segment : contentType.split(";")) {
            String trimmed = segment.trim();
            if (trimmed.toLowerCase(Locale.ROOT).startsWith("boundary=")) {
                return trimmed.substring("boundary=".length());
            }
        }
        throw new IllegalArgumentException("multipart Content-Type missing boundary");
    }
}
