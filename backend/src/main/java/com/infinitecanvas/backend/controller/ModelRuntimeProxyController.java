package com.infinitecanvas.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.service.PlatformConfigService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

@RestController
@RequestMapping("/api/model-runtime/models")
public class ModelRuntimeProxyController {
    private static final Duration TIMEOUT = Duration.ofMinutes(20);
    private static final Set<String> HOP_HEADERS = Set.of("connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "trailers", "transfer-encoding", "upgrade", "content-encoding", "content-length");
    private final PlatformConfigService configService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).followRedirects(HttpClient.Redirect.NORMAL).build();

    public ModelRuntimeProxyController(PlatformConfigService configService, ObjectMapper objectMapper) {
        this.configService = configService;
        this.objectMapper = objectMapper;
    }

    @RequestMapping("/{modelId}/**")
    public ResponseEntity<?> proxy(HttpServletRequest request) throws IOException, InterruptedException {
        String modelId = pathModelId(request);
        PlatformConfigService.RuntimeModel runtime;
        try {
            runtime = configService.requireRuntimeModel(modelId);
        } catch (IllegalArgumentException error) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error.getMessage());
        }

        String prefix = "/api/model-runtime/models/" + modelId;
        String suffix = request.getRequestURI().substring(prefix.length());
        try {
            validateEndpointCategory(suffix, runtime.model().getCategory());
        } catch (IllegalArgumentException error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }
        boolean gemini = "gemini".equalsIgnoreCase(runtime.provider().getApiFormat());
        String targetSuffix = gemini ? rewriteGeminiModelPath(suffix, runtime.model().getRequestModel()) : suffix;
        String query = request.getQueryString();
        URI target = URI.create(joinUrl(runtime.provider().getBaseUrl(), targetSuffix) + (query == null ? "" : "?" + query));
        byte[] body = ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod())) ? new byte[0] : request.getInputStream().readAllBytes();
        String contentType = request.getContentType();
        try {
            if (body.length > 0 && contentType != null && contentType.toLowerCase(Locale.ROOT).contains("application/json")) {
                body = validateAndRewriteJson(body, suffix, runtime.model(), gemini);
            } else if (body.length > 0 && contentType != null && contentType.toLowerCase(Locale.ROOT).contains("multipart/form-data")) {
                body = validateAndRewriteMultipart(body, suffix, runtime.model());
            }
        } catch (IllegalArgumentException error) {
            return ResponseEntity.badRequest().body(error.getMessage());
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder(target).timeout(TIMEOUT);
        if (gemini) builder.header("x-goog-api-key", runtime.provider().getApiKey());
        else builder.header("Authorization", "Bearer " + runtime.provider().getApiKey());
        copyHeader(request, builder, "Content-Type");
        copyHeader(request, builder, "Accept");
        builder.method(request.getMethod(), body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        try {
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
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(error.getMessage());
        }
    }

    private byte[] validateAndRewriteJson(byte[] body, String path, PlatformConfigDocument.Model model, boolean gemini) {
        try {
            JsonNode parsed = objectMapper.readTree(body);
            if (!(parsed instanceof ObjectNode json)) throw new IllegalArgumentException("请求体必须是 JSON 对象");
            switch (model.getCategory()) {
                case "text" -> validateText(json, model.getTextCapabilities());
                case "image" -> validateImage(json, path, model.getImageCapabilities());
                case "video" -> validateVideo(json, model.getVideoCapabilities());
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

    private byte[] validateAndRewriteMultipart(byte[] body, String path, PlatformConfigDocument.Model model) {
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
            int references = multipartFileCount(payload, "input_reference");
            String mode = references > 0 ? "image-to-video" : "text-to-video";
            validateRequiredMode(mode, model.getVideoCapabilities() == null ? null : model.getVideoCapabilities().getModes(), "视频生成模式");
            validateMultipartInteger(payload, "seconds", model.getVideoCapabilities().getDurations(), "时长");
            validateMultipartString(payload, "resolution_name", model.getVideoCapabilities().getResolutions(), "分辨率");
            validateReferenceLimit(references, model.getVideoCapabilities().getMaxImages(), "参考图片");
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

    private void validateEndpointCategory(String path, String category) {
        String endpointCategory = endpointCategory(path);
        if (endpointCategory != null && !endpointCategory.equals(category)) {
            throw new IllegalArgumentException("当前模型分类为 " + category + "，不能调用 " + endpointCategory + " 接口");
        }
    }

    private String endpointCategory(String path) {
        String value = path.toLowerCase(Locale.ROOT);
        if (value.contains("/images/")) return "image";
        if (value.equals("/videos") || value.contains("/videos/") || value.contains("/video/")) return "video";
        if (value.contains("/chat/completions") || value.contains("/responses") || value.contains("/completions")) return "text";
        return null;
    }

    private String explicitMode(ObjectNode json) {
        JsonNode value = first(json, List.of("_flowcanvas_mode", "mode", "task_type", "generation_type"));
        return value != null && value.isTextual() && !value.asText().isBlank() ? value.asText() : null;
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

    private void validateReferenceLimit(int count, int max, String label) {
        if (max >= 0 && count > max) throw new IllegalArgumentException(label + "数量超过当前模型上限: " + max);
    }

    private void validateString(ObjectNode json, List<String> keys, List<String> allowed, String label) {
        if (allowed == null || allowed.isEmpty()) return;
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

    private String pathModelId(HttpServletRequest request) {
        String prefix = "/api/model-runtime/models/";
        String rest = request.getRequestURI().substring(prefix.length());
        int slash = rest.indexOf('/');
        return slash < 0 ? rest : rest.substring(0, slash);
    }

    private void copyHeader(HttpServletRequest request, HttpRequest.Builder builder, String name) {
        String value = request.getHeader(name);
        if (value != null && !value.isBlank()) builder.header(name, value);
    }
}
