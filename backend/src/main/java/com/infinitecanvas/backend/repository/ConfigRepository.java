package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.Config;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConfigRepository extends JpaRepository<Config, Long> {
}