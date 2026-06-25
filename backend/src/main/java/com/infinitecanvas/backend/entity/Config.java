package com.infinitecanvas.backend.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "config")
public class Config {
    @Id
    private Long id = 1L;

    @Column(columnDefinition = "TEXT")
    private String data;

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}