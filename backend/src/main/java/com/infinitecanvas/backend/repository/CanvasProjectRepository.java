package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.CanvasProjectEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CanvasProjectRepository extends JpaRepository<CanvasProjectEntity, String> {
    interface AdminSummaryRow {
        String getRecordId();
        String getUserId();
        String getTitle();
        Instant getCreatedAt();
        Instant getUpdatedAt();
        Instant getDeletedAt();
    }

    List<CanvasProjectEntity> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<CanvasProjectEntity> findByUserIdAndId(String userId, String id);
    void deleteByUserIdAndId(String userId, String id);
    void deleteByUserId(String userId);

    @Query("select p.id as recordId, p.user.id as userId, p.title as title, p.createdAt as createdAt, " +
            "p.updatedAt as updatedAt, p.deletedAt as deletedAt from CanvasProjectEntity p")
    List<AdminSummaryRow> findAdminSummaries();
}
