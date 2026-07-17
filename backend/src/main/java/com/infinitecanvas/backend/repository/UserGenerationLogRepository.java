package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserGenerationLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserGenerationLogRepository extends JpaRepository<UserGenerationLog, String> {
    List<UserGenerationLog> findByUserIdAndKindOrderByCreatedAtDesc(String userId, String kind);
    Optional<UserGenerationLog> findByUserIdAndKindAndLogId(String userId, String kind, String logId);
    void deleteByUserIdAndKindAndLogId(String userId, String kind, String logId);
    void deleteByUserId(String userId);
}
