package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.VideoModelCapabilityResponse;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Stream;

@Service
public class ModelCapabilityService {
    private final PlatformConfigService platformConfigService;

    public ModelCapabilityService(PlatformConfigService platformConfigService) {
        this.platformConfigService = platformConfigService;
    }

    public List<VideoModelCapabilityResponse> videoCapabilities() {
        return platformConfigService.publishedVideoModels().stream().map(item -> {
            PlatformConfigDocument.VideoCapabilities capabilities = item.getVideoCapabilities();
            return new VideoModelCapabilityResponse(
                    item.getId(), item.getProviderId(), item.getRequestAdapter(),
                    Stream.concat(Stream.of(item.getId(), item.getRequestModel()), item.getModelPatterns().stream())
                            .filter(value -> value != null && !value.isBlank()).distinct().toList(),
                    List.copyOf(capabilities.getModes()), List.copyOf(capabilities.getRatios()),
                    List.copyOf(capabilities.getResolutions()), List.copyOf(capabilities.getDurations()),
                    List.copyOf(capabilities.getCounts()), capabilities.isGenerateAudio(), capabilities.isWatermark(),
                    capabilities.isDraft(), capabilities.getMaxImages(), capabilities.getMaxVideos(), capabilities.getMaxAudios()
            );
        }).toList();
    }
}
