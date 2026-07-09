package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.*;
import com.infinitecanvas.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class UserDataService {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UserConfigRepository configs;
    private final CanvasProjectRepository projects;
    private final UserAssetRepository assets;

    public UserDataService(UserConfigRepository configs, CanvasProjectRepository projects, UserAssetRepository assets) {
        this.configs = configs;
        this.projects = projects;
        this.assets = assets;
    }

    @Transactional(readOnly = true)
    public UserConfig getConfig(User user) {
        return configs.findByUserId(user.getId()).orElse(null);
    }

    @Transactional
    public UserConfig saveConfig(User user, String data) {
        UserConfig config = configs.findByUserId(user.getId()).orElseGet(() -> {
            UserConfig item = new UserConfig();
            item.setId(UUID.randomUUID().toString().replace("-", ""));
            item.setUser(user);
            return item;
        });
        config.setData(data);
        config.setUpdatedAt(Instant.now());
        return configs.save(config);
    }

    @Transactional(readOnly = true)
    public List<Object> getProjects(User user) {
        return projects.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream().map(item -> readJson(item.getProjectJson())).toList();
    }

    @Transactional
    public void replaceProjects(User user, List<Object> items) {
        Map<String, CanvasProjectEntity> existing = new HashMap<>();
        projects.findByUserIdOrderByUpdatedAtDesc(user.getId()).forEach(item -> existing.put(projectDataId(item), item));
        Set<String> nextRecordIds = new HashSet<>();
        for (Object item : items) {
            Map<String, Object> project = asMap(item);
            String id = string(project.get("id"));
            if (id.isBlank()) id = UUID.randomUUID().toString().replace("-", "");
            CanvasProjectEntity entity = existing.get(id);
            if (entity == null) {
                entity = new CanvasProjectEntity();
                entity.setId(recordId(user.getId(), id));
            }
            nextRecordIds.add(entity.getId());
            entity.setUser(user);
            entity.setTitle(defaultString(project.get("title"), "未命名画布"));
            entity.setCreatedAt(parseInstant(project.get("createdAt"), Instant.now()));
            entity.setUpdatedAt(parseInstant(project.get("updatedAt"), Instant.now()));
            entity.setProjectJson(writeJson(withId(project, id)));
            projects.save(entity);
        }
        existing.values().stream().filter(item -> !nextRecordIds.contains(item.getId())).forEach(item -> projects.deleteByUserIdAndId(user.getId(), item.getId()));
    }

    @Transactional(readOnly = true)
    public List<Object> getAssets(User user) {
        return assets.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream().map(item -> readJson(item.getAssetJson())).toList();
    }

    @Transactional
    public void replaceAssets(User user, List<Object> items) {
        Map<String, UserAsset> existing = new HashMap<>();
        assets.findByUserIdOrderByUpdatedAtDesc(user.getId()).forEach(item -> existing.put(assetDataId(item), item));
        Set<String> nextRecordIds = new HashSet<>();
        for (Object item : items) {
            Map<String, Object> asset = asMap(item);
            String id = string(asset.get("id"));
            if (id.isBlank()) id = UUID.randomUUID().toString().replace("-", "");
            UserAsset entity = existing.get(id);
            if (entity == null) {
                entity = new UserAsset();
                entity.setId(recordId(user.getId(), id));
            }
            nextRecordIds.add(entity.getId());
            entity.setUser(user);
            entity.setUpdatedAt(parseInstant(asset.get("updatedAt"), Instant.now()));
            entity.setAssetJson(writeJson(withId(asset, id)));
            assets.save(entity);
        }
        existing.values().stream().filter(item -> !nextRecordIds.contains(item.getId())).forEach(item -> assets.deleteByUserIdAndId(user.getId(), item.getId()));
    }

    public String writeJson(Object value) {
        try {
            return value instanceof String s ? s : objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalArgumentException("JSON 序列化失败");
        }
    }

    private Object readJson(String json) {
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) return new LinkedHashMap<>((Map<String, Object>) map);
        throw new IllegalArgumentException("数据格式错误");
    }

    private Map<String, Object> withId(Map<String, Object> value, String id) {
        value.put("id", id);
        return value;
    }

    private String projectDataId(CanvasProjectEntity item) {
        Object parsed = readJson(item.getProjectJson());
        if (parsed instanceof Map<?, ?> map) {
            String id = string(map.get("id"));
            if (!id.isBlank()) return id;
        }
        return dataIdFromRecordId(item.getId());
    }

    private String assetDataId(UserAsset item) {
        Object parsed = readJson(item.getAssetJson());
        if (parsed instanceof Map<?, ?> map) {
            String id = string(map.get("id"));
            if (!id.isBlank()) return id;
        }
        return dataIdFromRecordId(item.getId());
    }

    private String recordId(String userId, String dataId) {
        return userId + ":" + dataId;
    }

    private String dataIdFromRecordId(String recordId) {
        int index = recordId.indexOf(':');
        return index >= 0 ? recordId.substring(index + 1) : recordId;
    }

    private String string(Object value) {
        return value instanceof String s ? s.trim() : "";
    }

    private String defaultString(Object value, String fallback) {
        String text = string(value);
        return text.isBlank() ? fallback : text;
    }

    private Instant parseInstant(Object value, Instant fallback) {
        if (value instanceof String s) {
            try {
                return Instant.parse(s);
            } catch (Exception ignored) {
            }
        }
        return fallback;
    }
}
