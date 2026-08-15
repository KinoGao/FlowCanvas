package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.AgentRun;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.AgentRunRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Agent Run 业务层：创建/查询/暂停/继续/取消/任务重试，执行交给 AgentRunExecutor。 */
@Service
public class AgentRunService {
    private final AgentRunRepository runs;
    private final AgentRunExecutor executor;
    private final ObjectMapper mapper = new ObjectMapper();

    public AgentRunService(AgentRunRepository runs, AgentRunExecutor executor) {
        this.runs = runs;
        this.executor = executor;
    }

    @Transactional
    public Map<String, Object> create(User user, String sessionToken, Map<String, Object> body) {
        String id = text(body.get("id"));
        if (id == null || id.length() > 64) throw new IllegalArgumentException("run id 不能为空");
        if (runs.findByIdAndUserId(id, user.getId()).isPresent()) throw new IllegalArgumentException("run 已存在");
        String projectId = text(body.get("projectId"));
        if (projectId == null) throw new IllegalArgumentException("缺少 projectId");
        Object rawTasks = body.get("tasks");
        if (!(rawTasks instanceof List<?> list) || list.isEmpty() || list.size() > 24) throw new IllegalArgumentException("任务数量需为 1-24");
        List<Map<String, Object>> tasks = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) throw new IllegalArgumentException("任务格式不正确");
            Map<String, Object> task = new LinkedHashMap<>();
            task.put("id", require(text(map.get("id")), "任务缺少 id"));
            task.put("nodeId", require(text(map.get("nodeId")), "任务缺少 nodeId"));
            task.put("type", require(text(map.get("type")), "任务缺少 type"));
            task.put("title", text(map.get("title")) != null ? text(map.get("title")) : "任务");
            task.put("prompt", require(text(map.get("prompt")), "任务缺少提示词"));
            task.put("modelId", require(text(map.get("modelId")), "任务缺少模型"));
            task.put("dependencies", map.get("dependencies") instanceof List<?> deps ? deps : List.of());
            task.put("params", map.get("params") instanceof Map<?, ?> params ? params : Map.of());
            task.put("status", "READY");
            task.put("attempts", 0);
            tasks.add(task);
        }
        AgentRun run = new AgentRun();
        run.setId(id);
        run.setUser(user);
        run.setProjectId(projectId);
        run.setTitle(text(body.get("title")) != null ? text(body.get("title")) : "创作任务");
        run.setRequirement(text(body.get("requirement")));
        run.setPlanJson(json(body.get("plan")));
        run.setSessionToken(require(sessionToken, "缺少会话令牌"));
        run.setStatus("RUNNING");
        run.setTasksJson(json(tasks));
        runs.save(run);
        return toView(run);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(User user, String projectId) {
        return runs.findByUserIdAndProjectIdOrderByCreatedAtDesc(user.getId(), projectId).stream().map(this::toView).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(User user, String id) {
        return toView(requireRun(user, id));
    }

    @Transactional
    public Map<String, Object> action(User user, String id, String action) {
        AgentRun run = requireRun(user, id);
        switch (action) {
            case "pause" -> {
                if ("RUNNING".equals(run.getStatus())) {
                    run.setStatus("PAUSED");
                    save(run);
                }
            }
            case "resume" -> {
                if ("PAUSED".equals(run.getStatus()) || "FAILED".equals(run.getStatus())) {
                    List<Map<String, Object>> tasks = executor.readTasks(run);
                    tasks.forEach(task -> {
                        if ("FAILED".equals(task.get("status"))) {
                            task.put("status", "READY");
                            task.remove("error");
                        }
                    });
                    executor.writeTasks(run, tasks);
                    run.setStatus("RUNNING");
                    save(run);
                }
            }
            case "cancel" -> {
                if (!isTerminal(run.getStatus())) {
                    List<Map<String, Object>> tasks = executor.readTasks(run);
                    tasks.forEach(task -> {
                        if (!"COMPLETED".equals(task.get("status"))) task.put("status", "CANCELLED");
                    });
                    executor.writeTasks(run, tasks);
                    run.setStatus("CANCELLED");
                    save(run);
                }
            }
            default -> throw new IllegalArgumentException("不支持的操作");
        }
        return toView(run);
    }

    @Transactional
    public Map<String, Object> retryTask(User user, String id, String taskId) {
        AgentRun run = requireRun(user, id);
        List<Map<String, Object>> tasks = executor.readTasks(run);
        Map<String, Object> target = tasks.stream().filter(task -> taskId.equals(task.get("id"))).findFirst().orElse(null);
        if (target == null) throw new IllegalArgumentException("任务不存在");
        if (!"FAILED".equals(target.get("status")) && !"CANCELLED".equals(target.get("status"))) throw new IllegalArgumentException("仅失败或已取消的任务可重试");
        target.put("status", "READY");
        target.remove("error");
        executor.writeTasks(run, tasks);
        run.setStatus("RUNNING");
        save(run);
        return toView(run);
    }

    /** 事务提交后的派发循环入口（供控制器调用，避免在 @Transactional 内启动读不到未提交数据）。 */
    public void startLoop(String runId) {
        executor.startLoop(runId);
    }

    private AgentRun requireRun(User user, String id) {
        return runs.findByIdAndUserId(id, user.getId()).orElseThrow(() -> new IllegalArgumentException("run 不存在"));
    }

    private boolean isTerminal(String status) {
        return "COMPLETED".equals(status) || "FAILED".equals(status) || "CANCELLED".equals(status);
    }

    private void save(AgentRun run) {
        run.setUpdatedAt(Instant.now());
        runs.save(run);
    }

    private Map<String, Object> toView(AgentRun run) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", run.getId());
        view.put("projectId", run.getProjectId());
        view.put("title", run.getTitle());
        view.put("requirement", run.getRequirement());
        view.put("status", run.getStatus().toLowerCase());
        view.put("plan", parse(run.getPlanJson()));
        view.put("tasks", parse(run.getTasksJson()));
        view.put("createdAt", run.getCreatedAt().toEpochMilli());
        view.put("updatedAt", run.getUpdatedAt().toEpochMilli());
        return view;
    }

    private Object parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return mapper.readValue(json, Object.class);
        } catch (Exception error) {
            return null;
        }
    }

    private String json(Object value) {
        if (value == null) return null;
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalArgumentException("JSON 序列化失败");
        }
    }

    private String require(String value, String message) {
        if (value == null) throw new IllegalArgumentException(message);
        return value;
    }

    private String text(Object value) {
        return value instanceof String s && !s.isBlank() ? s.trim() : null;
    }
}
