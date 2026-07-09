package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.CanvasProjectEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CanvasProjectRepository extends JpaRepository<CanvasProjectEntity, String> {
    List<CanvasProjectEntity> findByUserIdOrderByUpdatedAtDesc(String userId);
    void deleteByUserIdAndId(String userId, String id);
}
