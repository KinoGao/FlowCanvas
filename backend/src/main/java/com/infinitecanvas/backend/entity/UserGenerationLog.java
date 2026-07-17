package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(
        name = "user_generation_logs",
        indexes = {
                @Index(name = "idx_generation_logs_user_kind", columnList = "user_id, kind"),
                @Index(name = "idx_generation_logs_created", columnList = "created_at")
        }
)
public class UserGenerationLog {
    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "log_id", nullable = false)
    private String logId;

    @Column(nullable = false, length = 16)
    private String kind;

    @Column(name = "log_json", columnDefinition = "TEXT", nullable = false)
    private String logJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getLogId() { return logId; }
    public void setLogId(String logId) { this.logId = logId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLogJson() { return logJson; }
    public void setLogJson(String logJson) { this.logJson = logJson; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
