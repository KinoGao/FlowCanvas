package com.infinitecanvas.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "platform_config")
public class PlatformConfigEntity {
    @Id
    private Long id = 1L;

    @Column(columnDefinition = "LONGTEXT", nullable = false)
    private String data = "{}";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
