package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.entity.UserSession;
import com.infinitecanvas.backend.repository.UserRepository;
import com.infinitecanvas.backend.repository.UserSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final UserRepository users;
    private final UserSessionRepository sessions;
    private final PasswordService passwordService;

    public AuthService(UserRepository users, UserSessionRepository sessions, PasswordService passwordService) {
        this.users = users;
        this.sessions = sessions;
        this.passwordService = passwordService;
    }

    @Transactional
    public LoginResult register(String username, String password, String displayName) {
        String normalized = normalizeUsername(username);
        if (normalized.length() < 3) throw new IllegalArgumentException("用户名至少 3 个字符");
        if (password == null || password.length() < 6) throw new IllegalArgumentException("密码至少 6 个字符");
        if (users.existsByUsername(normalized)) throw new IllegalArgumentException("用户名已存在");

        User user = new User();
        user.setId(UUID.randomUUID().toString().replace("-", ""));
        user.setUsername(normalized);
        user.setDisplayName(displayName == null || displayName.isBlank() ? normalized : displayName.trim());
        user.setPasswordHash(passwordService.hash(password));
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        users.save(user);
        return createSession(user);
    }

    @Transactional
    public LoginResult login(String username, String password) {
        User user = verifyCredentials(username, password);
        return createSession(user);
    }

    @Transactional
    public LoginResult adminLogin(String username, String password) {
        User user = verifyCredentials(username, password);
        if (!users.existsByRole("ADMIN")) {
            user.setRole("ADMIN");
            user.setUpdatedAt(Instant.now());
            users.save(user);
        } else if (!"ADMIN".equals(user.getRole())) {
            throw new IllegalArgumentException("该账号不是管理员");
        }
        return createSession(user);
    }

    @Transactional(readOnly = true)
    public Optional<User> authenticate(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        Optional<UserSession> session = sessions.findByTokenHash(hashToken(token));
        if (session.isEmpty() || session.get().getExpiresAt().isBefore(Instant.now())) return Optional.empty();
        return Optional.of(session.get().getUser());
    }

    @Transactional
    public void logout(String token) {
        if (token == null || token.isBlank()) return;
        sessions.deleteByTokenHash(hashToken(token));
    }

    public String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("token 哈希失败", e);
        }
    }

    private LoginResult createSession(User user) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        UserSession session = new UserSession();
        session.setId(UUID.randomUUID().toString().replace("-", ""));
        session.setUser(user);
        session.setTokenHash(hashToken(token));
        session.setCreatedAt(Instant.now());
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        sessions.save(session);
        return new LoginResult(token, user);
    }

    private User verifyCredentials(String username, String password) {
        User user = users.findByUsername(normalizeUsername(username))
                .orElseThrow(() -> new IllegalArgumentException("用户名或密码错误"));
        if (!passwordService.verify(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("用户名或密码错误");
        }
        return user;
    }

    private String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase();
    }

    public record LoginResult(String token, User user) {}
}
