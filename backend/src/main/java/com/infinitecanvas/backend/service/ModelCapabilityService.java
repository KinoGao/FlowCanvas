package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.dto.ImageModelCapabilityResponse;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.VideoModelCapabilityResponse;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ModelCapabilityService {
    private final PlatformConfigService platformConfigService;

    public ModelCapabilityService(PlatformConfigService platformConfigService) {
        this.platformConfigService = platformConfigService;
    }

    public List<ImageModelCapabilityResponse> imageCapabilities() {
        return platformConfigService.publishedImageModels().stream().map(item -> {
            PlatformConfigDocument.ImageCapabilities capabilities = item.getImageCapabilities();
            return new ImageModelCapabilityResponse(
                    item.getId(), item.getProviderId(), item.getRequestAdapter(), modelPatterns(item),
                    List.copyOf(capabilities.getModes()), List.copyOf(capabilities.getQualities()),
                    List.copyOf(capabilities.getResolutions()), List.copyOf(capabilities.getRatios()),
                    List.copyOf(capabilities.getCounts()), capabilities.getMaxImages(), capabilities.getMaxOutputs(),
                    capabilities.getMaxTotalImages(), capabilities.isSequentialImageGeneration(), capabilities.isWatermark(),
                    capabilities.getDocumentationUrl(), capabilities.getOfficialTemplate()
            );
        }).toList();
    }

    public List<VideoModelCapabilityResponse> videoCapabilities() {
        return platformConfigService.publishedVideoModels().stream().map(item -> {
            PlatformConfigDocument.VideoCapabilities capabilities = item.getVideoCapabilities();
            return new VideoModelCapabilityResponse(
                    item.getId(), item.getProviderId(), item.getRequestAdapter(),
                    modelPatterns(item),
                    List.copyOf(capabilities.getModes()), List.copyOf(capabilities.getRatios()),
                    List.copyOf(capabilities.getResolutions()), List.copyOf(capabilities.getDurations()),
                    List.copyOf(capabilities.getFrameRates()), List.copyOf(capabilities.getCounts()),
                    capabilities.isGenerateAudio(), capabilities.isWatermark(),
                    capabilities.isDraft(), capabilities.getMaxImages(), capabilities.getMaxVideos(), capabilities.getMaxAudios()
            );
        }).toList();
    }

    private List<String> modelPatterns(PlatformConfigDocument.Model item) {
        return List.of(item.getId());
    }
}
