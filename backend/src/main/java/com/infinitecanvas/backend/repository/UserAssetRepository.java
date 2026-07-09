package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserAssetRepository extends JpaRepository<UserAsset, String> {
    List<UserAsset> findByUserIdOrderByUpdatedAtDesc(String userId);
    void deleteByUserIdAndId(String userId, String id);
}
