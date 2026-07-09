package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "assets", indexes = @Index(name = "idx_assets_user", columnList = "user_id"))
public class UserAsset {
    @Id
    private String id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "asset_json", columnDefinition = "TEXT", nullable = false)
    private String assetJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getAssetJson() { return assetJson; }
    public void setAssetJson(String assetJson) { this.assetJson = assetJson; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
