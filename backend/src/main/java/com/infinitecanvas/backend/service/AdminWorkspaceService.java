package com.infinitecanvas.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.dto.AdminWorkspaceResponse;
import com.infinitecanvas.backend.entity.CanvasProjectEntity;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;

@Service
public class AdminWorkspaceService {
    private final UserRepository users;
    private final UserSessionRepository sessions;
    private final UserConfigRepository configs;
    private final CanvasProjectRepository projects;
    private final UserAssetRepository assets;
    private final UserFileRepository files;
    private final UserGenerationLogRepository generationLogs;
    private final PasswordService passwords;
    private final ObjectMapper objectMapper;
    private final Path userFileDir;

    public AdminWorkspaceService(
            UserRepository users,
            UserSessionRepository sessions,
            UserConfigRepository configs,
            CanvasProjectRepository projects,
            UserAssetRepository assets,
            UserFileRepository files,
            UserGenerationLogRepository generationLogs,
            PasswordService passwords,
            ObjectMapper objectMapper,
            @Value("${app.user-file-dir:./data/user-files}") String userFileDir
    ) {
        this.users = users;
        this.sessions = sessions;
        this.configs = configs;
        this.projects = projects;
        this.assets = assets;
        this.files = files;
        this.generationLogs = generationLogs;
        this.passwords = passwords;
        this.objectMapper = objectMapper;
        this.userFileDir = Paths.get(userFileDir).toAbsolutePath().normalize();
    }

    @Transactional(readOnly = true)
    public AdminWorkspaceResponse summaries() {
        Map<String, List<CanvasProjectRepository.AdminSummaryRow>> projectsByUser = groupProjects(projects.findAdminSummaries());
        Map<String, Integer> assetsByUser = countAssets(assets.countByUser());
        Map<String, FileStats> filesByUser = countFiles(files.summarizeByUser());
        return new AdminWorkspaceResponse(users.findAllByOrderByUpdatedAtDesc().stream()
                .map(user -> workspace(user, projectsByUser.getOrDefault(user.getId(), List.of()), assetsByUser, filesByUser))
                .toList());
    }

    @Transactional(readOnly = true)
    public AdminWorkspaceResponse.ProjectDetail project(String userId, String projectId) {
        CanvasProjectEntity item = projects.findByUserIdAndId(userId, recordId(userId, projectId))
                .orElseThrow(() -> new IllegalArgumentException("画布不存在"));
        return new AdminWorkspaceResponse.ProjectDetail(
                userId, dataId(item), item.getTitle(), item.getCreatedAt(), item.getUpdatedAt(), item.getDeletedAt(), readJson(item.getProjectJson())
        );
    }

    @Transactional
    public AdminWorkspaceResponse.UserWorkspace updateUser(String userId, String username, String displayName, String role) {
        User user = requireUser(userId);
        String normalizedUsername = username.trim().toLowerCase();
        if (normalizedUsername.length() < 3) throw new IllegalArgumentException("用户名至少 3 个字符");
        users.findByUsername(normalizedUsername).filter(other -> !other.getId().equals(userId))
                .ifPresent(other -> { throw new IllegalArgumentException("用户名已存在"); });
        String normalizedRole = role.trim().toUpperCase();
        if (!Set.of("USER", "ADMIN").contains(normalizedRole)) throw new IllegalArgumentException("角色必须是 USER 或 ADMIN");
        user.setUsername(normalizedUsername);
        user.setDisplayName(displayName.isBlank() ? normalizedUsername : displayName.trim());
        user.setRole(normalizedRole);
        user.setUpdatedAt(Instant.now());
        users.save(user);
        return workspace(user, projects.findAdminSummaries().stream().filter(item -> userId.equals(item.getUserId())).toList(),
                countAssets(assets.countByUser()), countFiles(files.summarizeByUser()));
    }

    @Transactional
    public void resetPassword(String userId, String password) {
        if (password == null || password.length() < 6) throw new IllegalArgumentException("密码至少 6 个字符");
        User user = requireUser(userId);
        user.setPasswordHash(passwords.hash(password));
        user.setUpdatedAt(Instant.now());
        users.save(user);
        sessions.deleteByUserId(userId);
    }

    @Transactional
    public void deleteProject(String userId, String projectId) {
        projects.deleteByUserIdAndId(userId, recordId(userId, projectId));
    }

    @Transactional
    public void deleteUser(String userId, String currentAdminId) {
        if (userId.equals(currentAdminId)) throw new IllegalArgumentException("不能删除当前登录的管理员账号");
        requireUser(userId);
        sessions.deleteByUserId(userId);
        configs.deleteByUserId(userId);
        projects.deleteByUserId(userId);
        assets.deleteByUserId(userId);
        files.deleteByUserId(userId);
        generationLogs.deleteByUserId(userId);
        users.deleteById(userId);
        deleteDirectory(userFileDir.resolve(userId).normalize());
    }

    private AdminWorkspaceResponse.UserWorkspace workspace(
            User user,
            List<CanvasProjectRepository.AdminSummaryRow> userProjects,
            Map<String, Integer> assetsByUser,
            Map<String, FileStats> filesByUser
    ) {
        List<AdminWorkspaceResponse.ProjectSummary> projectSummaries = userProjects.stream()
                .sorted((left, right) -> right.getUpdatedAt().compareTo(left.getUpdatedAt()))
                .map(this::projectSummary).toList();
        FileStats fileStats = filesByUser.getOrDefault(user.getId(), new FileStats(0, 0));
        int activeProjects = (int) userProjects.stream().filter(item -> item.getDeletedAt() == null).count();
        return new AdminWorkspaceResponse.UserWorkspace(
                user.getId(), user.getUsername(), user.getDisplayName(), user.getRole(), user.getCreatedAt(), user.getUpdatedAt(),
                userProjects.size(), activeProjects, assetsByUser.getOrDefault(user.getId(), 0),
                fileStats.count(), fileStats.bytes(), projectSummaries
        );
    }

    private User requireUser(String userId) {
        return users.findById(userId).orElseThrow(() -> new IllegalArgumentException("账号不存在"));
    }

    private Map<String, List<CanvasProjectRepository.AdminSummaryRow>> groupProjects(List<CanvasProjectRepository.AdminSummaryRow> items) {
        Map<String, List<CanvasProjectRepository.AdminSummaryRow>> result = new HashMap<>();
        for (var item : items) result.computeIfAbsent(item.getUserId(), ignored -> new ArrayList<>()).add(item);
        return result;
    }

    private Map<String, Integer> countAssets(List<UserAssetRepository.UserCountRow> items) {
        Map<String, Integer> result = new HashMap<>();
        for (var item : items) result.put(item.getUserId(), Math.toIntExact(item.getItemCount()));
        return result;
    }

    private Map<String, FileStats> countFiles(List<UserFileRepository.UserFileStatsRow> items) {
        Map<String, FileStats> result = new HashMap<>();
        for (var item : items) result.put(item.getUserId(), new FileStats(Math.toIntExact(item.getItemCount()), item.getTotalBytes()));
        return result;
    }

    private AdminWorkspaceResponse.ProjectSummary projectSummary(CanvasProjectRepository.AdminSummaryRow item) {
        return new AdminWorkspaceResponse.ProjectSummary(dataId(item.getRecordId()), item.getTitle(), item.getCreatedAt(), item.getUpdatedAt(), item.getDeletedAt());
    }

    private String dataId(CanvasProjectEntity item) {
        Object parsed = readJson(item.getProjectJson());
        if (parsed instanceof Map<?, ?> map && map.get("id") instanceof String id && !id.isBlank()) return id;
        return dataId(item.getId());
    }

    private String dataId(String recordId) {
        int separator = recordId.indexOf(':');
        return separator >= 0 ? recordId.substring(separator + 1) : recordId;
    }

    private String recordId(String userId, String projectId) { return userId + ":" + projectId; }

    private Object readJson(String json) {
        try { return objectMapper.readValue(json, Object.class); }
        catch (Exception error) { throw new IllegalStateException("画布数据解析失败", error); }
    }

    private void deleteDirectory(Path directory) {
        if (!directory.startsWith(userFileDir) || !Files.exists(directory)) return;
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); }
                catch (IOException error) { throw new IllegalStateException("用户文件目录删除失败", error); }
            });
        } catch (IOException error) {
            throw new IllegalStateException("用户文件目录删除失败", error);
        }
    }

    private record FileStats(int count, long bytes) {}
}
