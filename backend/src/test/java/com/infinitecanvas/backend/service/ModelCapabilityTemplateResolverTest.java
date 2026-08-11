package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.config.ModelCapabilitiesProperties;
import com.infinitecanvas.backend.dto.PlatformConfigDocument;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ModelCapabilityTemplateResolverTest {
    @Test
    void appliesConfiguredVideoTemplateWithoutVendorSpecificRewrites() {
        ModelCapabilitiesProperties.Video template = template("agnes-video-v2*", "agnes-v2", List.of("image-reference", "multi-frame"));
        PlatformConfigDocument.Model model = model("agnes-video-v2.0");

        assertTrue(resolver(template).applyOfficialVideoTemplate(model));

        assertEquals("agnes-v2", model.getRequestAdapter());
        assertEquals(List.of("image-reference", "multi-frame"), model.getVideoCapabilities().getModes());
        assertEquals(List.of("720p", "1080p"), model.getVideoCapabilities().getResolutions());
    }

    @Test
    void mostSpecificPatternWins() {
        ModelCapabilityTemplateResolver resolver = resolver(
                template("video-*", "openai", List.of("text-to-video")),
                template("video-fast-*", "agnes-v2", List.of("text-to-video", "image-to-video"))
        );
        PlatformConfigDocument.Model model = model("video-fast-v2");

        assertTrue(resolver.applyOfficialVideoTemplate(model));

        assertEquals("agnes-v2", model.getRequestAdapter());
        assertEquals(List.of("text-to-video", "image-to-video"), model.getVideoCapabilities().getModes());
    }

    private static ModelCapabilityTemplateResolver resolver(ModelCapabilitiesProperties.Video... templates) {
        ModelCapabilitiesProperties properties = new ModelCapabilitiesProperties();
        properties.setVideo(List.of(templates));
        return new ModelCapabilityTemplateResolver(properties);
    }

    private static ModelCapabilitiesProperties.Video template(String pattern, String adapter, List<String> modes) {
        ModelCapabilitiesProperties.Video template = new ModelCapabilitiesProperties.Video();
        template.setId(pattern);
        template.setProvider("video");
        template.setRequestAdapter(adapter);
        template.setModelPatterns(List.of(pattern));
        template.setModes(modes);
        template.setRatios(List.of("16:9", "9:16"));
        template.setResolutions(List.of("720p", "1080p"));
        template.setDurations(List.of(5, 10));
        template.setCounts(List.of(1));
        template.setMaxImages(2);
        return template;
    }

    private static PlatformConfigDocument.Model model(String requestModel) {
        PlatformConfigDocument.Model model = new PlatformConfigDocument.Model();
        model.setRequestModel(requestModel);
        model.setCategory("video");
        return model;
    }
}
