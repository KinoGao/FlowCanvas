package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserGenerationJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

public interface UserGenerationJobRepository extends JpaRepository<UserGenerationJob, String> {
    Optional<UserGenerationJob> findByUserIdAndJobKey(String userId, String jobKey);

    // Use bulk deletes so cleanup never hydrates response_body from SQLite.
    @Modifying
    @Transactional
    @Query("delete from UserGenerationJob job where job.updatedAt < :cutoff")
    int deleteByUpdatedAtBefore(@Param("cutoff") Instant cutoff);

    @Modifying
    @Transactional
    @Query("delete from UserGenerationJob job where job.user.id = :userId")
    int deleteByUserId(@Param("userId") String userId);
}
