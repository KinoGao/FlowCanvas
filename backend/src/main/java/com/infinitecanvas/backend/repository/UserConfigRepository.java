package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserConfigRepository extends JpaRepository<UserConfig, String> {
    Optional<UserConfig> findByUserId(String userId);
}
