package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import jakarta.servlet.http.HttpServletRequest;

public final class UserRequestContext {
    public static final String USER_ATTR = "infiniteCanvasUser";
    public static final String LEGACY_AUTH_ATTR = "infiniteCanvasLegacyAuth";

    private UserRequestContext() {}

    public static User requireUser(HttpServletRequest request) {
        User user = currentUser(request);
        if (user != null) return user;
        throw new IllegalArgumentException("登录状态无效");
    }

    public static User currentUser(HttpServletRequest request) {
        Object value = request.getAttribute(USER_ATTR);
        return value instanceof User user ? user : null;
    }

    public static boolean isLegacyAuth(HttpServletRequest request) {
        return Boolean.TRUE.equals(request.getAttribute(LEGACY_AUTH_ATTR));
    }

    public static boolean isAdmin(HttpServletRequest request) {
        if (isLegacyAuth(request)) return true;
        User user = currentUser(request);
        return user != null && "ADMIN".equals(user.getRole());
    }
}
