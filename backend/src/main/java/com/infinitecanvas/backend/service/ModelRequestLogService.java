package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.ModelRequestLog;
import com.infinitecanvas.backend.repository.ModelRequestLogRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * 模型请求日志：记录与查询经模型代理发出的上游请求。
 * 保留最近 {@link #RETENTION_DAYS} 天，写入时顺带清理过期日志。
 */
@Service
public class ModelRequestLogService {
    private static final int RETENTION_DAYS = 7;
    private static final int MAX_PAGE_SIZE = 200;

    private final ModelRequestLogRepository repository;

    public ModelRequestLogService(ModelRequestLogRepository repository) {
        this.repository = repository;
    }

    /**
     * 记录一次模型请求。错误信息会被截断并做最小化清洗（去掉可能的 URL 与引号包裹）。
     */
    @Transactional
    public void record(String userId, String modelId, String method, String path, String requestKind,
                       long durationMs, int statusCode, String errorMessage, String jobKey) {
        if (modelId == null || modelId.isBlank()) return;
        try {
            repository.deleteByCreatedAtBefore(Instant.now().minusSeconds(RETENTION_DAYS * 24L * 60 * 60));
            ModelRequestLog log = new ModelRequestLog();
            log.setId(UUID.randomUUID().toString());
            log.setUserId(blankToNull(userId));
            log.setModelId(truncate(modelId, 128));
            log.setMethod(method == null ? "GET" : method.toUpperCase(Locale.ROOT));
            log.setPath(truncate(path, 256));
            log.setRequestKind(truncate(requestKind, 16));
            log.setDurationMs(Math.max(0, durationMs));
            log.setStatusCode(statusCode);
            log.setErrorMessage(sanitize(errorMessage));
            log.setJobKey(blankToNull(jobKey));
            log.setCreatedAt(Instant.now());
            repository.save(log);
        } catch (Exception ignored) {
            // 日志写入失败不能影响正常生成链路。
        }
    }

    /** 管理后台查询：按模型 / 状态码 / 仅错误筛选，按时间倒序分页。 */
    public Page<ModelRequestLog> query(String modelId, Integer statusCode, boolean onlyErrors, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        PageRequest pageable = PageRequest.of(Math.max(0, page), safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        boolean hasModel = modelId != null && !modelId.isBlank();
        if (onlyErrors) return repository.findByErrorMessageNotNull(pageable);
        if (hasModel && statusCode != null) return repository.findByModelIdAndStatusCode(modelId, statusCode, pageable);
        if (hasModel) return repository.findByModelId(modelId, pageable);
        if (statusCode != null) return repository.findByStatusCode(statusCode, pageable);
        return repository.findAll(pageable);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    private String sanitize(String value) {
        if (value == null || value.isBlank()) return null;
        String cleaned = value.replaceAll("(?i)https?://\\S+", "[url]").trim();
        return truncate(cleaned, 2000);
    }
}
