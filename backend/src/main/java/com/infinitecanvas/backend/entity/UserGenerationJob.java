package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(
        name = "user_generation_jobs",
        uniqueConstraints = @UniqueConstraint(name = "uk_generation_jobs_user_job", columnNames = {"user_id", "job_key"}),
        indexes = {
                @Index(name = "idx_generation_jobs_user_updated", columnList = "user_id, updated_at"),
                @Index(name = "idx_generation_jobs_status", columnList = "status")
        }
)
public class UserGenerationJob {
    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "job_key", nullable = false, length = 96)
    private String jobKey;

    @Column(nullable = false, length = 16)
    private String status;

    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_headers_json", columnDefinition = "TEXT")
    private String responseHeadersJson;

    // SQLite's JDBC driver does not implement ResultSet#getBlob. Keep the
    // payload binary, but force Hibernate to use the byte[] VARBINARY path.
    @JdbcTypeCode(SqlTypes.VARBINARY)
    @Column(name = "response_body", columnDefinition = "BLOB")
    private byte[] responseBody;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getJobKey() { return jobKey; }
    public void setJobKey(String jobKey) { this.jobKey = jobKey; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getResponseStatus() { return responseStatus; }
    public void setResponseStatus(Integer responseStatus) { this.responseStatus = responseStatus; }
    public String getResponseHeadersJson() { return responseHeadersJson; }
    public void setResponseHeadersJson(String responseHeadersJson) { this.responseHeadersJson = responseHeadersJson; }
    public byte[] getResponseBody() { return responseBody; }
    public void setResponseBody(byte[] responseBody) { this.responseBody = responseBody; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
