package com.infinitecanvas.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * 模型请求日志：记录经 /api/model-runtime 代理发出的每一次上游模型请求，
 * 用于排查生成失败 / 超时（耗时、状态码、错误原因）。
 */
@Entity
@Table(
        name = "model_request_logs",
        indexes = {
                @Index(name = "idx_model_request_logs_created", columnList = "created_at"),
                @Index(name = "idx_model_request_logs_model", columnList = "model_id"),
                @Index(name = "idx_model_request_logs_status", columnList = "status_code")
        }
)
public class ModelRequestLog {
    @Id
    private String id;

    /** 发起请求的用户（未登录 / 匿名代理时为 null）。 */
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(name = "model_id", length = 128)
    private String modelId;

    /** 请求方法：POST / GET / DELETE 等。 */
    @Column(nullable = false, length = 8)
    private String method;

    /** 模型侧路径：/videos、/videos/{id}、/images/generations、/chat/completions 等。 */
    @Column(name = "path", nullable = false, length = 256)
    private String path;

    /** 请求方向类型：create / poll / content / other。 */
    @Column(name = "request_kind", length = 16)
    private String requestKind;

    /** 本次请求总耗时（毫秒）。 */
    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    /** 上游返回状态码（0 = 未得到响应）。 */
    @Column(name = "status_code")
    private int statusCode;

    /** 失败 / 超时的简要原因（来自异常根因，不包含密钥与内网地址）。 */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /** 本次请求对应的画布任务 key（jobKey，可为空）。 */
    @Column(name = "job_key", length = 96)
    private String jobKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getRequestKind() { return requestKind; }
    public void setRequestKind(String requestKind) { this.requestKind = requestKind; }
    public long getDurationMs() { return durationMs; }
    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }
    public int getStatusCode() { return statusCode; }
    public void setStatusCode(int statusCode) { this.statusCode = statusCode; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public String getJobKey() { return jobKey; }
    public void setJobKey(String jobKey) { this.jobKey = jobKey; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
