package com.infinitecanvas.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "app.model-capabilities")
public class ModelCapabilitiesProperties {
    private List<Video> video = new ArrayList<>();

    public List<Video> getVideo() { return video; }
    public void setVideo(List<Video> video) { this.video = video; }

    public static class Video {
        private String id;
        private String provider;
        private String requestAdapter;
        private boolean enabled = true;
        private List<String> modelPatterns = new ArrayList<>();
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

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getProvider() { return provider; }
        public void setProvider(String provider) { this.provider = provider; }
        public String getRequestAdapter() { return requestAdapter; }
        public void setRequestAdapter(String requestAdapter) { this.requestAdapter = requestAdapter; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public List<String> getModelPatterns() { return modelPatterns; }
        public void setModelPatterns(List<String> modelPatterns) { this.modelPatterns = modelPatterns; }
        public List<String> getModes() { return modes; }
        public void setModes(List<String> modes) { this.modes = modes; }
        public List<String> getRatios() { return ratios; }
        public void setRatios(List<String> ratios) { this.ratios = ratios; }
        public List<String> getResolutions() { return resolutions; }
        public void setResolutions(List<String> resolutions) { this.resolutions = resolutions; }
        public List<Integer> getDurations() { return durations; }
        public void setDurations(List<Integer> durations) { this.durations = durations; }
        public List<Integer> getCounts() { return counts; }
        public void setCounts(List<Integer> counts) { this.counts = counts; }
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
}
