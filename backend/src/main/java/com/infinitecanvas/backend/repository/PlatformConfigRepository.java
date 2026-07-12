package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.PlatformConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformConfigRepository extends JpaRepository<PlatformConfigEntity, Long> {
}
