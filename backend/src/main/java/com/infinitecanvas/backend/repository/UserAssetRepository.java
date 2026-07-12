package com.infinitecanvas.backend.repository;

import com.infinitecanvas.backend.entity.UserAsset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface UserAssetRepository extends JpaRepository<UserAsset, String> {
    interface UserCountRow {
        String getUserId();
        long getItemCount();
    }

    List<UserAsset> findByUserIdOrderByUpdatedAtDesc(String userId);
    void deleteByUserIdAndId(String userId, String id);
    void deleteByUserId(String userId);

    @Query("select a.user.id as userId, count(a.id) as itemCount from UserAsset a group by a.user.id")
    List<UserCountRow> countByUser();
}
