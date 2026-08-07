package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.CanvasTemplate;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.CanvasTemplateRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CanvasTemplateServiceTest {

    private final CanvasTemplateRepository repository = mock(CanvasTemplateRepository.class);
    private final CanvasTemplateService service = new CanvasTemplateService(repository);

    private User user(String id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    @Test
    void rejectsBlankName() {
        User user = user("u1");
        assertThrows(IllegalArgumentException.class,
                () -> service.saveTemplate(user, "  ", List.of(), List.of()));
        assertThrows(IllegalArgumentException.class,
                () -> service.saveTemplate(user, null, List.of(), List.of()));
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsNonArrayNodes() {
        assertThrows(IllegalArgumentException.class,
                () -> service.saveTemplate(user("u1"), "四宫格分镜", "not-an-array", List.of()));
    }

    @Test
    void rejectsNonArrayConnections() {
        assertThrows(IllegalArgumentException.class,
                () -> service.saveTemplate(user("u1"), "四宫格分镜", List.of(), Map.of("a", 1)));
    }

    @Test
    void savesTemplateWithGeneratedIdAndJsonColumns() {
        User user = user("u1");
        Map<String, Object> node = Map.of("id", "n1", "type", "text");
        Map<String, Object> connection = Map.of("fromNodeId", "n1", "toNodeId", "n2");

        Map<String, Object> saved = service.saveTemplate(user, "四宫格分镜", List.of(node), List.of(connection));

        assertEquals("四宫格分镜", saved.get("name"));
        assertNotNull(saved.get("id"));
        assertNotNull(saved.get("createdAt"));

        ArgumentCaptor<CanvasTemplate> captor = ArgumentCaptor.forClass(CanvasTemplate.class);
        verify(repository).save(captor.capture());
        CanvasTemplate entity = captor.getValue();
        assertEquals(user, entity.getUser());
        assertTrue(entity.getNodesJson().contains("\"type\":\"text\""));
        assertTrue(entity.getConnectionsJson().contains("\"toNodeId\":\"n2\""));
        assertNotNull(entity.getCreatedAt());
        assertNotNull(entity.getUpdatedAt());
    }

    @Test
    void listsTemplatesInFrontendShape() {
        User user = user("u1");
        CanvasTemplate template = new CanvasTemplate();
        template.setId("t1");
        template.setName("模板A");
        template.setCreatedAt(Instant.parse("2025-06-01T00:00:00Z"));
        template.setNodesJson("[{\"id\":\"n1\"}]");
        template.setConnectionsJson("[]");
        when(repository.findByUserIdOrderByUpdatedAtDesc("u1")).thenReturn(List.of(template));

        List<Map<String, Object>> list = service.listTemplates(user);

        assertEquals(1, list.size());
        Map<String, Object> item = list.get(0);
        assertEquals("t1", item.get("id"));
        assertEquals("模板A", item.get("name"));
        assertEquals("2025-06-01T00:00:00Z", item.get("createdAt"));
        assertEquals(List.of(Map.of("id", "n1")), item.get("nodes"));
        assertEquals(List.of(), item.get("connections"));
        verify(repository).findByUserIdOrderByUpdatedAtDesc("u1");
    }

    @Test
    void deleteReturnsFalseForTemplateNotOwnedByUser() {
        User user = user("u1");
        when(repository.findByUserIdAndId("u1", "t9")).thenReturn(Optional.empty());

        assertFalse(service.deleteTemplate(user, "t9"));
        verify(repository, never()).delete(any());
    }

    @Test
    void deleteRemovesOwnTemplate() {
        User user = user("u1");
        CanvasTemplate template = new CanvasTemplate();
        template.setId("t1");
        when(repository.findByUserIdAndId("u1", "t1")).thenReturn(Optional.of(template));

        assertTrue(service.deleteTemplate(user, "t1"));
        verify(repository).delete(template);
    }
}
