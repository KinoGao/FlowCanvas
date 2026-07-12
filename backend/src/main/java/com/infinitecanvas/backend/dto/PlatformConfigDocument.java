package com.infinitecanvas.backend.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonSetter;

import java.util.ArrayList;
import java.util.List;

public class PlatformConfigDocument {
    private List<Provider> providers = new ArrayList<>();
    private List<Model> models = new ArrayList<>();
    private ComfyUi comfyui = new ComfyUi();

    public List<Provider> getProviders() { return providers; }
    public void setProviders(List<Provider> providers) { this.providers = providers == null ? new ArrayList<>() : providers; }
    public List<Model> getModels() { return models; }
    public void setModels(List<Model> models) { this.models = models == null ? new ArrayList<>() : models; }
    public ComfyUi getComfyui() { return comfyui; }
    public void setComfyui(ComfyUi comfyui) { this.comfyui = comfyui == null ? new ComfyUi() : comfyui; }

    public static class Provider {
        private String id = "";
        private String name = "";
        private String baseUrl = "";
        private String apiKey = "";
        private String apiFormat = "openai";
        private String modelsPath = "/models";
        private boolean enabled = true;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }
        public String getApiFormat() { return apiFormat; }
        public void setApiFormat(String apiFormat) { this.apiFormat = apiFormat; }
        public String getModelsPath() { return modelsPath; }
        public void setModelsPath(String modelsPath) { this.modelsPath = modelsPath; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }

    public static class Model {
        private String id = "";
        private String providerId = "";
        private String displayName = "";
        private String requestModel = "";
        @JsonAlias("capability")
        private String category = "image";
        private String requestAdapter = "openai";
        private boolean enabled = true;
        private boolean published = true;
        private List<String> modelPatterns = new ArrayList<>();
        private TextCapabilities textCapabilities;
        private ImageCapabilities imageCapabilities;
        private VideoCapabilities videoCapabilities;

        private List<String> legacyModes = new ArrayList<>();
        private List<String> legacyRatios = new ArrayList<>();
        private List<String> legacyResolutions = new ArrayList<>();
        private List<Integer> legacyDurations = new ArrayList<>();
        private List<Integer> legacyCounts = new ArrayList<>();
        private boolean legacyGenerateAudio;
        private boolean legacyWatermark;
        private boolean legacyDraft;
        private int legacyMaxImages;
        private int legacyMaxVideos;
        private int legacyMaxAudios;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getProviderId() { return providerId; }
        public void setProviderId(String providerId) { this.providerId = providerId; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public String getRequestModel() { return requestModel; }
        public void setRequestModel(String requestModel) { this.requestModel = requestModel; }
        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }
        public String getRequestAdapter() { return requestAdapter; }
        public void setRequestAdapter(String requestAdapter) { this.requestAdapter = requestAdapter; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public boolean isPublished() { return published; }
        public void setPublished(boolean published) { this.published = published; }
        public List<String> getModelPatterns() { return modelPatterns; }
        public void setModelPatterns(List<String> modelPatterns) { this.modelPatterns = modelPatterns == null ? new ArrayList<>() : modelPatterns; }
        public TextCapabilities getTextCapabilities() { return textCapabilities; }
        public void setTextCapabilities(TextCapabilities textCapabilities) { this.textCapabilities = textCapabilities; }
        public ImageCapabilities getImageCapabilities() { return imageCapabilities; }
        public void setImageCapabilities(ImageCapabilities imageCapabilities) { this.imageCapabilities = imageCapabilities; }
        public VideoCapabilities getVideoCapabilities() { return videoCapabilities; }
        public void setVideoCapabilities(VideoCapabilities videoCapabilities) { this.videoCapabilities = videoCapabilities; }

        @JsonSetter("modes") public void setLegacyModes(List<String> values) { legacyModes = list(values); }
        @JsonSetter("ratios") public void setLegacyRatios(List<String> values) { legacyRatios = list(values); }
        @JsonSetter("resolutions") public void setLegacyResolutions(List<String> values) { legacyResolutions = list(values); }
        @JsonSetter("durations") public void setLegacyDurations(List<Integer> values) { legacyDurations = list(values); }
        @JsonSetter("counts") public void setLegacyCounts(List<Integer> values) { legacyCounts = list(values); }
        @JsonSetter("generateAudio") public void setLegacyGenerateAudio(boolean value) { legacyGenerateAudio = value; }
        @JsonSetter("watermark") public void setLegacyWatermark(boolean value) { legacyWatermark = value; }
        @JsonSetter("draft") public void setLegacyDraft(boolean value) { legacyDraft = value; }
        @JsonSetter("maxImages") public void setLegacyMaxImages(int value) { legacyMaxImages = value; }
        @JsonSetter("maxVideos") public void setLegacyMaxVideos(int value) { legacyMaxVideos = value; }
        @JsonSetter("maxAudios") public void setLegacyMaxAudios(int value) { legacyMaxAudios = value; }

        @JsonIgnore public List<String> legacyModes() { return legacyModes; }
        @JsonIgnore public List<String> legacyRatios() { return legacyRatios; }
        @JsonIgnore public List<String> legacyResolutions() { return legacyResolutions; }
        @JsonIgnore public List<Integer> legacyDurations() { return legacyDurations; }
        @JsonIgnore public List<Integer> legacyCounts() { return legacyCounts; }
        @JsonIgnore public boolean legacyGenerateAudio() { return legacyGenerateAudio; }
        @JsonIgnore public boolean legacyWatermark() { return legacyWatermark; }
        @JsonIgnore public boolean legacyDraft() { return legacyDraft; }
        @JsonIgnore public int legacyMaxImages() { return legacyMaxImages; }
        @JsonIgnore public int legacyMaxVideos() { return legacyMaxVideos; }
        @JsonIgnore public int legacyMaxAudios() { return legacyMaxAudios; }

        private static <T> List<T> list(List<T> values) { return values == null ? new ArrayList<>() : values; }
    }

    public static class TextCapabilities {
        private List<String> modes = new ArrayList<>();
        public List<String> getModes() { return modes; }
        public void setModes(List<String> modes) { this.modes = modes == null ? new ArrayList<>() : modes; }
    }

    public static class ImageCapabilities {
        private List<String> modes = new ArrayList<>();
        private List<String> qualities = new ArrayList<>();
        private List<String> resolutions = new ArrayList<>();
        private List<String> ratios = new ArrayList<>();
        private List<Integer> counts = new ArrayList<>();

        public List<String> getModes() { return modes; }
        public void setModes(List<String> modes) { this.modes = modes == null ? new ArrayList<>() : modes; }
        public List<String> getQualities() { return qualities; }
        public void setQualities(List<String> qualities) { this.qualities = qualities == null ? new ArrayList<>() : qualities; }
        public List<String> getResolutions() { return resolutions; }
        public void setResolutions(List<String> resolutions) { this.resolutions = resolutions == null ? new ArrayList<>() : resolutions; }
        public List<String> getRatios() { return ratios; }
        public void setRatios(List<String> ratios) { this.ratios = ratios == null ? new ArrayList<>() : ratios; }
        public List<Integer> getCounts() { return counts; }
        public void setCounts(List<Integer> counts) { this.counts = counts == null ? new ArrayList<>() : counts; }
    }

    public static class VideoCapabilities {
        private List<String> modes = new ArrayList<>();
        private List<String> ratios = new ArrayList<>();
        private List<String> resolutions = new ArrayList<>();
        private List<Integer> durations = new ArrayList<>();
        private List<Integer> counts = new ArrayList<>();
        private boolean generateAudio;
        private boolean watermark;
        private boolean draft;
        private int maxImages;
        private int maxVideos;
        private int maxAudios;

        public List<String> getModes() { return modes; }
        public void setModes(List<String> modes) { this.modes = modes == null ? new ArrayList<>() : modes; }
        public List<String> getRatios() { return ratios; }
        public void setRatios(List<String> ratios) { this.ratios = ratios == null ? new ArrayList<>() : ratios; }
        public List<String> getResolutions() { return resolutions; }
        public void setResolutions(List<String> resolutions) { this.resolutions = resolutions == null ? new ArrayList<>() : resolutions; }
        public List<Integer> getDurations() { return durations; }
        public void setDurations(List<Integer> durations) { this.durations = durations == null ? new ArrayList<>() : durations; }
        public List<Integer> getCounts() { return counts; }
        public void setCounts(List<Integer> counts) { this.counts = counts == null ? new ArrayList<>() : counts; }
        public boolean isGenerateAudio() { return generateAudio; }
        public void setGenerateAudio(boolean generateAudio) { this.generateAudio = generateAudio; }
        public boolean isWatermark() { return watermark; }
        public void setWatermark(boolean watermark) { this.watermark = watermark; }
        public boolean isDraft() { return draft; }
        public void setDraft(boolean draft) { this.draft = draft; }
        public int getMaxImages() { return maxImages; }
        public void setMaxImages(int maxImages) { this.maxImages = maxImages; }
        public int getMaxVideos() { return maxVideos; }
        public void setMaxVideos(int maxVideos) { this.maxVideos = maxVideos; }
        public int getMaxAudios() { return maxAudios; }
        public void setMaxAudios(int maxAudios) { this.maxAudios = maxAudios; }
    }

    public static class ComfyUi {
        private boolean enabled;
        private String baseUrl = "http://127.0.0.1:8188";
        private String clientId = "flow-canvas";
        private String defaultWorkflowId = "";
        private int timeoutSeconds = 300;
        private int pollIntervalMs = 1200;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
        public String getClientId() { return clientId; }
        public void setClientId(String clientId) { this.clientId = clientId; }
        public String getDefaultWorkflowId() { return defaultWorkflowId; }
        public void setDefaultWorkflowId(String defaultWorkflowId) { this.defaultWorkflowId = defaultWorkflowId; }
        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
        public int getPollIntervalMs() { return pollIntervalMs; }
        public void setPollIntervalMs(int pollIntervalMs) { this.pollIntervalMs = pollIntervalMs; }
    }
}
