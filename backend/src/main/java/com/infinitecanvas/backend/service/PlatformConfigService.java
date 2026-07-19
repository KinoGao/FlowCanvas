package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.entity.PlatformConfigEntity;
import com.infinitecanvas.backend.repository.PlatformConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PlatformConfigService {
    private static final Set<String> CATEGORIES = Set.of("text", "image", "video");
    private static final Set<String> TEXT_MODES = Set.of("text", "vision");
    private static final Set<String> IMAGE_MODES = Set.of("text-to-image", "image-to-image", "image-edit");
    private static final Set<String> IMAGE_QUALITIES = Set.of("low", "standard", "high");
    private static final Set<String> IMAGE_RESOLUTIONS = Set.of("1k", "2k", "4k");
    private static final Set<String> IMAGE_RATIOS = Set.of("1:1", "3:4", "4:5", "1:2", "4:3", "21:9", "2:1", "3:2", "9:21", "9:16", "2:3", "16:9", "5:4");
    private static final Set<String> VIDEO_MODES = Set.of("text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame", "image-reference", "multi-frame");
    private final PlatformConfigRepository repository;
    private final ObjectMapper objectMapper;
    private final ModelCapabilitiesProperties defaults;
    private final VolcengineModelCapabilityCatalog officialCapabilityCatalog;
    private final String configuredComfyUrl;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    public PlatformConfigService(
            PlatformConfigRepository repository,
            ObjectMapper objectMapper,
            ModelCapabilitiesProperties defaults,
            VolcengineModelCapabilityCatalog officialCapabilityCatalog,
            @Value("${app.comfyui-base-url:}") String configuredComfyUrl
    ) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.defaults = defaults;
        this.officialCapabilityCatalog = officialCapabilityCatalog;
        this.configuredComfyUrl = configuredComfyUrl == null ? "" : configuredComfyUrl.trim();
    }

    public PlatformConfigDocument getAdminConfig() {
        return repository.findById(1L).map(entity -> {
            PlatformConfigDocument document = read(entity);
            if (officialCapabilityCatalog.reconcileConfirmedModels(document)) {
                normalizeAndValidate(document);
                persist(entity, document);
            }
            return document;
        }).orElseGet(this::defaultDocument);
    }

    @Transactional
    public PlatformConfigDocument save(PlatformConfigDocument document) {
        normalizeAndValidate(document);
        PlatformConfigEntity entity = repository.findById(1L).orElseGet(PlatformConfigEntity::new);
        persist(entity, document);
        return document;
    }

    private void persist(PlatformConfigEntity entity, PlatformConfigDocument document) {
        try {
            entity.setData(objectMapper.writeValueAsString(document));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("平台配置无法序列化", e);
        }
        entity.setUpdatedAt(Instant.now());
        repository.save(entity);
    }

    public RuntimeConfigResponse runtimeConfig() {
        PlatformConfigDocument document = getAdminConfig();
        Map<String, PlatformConfigDocument.Provider> providers = document.getProviders().stream()
                .filter(PlatformConfigDocument.Provider::isEnabled)
                .filter(item -> !blank(item.getBaseUrl()) && !blank(item.getApiKey()))
                .collect(Collectors.toMap(PlatformConfigDocument.Provider::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Map<String, List<RuntimeConfigResponse.Model>> groupedModels = new LinkedHashMap<>();
        document.getModels().stream()
                .filter(PlatformConfigDocument.Model::isEnabled)
                .filter(PlatformConfigDocument.Model::isPublished)
                .filter(item -> providers.containsKey(item.getProviderId()))
                .forEach(item -> groupedModels.computeIfAbsent(item.getProviderId(), ignored -> new ArrayList<>()).add(toRuntimeModel(item)));
        List<RuntimeConfigResponse.Provider> runtimeProviders = providers.values().stream()
                .filter(provider -> !groupedModels.getOrDefault(provider.getId(), List.of()).isEmpty())
                .map(provider -> new RuntimeConfigResponse.Provider(
                        provider.getId(), provider.getName(), "/api/model-runtime/models",
                        provider.getApiFormat(), groupedModels.get(provider.getId())
                ))
                .toList();
        PlatformConfigDocument.ComfyUi comfy = document.getComfyui();
        return new RuntimeConfigResponse(runtimeProviders, new RuntimeConfigResponse.ComfyUi(
                comfy.isEnabled(), comfy.getClientId(), comfy.getDefaultWorkflowId(), comfy.getTimeoutSeconds(), comfy.getPollIntervalMs()
        ));
    }

    public PlatformConfigDocument.Provider requireRuntimeProvider(String providerId) {
        return getAdminConfig().getProviders().stream()
                .filter(item -> item.isEnabled() && item.getId().equals(providerId))
                .filter(item -> !blank(item.getBaseUrl()) && !blank(item.getApiKey()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("模型厂商未启用或配置不完整: " + providerId));
    }

    public RuntimeModel requireRuntimeModel(String modelId) {
        PlatformConfigDocument.Model model = getAdminConfig().getModels().stream()
                .filter(item -> item.isEnabled() && item.isPublished() && item.getId().equals(modelId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Model is disabled or unpublished: " + modelId));
        return new RuntimeModel(requireRuntimeProvider(model.getProviderId()), model);
    }

    public List<String> discoverModels(String providerId) {
        PlatformConfigDocument.Provider provider = getAdminConfig().getProviders().stream()
                .filter(item -> item.getId().equals(providerId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Provider does not exist: " + providerId));
        if (blank(provider.getBaseUrl()) || blank(provider.getApiKey())) {
            throw new IllegalArgumentException("厂商未配置接口地址或 API Key");
        }
        boolean gemini = "gemini".equalsIgnoreCase(provider.getApiFormat());
        String defaultPath = gemini ? "/v1beta/models" : "/models";
        String modelsPath = blank(provider.getModelsPath()) ? defaultPath : provider.getModelsPath();
        URI target = URI.create(joinUrl(provider.getBaseUrl(), modelsPath));
        HttpRequest.Builder request = HttpRequest.newBuilder(target).timeout(Duration.ofSeconds(60))
                .header("Accept", "application/json");
        if (gemini) request.header("x-goog-api-key", provider.getApiKey());
        else request.header("Authorization", "Bearer " + provider.getApiKey());
        try {
            HttpResponse<String> response = httpClient.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("模型列表请求失败: HTTP " + response.statusCode());
            }
            var root = objectMapper.readTree(response.body());
            var data = root.isArray() ? root : root.path(gemini ? "models" : "data");
            if (!data.isArray()) {
                throw new IllegalArgumentException(gemini ? "Gemini 模型列表响应缺少 models 数组" : "OpenAI 模型列表响应缺少 data 数组");
            }
            List<String> result = new ArrayList<>();
            data.forEach(item -> {
                String id = item.isTextual() ? item.asText() : item.path(gemini ? "name" : "id").asText("");
                if (gemini && id.startsWith("models/")) id = id.substring("models/".length());
                if (!id.isBlank() && !result.contains(id)) result.add(id);
            });
            return result;
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("模型列表请求失败: " + error.getMessage(), error);
        }
    }

    public String comfyBaseUrl() {
        PlatformConfigDocument.ComfyUi comfy = getAdminConfig().getComfyui();
        if (comfy.isEnabled() && !blank(comfy.getBaseUrl())) return comfy.getBaseUrl().trim();
        return configuredComfyUrl;
    }

    public List<PlatformConfigDocument.Model> publishedImageModels() {
        return publishedModels("image");
    }

    public List<PlatformConfigDocument.Model> publishedVideoModels() {
        return publishedModels("video");
    }

    private List<PlatformConfigDocument.Model> publishedModels(String category) {
        PlatformConfigDocument document = getAdminConfig();
        Set<String> runtimeProviderIds = document.getProviders().stream()
                .filter(PlatformConfigDocument.Provider::isEnabled)
                .filter(item -> !blank(item.getBaseUrl()) && !blank(item.getApiKey()))
                .map(PlatformConfigDocument.Provider::getId)
                .collect(Collectors.toSet());
        return document.getModels().stream()
                .filter(PlatformConfigDocument.Model::isEnabled)
                .filter(PlatformConfigDocument.Model::isPublished)
                .filter(item -> category.equals(item.getCategory()))
                .filter(item -> runtimeProviderIds.contains(item.getProviderId()))
                .toList();
    }

    private PlatformConfigDocument read(PlatformConfigEntity entity) {
        try {
            PlatformConfigDocument document = objectMapper.readValue(entity.getData(), PlatformConfigDocument.class);
            migrateLegacyCapabilities(document);
            document.getModels().forEach(officialCapabilityCatalog::applyOfficialTemplate);
            return document;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("平台配置解析失败", e);
        }
    }

    private PlatformConfigDocument defaultDocument() {
        PlatformConfigDocument document = new PlatformConfigDocument();
        document.getComfyui().setEnabled(!configuredComfyUrl.isBlank());
        if (!configuredComfyUrl.isBlank()) document.getComfyui().setBaseUrl(configuredComfyUrl);
        Map<String, PlatformConfigDocument.Provider> providers = new LinkedHashMap<>();
        for (ModelCapabilitiesProperties.Video source : defaults.getVideo()) {
            providers.computeIfAbsent(source.getProvider(), providerId -> {
                PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
                provider.setId(providerId);
                provider.setName(providerId);
                provider.setEnabled(false);
                return provider;
            });
            PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
            model.setId(source.getId());
            model.setProviderId(source.getProvider());
            model.setDisplayName(source.getId());
            model.setRequestModel(source.getModelPatterns().isEmpty() ? source.getId() : source.getModelPatterns().getFirst().replace("*", ""));
            model.setCategory("video");
            model.setRequestAdapter(source.getRequestAdapter());
            model.setModelPatterns(List.copyOf(source.getModelPatterns()));
            PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
            capabilities.setModes(List.copyOf(source.getModes()));
            capabilities.setRatios(List.copyOf(source.getRatios()));
            capabilities.setResolutions(List.copyOf(source.getResolutions()));
            capabilities.setDurations(List.copyOf(source.getDurations()));
            capabilities.setFrameRates(List.copyOf(source.getFrameRates()));
            capabilities.setCounts(List.copyOf(source.getCounts()));
            capabilities.setGenerateAudio(source.isGenerateAudio());
            capabilities.setWatermark(source.isWatermark());
            capabilities.setDraft(source.isDraft());
            capabilities.setMaxImages(source.getMaxImages());
            capabilities.setMaxVideos(source.getMaxVideos());
            capabilities.setMaxAudios(source.getMaxAudios());
            model.setVideoCapabilities(capabilities);
            document.getModels().add(model);
        }
        document.setProviders(new ArrayList<>(providers.values()));
        return document;
    }

    private void normalizeAndValidate(PlatformConfigDocument document) {
        if (document == null) throw new IllegalArgumentException("平台配置不能为空");
        document.setProviders(document.getProviders());
        document.setModels(document.getModels());
        document.setComfyui(document.getComfyui());
        Set<String> providerIds = document.getProviders().stream().map(provider -> {
            provider.setId(cleanId(provider.getId(), "厂商 ID"));
            provider.setName(required(provider.getName(), "厂商名称"));
            provider.setBaseUrl(normalizeBaseUrl(provider.getBaseUrl(), "厂商地址"));
            provider.setApiKey(provider.getApiKey() == null ? "" : provider.getApiKey().trim());
            provider.setApiFormat("gemini".equals(provider.getApiFormat()) ? "gemini" : "openai");
            String defaultModelsPath = "gemini".equals(provider.getApiFormat()) ? "/v1beta/models" : "/models";
            String modelsPath = blank(provider.getModelsPath()) ? defaultModelsPath : provider.getModelsPath().trim();
            provider.setModelsPath(modelsPath.startsWith("/") ? modelsPath : "/" + modelsPath);
            return provider.getId();
        }).collect(Collectors.toSet());
        if (providerIds.size() != document.getProviders().size()) throw new IllegalArgumentException("厂商 ID 不能重复");
        Set<String> modelIds = document.getModels().stream().map(model -> {
            model.setId(cleanId(model.getId(), "模型 ID"));
            model.setProviderId(cleanId(model.getProviderId(), "模型厂商 ID"));
            if (!providerIds.contains(model.getProviderId())) throw new IllegalArgumentException("模型引用了不存在的厂商: " + model.getProviderId());
            model.setDisplayName(required(model.getDisplayName(), "模型显示名称"));
            model.setRequestModel(required(model.getRequestModel(), "实际请求模型名称"));
            model.setCategory(CATEGORIES.contains(model.getCategory()) ? model.getCategory() : "image");
            model.setRequestAdapter(blank(model.getRequestAdapter()) ? "openai" : model.getRequestAdapter().trim());
            model.setModelPatterns(cleanStrings(model.getModelPatterns()));
            officialCapabilityCatalog.applyOfficialTemplate(model);
            normalizeCapabilities(model);
            return model.getId();
        }).collect(Collectors.toSet());
        if (modelIds.size() != document.getModels().size()) throw new IllegalArgumentException("模型 ID 不能重复");
        PlatformConfigDocument.ComfyUi comfy = document.getComfyui();
        comfy.setBaseUrl(normalizeBaseUrl(comfy.getBaseUrl(), "ComfyUI 地址"));
        comfy.setClientId(blank(comfy.getClientId()) ? "flow-canvas" : comfy.getClientId().trim());
        comfy.setTimeoutSeconds(Math.max(10, comfy.getTimeoutSeconds()));
        comfy.setPollIntervalMs(Math.max(500, comfy.getPollIntervalMs()));
    }

    private RuntimeConfigResponse.Model toRuntimeModel(PlatformConfigDocument.Model item) {
        PlatformConfigDocument.TextCapabilities text = item.getTextCapabilities();
        PlatformConfigDocument.ImageCapabilities image = item.getImageCapabilities();
        PlatformConfigDocument.VideoCapabilities video = item.getVideoCapabilities();
        return new RuntimeConfigResponse.Model(
                item.getId(), item.getDisplayName(), item.getCategory(), item.getRequestAdapter(),
                List.of(item.getId()),
                text == null ? null : new RuntimeConfigResponse.TextCapabilities(List.copyOf(text.getModes())),
                image == null ? null : new RuntimeConfigResponse.ImageCapabilities(
                        List.copyOf(image.getModes()), List.copyOf(image.getQualities()), List.copyOf(image.getResolutions()),
                        List.copyOf(image.getRatios()), List.copyOf(image.getCounts()), image.getMaxImages(),
                        image.getMaxOutputs(), image.getMaxTotalImages(), image.isSequentialImageGeneration(),
                        image.isWatermark(), image.getDocumentationUrl(), image.getOfficialTemplate()
                ),
                video == null ? null : new RuntimeConfigResponse.VideoCapabilities(
                        List.copyOf(video.getModes()), List.copyOf(video.getRatios()), List.copyOf(video.getResolutions()),
                        List.copyOf(video.getDurations()), List.copyOf(video.getFrameRates()), List.copyOf(video.getCounts()), video.isGenerateAudio(),
                        video.isWatermark(), video.isDraft(), video.getMaxImages(), video.getMaxVideos(), video.getMaxAudios()
                )
        );
    }

    private void migrateLegacyCapabilities(PlatformConfigDocument document) {
        document.setProviders(document.getProviders());
        document.setModels(document.getModels());
        document.setComfyui(document.getComfyui());
        document.getModels().forEach(model -> {
            if ("text".equals(model.getCategory()) && model.getTextCapabilities() == null) {
                PlatformConfigDocument.TextCapabilities capabilities = new PlatformConfigDocument.TextCapabilities();
                capabilities.setModes(model.legacyModes().isEmpty() ? List.of("text") : model.legacyModes());
                model.setTextCapabilities(capabilities);
            } else if ("image".equals(model.getCategory()) && model.getImageCapabilities() == null) {
                PlatformConfigDocument.ImageCapabilities capabilities = new PlatformConfigDocument.ImageCapabilities();
                capabilities.setModes(model.legacyModes());
                capabilities.setResolutions(model.legacyResolutions().stream().map(String::toLowerCase).toList());
                capabilities.setRatios(model.legacyRatios());
                capabilities.setCounts(model.legacyCounts());
                model.setImageCapabilities(capabilities);
            } else if ("video".equals(model.getCategory()) && model.getVideoCapabilities() == null) {
                PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
                capabilities.setModes(model.legacyModes());
                capabilities.setRatios(model.legacyRatios());
                capabilities.setResolutions(model.legacyResolutions());
                capabilities.setDurations(model.legacyDurations());
                capabilities.setCounts(model.legacyCounts());
                capabilities.setGenerateAudio(model.legacyGenerateAudio());
                capabilities.setWatermark(model.legacyWatermark());
                capabilities.setDraft(model.legacyDraft());
                capabilities.setMaxImages(model.legacyMaxImages());
                capabilities.setMaxVideos(model.legacyMaxVideos());
                capabilities.setMaxAudios(model.legacyMaxAudios());
                model.setVideoCapabilities(capabilities);
            }
        });
    }

    private void normalizeCapabilities(PlatformConfigDocument.Model model) {
        switch (model.getCategory()) {
            case "text" -> {
                PlatformConfigDocument.TextCapabilities capabilities = model.getTextCapabilities() == null ? new PlatformConfigDocument.TextCapabilities() : model.getTextCapabilities();
                capabilities.setModes(cleanAllowedStrings(capabilities.getModes(), TEXT_MODES));
                if (model.isPublished() && capabilities.getModes().isEmpty()) throw new IllegalArgumentException("已发布的文本模型必须至少配置纯文本或识图能力: " + model.getId());
                model.setTextCapabilities(capabilities);
                model.setImageCapabilities(null);
                model.setVideoCapabilities(null);
            }
            case "image" -> {
                PlatformConfigDocument.ImageCapabilities capabilities = model.getImageCapabilities() == null ? new PlatformConfigDocument.ImageCapabilities() : model.getImageCapabilities();
                capabilities.setModes(cleanAllowedStrings(capabilities.getModes(), IMAGE_MODES));
                capabilities.setQualities(cleanAllowedStrings(capabilities.getQualities(), IMAGE_QUALITIES));
                capabilities.setResolutions(cleanAllowedStringsLowercase(capabilities.getResolutions(), IMAGE_RESOLUTIONS));
                capabilities.setRatios(cleanAllowedStrings(capabilities.getRatios(), IMAGE_RATIOS));
                capabilities.setCounts(positiveIntegers(capabilities.getCounts()));
                capabilities.setMaxImages(Math.max(0, capabilities.getMaxImages()));
                capabilities.setMaxOutputs(Math.max(0, capabilities.getMaxOutputs()));
                capabilities.setMaxTotalImages(Math.max(0, capabilities.getMaxTotalImages()));
                capabilities.setDocumentationUrl(cleanOptional(capabilities.getDocumentationUrl()));
                capabilities.setOfficialTemplate(cleanOptional(capabilities.getOfficialTemplate()));
                normalizeImageCapabilityLimits(capabilities);
                if (model.isPublished() && capabilities.getModes().isEmpty()) throw new IllegalArgumentException("已发布的图像模型必须至少配置一种生成能力: " + model.getId());
                model.setTextCapabilities(null);
                model.setImageCapabilities(capabilities);
                model.setVideoCapabilities(null);
            }
            case "video" -> {
                PlatformConfigDocument.VideoCapabilities capabilities = model.getVideoCapabilities() == null ? new PlatformConfigDocument.VideoCapabilities() : model.getVideoCapabilities();
                capabilities.setModes(cleanAllowedStrings(capabilities.getModes(), VIDEO_MODES));
                capabilities.setRatios(cleanStrings(capabilities.getRatios()));
                capabilities.setResolutions(cleanStrings(capabilities.getResolutions()));
                capabilities.setDurations(positiveIntegers(capabilities.getDurations()));
                capabilities.setFrameRates(positiveIntegers(capabilities.getFrameRates()));
                capabilities.setCounts(positiveIntegers(capabilities.getCounts()));
                capabilities.setMaxImages(Math.max(0, capabilities.getMaxImages()));
                capabilities.setMaxVideos(Math.max(0, capabilities.getMaxVideos()));
                capabilities.setMaxAudios(Math.max(0, capabilities.getMaxAudios()));
                if (model.isPublished() && capabilities.getModes().isEmpty()) throw new IllegalArgumentException("已发布的视频模型必须至少配置一种生成能力: " + model.getId());
                validateVideoCapabilityLimits(model.getId(), capabilities);
                model.setTextCapabilities(null);
                model.setImageCapabilities(null);
                model.setVideoCapabilities(capabilities);
            }
            default -> throw new IllegalArgumentException("不支持的模型分类: " + model.getCategory());
        }
    }

    private void normalizeImageCapabilityLimits(PlatformConfigDocument.ImageCapabilities capabilities) {
        int configuredMax = capabilities.getCounts().stream().mapToInt(Integer::intValue).max().orElse(0);
        if (capabilities.getMaxOutputs() == 0 && configuredMax > 0) capabilities.setMaxOutputs(configuredMax);
        if (capabilities.getMaxTotalImages() > 0) {
            capabilities.setMaxOutputs(Math.min(capabilities.getMaxOutputs(), capabilities.getMaxTotalImages()));
            capabilities.setMaxImages(Math.min(capabilities.getMaxImages(), Math.max(0, capabilities.getMaxTotalImages() - 1)));
        }
        int outputLimit = capabilities.getMaxOutputs();
        int totalLimit = capabilities.getMaxTotalImages();
        capabilities.setCounts(capabilities.getCounts().stream()
                .filter(count -> outputLimit == 0 || count <= outputLimit)
                .filter(count -> totalLimit == 0 || count <= totalLimit)
                .toList());
    }

    private void validateVideoCapabilityLimits(String modelId, PlatformConfigDocument.VideoCapabilities capabilities) {
        Set<String> modes = Set.copyOf(capabilities.getModes());
        if ((modes.contains("image-to-video") || modes.contains("image-reference")) && capabilities.getMaxImages() < 1) {
            throw new IllegalArgumentException("视频模型启用图生视频或图片参考时，最多参考图片必须至少为 1: " + modelId);
        }
        if (modes.contains("first-last-frame") && capabilities.getMaxImages() < 2) {
            throw new IllegalArgumentException("视频模型启用首尾帧时，最多参考图片必须至少为 2: " + modelId);
        }
        if (modes.contains("multi-frame") && capabilities.getMaxImages() < 2) {
            throw new IllegalArgumentException("视频模型启用智能多帧时，最多参考图片必须至少为 2: " + modelId);
        }
        if (modes.contains("all-in-one-reference")
                && capabilities.getMaxImages() + capabilities.getMaxVideos() + capabilities.getMaxAudios() < 1) {
            throw new IllegalArgumentException("视频模型启用全能参考时，必须至少允许一种参考媒体: " + modelId);
        }
    }

    private String cleanId(String value, String label) {
        String id = required(value, label).toLowerCase();
        if (!id.matches("[a-z0-9][a-z0-9._-]*")) throw new IllegalArgumentException(label + " 只能包含小写字母、数字、点、下划线和短横线");
        return id;
    }

    private String joinUrl(String baseUrl, String path) {
        String normalizedBase = baseUrl.replaceAll("/+$", "");
        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        if (normalizedBase.endsWith("/v1beta") && normalizedPath.startsWith("/v1beta/")) {
            normalizedPath = normalizedPath.substring("/v1beta".length());
        }
        if (normalizedBase.endsWith("/v1") && normalizedPath.startsWith("/v1/")) {
            normalizedPath = normalizedPath.substring("/v1".length());
        }
        return normalizedBase + normalizedPath;
    }

    private String normalizeBaseUrl(String value, String label) {
        if (blank(value)) return "";
        URI uri;
        try { uri = URI.create(value.trim()); } catch (IllegalArgumentException e) { throw new IllegalArgumentException(label + " 无效"); }
        if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) throw new IllegalArgumentException(label + " 只支持 http/https");
        return value.trim().replaceAll("/+$", "");
    }

    private String required(String value, String label) {
        if (blank(value)) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }

    private String cleanOptional(String value) {
        return value == null ? "" : value.trim();
    }

    private List<String> cleanStrings(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank()).map(String::trim).distinct().toList();
    }

    private List<Integer> positiveIntegers(List<Integer> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && value > 0).distinct().sorted().toList();
    }

    private List<String> cleanAllowedStrings(List<String> values, Set<String> allowed) {
        return cleanStrings(values).stream().filter(allowed::contains).toList();
    }

    private List<String> cleanAllowedStringsLowercase(List<String> values, Set<String> allowed) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank()).map(value -> value.trim().toLowerCase())
                .filter(allowed::contains).distinct().toList();
    }

    private List<Integer> allowedIntegers(List<Integer> values, Set<Integer> allowed) {
        return positiveIntegers(values).stream().filter(allowed::contains).toList();
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }

    public record RuntimeModel(PlatformConfigDocument.Provider provider, PlatformConfigDocument.Model model) {}
}
