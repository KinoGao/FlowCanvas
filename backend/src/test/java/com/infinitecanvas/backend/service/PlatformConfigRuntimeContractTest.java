package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.ImageModelCapabilityResponse;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.dto.VideoModelCapabilityResponse;
import com.infinitecanvas.backend.entity.PlatformConfigEntity;
import com.infinitecanvas.backend.repository.PlatformConfigRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlatformConfigRuntimeContractTest {
    @Test
    void rejectsImageReferenceModesWhenReferenceLimitIsZero() {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        VolcengineModelCapabilityCatalog officialCatalog = mock(VolcengineModelCapabilityCatalog.class);
        PlatformConfigService service = new PlatformConfigService(
                repository,
                new ObjectMapper(),
                new ModelCapabilitiesProperties(),
                officialCatalog,
                ""
        );
        PlatformConfigDocument document = document();
        PlatformConfigDocument.Model image = document.getModels().stream()
                .filter(model -> "image-model".equals(model.getId()))
                .findFirst()
                .orElseThrow();
        image.getImageCapabilities().setModes(List.of("text-to-image", "image-to-image", "image-edit"));
        image.getImageCapabilities().setMaxImages(0);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.save(document));

        assertEquals("图像模型启用图生图或图像编辑时，最多参考图片必须至少为 1: image-model", error.getMessage());
    }

    @Test
    void runtimeCatalogAndCapabilityEndpointsExposeTheSameModelPatterns() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        VolcengineModelCapabilityCatalog officialCatalog = mock(VolcengineModelCapabilityCatalog.class);
        when(officialCatalog.reconcileConfirmedModels(any())).thenReturn(false);

        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument document = document();
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        PlatformConfigService platformConfigService = new PlatformConfigService(
                repository,
                objectMapper,
                new ModelCapabilitiesProperties(),
                officialCatalog,
                ""
        );
        ModelCapabilityService capabilityService = new ModelCapabilityService(platformConfigService);

        RuntimeConfigResponse runtime = platformConfigService.runtimeConfig();
        List<RuntimeConfigResponse.Model> runtimeModels = runtime.providers().getFirst().models();
        RuntimeConfigResponse.Model runtimeImage = runtimeModels.stream()
                .filter(model -> "image-model".equals(model.id()))
                .findFirst()
                .orElseThrow();
        RuntimeConfigResponse.Model runtimeVideo = runtimeModels.stream()
                .filter(model -> "video-model".equals(model.id()))
                .findFirst()
                .orElseThrow();
        RuntimeConfigResponse.Model runtimeSeedance = runtimeModels.stream()
                .filter(model -> "seedance-canonical".equals(model.id()))
                .findFirst()
                .orElseThrow();

        ImageModelCapabilityResponse imageCapability = capabilityService.imageCapabilities().getFirst();
        VideoModelCapabilityResponse videoCapability = capabilityService.videoCapabilities().stream()
                .filter(model -> "video-model".equals(model.id()))
                .findFirst()
                .orElseThrow();
        VideoModelCapabilityResponse seedanceCapability = capabilityService.videoCapabilities().stream()
                .filter(model -> "seedance-canonical".equals(model.id()))
                .findFirst()
                .orElseThrow();

        assertEquals(List.of("image-model", "image-request-model", "image-alias", "image-*"), runtimeImage.modelPatterns());
        assertEquals(imageCapability.modelPatterns(), runtimeImage.modelPatterns());
        assertEquals(List.of("video-model", "video-request-model", "video-alias", "video-*"), runtimeVideo.modelPatterns());
        assertEquals(videoCapability.modelPatterns(), runtimeVideo.modelPatterns());
        assertEquals(List.of(
                "seedance-canonical",
                "doubao-seedance-1-0-lite-t2v-250428",
                "seedance-lite-t2v",
                "seedance-1.0-lite-t2v",
                "seedance-1-0-lite-t2v"
        ), runtimeSeedance.modelPatterns());
        assertEquals(seedanceCapability.modelPatterns(), runtimeSeedance.modelPatterns());
        assertTrue(runtimeImage.modelPatterns().contains(imageCapability.id()));
        assertTrue(runtimeVideo.modelPatterns().contains(videoCapability.id()));
        assertTrue(runtimeSeedance.modelPatterns().contains("seedance-lite-t2v"));
    }

    private static PlatformConfigDocument document() {
        PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
        provider.setId("provider");
        provider.setName("Provider");
        provider.setBaseUrl("https://example.invalid/v1");
        provider.setApiKey("secret");
        provider.setEnabled(true);

        PlatformConfigDocument.Model image = new PlatformConfigDocument.Model();
        image.setId("image-model");
        image.setProviderId(provider.getId());
        image.setDisplayName("Image Model");
        image.setRequestModel("image-request-model");
        image.setCategory("image");
        image.setModelPatterns(List.of("image-alias", "image-*", "image-alias"));
        PlatformConfigDocument.ImageCapabilities imageCapabilities = new PlatformConfigDocument.ImageCapabilities();
        imageCapabilities.setModes(List.of("text-to-image"));
        image.setImageCapabilities(imageCapabilities);

        PlatformConfigDocument.Model video = new PlatformConfigDocument.Model();
        video.setId("video-model");
        video.setProviderId(provider.getId());
        video.setDisplayName("Video Model");
        video.setRequestModel("video-request-model");
        video.setCategory("video");
        video.setModelPatterns(List.of("video-alias", "video-*", "video-alias"));
        PlatformConfigDocument.VideoCapabilities videoCapabilities = new PlatformConfigDocument.VideoCapabilities();
        videoCapabilities.setModes(List.of("text-to-video"));
        video.setVideoCapabilities(videoCapabilities);

        PlatformConfigDocument.Model seedance = new PlatformConfigDocument.Model();
        seedance.setId("seedance-canonical");
        seedance.setProviderId(provider.getId());
        seedance.setDisplayName("Seedance Lite T2V");
        seedance.setRequestModel("doubao-seedance-1-0-lite-t2v-250428");
        seedance.setCategory("video");
        PlatformConfigDocument.VideoCapabilities seedanceCapabilities = new PlatformConfigDocument.VideoCapabilities();
        seedanceCapabilities.setModes(List.of("text-to-video"));
        seedance.setVideoCapabilities(seedanceCapabilities);

        PlatformConfigDocument document = new PlatformConfigDocument();
        document.setProviders(List.of(provider));
        document.setModels(List.of(image, video, seedance));
        return document;
    }
}
