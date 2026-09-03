package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;

import java.time.Instant;

/** Agent Run：服务端执行的批量生成任务组（对齐 VOZEB Agent Run），tasksJson 内嵌任务列表。 */
@Entity
@Table(name = "agent_runs", indexes = @Index(name = "idx_agent_runs_user", columnList = "user_id"))
public class AgentRun {
    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "LONGTEXT")
    private String requirement;

    @Column(name = "plan_json", columnDefinition = "LONGTEXT")
    private String planJson;

    @Column(name = "tasks_json", columnDefinition = "LONGTEXT", nullable = false)
    private String tasksJson;

    /** RUNNING / PAUSED / COMPLETED / FAILED / CANCELLED */
    @Column(nullable = false)
    private String status;

    /** 创建时使用的会话令牌：执行器经模型代理自调用时回传鉴权 */
    @Column(name = "session_token", nullable = false)
    private String sessionToken;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getRequirement() { return requirement; }
    public void setRequirement(String requirement) { this.requirement = requirement; }
    public String getPlanJson() { return planJson; }
    public void setPlanJson(String planJson) { this.planJson = planJson; }
    public String getTasksJson() { return tasksJson; }
    public void setTasksJson(String tasksJson) { this.tasksJson = tasksJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSessionToken() { return sessionToken; }
    public void setSessionToken(String sessionToken) { this.sessionToken = sessionToken; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
