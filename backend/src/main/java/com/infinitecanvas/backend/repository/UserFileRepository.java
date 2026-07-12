package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.List;

public interface UserFileRepository extends JpaRepository<UserFile, String> {
    interface UserFileStatsRow {
        String getUserId();
        long getItemCount();
        long getTotalBytes();
    }

    Optional<UserFile> findByStorageKey(String storageKey);
    List<UserFile> findByUserId(String userId);
    void deleteByUserId(String userId);

    @Query("select f.user.id as userId, count(f.id) as itemCount, coalesce(sum(f.bytes), 0) as totalBytes " +
            "from UserFile f group by f.user.id")
    List<UserFileStatsRow> summarizeByUser();
}
