package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
public class ModelCapabilityTemplateResolver {
    private final ModelCapabilitiesProperties properties;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public ModelCapabilityTemplateResolver(ModelCapabilitiesProperties properties) {
        this.properties = properties;
    }

    public boolean applyOfficialVideoTemplate(PlatformConfigDocument.Model model) {
        if (model == null || !"video".equals(model.getCategory())) return false;
        Optional<ModelCapabilitiesProperties.Video> resolved = resolveVideo(model.getRequestModel());
        if (resolved.isEmpty()) return false;

        ModelCapabilitiesProperties.Video template = resolved.get();
        model.setRequestAdapter(template.getRequestAdapter());
        LinkedHashSet<String> patterns = new LinkedHashSet<>(template.getModelPatterns());
        patterns.addAll(model.getModelPatterns());
        model.setModelPatterns(List.copyOf(patterns));

        PlatformConfigDocument.VideoCapabilities capabilities = new PlatformConfigDocument.VideoCapabilities();
        capabilities.setModes(normalizeVideoModes(template));
        capabilities.setRatios(List.copyOf(template.getRatios()));
        capabilities.setResolutions(List.copyOf(template.getResolutions()));
        capabilities.setDurations(List.copyOf(template.getDurations()));
        capabilities.setFrameRates(List.copyOf(template.getFrameRates()));
        capabilities.setCounts(List.copyOf(template.getCounts()));
        capabilities.setGenerateAudio(template.isGenerateAudio());
        capabilities.setWatermark(template.isWatermark());
        capabilities.setDraft(template.isDraft());
        capabilities.setMaxImages(template.getMaxImages());
        capabilities.setMaxVideos(template.getMaxVideos());
        capabilities.setMaxAudios(template.getMaxAudios());
        model.setTextCapabilities(null);
        model.setImageCapabilities(null);
        model.setVideoCapabilities(capabilities);
        return true;
    }

    private List<String> normalizeVideoModes(ModelCapabilitiesProperties.Video template) {
        LinkedHashSet<String> modes = new LinkedHashSet<>();
        boolean seedance = template.getRequestAdapter() != null
                && template.getRequestAdapter().startsWith("seedance");
        for (String mode : template.getModes()) {
            if (seedance && ("image-reference".equals(mode) || "multi-frame".equals(mode))) {
                modes.add("all-in-one-reference");
            } else {
                modes.add(mode);
            }
        }
        return List.copyOf(modes);
    }

    Optional<ModelCapabilitiesProperties.Video> resolveVideo(String requestModel) {
        if (requestModel == null || requestModel.isBlank()) return Optional.empty();
        String candidate = requestModel.trim().toLowerCase(Locale.ROOT);
        return properties.getVideo().stream()
                .filter(ModelCapabilitiesProperties.Video::isEnabled)
                .filter(template -> template.getModelPatterns().stream().anyMatch(pattern -> matches(pattern, candidate)))
                .max(Comparator.comparingInt(template -> specificity(template, candidate)));
    }

    private boolean matches(String pattern, String candidate) {
        return pattern != null
                && !pattern.isBlank()
                && pathMatcher.match(pattern.trim().toLowerCase(Locale.ROOT), candidate);
    }

    private int specificity(ModelCapabilitiesProperties.Video template, String candidate) {
        return template.getModelPatterns().stream()
                .filter(pattern -> matches(pattern, candidate))
                .mapToInt(pattern -> pattern.replace("*", "").replace("?", "").length())
                .max()
                .orElse(0);
    }
}
