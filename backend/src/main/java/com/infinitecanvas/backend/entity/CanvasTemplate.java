package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "canvas_templates", indexes = @Index(name = "idx_canvas_templates_user", columnList = "user_id"))
public class CanvasTemplate {
    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String name;

    @Column(name = "nodes_json", columnDefinition = "TEXT", nullable = false)
    private String nodesJson;

    @Column(name = "connections_json", columnDefinition = "TEXT", nullable = false)
    private String connectionsJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getNodesJson() { return nodesJson; }
    public void setNodesJson(String nodesJson) { this.nodesJson = nodesJson; }
    public String getConnectionsJson() { return connectionsJson; }
    public void setConnectionsJson(String connectionsJson) { this.connectionsJson = connectionsJson; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
