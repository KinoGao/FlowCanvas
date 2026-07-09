package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import jakarta.servlet.http.HttpServletRequest;

public final class UserRequestContext {
    public static final String USER_ATTR = "infiniteCanvasUser";
    public static final String LEGACY_AUTH_ATTR = "infiniteCanvasLegacyAuth";

    private UserRequestContext() {}

    public static User requireUser(HttpServletRequest request) {
        Object value = request.getAttribute(USER_ATTR);
        if (value instanceof User user) return user;
        throw new IllegalArgumentException("请先登录");
    }

    public static boolean isLegacyAuth(HttpServletRequest request) {
        return Boolean.TRUE.equals(request.getAttribute(LEGACY_AUTH_ATTR));
    }
}
