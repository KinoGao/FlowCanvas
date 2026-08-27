package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.CanvasTemplate;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.CanvasTemplateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CanvasTemplateService {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CanvasTemplateRepository templates;

    public CanvasTemplateService(CanvasTemplateRepository templates) {
        this.templates = templates;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listTemplates(User user) {
        return templates.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream()
                .map(this::toTemplateMap)
                .toList();
    }

    @Transactional
    public Map<String, Object> saveTemplate(User user, String name, Object nodes, Object connections) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("模板名称不能为空");
        if (!(nodes instanceof List<?>)) throw new IllegalArgumentException("无效的模板 JSON：nodes 必须是数组");
        if (!(connections instanceof List<?>)) throw new IllegalArgumentException("无效的模板 JSON：connections 必须是数组");

        CanvasTemplate template = new CanvasTemplate();
        template.setId(UUID.randomUUID().toString().replace("-", ""));
        template.setUser(user);
        template.setName(name.trim());
        template.setNodesJson(writeJson(nodes));
        template.setConnectionsJson(writeJson(connections));
        template.setCreatedAt(Instant.now());
        template.setUpdatedAt(template.getCreatedAt());
        templates.save(template);
        return toTemplateMap(template);
    }

    @Transactional
    public boolean deleteTemplate(User user, String id) {
        var template = templates.findByUserIdAndId(user.getId(), id);
        if (template.isEmpty()) return false;
        templates.delete(template.get());
        return true;
    }

    private Map<String, Object> toTemplateMap(CanvasTemplate template) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", template.getId());
        result.put("name", template.getName());
        result.put("createdAt", template.getCreatedAt().toString());
        result.put("nodes", readJsonList(template.getNodesJson()));
        result.put("connections", readJsonList(template.getConnectionsJson()));
        return result;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("无效的模板 JSON", e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Object> readJsonList(String json) {
        try {
            return objectMapper.readValue(json, List.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("模板 JSON 数据损坏: " + json, e);
        }
    }
}
