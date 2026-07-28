package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserGenerationJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

public interface UserGenerationJobRepository extends JpaRepository<UserGenerationJob, String> {
    Optional<UserGenerationJob> findByUserIdAndJobKey(String userId, String jobKey);
    void deleteByUpdatedAtBefore(Instant cutoff);
    void deleteByUserId(String userId);
}
