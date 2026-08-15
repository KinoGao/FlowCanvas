package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.CanvasProjectEntity;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserAsset;
import com.infinitecanvas.backend.entity.UserConfig;
import com.infinitecanvas.backend.entity.UserGenerationLog;
import com.infinitecanvas.backend.repository.CanvasProjectRepository;
import com.infinitecanvas.backend.repository.UserAssetRepository;
import com.infinitecanvas.backend.repository.UserConfigRepository;
import com.infinitecanvas.backend.repository.UserGenerationLogRepository;
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
    private final UserGenerationLogRepository generationLogs;

    public UserDataService(
            UserConfigRepository configs,
            CanvasProjectRepository projects,
            UserAssetRepository assets,
            UserGenerationLogRepository generationLogs
    ) {
        this.configs = configs;
        this.projects = projects;
        this.assets = assets;
        this.generationLogs = generationLogs;
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
        return projects.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream()
                .filter(item -> item.getDeletedAt() == null)
                .map(item -> readJson(item.getProjectJson()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, String> getProjectTombstones(User user) {
        Map<String, String> tombstones = new HashMap<>();
        projects.findByUserIdOrderByUpdatedAtDesc(user.getId()).forEach(item -> {
            if (item.getDeletedAt() != null) tombstones.put(projectDataId(item), item.getDeletedAt().toString());
        });
        return tombstones;
    }

    @Transactional
    public void replaceProjects(User user, List<Object> items) {
        replaceProjects(user, items, Collections.emptyMap());
    }

    @Transactional
    public void replaceProjects(User user, List<Object> items, Map<String, String> tombstones) {
        Map<String, CanvasProjectEntity> existing = new HashMap<>();
        projects.findByUserIdOrderByUpdatedAtDesc(user.getId()).forEach(item -> existing.put(projectDataId(item), item));

        for (Object item : items) {
            Map<String, Object> project = asMap(item);
            String id = string(project.get("id"));
            if (id.isBlank()) id = UUID.randomUUID().toString().replace("-", "");
            Instant projectUpdatedAt = parseInstant(project.get("updatedAt"), Instant.now());
            Instant deletedAt = parseInstant(tombstones.get(id), null);
            if (deletedAt != null && !projectUpdatedAt.isAfter(deletedAt)) continue;

            CanvasProjectEntity entity = existing.get(id);
            if (entity != null && shouldPreserveExistingProject(entity, project, projectUpdatedAt)) continue;
            if (entity == null) {
                entity = new CanvasProjectEntity();
                entity.setId(recordId(user.getId(), id));
            }
            entity.setUser(user);
            entity.setTitle(defaultString(project.get("title"), "未命名画布"));
            entity.setCreatedAt(parseInstant(project.get("createdAt"), Instant.now()));
            entity.setUpdatedAt(projectUpdatedAt);
            entity.setDeletedAt(null);
            entity.setProjectJson(writeJson(withId(project, id)));
            projects.save(entity);
            existing.put(id, entity);
        }

        tombstones.forEach((id, deletedAtText) -> {
            String cleanId = string(id);
            Instant deletedAt = parseInstant(deletedAtText, null);
            if (cleanId.isBlank() || deletedAt == null) return;
            CanvasProjectEntity entity = existing.get(cleanId);
            if (entity == null) {
                entity = new CanvasProjectEntity();
                entity.setId(recordId(user.getId(), cleanId));
                entity.setUser(user);
                entity.setTitle("已删除画布");
                entity.setCreatedAt(deletedAt);
                entity.setUpdatedAt(deletedAt);
                entity.setProjectJson(writeJson(Map.of("id", cleanId, "title", "已删除画布", "createdAt", deletedAt.toString(), "updatedAt", deletedAt.toString())));
            }
            if (entity.getUpdatedAt() != null && entity.getUpdatedAt().isAfter(deletedAt)) return;
            if (entity.getDeletedAt() == null || entity.getDeletedAt().isBefore(deletedAt)) {
                entity.setDeletedAt(deletedAt);
                projects.save(entity);
            }
        });
    }

    @Transactional(readOnly = true)
    public List<Object> getAssets(User user) {
        return assets.findByUserIdOrderByUpdatedAtDesc(user.getId()).stream().map(item -> readJson(item.getAssetJson())).toList();
    }

    @Transactional
    public void replaceAssets(User user, List<Object> items) {
        Map<String, UserAsset> existing = new HashMap<>();
        assets.findByUserIdOrderByUpdatedAtDesc(user.getId()).forEach(item -> existing.put(assetDataId(item), item));
        for (Object item : items) {
            Map<String, Object> asset = asMap(item);
            String id = string(asset.get("id"));
            if (id.isBlank()) id = UUID.randomUUID().toString().replace("-", "");
            UserAsset entity = existing.get(id);
            if (entity == null) {
                entity = new UserAsset();
                entity.setId(recordId(user.getId(), id));
            }
            entity.setUser(user);
            entity.setUpdatedAt(parseInstant(asset.get("updatedAt"), Instant.now()));
            entity.setAssetJson(writeJson(withId(asset, id)));
            assets.save(entity);
        }
    }

    @Transactional(readOnly = true)
    public List<Object> getGenerationLogs(User user, String kind) {
        String normalizedKind = normalizeGenerationKind(kind);
        return generationLogs.findByUserIdAndKindOrderByCreatedAtDesc(user.getId(), normalizedKind).stream()
                .map(item -> readJson(item.getLogJson()))
                .toList();
    }

    @Transactional
    public void saveGenerationLog(User user, String kind, String logId, Object value) {
        String normalizedKind = normalizeGenerationKind(kind);
        String normalizedLogId = string(logId);
        if (normalizedLogId.isBlank()) throw new IllegalArgumentException("生成记录 ID 不能为空");

        Map<String, Object> log = asMap(value);
        log.put("id", normalizedLogId);
        Instant now = Instant.now();
        UserGenerationLog entity = generationLogs
                .findByUserIdAndKindAndLogId(user.getId(), normalizedKind, normalizedLogId)
                .orElseGet(() -> {
                    UserGenerationLog item = new UserGenerationLog();
                    item.setId(user.getId() + ":" + normalizedKind + ":" + normalizedLogId);
                    item.setUser(user);
                    item.setKind(normalizedKind);
                    item.setLogId(normalizedLogId);
                    item.setCreatedAt(parseEpochMillis(log.get("createdAt"), now));
                    return item;
                });
        entity.setLogJson(writeJson(log));
        entity.setUpdatedAt(now);
        generationLogs.save(entity);
    }

    @Transactional
    public void deleteGenerationLog(User user, String kind, String logId) {
        generationLogs.deleteByUserIdAndKindAndLogId(user.getId(), normalizeGenerationKind(kind), string(logId));
    }

    private String normalizeGenerationKind(String kind) {
        String normalized = string(kind).toLowerCase(Locale.ROOT);
        if (!normalized.equals("image") && !normalized.equals("video") && !normalized.equals("chat") && !normalized.equals("agentrun")) {
            throw new IllegalArgumentException("不支持的生成记录类型");
        }
        return normalized;
    }

    private Instant parseEpochMillis(Object value, Instant fallback) {
        if (value instanceof Number number) {
            try {
                return Instant.ofEpochMilli(number.longValue());
            } catch (Exception ignored) {
            }
        }
        return parseInstant(value, fallback);
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

    private boolean shouldPreserveExistingProject(CanvasProjectEntity entity, Map<String, Object> incoming, Instant incomingUpdatedAt) {
        Object storedProject = readJson(entity.getProjectJson());
        Instant storedUpdatedAt = storedProject instanceof Map<?, ?> map
                ? parseInstant(map.get("updatedAt"), entity.getUpdatedAt())
                : entity.getUpdatedAt();
        if (storedUpdatedAt == null) return false;
        if (storedUpdatedAt.isAfter(incomingUpdatedAt)) return true;
        if (storedUpdatedAt.isBefore(incomingUpdatedAt)) return false;
        return projectDetailScore(storedProject) >= projectDetailScore(incoming);
    }

    private long projectDetailScore(Object value) {
        if (!(value instanceof Map<?, ?> map)) return 0;
        long nodes = listSize(map.get("nodes"));
        long connections = listSize(map.get("connections"));
        long chatSessions = listSize(map.get("chatSessions"));
        return nodes * 1_000_000L + connections * 10_000L + chatSessions * 100L + writeJson(value).length();
    }

    private int listSize(Object value) {
        return value instanceof Collection<?> collection ? collection.size() : 0;
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
