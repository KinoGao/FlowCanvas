package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

@Service
public class WorkflowService {

    private final Path workflowDir;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WorkflowService(@Value("${app.workflow-dir:./data/workflows}") String dir) {
        this.workflowDir = Paths.get(dir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.workflowDir);
        } catch (IOException e) {
            throw new RuntimeException("无法创建工作流目录: " + dir, e);
        }
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listWorkflows() {
        List<Map<String, Object>> result = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(workflowDir, "*.json")) {
            for (Path file : stream) {
                String name = file.getFileName().toString();
                if (name.endsWith(".config.json")) continue;
                result.add(readWorkflowEntry(file));
            }
        } catch (IOException e) {
            throw new RuntimeException("读取工作流列表失败", e);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getWorkflow(String id) {
        Path rawFile = resolveRawFile(id);
        if (!Files.exists(rawFile)) return null;
        return readWorkflowEntry(rawFile);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> uploadWorkflow(String name, String json) {
        try {
            Map<String, Object> raw = objectMapper.readValue(json, Map.class);
            String safeName = sanitizeName(name);
            Path rawFile = workflowDir.resolve(safeName + ".json").normalize();
            if (!rawFile.startsWith(workflowDir)) throw new IllegalArgumentException("无效的工作流名称");
            if (Files.exists(rawFile)) {
                throw new IllegalArgumentException("同名工作流已存在: " + safeName);
            }
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(rawFile.toFile(), raw);

            Path cfgFile = configPath(rawFile);
            Map<String, Object> cfg = new LinkedHashMap<>();
            cfg.put("title", safeName);
            cfg.put("fields", new ArrayList<>());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(cfgFile.toFile(), cfg);

            return readWorkflowEntry(rawFile);
        } catch (IOException e) {
            throw new RuntimeException("上传工作流失败", e);
        }
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> saveConfig(String id, Map<String, Object> config) {
        Path rawFile = resolveRawFile(id);
        if (!Files.exists(rawFile)) throw new IllegalArgumentException("工作流不存在: " + id);

        Path cfgFile = configPath(rawFile);
        Map<String, Object> normalized = new LinkedHashMap<>();
        normalized.put("title", config.getOrDefault("title", id));
        normalized.put("fields", config.getOrDefault("fields", new ArrayList<>()));

        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(cfgFile.toFile(), normalized);
        } catch (IOException e) {
            throw new RuntimeException("保存工作流配置失败", e);
        }
        return readWorkflowEntry(rawFile);
    }

    public boolean deleteWorkflow(String id) {
        Path rawFile = resolveRawFile(id);
        if (!rawFile.startsWith(workflowDir) || !Files.exists(rawFile)) return false;
        Path cfgFile = configPath(rawFile);
        try {
            Files.delete(rawFile);
            if (Files.exists(cfgFile)) Files.delete(cfgFile);
            return true;
        } catch (IOException e) {
            throw new RuntimeException("删除工作流失败", e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readWorkflowEntry(Path rawFile) {
        String fileName = rawFile.getFileName().toString();
        String id = fileName.substring(0, fileName.length() - ".json".length());
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", id);
        entry.put("name", fileName);

        try {
            Map<String, Object> raw = objectMapper.readValue(rawFile.toFile(), Map.class);
            entry.put("workflow", raw);
        } catch (IOException e) {
            entry.put("_error", "工作流文件解析失败: " + e.getMessage());
            entry.put("workflow", Map.of());
        }

        Path cfgFile = configPath(rawFile);
        if (Files.exists(cfgFile)) {
            try {
                Map<String, Object> cfg = objectMapper.readValue(cfgFile.toFile(), Map.class);
                entry.put("fields", cfg.getOrDefault("fields", new ArrayList<>()));
                entry.put("title", cfg.getOrDefault("title", id));
                entry.put("hasConfig", true);
            } catch (IOException e) {
                entry.put("fields", new ArrayList<>());
                entry.put("title", id);
                entry.put("hasConfig", false);
            }
        } else {
            entry.put("fields", new ArrayList<>());
            entry.put("title", id);
            entry.put("hasConfig", false);
        }

        entry.put("createdAt", null);
        entry.put("updatedAt", null);
        return entry;
    }

    private Path resolveRawFile(String id) {
        String safe = sanitizeName(id);
        return workflowDir.resolve(safe + ".json").normalize();
    }

    private Path configPath(Path rawFile) {
        String fileName = rawFile.getFileName().toString();
        String stem = fileName.substring(0, fileName.length() - ".json".length());
        return rawFile.resolveSibling(stem + ".config.json");
    }

    private String sanitizeName(String name) {
        if (name == null || name.isBlank()) return "workflow";
        String n = name.trim().replaceAll("\\.json$", "");
        // 只禁止路径分隔符和通配符，其余字符（含中文）直接保留
        n = n.replaceAll("[/\\\\:*?\"<>|]", "_");
        return n.isBlank() ? "workflow" : n;
    }
}