package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ModelCapabilityTemplateResolverTest {
    @Test
    void standardSeedance20UsesOfficialMultimodalAnd4kCapabilities() {
        ModelCapabilitiesProperties.Video standard = template(
                "seedance-2", "doubao-seedance-2-0-*",
                List.of("480p", "720p", "1080p", "4k"), true, false, 9, 3, 3
        );
        standard.setModes(List.of(
                "text-to-video", "image-reference", "multi-frame",
                "all-in-one-reference", "image-to-video", "first-last-frame"
        ));
        ModelCapabilityTemplateResolver resolver = resolver(
                template("seedance-2-fast", "doubao-seedance-2-0-fast-*", List.of("480p", "720p"), true, false, 9, 3, 3),
                standard
        );
        PlatformConfigDocument.Model model = model("doubao-seedance-2-0-260128");

        assertTrue(resolver.applyOfficialVideoTemplate(model));

        assertEquals("seedance-v2", model.getRequestAdapter());
        assertEquals(
                List.of("text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame"),
                model.getVideoCapabilities().getModes()
        );
        assertEquals(List.of("480p", "720p", "1080p", "4k"), model.getVideoCapabilities().getResolutions());
        assertTrue(model.getVideoCapabilities().getDurations().contains(-1));
        assertEquals(9, model.getVideoCapabilities().getMaxImages());
        assertEquals(3, model.getVideoCapabilities().getMaxVideos());
        assertEquals(3, model.getVideoCapabilities().getMaxAudios());
        assertTrue(model.getVideoCapabilities().isGenerateAudio());
    }

    @Test
    void seedance20FastWinsOverGenericPattern() {
        ModelCapabilityTemplateResolver resolver = resolver(
                template("seedance-2", "doubao-seedance-2-0-*", List.of("480p", "720p", "1080p", "4k"), true, false, 9, 3, 3),
                template("seedance-2-fast", "doubao-seedance-2-0-fast-*", List.of("480p", "720p"), true, false, 9, 3, 3)
        );
        PlatformConfigDocument.Model model = model("doubao-seedance-2-0-fast-260128");

        assertTrue(resolver.applyOfficialVideoTemplate(model));

        assertEquals(List.of("480p", "720p"), model.getVideoCapabilities().getResolutions());
    }

    @Test
    void seedance15SupportsAudioDraftAndSmartDurationWithoutReferenceMedia() {
        ModelCapabilitiesProperties.Video template = template(
                "seedance-1-5-pro", "doubao-seedance-1-5-pro-*",
                List.of("480p", "720p", "1080p"), true, true, 2, 0, 0
        );
        template.setRequestAdapter("seedance-v1.5");
        template.setModes(List.of("text-to-video", "image-to-video", "first-last-frame"));
        PlatformConfigDocument.Model model = model("doubao-seedance-1-5-pro-251215");

        assertTrue(resolver(template).applyOfficialVideoTemplate(model));

        assertTrue(model.getVideoCapabilities().isGenerateAudio());
        assertTrue(model.getVideoCapabilities().isDraft());
        assertTrue(model.getVideoCapabilities().getDurations().contains(-1));
        assertEquals(0, model.getVideoCapabilities().getMaxVideos());
        assertEquals(0, model.getVideoCapabilities().getMaxAudios());
    }

    @Test
    void seedance10VariantsExposeOnlyTheirDocumentedModes() {
        ModelCapabilitiesProperties.Video pro = template(
                "seedance-1-pro", "doubao-seedance-1-0-pro-*",
                List.of("480p", "720p", "1080p"), false, false, 2, 0, 0
        );
        pro.setRequestAdapter("seedance-v1");
        pro.setModes(List.of("text-to-video", "image-to-video", "first-last-frame"));
        ModelCapabilitiesProperties.Video fast = template(
                "seedance-1-pro-fast", "doubao-seedance-1-0-pro-fast-*",
                List.of("480p", "720p", "1080p"), false, false, 1, 0, 0
        );
        fast.setRequestAdapter("seedance-v1");
        fast.setModes(List.of("text-to-video", "image-to-video"));
        ModelCapabilityTemplateResolver resolver = resolver(pro, fast);
        PlatformConfigDocument.Model proModel = model("doubao-seedance-1-0-pro-250528");
        PlatformConfigDocument.Model fastModel = model("doubao-seedance-1-0-pro-fast-251015");

        assertTrue(resolver.applyOfficialVideoTemplate(proModel));
        assertTrue(resolver.applyOfficialVideoTemplate(fastModel));

        assertTrue(proModel.getVideoCapabilities().getModes().contains("first-last-frame"));
        assertFalse(proModel.getVideoCapabilities().isGenerateAudio());
        assertFalse(fastModel.getVideoCapabilities().getModes().contains("first-last-frame"));
        assertFalse(fastModel.getVideoCapabilities().isGenerateAudio());
    }

    private static ModelCapabilityTemplateResolver resolver(ModelCapabilitiesProperties.Video... templates) {
        ModelCapabilitiesProperties properties = new ModelCapabilitiesProperties();
        properties.setVideo(List.of(templates));
        return new ModelCapabilityTemplateResolver(properties);
    }

    private static ModelCapabilitiesProperties.Video template(
            String id,
            String pattern,
            List<String> resolutions,
            boolean generateAudio,
            boolean draft,
            int maxImages,
            int maxVideos,
            int maxAudios
    ) {
        ModelCapabilitiesProperties.Video template = new ModelCapabilitiesProperties.Video();
        template.setId(id);
        template.setProvider("seedance");
        template.setRequestAdapter("seedance-v2");
        template.setModelPatterns(List.of(pattern));
        template.setModes(List.of("text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame"));
        template.setRatios(List.of("adaptive", "16:9", "9:16"));
        template.setResolutions(resolutions);
        template.setDurations(List.of(-1, 4, 5, 15));
        template.setCounts(List.of(1));
        template.setGenerateAudio(generateAudio);
        template.setWatermark(true);
        template.setDraft(draft);
        template.setMaxImages(maxImages);
        template.setMaxVideos(maxVideos);
        template.setMaxAudios(maxAudios);
        return template;
    }

    private static PlatformConfigDocument.Model model(String requestModel) {
        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setRequestModel(requestModel);
        model.setCategory("video");
        return model;
    }
}
