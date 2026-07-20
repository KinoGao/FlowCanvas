package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MediaAccessServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-19T12:00:00Z");

    @Test
    void acceptsValidSignatureAndRejectsTampering() {
        MediaAccessService service = new MediaAccessService("test-signing-secret", 600, Clock.fixed(NOW, ZoneOffset.UTC));
        User user = user("user-a");
        String storageKey = "backend:abc123";
        Map<String, String> query = query(service.signedPath(user, storageKey));
        long expires = Long.parseLong(query.get("expires"));
        String signature = query.get("signature");

        assertTrue(service.verify(user.getId(), storageKey, expires, signature));
        assertFalse(service.verify("user-b", storageKey, expires, signature));
        assertFalse(service.verify(user.getId(), "backend:changed", expires, signature));
        assertFalse(service.verify(user.getId(), storageKey, expires + 1, signature));
        assertFalse(service.verify(user.getId(), storageKey, expires, signature + "x"));
    }

    @Test
    void rejectsExpiredSignature() {
        MediaAccessService issuer = new MediaAccessService("test-signing-secret", 300, Clock.fixed(NOW, ZoneOffset.UTC));
        String storageKey = "backend:expired";
        User user = user("user-a");
        Map<String, String> query = query(issuer.signedPath(user, storageKey));
        long expires = Long.parseLong(query.get("expires"));

        MediaAccessService verifier = new MediaAccessService(
                "test-signing-secret",
                300,
                Clock.fixed(NOW.plusSeconds(301), ZoneOffset.UTC)
        );
        assertFalse(verifier.verify(user.getId(), storageKey, expires, query.get("signature")));
    }

    private static User user(String id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    private static Map<String, String> query(String path) {
        String rawQuery = path.substring(path.indexOf('?') + 1);
        return Arrays.stream(rawQuery.split("&"))
                .map(part -> part.split("=", 2))
                .collect(Collectors.toMap(
                        part -> URLDecoder.decode(part[0], StandardCharsets.UTF_8),
                        part -> URLDecoder.decode(part[1], StandardCharsets.UTF_8)
                ));
    }
}
