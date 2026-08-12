package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.ModelRequestLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface ModelRequestLogRepository extends JpaRepository<ModelRequestLog, String> {
    Page<ModelRequestLog> findByModelId(String modelId, Pageable pageable);

    Page<ModelRequestLog> findByStatusCode(int statusCode, Pageable pageable);

    Page<ModelRequestLog> findByModelIdAndStatusCode(String modelId, int statusCode, Pageable pageable);

    Page<ModelRequestLog> findByErrorMessageNotNull(Pageable pageable);

    @Query("select log from ModelRequestLog log where log.createdAt >= :since order by log.createdAt desc")
    List<ModelRequestLog> findRecent(@Param("since") Instant since, Pageable pageable);

    // 保留最近 N 天日志；使用批量删除避免逐条加载。
    @Modifying
    @Transactional
    @Query("delete from ModelRequestLog log where log.createdAt < :cutoff")
    int deleteByCreatedAtBefore(@Param("cutoff") Instant cutoff);
}
