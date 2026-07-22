package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.ImageModelCapabilityResponse;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import com.infinitecanvas.backend.dto.RuntimeConfigResponse;
import com.infinitecanvas.backend.dto.VideoModelCapabilityResponse;
import com.infinitecanvas.backend.entity.PlatformConfigEntity;
import com.infinitecanvas.backend.repository.PlatformConfigRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlatformConfigRuntimeContractTest {
    @Test
    void emptyPlatformConfigDoesNotCreateDefaultProvidersOrModels() {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.empty());

        PlatformConfigService service = new PlatformConfigService(
                repository,
                new ObjectMapper(),
                ""
        );

        PlatformConfigDocument result = service.getAdminConfig();

        assertTrue(result.getProviders().isEmpty());
        assertTrue(result.getModels().isEmpty());
    }

    @Test
    void readingSavedConfigDoesNotAutomaticallyAddOfficialModels() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument document = document();
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        PlatformConfigService service = new PlatformConfigService(
                repository,
                objectMapper,
                ""
        );

        PlatformConfigDocument result = service.getAdminConfig();

        assertEquals(document.getModels().size(), result.getModels().size());
    }

    @Test
    void unverifiedModelsAreExcludedFromRuntimeCatalog() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument document = document();
        document.getModels().getFirst().setVerificationStatus("unverified");
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        PlatformConfigService service = new PlatformConfigService(repository, objectMapper, "");

        RuntimeConfigResponse runtime = service.runtimeConfig();

        assertTrue(runtime.providers().getFirst().models().stream().noneMatch(model -> "image-model".equals(model.id())));
    }

    @Test
    void saveCannotForgeModelVerification() {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        when(repository.findById(1L)).thenReturn(Optional.empty());
        PlatformConfigDocument document = document();
        PlatformConfigDocument.Model model = document.getModels().getFirst();
        model.setVerificationStatus("verified");
        model.setPublished(true);

        PlatformConfigService service = new PlatformConfigService(repository, new ObjectMapper(), "");

        PlatformConfigDocument saved = service.save(document);

        PlatformConfigDocument.Model savedModel = saved.getModels().getFirst();
        assertEquals("unverified", savedModel.getVerificationStatus());
        assertTrue(!savedModel.isPublished());
    }

    @Test
    void changingVerifiedModelConfigurationInvalidatesVerificationAndPublication() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument existing = document();
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(existing));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        PlatformConfigDocument changed = objectMapper.readValue(objectMapper.writeValueAsString(existing), PlatformConfigDocument.class);
        changed.getModels().getFirst().setRequestAdapter("changed-adapter");

        PlatformConfigService service = new PlatformConfigService(repository, objectMapper, "");

        PlatformConfigDocument saved = service.save(changed);

        PlatformConfigDocument.Model model = saved.getModels().getFirst();
        assertEquals("unverified", model.getVerificationStatus());
        assertTrue(!model.isPublished());
    }

    @Test
    void modelVerificationUsesProviderCredentialsAndRequiresExplicitPublication() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/models", exchange -> {
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            byte[] body = ("Bearer secret".equals(authorization)
                    ? "{\"data\":[{\"id\":\"image-request-model\"}]}"
                    : "{\"error\":\"unauthorized\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders("Bearer secret".equals(authorization) ? 200 : 401, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
            ObjectMapper objectMapper = new ObjectMapper();
            PlatformConfigDocument document = document();
            PlatformConfigDocument.Provider provider = document.getProviders().getFirst();
            provider.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
            PlatformConfigDocument.Model model = document.getModels().getFirst();
            model.setVerificationStatus("unverified");
            model.setVerifiedAt("");
            model.setVerificationMessage("");
            model.setPublished(false);
            PlatformConfigEntity entity = new PlatformConfigEntity();
            entity.setData(objectMapper.writeValueAsString(document));
            when(repository.findById(1L)).thenReturn(Optional.of(entity));

            PlatformConfigService service = new PlatformConfigService(repository, objectMapper, "");

            PlatformConfigDocument verified = service.verifyModel("image-model");

            PlatformConfigDocument.Model verifiedModel = verified.getModels().getFirst();
            assertEquals("verified", verifiedModel.getVerificationStatus());
            assertTrue(!verifiedModel.getVerifiedAt().isBlank());
            assertTrue(!verifiedModel.isPublished());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void rejectsImageReferenceModesWhenReferenceLimitIsZero() {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        PlatformConfigService service = new PlatformConfigService(
                repository,
                new ObjectMapper(),
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
        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument document = document();
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        PlatformConfigService platformConfigService = new PlatformConfigService(
                repository,
                objectMapper,
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
                "doubao-seedance-1-0-pro-250528",
                "seedance-1-pro",
                "seedance-1.0-pro",
                "seedance-1-0-pro"
        ), runtimeSeedance.modelPatterns());
        assertEquals(seedanceCapability.modelPatterns(), runtimeSeedance.modelPatterns());
        assertTrue(runtimeImage.modelPatterns().contains(imageCapability.id()));
        assertTrue(runtimeVideo.modelPatterns().contains(videoCapability.id()));
        assertTrue(runtimeSeedance.modelPatterns().contains("seedance-1-pro"));
    }

    @Test
    void agnesVideoLegacyOpenAiAdapterIsPublishedAsAgnesV2() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();

        PlatformConfigDocument.Provider provider = new PlatformConfigDocument.Provider();
        provider.setId("agnes");
        provider.setName("Agnes");
        provider.setBaseUrl("https://apihub.agnes-ai.com/v1");
        provider.setApiKey("secret");
        provider.setEnabled(true);

        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setId("agnes-video");
        model.setProviderId(provider.getId());
        model.setDisplayName("Agnes Video 2.0");
        model.setRequestModel("agnes-video-v2.0");
        model.setCategory("video");
        model.setRequestAdapter("openai");
        markVerified(model);

        PlatformConfigDocument document = new PlatformConfigDocument();
        document.setProviders(List.of(provider));
        document.setModels(List.of(model));
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        PlatformConfigService service = new PlatformConfigService(repository, objectMapper, "");

        RuntimeConfigResponse.Model runtimeModel = service.runtimeConfig().providers().getFirst().models().getFirst();
        assertEquals("agnes-v2", runtimeModel.requestAdapter());
        assertEquals("agnes-v2", service.requireRuntimeModel("agnes-video").model().getRequestAdapter());
    }

    @Test
    void officialSeedanceTemplateIsPublishedAndKeepsSmartDuration() throws Exception {
        PlatformConfigRepository repository = mock(PlatformConfigRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();
        PlatformConfigDocument document = document();
        PlatformConfigDocument.Model seedance = document.getModels().stream()
                .filter(model -> "seedance-canonical".equals(model.getId()))
                .findFirst()
                .orElseThrow();
        seedance.setRequestModel("doubao-seedance-2-0-260128");
        seedance.setRequestAdapter("openai");
        seedance.setVideoCapabilities(new PlatformConfigDocument.VideoCapabilities());
        PlatformConfigEntity entity = new PlatformConfigEntity();
        entity.setData(objectMapper.writeValueAsString(document));
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        ModelCapabilitiesProperties properties = new ModelCapabilitiesProperties();
        ModelCapabilitiesProperties.Video template = new ModelCapabilitiesProperties.Video();
        template.setRequestAdapter("seedance-v2");
        template.setModelPatterns(List.of("doubao-seedance-2-0-*"));
        template.setModes(List.of("text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame"));
        template.setRatios(List.of("adaptive", "16:9"));
        template.setResolutions(List.of("480p", "720p", "1080p", "4k"));
        template.setDurations(List.of(-1, 4, 15));
        template.setCounts(List.of(1));
        template.setGenerateAudio(true);
        template.setWatermark(true);
        template.setMaxImages(9);
        template.setMaxVideos(3);
        template.setMaxAudios(3);
        properties.setVideo(List.of(template));
        PlatformConfigService service = new PlatformConfigService(
                repository,
                objectMapper,
                "",
                new ModelCapabilityTemplateResolver(properties)
        );

        RuntimeConfigResponse.Model runtimeModel = service.runtimeConfig().providers().getFirst().models().stream()
                .filter(model -> "seedance-canonical".equals(model.id()))
                .findFirst()
                .orElseThrow();

        assertEquals("seedance-v2", runtimeModel.requestAdapter());
        assertEquals(List.of(-1, 4, 15), runtimeModel.videoCapabilities().durations());
        assertEquals(9, runtimeModel.videoCapabilities().maxImages());
        assertEquals(3, runtimeModel.videoCapabilities().maxVideos());
        assertEquals(3, runtimeModel.videoCapabilities().maxAudios());
        assertTrue(runtimeModel.videoCapabilities().generateAudio());
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
        markVerified(image);

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
        markVerified(video);

        PlatformConfigDocument.Model seedance = new PlatformConfigDocument.Model();
        seedance.setId("seedance-canonical");
        seedance.setProviderId(provider.getId());
        seedance.setDisplayName("Seedance Lite T2V");
        seedance.setRequestModel("doubao-seedance-1-0-pro-250528");
        seedance.setCategory("video");
        PlatformConfigDocument.VideoCapabilities seedanceCapabilities = new PlatformConfigDocument.VideoCapabilities();
        seedanceCapabilities.setModes(List.of("text-to-video"));
        seedance.setVideoCapabilities(seedanceCapabilities);
        markVerified(seedance);

        PlatformConfigDocument document = new PlatformConfigDocument();
        document.setProviders(List.of(provider));
        document.setModels(List.of(image, video, seedance));
        return document;
    }

    private static void markVerified(PlatformConfigDocument.Model model) {
        model.setVerificationStatus("verified");
        model.setVerifiedAt("2026-07-21T00:00:00Z");
        model.setVerificationMessage("模型认证与能力配置已验证");
        model.setPublished(true);
    }
}
