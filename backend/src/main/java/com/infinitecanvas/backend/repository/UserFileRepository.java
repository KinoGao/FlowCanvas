package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserFileRepository extends JpaRepository<UserFile, String> {
    Optional<UserFile> findByStorageKey(String storageKey);
}
