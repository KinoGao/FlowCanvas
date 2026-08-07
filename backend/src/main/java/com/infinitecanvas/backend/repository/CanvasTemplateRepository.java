package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.CanvasTemplate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CanvasTemplateRepository extends JpaRepository<CanvasTemplate, String> {
    List<CanvasTemplate> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<CanvasTemplate> findByUserIdAndId(String userId, String id);
    void deleteByUserIdAndId(String userId, String id);
}
