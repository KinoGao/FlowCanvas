package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

@Service
public class MediaAccessService {
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final byte[] secret;
    private final long ttlSeconds;
    private final Clock clock;

    @Autowired
    public MediaAccessService(
            @Value("${app.media-signing-secret:${app.admin-code:admincode}}") String secret,
            @Value("${app.media-url-ttl-seconds:43200}") long ttlSeconds
    ) {
        this(secret, ttlSeconds, Clock.systemUTC());
    }

    MediaAccessService(String secret, long ttlSeconds, Clock clock) {
        if (secret == null || secret.isBlank()) throw new IllegalArgumentException("媒体签名密钥不能为空");
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = Math.max(300, ttlSeconds);
        this.clock = clock;
    }

    public String signedPath(User user, String storageKey) {
        long expires = Instant.now(clock).getEpochSecond() + ttlSeconds;
        String signature = signature(user.getId(), storageKey, expires);
        return "/api/user/files/" + storageKey + "?uid=" + user.getId() + "&expires=" + expires + "&signature=" + signature;
    }

    public boolean verify(String userId, String storageKey, long expires, String providedSignature) {
        if (userId == null || userId.isBlank() || storageKey == null || storageKey.isBlank() || providedSignature == null || providedSignature.isBlank()) return false;
        if (expires < Instant.now(clock).getEpochSecond()) return false;
        byte[] expected = signature(userId, storageKey, expires).getBytes(StandardCharsets.US_ASCII);
        byte[] provided = providedSignature.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, provided);
    }

    private String signature(String userId, String storageKey, long expires) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
            byte[] digest = mac.doFinal((userId + "\n" + storageKey + "\n" + expires).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception error) {
            throw new IllegalStateException("生成媒体访问签名失败", error);
        }
    }
}
