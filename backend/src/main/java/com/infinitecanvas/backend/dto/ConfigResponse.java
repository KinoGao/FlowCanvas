package com.infinitecanvas.backend.dto;

public class ConfigResponse {
    private String data;
    private String updatedAt;

    public ConfigResponse(String data, String updatedAt) {
        this.data = data;
        this.updatedAt = updatedAt;
    }

    public String getData() { return data; }
    public String getUpdatedAt() { return updatedAt; }
}