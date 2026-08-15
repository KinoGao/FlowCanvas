package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.AgentRun;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.AgentRunRepository;
import com.infinitecanvas.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;

/**
 * Agent Run 服务端执行器：按依赖拓扑派发任务（并发 2），经模型代理自调用执行生成
 * （复用全部协议适配器），视频任务创建后记录上游任务 id 再轮询下载；
 * 产物落盘为用户文件并回写任务结果。进程重启后对 RUNNING 的 run 做恢复：
 * 视频任务按上游任务 id 续取，同步任务（文本/图片/音频）标记失败可重试。
 */
@Service
public class AgentRunExecutor implements ApplicationRunner {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AgentRunExecutor.class);
    private static final int RUN_CONCURRENCY = 2;
    private static final long VIDEO_POLL_INTERVAL_MS = 5_000;
    private static final long VIDEO_POLL_TIMEOUT_MS = 40 * 60_000;

    private final AgentRunRepository runs;
    private final UserRepository users;
    private final UserFileService userFiles;
    private final ExecutorService executor;
    private final String baseUrl;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();
    private final Map<String, Object> runLocks = new ConcurrentHashMap<>();
    private final Set<String> activeLoops = ConcurrentHashMap.newKeySet();

    public AgentRunExecutor(AgentRunRepository runs, UserRepository users, UserFileService userFiles,
                            @Qualifier("agentRunExecutorService") ExecutorService executor,
                            @Value("${server.port:9801}") int port) {
        this.runs = runs;
        this.users = users;
        this.userFiles = userFiles;
        this.executor = executor;
        this.baseUrl = "http://127.0.0.1:" + port;
    }

    /** 启动（或唤醒）run 的派发循环，幂等。 */
    public void startLoop(String runId) {
        if (!activeLoops.add(runId)) return;
        executor.submit(() -> {
            try {
                runLoop(runId);
            } catch (Exception error) {
                log.error("Agent Run 派发循环异常: runId={}", runId, error);
            } finally {
                activeLoops.remove(runId);
            }
        });
    }

    /** 进程启动恢复：RUNNING 的 run 继续；视频任务按上游 id 续取，其余进行中任务标记失败。 */
    @Override
    public void run(ApplicationArguments args) {
        for (AgentRun run : runs.findByStatus("RUNNING")) {
            try {
                recoverRun(run);
            } catch (Exception error) {
                run.setStatus("FAILED");
                run.setUpdatedAt(Instant.now());
                runs.save(run);
            }
        }
    }

    private void recoverRun(AgentRun run) {
        List<Map<String, Object>> tasks = readTasks(run);
        boolean hasUpstreamPoll = false;
        for (Map<String, Object> task : tasks) {
            if (!"RUNNING".equals(task.get("status"))) continue;
            if ("video".equals(task.get("type")) && text(task.get("upstreamTaskId")) != null) {
                hasUpstreamPoll = true;
                String runId = run.getId();
                String taskId = text(task.get("id"));
                executor.submit(() -> executeTask(runId, taskId));
            } else {
                task.put("status", "FAILED");
                task.put("error", "服务重启导致生成中断，可重试");
            }
        }
        writeTasks(run, tasks);
        if (hasReadyOrRunning(tasks)) startLoop(run.getId());
        else finalizeRun(run.getId());
    }

    private boolean hasReadyOrRunning(List<Map<String, Object>> tasks) {
        return tasks.stream().anyMatch(task -> "READY".equals(task.get("status")) || "RUNNING".equals(task.get("status")));
    }

    private void runLoop(String runId) {
        while (true) {
            AgentRun run = runs.findById(runId).orElse(null);
            if (run == null || !"RUNNING".equals(run.getStatus())) return;
            List<Map<String, Object>> tasks = readTasks(run);
            Set<String> completed = new HashSet<>();
            long inFlight = 0;
            for (Map<String, Object> task : tasks) {
                if ("COMPLETED".equals(task.get("status"))) completed.add(text(task.get("id")));
                if ("RUNNING".equals(task.get("status"))) inFlight += 1;
            }
            List<Map<String, Object>> ready = new ArrayList<>();
            for (Map<String, Object> task : tasks) {
                if (!"READY".equals(task.get("status"))) continue;
                if (dependenciesCompleted(task, completed)) ready.add(task);
            }
            if (ready.isEmpty() && inFlight == 0) {
                finalizeRun(runId);
                return;
            }
            long slots = Math.max(0, RUN_CONCURRENCY - inFlight);
            for (Map<String, Object> task : ready.stream().limit(slots).toList()) {
                synchronized (lock(runId)) {
                    List<Map<String, Object>> current = readTasks(run);
                    Map<String, Object> target = findTask(current, text(task.get("id")));
                    if (target == null || !"READY".equals(target.get("status"))) continue;
                    target.put("status", "RUNNING");
                    target.put("attempts", ((Number) target.getOrDefault("attempts", 0)).intValue() + 1);
                    target.remove("error");
                    writeTasks(run, current);
                }
                String taskId = text(task.get("id"));
                executor.submit(() -> {
                    try {
                        executeTask(runId, taskId);
                    } catch (Exception error) {
                        log.error("Agent Run 任务执行异常: runId={} taskId={}", runId, taskId, error);
                        failTask(runId, taskId, "执行异常：" + error.getMessage());
                    }
                });
            }
            sleep(800);
        }
    }

    private boolean dependenciesCompleted(Map<String, Object> task, Set<String> completed) {
        Object deps = task.get("dependencies");
        if (!(deps instanceof List<?> list)) return true;
        for (Object dep : list) {
            if (!completed.contains(text(dep))) return false;
        }
        return true;
    }

    private void finalizeRun(String runId) {
        AgentRun run = runs.findById(runId).orElse(null);
        if (run == null || !"RUNNING".equals(run.getStatus())) return;
        List<Map<String, Object>> tasks = readTasks(run);
        boolean anyFailed = tasks.stream().anyMatch(task -> "FAILED".equals(task.get("status")));
        boolean allCompleted = tasks.stream().allMatch(task -> "COMPLETED".equals(task.get("status")));
        if (allCompleted) run.setStatus("COMPLETED");
        else if (anyFailed) run.setStatus("FAILED");
        else return;
        run.setUpdatedAt(Instant.now());
        runs.save(run);
    }

    // ===== 任务执行 =====

    private void executeTask(String runId, String taskId) {
        AgentRun run = runs.findById(runId).orElse(null);
        if (run == null) return;
        Map<String, Object> task = findTask(readTasks(run), taskId);
        if (task == null || !"RUNNING".equals(task.get("status"))) return;
        User user = users.findById(run.getUser().getId()).orElse(null);
        if (user == null) {
            failTask(runId, taskId, "用户不存在");
            return;
        }
        try {
            Map<String, Object> result = switch (text(task.get("type"))) {
                case "text" -> executeText(run, task);
                case "image" -> executeImage(run, user, task);
                case "audio" -> executeAudio(run, user, task);
                case "video" -> executeVideo(run, user, task);
                default -> throw new IllegalArgumentException("不支持的任务类型");
            };
            if (isCancelled(runId)) return;
            synchronized (lock(runId)) {
                AgentRun current = runs.findById(runId).orElse(null);
                if (current == null) return;
                List<Map<String, Object>> tasks = readTasks(current);
                Map<String, Object> target = findTask(tasks, taskId);
                if (target == null || !"RUNNING".equals(target.get("status"))) return;
                target.put("status", "COMPLETED");
                target.put("result", result);
                writeTasks(current, tasks);
            }
        } catch (Exception error) {
            if (isCancelled(runId)) return;
            failTask(runId, taskId, error.getMessage() == null ? "生成失败" : error.getMessage());
        }
    }

    private boolean isCancelled(String runId) {
        return runs.findById(runId).map(run -> "CANCELLED".equals(run.getStatus())).orElse(true);
    }

    private void failTask(String runId, String taskId, String message) {
        synchronized (lock(runId)) {
            AgentRun run = runs.findById(runId).orElse(null);
            if (run == null) return;
            List<Map<String, Object>> tasks = readTasks(run);
            Map<String, Object> target = findTask(tasks, taskId);
            if (target == null || !"RUNNING".equals(target.get("status"))) return;
            target.put("status", "FAILED");
            target.put("error", message.length() > 300 ? message.substring(0, 300) : message);
            writeTasks(run, tasks);
        }
    }

    private Map<String, Object> executeText(AgentRun run, Map<String, Object> task) throws Exception {
        Map<String, Object> body = Map.of(
                "model", modelId(task),
                "messages", List.of(Map.of("role", "user", "content", promptOf(task))));
        Map<String, Object> response = postJson(run, task, "/chat/completions", body, Duration.ofMinutes(5));
        String content = readAssistantContent(response);
        if (content.isBlank()) throw new IllegalStateException("文本模型没有返回内容");
        return Map.of("content", content);
    }

    private Map<String, Object> executeImage(AgentRun run, User user, Map<String, Object> task) throws Exception {
        Map<String, Object> params = paramsOf(task);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", modelId(task));
        body.put("prompt", promptOf(task));
        body.put("n", Math.min(9, Math.max(1, intParam(params, "count", 1))));
        if (text(params.get("size")) != null) body.put("size", text(params.get("size")));
        if (text(params.get("quality")) != null) body.put("quality", text(params.get("quality")));
        Map<String, Object> response = postJson(run, task, "/images/generations", body, Duration.ofMinutes(10));
        Object data = response.get("data");
        if (!(data instanceof List<?> list) || list.isEmpty()) throw new IllegalStateException("图片接口没有返回结果");
        List<String> storageKeys = new ArrayList<>();
        long bytes = 0;
        String mimeType = "image/png";
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            byte[] imageBytes = readMediaBytes(map);
            if (imageBytes == null) continue;
            var saved = userFiles.saveBytes(user, imageBytes, "agent-run-" + task.get("id") + ".png", mimeType);
            storageKeys.add(saved.getStorageKey());
            bytes = saved.getBytes();
        }
        if (storageKeys.isEmpty()) throw new IllegalStateException("图片接口没有返回可用图片");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("storageKey", storageKeys.get(0));
        result.put("extraStorageKeys", storageKeys.subList(1, storageKeys.size()));
        result.put("mimeType", mimeType);
        result.put("bytes", bytes);
        return result;
    }

    private Map<String, Object> executeAudio(AgentRun run, User user, Map<String, Object> task) throws Exception {
        Map<String, Object> params = paramsOf(task);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", modelId(task));
        body.put("input", promptOf(task));
        if (text(params.get("voice")) != null) body.put("voice", text(params.get("voice")));
        if (text(params.get("speed")) != null) body.put("speed", text(params.get("speed")));
        body.put("response_format", text(params.get("format")) != null ? text(params.get("format")) : "mp3");
        byte[] audio = postBytes(run, task, "/audio/speech", body, Duration.ofMinutes(5));
        if (audio.length == 0) throw new IllegalStateException("音频接口没有返回内容");
        var saved = userFiles.saveBytes(user, audio, "agent-run-" + task.get("id") + ".mp3", "audio/mpeg");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("storageKey", saved.getStorageKey());
        result.put("mimeType", "audio/mpeg");
        result.put("bytes", saved.getBytes());
        return result;
    }

    private Map<String, Object> executeVideo(AgentRun run, User user, Map<String, Object> task) throws Exception {
        String upstreamTaskId = text(task.get("upstreamTaskId"));
        if (upstreamTaskId == null) {
            Map<String, Object> params = paramsOf(task);
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("model", modelId(task));
            fields.put("prompt", promptOf(task));
            if (text(params.get("seconds")) != null) fields.put("seconds", text(params.get("seconds")));
            if (text(params.get("size")) != null) fields.put("size", text(params.get("size")));
            if (text(params.get("vquality")) != null) fields.put("resolution_name", text(params.get("vquality")));
            fields.put("preset", "normal");
            Map<String, Object> created = postForm(run, task, "/videos", fields, Duration.ofSeconds(90));
            upstreamTaskId = firstText(created, "id", "task_id", "video_id");
            if (upstreamTaskId == null) throw new IllegalStateException("视频接口没有返回任务 ID");
            String finalUpstreamTaskId = upstreamTaskId;
            synchronized (lock(run.getId())) {
                AgentRun current = runs.findById(run.getId()).orElse(null);
                if (current != null) {
                    List<Map<String, Object>> tasks = readTasks(current);
                    Map<String, Object> target = findTask(tasks, text(task.get("id")));
                    if (target != null) {
                        target.put("upstreamTaskId", finalUpstreamTaskId);
                        writeTasks(current, tasks);
                    }
                }
            }
        }
        long deadline = System.currentTimeMillis() + VIDEO_POLL_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            if (isCancelled(run.getId())) return Map.of();
            Map<String, Object> state = getJson(run, task, "/videos/" + upstreamTaskId, Duration.ofSeconds(60));
            String status = firstText(state, "status");
            if (status != null && (status.equals("completed") || status.equals("succeeded") || status.equals("success"))) {
                byte[] video = getBytes(run, task, "/videos/" + upstreamTaskId + "/content", Duration.ofMinutes(10));
                if (video.length == 0) throw new IllegalStateException("视频下载内容为空");
                var saved = userFiles.saveBytes(user, video, "agent-run-" + task.get("id") + ".mp4", "video/mp4");
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("storageKey", saved.getStorageKey());
                result.put("mimeType", "video/mp4");
                result.put("bytes", saved.getBytes());
                return result;
            }
            if (status != null && (status.equals("failed") || status.equals("error") || status.equals("cancelled"))) {
                Object error = state.get("error");
                String message = error instanceof Map<?, ?> map ? text(map.get("message")) : null;
                throw new IllegalStateException(message != null ? message : "视频生成失败");
            }
            sleep(VIDEO_POLL_INTERVAL_MS);
        }
        throw new IllegalStateException("视频生成超时");
    }

    // ===== 自调用模型代理 =====

    private String proxyPath(Map<String, Object> task, String suffix) {
        return "/api/model-runtime/models/" + modelId(task) + suffix;
    }

    /** POST JSON 并解析 JSON 响应（剥 {code,data} 信封与 {video:{...}} 包裹）。 */
    private Map<String, Object> postJson(AgentRun run, Map<String, Object> task, String suffix, Map<String, Object> body, Duration timeout) throws Exception {
        HttpRequest request = baseRequest(run, proxyPath(task, suffix))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return readJsonResponse(response.statusCode(), response.body());
    }

    /** POST JSON，返回原始字节响应（音频等二进制）。 */
    private byte[] postBytes(AgentRun run, Map<String, Object> task, String suffix, Map<String, Object> body, Duration timeout) throws Exception {
        HttpRequest request = baseRequest(run, proxyPath(task, suffix))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() >= 400) throw new IllegalStateException("生成接口返回 " + response.statusCode() + "：" + snippet(response.body()));
        return response.body();
    }

    /** multipart 表单 POST（仅文本字段），解析 JSON 响应。 */
    private Map<String, Object> postForm(AgentRun run, Map<String, Object> task, String suffix, Map<String, String> fields, Duration timeout) throws Exception {
        String boundary = "----flowcanvas" + UUID.randomUUID().toString().replace("-", "");
        StringBuilder payload = new StringBuilder();
        fields.forEach((name, value) -> {
            if (value == null) return;
            payload.append("--").append(boundary).append("\r\n")
                    .append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n")
                    .append(value).append("\r\n");
        });
        payload.append("--").append(boundary).append("--\r\n");
        HttpRequest request = baseRequest(run, proxyPath(task, suffix))
                .timeout(timeout)
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString(), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return readJsonResponse(response.statusCode(), response.body());
    }

    private Map<String, Object> getJson(AgentRun run, Map<String, Object> task, String suffix, Duration timeout) throws Exception {
        HttpRequest request = baseRequest(run, proxyPath(task, suffix)).timeout(timeout).GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return readJsonResponse(response.statusCode(), response.body());
    }

    private byte[] getBytes(AgentRun run, Map<String, Object> task, String suffix, Duration timeout) throws Exception {
        HttpRequest request = baseRequest(run, proxyPath(task, suffix)).timeout(timeout).GET().build();
        HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() >= 400) throw new IllegalStateException("下载接口返回 " + response.statusCode() + "：" + snippet(response.body()));
        return response.body();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJsonResponse(int status, String body) throws Exception {
        Map<String, Object> parsed;
        try {
            parsed = mapper.readValue(body, Map.class);
        } catch (Exception error) {
            throw new IllegalStateException("生成接口返回无法解析（HTTP " + status + "）");
        }
        if (status >= 400) {
            Object error = parsed.get("error");
            String message = error instanceof Map<?, ?> map ? text(map.get("message")) : text(parsed.get("msg"));
            throw new IllegalStateException(message != null ? message : "生成接口返回 " + status);
        }
        Object msg = parsed.get("msg");
        if (parsed.get("code") instanceof Number code && code.intValue() != 0) {
            throw new IllegalStateException(msg != null ? String.valueOf(msg) : "生成接口返回错误");
        }
        Object data = parsed.get("data");
        if (data instanceof Map<?, ?> map) return (Map<String, Object>) map;
        Object video = parsed.get("video");
        if (video instanceof Map<?, ?> map) return (Map<String, Object>) map;
        return parsed;
    }

    /** 图片结果项 → 字节：优先 b64_json，其次各种 url 字段（再下载）。 */
    private byte[] readMediaBytes(Map<?, ?> item) throws Exception {
        Object b64 = item.get("b64_json");
        if (b64 instanceof String s && !s.isBlank()) {
            return java.util.Base64.getDecoder().decode(s);
        }
        for (String key : new String[]{"url", "dataUrl", "data_url", "output_url", "file_url", "public_url"}) {
            Object value = item.get(key);
            if (value instanceof String url && url.startsWith("http")) {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(5)).build();
                HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
                if (response.statusCode() < 400 && response.body().length > 0) return response.body();
            }
        }
        Object imageUrl = item.get("image_url");
        if (imageUrl instanceof Map<?, ?> map && map.get("url") instanceof String url && url.startsWith("http")) {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(5)).build();
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 400 && response.body().length > 0) return response.body();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String readAssistantContent(Map<String, Object> response) {
        Object choices = response.get("choices");
        if (!(choices instanceof List<?> list) || list.isEmpty()) return "";
        Object message = list.get(0) instanceof Map<?, ?> map ? map.get("message") : null;
        if (!(message instanceof Map<?, ?> messageMap)) return "";
        Object content = messageMap.get("content");
        if (content instanceof String s) return s;
        if (content instanceof List<?> parts) {
            StringBuilder text = new StringBuilder();
            for (Object part : parts) {
                if (part instanceof Map<?, ?> map && map.get("text") instanceof String s) text.append(s);
            }
            return text.toString();
        }
        return "";
    }

    private String snippet(byte[] body) {
        String text = new String(body, 0, Math.min(body.length, 200), StandardCharsets.UTF_8);
        return text.replaceAll("\\s+", " ").trim();
    }

    private HttpRequest.Builder baseRequest(AgentRun run, String path) {
        return HttpRequest.newBuilder(URI.create(baseUrl + path)).header("X-FlowCanvas-Session", run.getSessionToken());
    }

    private Object lock(String runId) {
        return runLocks.computeIfAbsent(runId, key -> new Object());
    }

    // ===== 任务 JSON 读写 =====

    @SuppressWarnings("unchecked")
    List<Map<String, Object>> readTasks(AgentRun run) {
        try {
            List<Map<String, Object>> tasks = mapper.readValue(run.getTasksJson(), List.class);
            return new ArrayList<>(tasks);
        } catch (Exception error) {
            return new ArrayList<>();
        }
    }

    void writeTasks(AgentRun run, List<Map<String, Object>> tasks) {
        try {
            run.setTasksJson(mapper.writeValueAsString(tasks));
        } catch (Exception error) {
            throw new RuntimeException("任务序列化失败", error);
        }
        run.setUpdatedAt(Instant.now());
        runs.save(run);
    }

    private Map<String, Object> findTask(List<Map<String, Object>> tasks, String id) {
        if (id == null) return null;
        return tasks.stream().filter(task -> id.equals(text(task.get("id")))).findFirst().orElse(null);
    }

    // ===== 工具 =====

    static String text(Object value) {
        return value instanceof String s && !s.isBlank() ? s.trim() : null;
    }

    private String modelId(Map<String, Object> task) {
        String modelId = text(task.get("modelId"));
        if (modelId == null) throw new IllegalArgumentException("任务缺少模型");
        return modelId;
    }

    private String promptOf(Map<String, Object> task) {
        String prompt = text(task.get("prompt"));
        if (prompt == null) throw new IllegalArgumentException("任务缺少提示词");
        return prompt;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> paramsOf(Map<String, Object> task) {
        Object params = task.get("params");
        return params instanceof Map ? (Map<String, Object>) params : Map.of();
    }

    private int intParam(Map<String, Object> params, String key, int fallback) {
        Object value = params.get(key);
        if (value instanceof Number number) return number.intValue();
        if (value instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    private String firstText(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            String value = text(map.get(key));
            if (value != null) return value;
        }
        return null;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }
}
