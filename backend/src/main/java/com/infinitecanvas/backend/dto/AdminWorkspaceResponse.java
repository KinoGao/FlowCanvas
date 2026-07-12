package com.infinitecanvas.backend.dto;

import java.time.Instant;
import java.util.List;

public record AdminWorkspaceResponse(List<UserWorkspace> users) {
    public record UserWorkspace(
            String id,
            String username,
            String displayName,
            String role,
            Instant createdAt,
            Instant updatedAt,
            int projectCount,
            int activeProjectCount,
            int assetCount,
            int fileCount,
            long fileBytes,
            List<ProjectSummary> projects
    ) {}

    public record ProjectSummary(
            String id,
            String title,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt
    ) {}

    public record ProjectDetail(
            String userId,
            String id,
            String title,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt,
            Object project
    ) {}
}
