package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.AgentRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AgentRunRepository extends JpaRepository<AgentRun, String> {
    List<AgentRun> findByUserIdAndProjectIdOrderByCreatedAtDesc(String userId, String projectId);

    Optional<AgentRun> findByIdAndUserId(String id, String userId);

    List<AgentRun> findByStatus(String status);
}
