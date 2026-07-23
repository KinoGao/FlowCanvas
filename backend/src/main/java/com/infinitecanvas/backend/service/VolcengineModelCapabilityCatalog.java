package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Component
public class VolcengineModelCapabilityCatalog {
    private static final String SEEDREAM_5_LITE = "doubao-seedream-5-0-lite-260128";
    private static final String SEEDREAM_5_PRO_PREFIX = "doubao-seedream-5-0-pro-";
    private static final String SEEDREAM_4_5 = "doubao-seedream-4-5-251128";
    private static final String SEEDREAM_4_0 = "doubao-seedream-4-0-250828";
    private static final String SEEDANCE_1_5_PRO = "doubao-seedance-1-5-pro-251215";
    private static final String SEEDANCE_1_0_PRO_FAST = "doubao-seedance-1-0-pro-fast-251015";
    private static final String SEEDANCE_1_0_PRO = "doubao-seedance-1-0-pro-250528";
    private static final String SEEDANCE_1_0_LITE_T2V = "doubao-seedance-1-0-lite-t2v-250428";
    private static final String SEEDANCE_1_0_LITE_I2V = "doubao-seedance-1-0-lite-i2v-250428";
    private static final String SEEDREAM_DOCUMENTATION = "https://www.volcengine.com/docs/82379/1824121";

    private final Map<String, Consumer<PlatformConfigDocument.Model>> templates = Map.of(
            SEEDREAM_5_LITE, model -> applySeedream(model, SEEDREAM_5_LITE, 14, List.of("2k", "3k", "4k"), "volcengine-seedream-5.0-lite"),
            SEEDREAM_4_5, model -> applySeedream(model, SEEDREAM_4_5, 14, List.of("2k", "4k"), "volcengine-seedream-4.5"),
            SEEDREAM_4_0, model -> applySeedream(model, SEEDREAM_4_0, 14, List.of("1k", "2k", "4k"), "volcengine-seedream-4.0"),
            SEEDANCE_1_5_PRO, this::applySeedance15Pro,
            SEEDANCE_1_0_PRO_FAST, model -> applySeedance10(model, SEEDANCE_1_0_PRO_FAST, false),
            SEEDANCE_1_0_PRO, model -> applySeedance10(model, SEEDANCE_1_0_PRO, true),
            SEEDANCE_1_0_LITE_T2V, model -> applySeedance10Lite(model, SEEDANCE_1_0_LITE_T2V, false),
            SEEDANCE_1_0_LITE_I2V, model -> applySeedance10Lite(model, SEEDANCE_1_0_LITE_I2V, true)
    );

    public boolean applyOfficialTemplate(PlatformConfigDocument.Model model) {
        if (model == null || model.getRequestModel() == null) return false;
        Consumer<PlatformConfigDocument.Model> template = templates.get(model.getRequestModel().trim());
        if (template != null) {
            template.accept(model);
            return true;
        }
        if (!model.getRequestModel().trim().startsWith(SEEDREAM_5_PRO_PREFIX)) return false;
        applySeedream5Pro(model);
        return true;
    }

    public boolean reconcileConfirmedModels(PlatformConfigDocument document) {
        boolean changed = reconcileModel(
                document, SEEDANCE_1_5_PRO, "seedance-1-5-pro", "Doubao Seedance 1.5 Pro", "doubao-seedance-"
        );
        changed |= reconcileModel(
                document, SEEDREAM_5_LITE, "seedream-5-0-lite", "Doubao Seedream 5.0 Lite", "doubao-seedream-"
        );
        changed |= disableTruncatedDuplicates(document);
        return changed;
    }

    private boolean reconcileModel(
            PlatformConfigDocument document,
            String requestModel,
            String preferredId,
            String displayName,
            String familyPrefix
    ) {
        PlatformConfigDocument.Model exact = document.getModels().stream()
                .filter(model -> requestModel.equals(trimmed(model.getRequestModel())))
                .findFirst()
                .orElse(null);
        if (exact != null) {
            if (exact.getImageCapabilities() == null && exact.getVideoCapabilities() == null) applyOfficialTemplate(exact);
            return false;
        }

        PlatformConfigDocument.Model placeholder = document.getModels().stream()
                .filter(model -> isTruncatedPrefix(model.getRequestModel(), requestModel))
                .findFirst()
                .orElse(null);
        String providerId = placeholder == null
                ? findConfiguredProvider(document, familyPrefix)
                : placeholder.getProviderId();
        if (providerId == null) return false;

        PlatformConfigDocument.Model model = placeholder == null ? new PlatformConfigDocument.Model() : placeholder;
        if (placeholder == null) {
            model.setId(uniqueModelId(document, preferredId));
            model.setProviderId(providerId);
            document.getModels().add(model);
        }
        model.setDisplayName(displayName);
        model.setRequestModel(requestModel);
        model.setEnabled(true);
        model.setPublished(true);
        applyOfficialTemplate(model);
        return true;
    }

    private boolean disableTruncatedDuplicates(PlatformConfigDocument document) {
        boolean changed = false;
        for (PlatformConfigDocument.Model model : document.getModels()) {
            String requestModel = trimmed(model.getRequestModel());
            if (!requestModel.endsWith("-")) continue;
            boolean hasExactReplacement = templates.keySet().stream()
                    .filter(official -> official.startsWith(requestModel))
                    .anyMatch(official -> document.getModels().stream()
                            .anyMatch(candidate -> official.equals(trimmed(candidate.getRequestModel()))));
            if (hasExactReplacement && (model.isEnabled() || model.isPublished())) {
                model.setEnabled(false);
                model.setPublished(false);
                changed = true;
            }
        }
        return changed;
    }

    private String findConfiguredProvider(PlatformConfigDocument document, String familyPrefix) {
        return document.getModels().stream()
                .filter(model -> trimmed(model.getRequestModel()).startsWith(familyPrefix))
                .map(PlatformConfigDocument.Model::getProviderId)
                .filter(providerId -> document.getProviders().stream()
                        .anyMatch(provider -> provider.getId().equals(providerId)
                                && provider.isEnabled()
                                && !trimmed(provider.getBaseUrl()).isEmpty()
                                && !trimmed(provider.getApiKey()).isEmpty()))
                .findFirst()
                .orElse(null);
    }

    private String uniqueModelId(PlatformConfigDocument document, String preferredId) {
        String candidate = preferredId;
        int suffix = 2;
        while (containsModelId(document, candidate)) candidate = preferredId + "-" + suffix++;
        return candidate;
    }

    private boolean containsModelId(PlatformConfigDocument document, String id) {
        return document.getModels().stream().anyMatch(model -> id.equals(model.getId()));
    }

    private boolean isTruncatedPrefix(String candidate, String official) {
        String value = trimmed(candidate);
        return value.endsWith("-") && official.startsWith(value);
    }

    private String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    private static void applySeedream(
            PlatformConfigDocument.Model model,
            String requestModel,
            int maxImages,
            List<String> resolutions,
            String officialTemplate
    ) {
        model.setCategory("image");
        model.setRequestAdapter("seedream");
        model.setModelPatterns(List.of(requestModel));
        model.setTextCapabilities(null);
        model.setVideoCapabilities(null);

        PlatformConfigDocument.ImageCapabilities capabilities = new PlatformConfigDocument.ImageCapabilities();
        capabilities.setModes(List.of("text-to-image", "image-to-image", "image-edit"));
        capabilities.setQualities(List.of("standard", "high"));
        capabilities.setResolutions(resolutions);
        capabilities.setRatios(List.of("1:1", "3:4", "4:5", "1:2", "4:3", "21:9", "2:1", "3:2", "9:21", "9:16", "2:3", "16:9", "5:4"));
        capabilities.setCounts(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15));
        capabilities.setMaxImages(maxImages);
        capabilities.setMaxOutputs(15);
        capabilities.setMaxTotalImages(15);
        capabilities.setSequentialImageGeneration(true);
        capabilities.setInteractiveEdit(false);
        capabilities.setWatermark(true);
        capabilities.setDocumentationUrl(SEEDREAM_DOCUMENTATION);
        capabilities.setOfficialTemplate(officialTemplate);
        model.setImageCapabilities(capabilities);
    }

    private static void applySeedream5Pro(PlatformConfigDocument.Model model) {
        model.setCategory("image");
        model.setRequestAdapter("seedream");
        model.setModelPatterns(List.of(model.getRequestModel().trim()));
        model.setTextCapabilities(null);
        model.setVideoCapabilities(null);

        PlatformConfigDocument.ImageCapabilities capabilities = new PlatformConfigDocument.ImageCapabilities();
        capabilities.setModes(List.of("text-to-image", "image-to-image", "image-edit"));
        capabilities.setQualities(List.of("standard", "high"));
        capabilities.setResolutions(List.of("1k", "2k"));
        capabilities.setRatios(List.of("1:1", "3:4", "4:5", "1:2", "4:3", "21:9", "2:1", "3:2", "9:21", "9:16", "2:3", "16:9", "5:4"));
        capabilities.setCounts(List.of(1));
        capabilities.setMaxImages(10);
        capabilities.setMaxOutputs(1);
        capabilities.setMaxTotalImages(0);
        capabilities.setSequentialImageGeneration(false);
        capabilities.setInteractiveEdit(true);
        capabilities.setWatermark(true);
        capabilities.setDocumentationUrl(SEEDREAM_DOCUMENTATION);
        capabilities.setOfficialTemplate("volcengine-seedream-5.0-pro");
        model.setImageCapabilities(capabilities);
    }

    private void applySeedance15Pro(PlatformConfigDocument.Model model) {
        model.setCategory("video");
        model.setRequestAdapter("seedance-v1.5");
        model.setModelPatterns(List.of(SEEDANCE_1_5_PRO));
        model.setTextCapabilities(null);
        model.setImageCapabilities(null);

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(List.of("text-to-video", "image-to-video", "first-last-frame"));
        capabilities.setRatios(List.of("adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"));
        capabilities.setResolutions(List.of("480p", "720p", "1080p"));
        capabilities.setDurations(List.of(-1, 4, 5, 6, 7, 8, 9, 10, 11, 12));
        capabilities.setCounts(List.of(1));
        capabilities.setGenerateAudio(true);
        capabilities.setWatermark(true);
        capabilities.setDraft(true);
        capabilities.setMaxImages(2);
        capabilities.setMaxVideos(0);
        capabilities.setMaxAudios(0);
        model.setVideoCapabilities(capabilities);
    }

    private static void applySeedance10(PlatformConfigDocument.Model model, String requestModel, boolean firstLastFrame) {
        model.setCategory("video");
        model.setRequestAdapter("seedance-v1");
        model.setModelPatterns(List.of(requestModel));
        model.setTextCapabilities(null);
        model.setImageCapabilities(null);

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(firstLastFrame
                ? List.of("text-to-video", "image-to-video", "first-last-frame")
                : List.of("text-to-video", "image-to-video"));
        capabilities.setRatios(List.of("adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"));
        capabilities.setResolutions(List.of("480p", "720p", "1080p"));
        capabilities.setDurations(List.of(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
        capabilities.setCounts(List.of(1));
        capabilities.setGenerateAudio(false);
        capabilities.setWatermark(true);
        capabilities.setDraft(false);
        capabilities.setMaxImages(firstLastFrame ? 2 : 1);
        capabilities.setMaxVideos(0);
        capabilities.setMaxAudios(0);
        model.setVideoCapabilities(capabilities);
    }

    private static void applySeedance10Lite(PlatformConfigDocument.Model model, String requestModel, boolean imageToVideo) {
        model.setCategory("video");
        model.setRequestAdapter("seedance-v1");
        model.setModelPatterns(List.of(requestModel));
        model.setTextCapabilities(null);
        model.setImageCapabilities(null);

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(List.of(imageToVideo ? "image-to-video" : "text-to-video"));
        capabilities.setRatios(List.of("adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"));
        capabilities.setResolutions(List.of("480p", "720p", "1080p"));
        capabilities.setDurations(List.of(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
        capabilities.setFrameRates(List.of(24));
        capabilities.setCounts(List.of(1));
        capabilities.setGenerateAudio(false);
        capabilities.setWatermark(true);
        capabilities.setDraft(false);
        capabilities.setMaxImages(imageToVideo ? 1 : 0);
        capabilities.setMaxVideos(0);
        capabilities.setMaxAudios(0);
        model.setVideoCapabilities(capabilities);
    }
}
