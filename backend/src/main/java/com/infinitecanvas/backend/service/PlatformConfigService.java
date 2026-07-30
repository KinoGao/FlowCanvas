package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.entity.PlatformConfigEntity;
import com.infinitecanvas.backend.repository.PlatformConfigRepository;
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PlatformConfigService {
    private static final Set<String> CATEGORIES = Set.of("text", "image", "video", "audio");
    private static final Set<String> TEXT_MODES = Set.of("text", "vision");
    private static final Set<String> IMAGE_MODES = Set.of("text-to-image", "image-to-image", "image-edit");
    private static final Set<String> IMAGE_QUALITIES = Set.of("low", "standard", "high");
    private static final Set<String> IMAGE_RESOLUTIONS = Set.of("1k", "2k", "3k", "4k");
    private static final Set<String> IMAGE_RATIOS = Set.of("1:1", "3:4", "4:5", "1:2", "4:3", "21:9", "2:1", "3:2", "9:21", "9:16", "2:3", "16:9", "5:4");
    private static final Set<String> VIDEO_MODES = Set.of("text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame", "image-reference", "multi-frame");
    private static final Set<String> AUDIO_MODES = Set.of("text-to-speech");
    private static final String VERIFICATION_UNVERIFIED = "unverified";
    private static final String VERIFICATION_VERIFIED = "verified";
    private static final String VERIFICATION_FAILED = "failed";
    private final PlatformConfigRepository repository;
    private final ObjectMapper objectMapper;
    private final String configuredComfyUrl;
    private final ModelCapabilityTemplateResolver capabilityTemplateResolver;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build();

    @Autowired
    public PlatformConfigService(
            PlatformConfigRepository repository,
            ObjectMapper objectMapper,
            @Value("${app.comfyui-base-url:}") String configuredComfyUrl,
            ModelCapabilityTemplateResolver capabilityTemplateResolver
    ) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.configuredComfyUrl = configuredComfyUrl == null ? "" : configuredComfyUrl.trim();
        this.capabilityTemplateResolver = capabilityTemplateResolver;
    }

    public PlatformConfigService(
            PlatformConfigRepository repository,
            ObjectMapper objectMapper,
            String configuredComfyUrl
    ) {
        this(repository, objectMapper, configuredComfyUrl,
                new ModelCapabilityTemplateResolver(new com.infinitecanvas.backend.config.ModelCapabilitiesProperties()));
    }

    public PlatformConfigDocument getAdminConfig() {
        return repository.findById(1L).map(this::read).orElseGet(this::defaultDocument);
    }

    @Transactional
    public PlatformConfigDocument save(PlatformConfigDocument document) {
        Optional<PlatformConfigEntity> existingEntity = repository.findById(1L);
        PlatformConfigDocument existing = existingEntity.map(this::read).orElse(null);
        if (existing != null) normalizeAndValidate(existing);
        normalizeAndValidate(document);
        preserveVerification(existing, document);
        validatePublishedModels(document);
        PlatformConfigEntity entity = existingEntity.orElseGet(PlatformConfigEntity::new);
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
                .filter(this::isVerified)
                .filter(item -> providers.containsKey(item.getProviderId()))
                .forEach(item -> groupedModels
                        .computeIfAbsent(item.getProviderId(), ignored -> new ArrayList<>())
                        .add(toRuntimeModel(providers.get(item.getProviderId()), item)));
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
                .filter(item -> item.isEnabled() && item.isPublished() && isVerified(item) && item.getId().equals(modelId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Model is disabled or unpublished: " + modelId));
        PlatformConfigDocument.Provider provider = requireRuntimeProvider(model.getProviderId());
        model.setRequestAdapter(effectiveRequestAdapter(provider, model));
        return new RuntimeModel(provider, model);
    }

    public List<String> discoverModels(String providerId) {
        PlatformConfigDocument.Provider provider = getAdminConfig().getProviders().stream()
                .filter(item -> item.getId().equals(providerId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Provider does not exist: " + providerId));
        return discoverModels(provider);
    }

    private List<String> discoverModels(PlatformConfigDocument.Provider provider) {
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

    @Transactional
    public PlatformConfigDocument verifyModel(String modelId) {
        PlatformConfigDocument document = getAdminConfig();
        normalizeAndValidate(document);
        PlatformConfigDocument.Model model = document.getModels().stream()
                .filter(item -> item.getId().equals(modelId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("模型不存在: " + modelId));
        PlatformConfigDocument.Provider provider = document.getProviders().stream()
                .filter(item -> item.getId().equals(model.getProviderId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("模型厂商不存在: " + model.getProviderId()));

        boolean keepPublished = isVerified(model) && model.isPublished();
        String failure = null;
        try {
            if (!discoverModels(provider).contains(model.getRequestModel())) {
                failure = "厂商模型接口未返回实际请求模型: " + model.getRequestModel();
            }
        } catch (IllegalArgumentException error) {
            failure = error.getMessage();
        }

        if (failure == null) {
            model.setVerificationStatus(VERIFICATION_VERIFIED);
            model.setVerifiedAt(Instant.now().toString());
            model.setVerificationMessage("厂商认证通过，模型存在");
            model.setPublished(keepPublished);
        } else {
            model.setVerificationStatus(VERIFICATION_FAILED);
            model.setVerifiedAt("");
            model.setVerificationMessage(failure);
            model.setPublished(false);
        }
        document.getModels().stream().filter(item -> !isVerified(item)).forEach(item -> item.setPublished(false));
        PlatformConfigEntity entity = repository.findById(1L).orElseGet(PlatformConfigEntity::new);
        persist(entity, document);
        return document;
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

    public List<PlatformConfigDocument.Model> publishedAudioModels() {
        return publishedModels("audio");
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
                .filter(this::isVerified)
                .filter(item -> category.equals(item.getCategory()))
                .filter(item -> runtimeProviderIds.contains(item.getProviderId()))
                .toList();
    }

    private PlatformConfigDocument read(PlatformConfigEntity entity) {
        try {
            PlatformConfigDocument document = objectMapper.readValue(entity.getData(), PlatformConfigDocument.class);
            migrateLegacyCapabilities(document);
            applyOfficialCapabilityTemplates(document);
            return document;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("平台配置解析失败", e);
        }
    }

    private PlatformConfigDocument defaultDocument() {
        PlatformConfigDocument document = new PlatformConfigDocument();
        document.getComfyui().setEnabled(!configuredComfyUrl.isBlank());
        if (!configuredComfyUrl.isBlank()) document.getComfyui().setBaseUrl(configuredComfyUrl);
        return document;
    }

    private void preserveVerification(PlatformConfigDocument existing, PlatformConfigDocument incoming) {
        Map<String, PlatformConfigDocument.Model> existingModels = existing == null ? Map.of() : existing.getModels().stream()
                .collect(Collectors.toMap(PlatformConfigDocument.Model::getId, Function.identity()));
        for (PlatformConfigDocument.Model model : incoming.getModels()) {
            PlatformConfigDocument.Model previous = existingModels.get(model.getId());
            if (previous != null && verificationFingerprint(existing, previous).equals(verificationFingerprint(incoming, model))) {
                model.setVerificationStatus(previous.getVerificationStatus());
                model.setVerifiedAt(previous.getVerifiedAt());
                model.setVerificationMessage(previous.getVerificationMessage());
            } else {
                clearVerification(model);
            }
        }
    }

    private String verificationFingerprint(PlatformConfigDocument document, PlatformConfigDocument.Model model) {
        PlatformConfigDocument.Provider provider = document.getProviders().stream()
                .filter(item -> item.getId().equals(model.getProviderId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("模型厂商不存在: " + model.getProviderId()));
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("providerId", provider.getId());
        values.put("providerBaseUrl", provider.getBaseUrl());
        values.put("providerApiKey", provider.getApiKey());
        values.put("providerApiFormat", provider.getApiFormat());
        values.put("providerModelsPath", provider.getModelsPath());
        values.put("requestModel", model.getRequestModel());
        values.put("category", model.getCategory());
        values.put("requestAdapter", model.getRequestAdapter());
        values.put("modelPatterns", model.getModelPatterns());
        values.put("textCapabilities", model.getTextCapabilities());
        values.put("imageCapabilities", model.getImageCapabilities());
        values.put("videoCapabilities", model.getVideoCapabilities());
        values.put("audioCapabilities", model.getAudioCapabilities());
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("模型验证配置无法序列化", error);
        }
    }

    private void clearVerification(PlatformConfigDocument.Model model) {
        model.setVerificationStatus(VERIFICATION_UNVERIFIED);
        model.setVerifiedAt("");
        model.setVerificationMessage("配置已变更，需要重新验证");
        model.setPublished(false);
    }

    private void validatePublishedModels(PlatformConfigDocument document) {
        document.getModels().stream()
                .filter(PlatformConfigDocument.Model::isPublished)
                .filter(model -> !isVerified(model))
                .findFirst()
                .ifPresent(model -> { throw new IllegalArgumentException("模型尚未通过认证验证，不能发布: " + model.getId()); });
    }

    private boolean isVerified(PlatformConfigDocument.Model model) {
        return VERIFICATION_VERIFIED.equals(model.getVerificationStatus());
    }

    private String cleanVerificationStatus(String value) {
        return Set.of(VERIFICATION_UNVERIFIED, VERIFICATION_VERIFIED, VERIFICATION_FAILED).contains(value)
                ? value : VERIFICATION_UNVERIFIED;
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
            if ("video".equals(model.getCategory()) && model.getVideoCapabilities() == null) {
                capabilityTemplateResolver.applyOfficialVideoTemplate(model);
            }
            model.setRequestAdapter(blank(model.getRequestAdapter()) ? "openai" : model.getRequestAdapter().trim());
            model.setModelPatterns(cleanStrings(model.getModelPatterns()));
            model.setVerificationStatus(cleanVerificationStatus(model.getVerificationStatus()));
            model.setVerifiedAt(cleanOptional(model.getVerifiedAt()));
            model.setVerificationMessage(cleanOptional(model.getVerificationMessage()));
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

    private RuntimeConfigResponse.Model toRuntimeModel(PlatformConfigDocument.Provider provider, PlatformConfigDocument.Model item) {
        PlatformConfigDocument.TextCapabilities text = item.getTextCapabilities();
        PlatformConfigDocument.ImageCapabilities image = item.getImageCapabilities();
        PlatformConfigDocument.VideoCapabilities video = item.getVideoCapabilities();
        PlatformConfigDocument.AudioCapabilities audio = item.getAudioCapabilities();
        return new RuntimeConfigResponse.Model(
                item.getId(), item.getDisplayName(), item.getCategory(), effectiveRequestAdapter(provider, item),
                runtimeModelPatterns(item),
                text == null ? null : new RuntimeConfigResponse.TextCapabilities(List.copyOf(text.getModes())),
                image == null ? null : new RuntimeConfigResponse.ImageCapabilities(
                        List.copyOf(image.getModes()), List.copyOf(image.getQualities()), List.copyOf(image.getResolutions()),
                        List.copyOf(image.getRatios()), List.copyOf(image.getCounts()), image.getMaxImages(),
                        image.getMaxOutputs(), image.getMaxTotalImages(), image.isSequentialImageGeneration(), image.isInteractiveEdit(),
                        image.isWatermark(), image.getDocumentationUrl(), image.getOfficialTemplate()
                ),
                video == null ? null : new RuntimeConfigResponse.VideoCapabilities(
                        List.copyOf(video.getModes()), List.copyOf(video.getRatios()), List.copyOf(video.getResolutions()),
                        List.copyOf(video.getDurations()), List.copyOf(video.getFrameRates()), List.copyOf(video.getCounts()), video.isGenerateAudio(),
                        video.isWatermark(), video.isDraft(), video.getMaxImages(), video.getMaxVideos(), video.getMaxAudios()
                ),
                audio == null ? null : new RuntimeConfigResponse.AudioCapabilities(
                        List.copyOf(audio.getModes()), List.copyOf(audio.getVoices()), List.copyOf(audio.getFormats()),
                        List.copyOf(audio.getSpeeds()), audio.isInstructions()
                )
        );
    }

    private String effectiveRequestAdapter(
            PlatformConfigDocument.Provider provider,
            PlatformConfigDocument.Model model
    ) {
        String configured = blank(model.getRequestAdapter()) ? "openai" : model.getRequestAdapter().trim();
        if ("openai".equalsIgnoreCase(configured) && isAgnesVideoModel(provider, model)) {
            return "agnes-v2";
        }
        return configured;
    }

    private boolean isAgnesVideoModel(
            PlatformConfigDocument.Provider provider,
            PlatformConfigDocument.Model model
    ) {
        if (!"video".equalsIgnoreCase(model.getCategory())) return false;

        String requestModel = cleanOptional(model.getRequestModel()).toLowerCase(Locale.ROOT);
        if (requestModel.startsWith("agnes-video-v2")) return true;

        String modelIdentity = String.join(
                " ",
                cleanOptional(model.getId()),
                cleanOptional(model.getDisplayName()),
                requestModel
        ).toLowerCase(Locale.ROOT);
        String providerIdentity = String.join(
                " ",
                cleanOptional(provider.getId()),
                cleanOptional(provider.getName()),
                cleanOptional(provider.getBaseUrl())
        ).toLowerCase(Locale.ROOT);
        return modelIdentity.contains("agnes-video") || providerIdentity.contains("agnes");
    }

    List<String> runtimeModelPatterns(PlatformConfigDocument.Model item) {
        LinkedHashSet<String> patterns = new LinkedHashSet<>();
        addRuntimePattern(patterns, item.getId());
        addRuntimePattern(patterns, item.getRequestModel());
        item.getModelPatterns().forEach(value -> addRuntimePattern(patterns, value));
        legacyRuntimeModelAliases(item.getRequestModel()).forEach(value -> addRuntimePattern(patterns, value));
        return List.copyOf(patterns);
    }

    private List<String> legacyRuntimeModelAliases(String requestModel) {
        String model = cleanOptional(requestModel).toLowerCase();
        if (model.startsWith("doubao-seedance-1-0-lite-t2v")) {
            return List.of("seedance-lite-t2v", "seedance-1.0-lite-t2v", "seedance-1-0-lite-t2v");
        }
        if (model.startsWith("doubao-seedance-1-0-lite-i2v")) {
            return List.of("seedance-lite-i2v", "seedance-1.0-lite-i2v", "seedance-1-0-lite-i2v");
        }
        if (model.startsWith("doubao-seedance-1-0-pro-fast")) {
            return List.of("seedance-1-pro-fast", "seedance-1.0-pro-fast", "seedance-1-0-pro-fast");
        }
        if (model.startsWith("doubao-seedance-1-0-pro")) {
            return List.of("seedance-1-pro", "seedance-1.0-pro", "seedance-1-0-pro");
        }
        if (model.startsWith("doubao-seedance-1-5-pro")) {
            return List.of("seedance-1.5-pro", "seedance-1-5-pro");
        }
        return List.of();
    }

    private void addRuntimePattern(LinkedHashSet<String> patterns, String value) {
        if (value != null && !value.isBlank()) patterns.add(value.trim());
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
            } else if ("audio".equals(model.getCategory()) && model.getAudioCapabilities() == null) {
                PlatformConfigDocument.AudioCapabilities capabilities = new PlatformConfigDocument.AudioCapabilities();
                capabilities.setModes(List.of("text-to-speech"));
                model.setAudioCapabilities(capabilities);
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
                model.setAudioCapabilities(null);
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
                validateImageCapabilityLimits(model.getId(), capabilities);
                if (model.isPublished() && capabilities.getModes().isEmpty()) throw new IllegalArgumentException("已发布的图像模型必须至少配置一种生成能力: " + model.getId());
                model.setTextCapabilities(null);
                model.setImageCapabilities(capabilities);
                model.setVideoCapabilities(null);
                model.setAudioCapabilities(null);
            }
            case "video" -> {
                PlatformConfigDocument.VideoCapabilities capabilities = model.getVideoCapabilities() == null ? new PlatformConfigDocument.VideoCapabilities() : model.getVideoCapabilities();
                capabilities.setModes(cleanAllowedStrings(capabilities.getModes(), VIDEO_MODES));
                capabilities.setRatios(cleanStrings(capabilities.getRatios()));
                capabilities.setResolutions(cleanStrings(capabilities.getResolutions()));
                capabilities.setDurations(videoDurations(capabilities.getDurations()));
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
                model.setAudioCapabilities(null);
            }
            case "audio" -> {
                PlatformConfigDocument.AudioCapabilities capabilities = model.getAudioCapabilities() == null ? new PlatformConfigDocument.AudioCapabilities() : model.getAudioCapabilities();
                capabilities.setModes(cleanAllowedStrings(capabilities.getModes(), AUDIO_MODES));
                capabilities.setVoices(cleanStrings(capabilities.getVoices()));
                capabilities.setFormats(cleanStringsLowercase(capabilities.getFormats(), Set.of("mp3", "opus", "aac", "flac", "wav", "pcm")));
                capabilities.setSpeeds(capabilities.getSpeeds().stream()
                        .filter(value -> value != null && value > 0 && value <= 4)
                        .distinct()
                        .sorted()
                        .toList());
                if (model.isPublished() && !capabilities.getModes().contains("text-to-speech")) throw new IllegalArgumentException("已发布的音频模型必须配置文生语音能力: " + model.getId());
                model.setTextCapabilities(null);
                model.setImageCapabilities(null);
                model.setVideoCapabilities(null);
                model.setAudioCapabilities(capabilities);
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

    private void validateImageCapabilityLimits(String modelId, PlatformConfigDocument.ImageCapabilities capabilities) {
        Set<String> modes = Set.copyOf(capabilities.getModes());
        if ((modes.contains("image-to-image") || modes.contains("image-edit")) && capabilities.getMaxImages() < 1) {
            throw new IllegalArgumentException("图像模型启用图生图或图像编辑时，最多参考图片必须至少为 1: " + modelId);
        }
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

    private List<Integer> videoDurations(List<Integer> values) {
        if (values == null) return List.of();
        return values.stream()
                .filter(value -> value != null && (value == -1 || value > 0))
                .distinct()
                .sorted()
                .toList();
    }

    private void applyOfficialCapabilityTemplates(PlatformConfigDocument document) {
        document.getModels().stream()
                .filter(model -> "video".equals(model.getCategory()))
                .forEach(capabilityTemplateResolver::applyOfficialVideoTemplate);
    }

    private List<String> cleanAllowedStrings(List<String> values, Set<String> allowed) {
        return cleanStrings(values).stream().filter(allowed::contains).toList();
    }

    private List<String> cleanAllowedStringsLowercase(List<String> values, Set<String> allowed) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank()).map(value -> value.trim().toLowerCase())
                .filter(allowed::contains).distinct().toList();
    }

    private List<String> cleanStringsLowercase(List<String> values, Set<String> allowed) {
        return cleanAllowedStringsLowercase(values, allowed);
    }

    private List<Integer> allowedIntegers(List<Integer> values, Set<Integer> allowed) {
        return positiveIntegers(values).stream().filter(allowed::contains).toList();
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }

    public record RuntimeModel(PlatformConfigDocument.Provider provider, PlatformConfigDocument.Model model) {}
}
