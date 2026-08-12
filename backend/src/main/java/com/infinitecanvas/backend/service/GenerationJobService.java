package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserGenerationJob;
import com.infinitecanvas.backend.repository.UserGenerationJobRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GenerationJobService {
    /**
     * 每个 userId:jobKey 一个锁对象，带引用计数。
     * 引用计数防止同 key 并发时旧锁被 remove 后新请求拿到新锁对象
     * 而绕过去重（历史 bug：finally 中直接 remove 导致并行执行）。
     */
    private static final Map<String, LockEntry> LOCKS = new ConcurrentHashMap<>();

    private static final class LockEntry {
        final Object lock = new Object();
        int refs;
    }

    private final UserGenerationJobRepository repository;
    private final ObjectMapper objectMapper;

    public GenerationJobService(UserGenerationJobRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public ResponseEntity<?> execute(User user, String jobKey, ThrowingResponseSupplier action) throws Exception {
        if (user == null || jobKey == null || jobKey.isBlank()) return action.get();
        if (jobKey.length() > 96) return ResponseEntity.badRequest().body("任务 ID 过长");

        String lockKey = user.getId() + ":" + jobKey;
        LockEntry entry = LOCKS.compute(lockKey, (key, current) -> {
            LockEntry next = current != null ? current : new LockEntry();
            next.refs++;
            return next;
        });
        try {
            synchronized (entry.lock) {
                UserGenerationJob existing = repository.findByUserIdAndJobKey(user.getId(), jobKey).orElse(null);
                if (existing != null && "COMPLETED".equals(existing.getStatus())) return restore(existing);
                if (existing != null && "FAILED".equals(existing.getStatus())) {
                    return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(existing.getErrorMessage());
                }

                UserGenerationJob job = existing == null ? create(user, jobKey) : existing;
                try {
                    ResponseEntity<?> response = action.get();
                    if (response != null) saveResponse(job, response);
                    return response;
                } catch (Exception error) {
                    fail(job, rootMessage(error));
                    throw error;
                }
            }
        } finally {
            LOCKS.compute(lockKey, (key, current) -> {
                if (current != null && --current.refs <= 0) return null;
                return current;
            });
        }
    }

    @Transactional
    protected UserGenerationJob create(User user, String jobKey) {
        repository.deleteByUpdatedAtBefore(Instant.now().minusSeconds(7 * 24 * 60 * 60));
        UserGenerationJob job = new UserGenerationJob();
        job.setId(UUID.randomUUID().toString());
        job.setUser(user);
        job.setJobKey(jobKey);
        job.setStatus("RUNNING");
        job.setCreatedAt(Instant.now());
        job.setUpdatedAt(Instant.now());
        return repository.saveAndFlush(job);
    }

    @Transactional
    protected void saveResponse(UserGenerationJob job, ResponseEntity<?> response) throws Exception {
        // 流式响应（StreamingResponseBody 等）不缓存：body 无法回放且可能巨大，
        // 直接透传并标记完成，避免序列化失败或缓存膨胀。
        if (isStreamingBody(response.getBody())) {
            job.setStatus("COMPLETED");
            job.setResponseStatus(response.getStatusCode().value());
            job.setErrorMessage(null);
            job.setUpdatedAt(Instant.now());
            repository.saveAndFlush(job);
            return;
        }
        HttpHeaders headers = new HttpHeaders();
        response.getHeaders().forEach((name, values) -> values.forEach(value -> headers.add(name, value)));
        byte[] body = responseBody(response.getBody());
        if (response.getBody() != null && headers.getContentType() == null && !(response.getBody() instanceof byte[]) && !(response.getBody() instanceof String)) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        job.setStatus("COMPLETED");
        job.setResponseStatus(response.getStatusCode().value());
        job.setResponseHeadersJson(objectMapper.writeValueAsString(headers));
        job.setResponseBody(body);
        job.setErrorMessage(null);
        job.setUpdatedAt(Instant.now());
        repository.saveAndFlush(job);
    }

    private boolean isStreamingBody(Object body) {
        return body instanceof org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
    }

    @Transactional
    protected void fail(UserGenerationJob job, String message) {
        job.setStatus("FAILED");
        job.setErrorMessage(message);
        job.setUpdatedAt(Instant.now());
        repository.saveAndFlush(job);
    }

    private ResponseEntity<byte[]> restore(UserGenerationJob job) {
        HttpHeaders headers = new HttpHeaders();
        try {
            Map<String, java.util.List<String>> values = objectMapper.readValue(
                    job.getResponseHeadersJson() == null ? "{}" : job.getResponseHeadersJson(),
                    new TypeReference<>() {}
            );
            values.forEach((name, items) -> items.forEach(value -> headers.add(name, value)));
        } catch (Exception ignored) {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        return new ResponseEntity<>(
                job.getResponseBody() == null ? new byte[0] : job.getResponseBody(),
                headers,
                HttpStatus.valueOf(job.getResponseStatus() == null ? 200 : job.getResponseStatus())
        );
    }

    private byte[] responseBody(Object body) throws Exception {
        if (body == null) return new byte[0];
        if (body instanceof byte[] bytes) return bytes;
        if (body instanceof String text) return text.getBytes(StandardCharsets.UTF_8);
        return objectMapper.writeValueAsBytes(body);
    }

    private String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        return current.getMessage() == null || current.getMessage().isBlank() ? error.getClass().getSimpleName() : current.getMessage();
    }

    @FunctionalInterface
    public interface ThrowingResponseSupplier {
        ResponseEntity<?> get() throws Exception;
    }
}
