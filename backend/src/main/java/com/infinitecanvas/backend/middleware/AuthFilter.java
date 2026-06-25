package com.infinitecanvas.backend.middleware;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

@Component
public class AuthFilter implements Filter {

    private final String authCode;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuthFilter(@Value("${app.auth-code:}") String authCode) {
        if (authCode == null || authCode.isBlank()) {
            this.authCode = UUID.randomUUID().toString().replace("-", "");
            System.out.println("========================================");
            System.out.println("  AUTH_CODE 未设置，已自动生成: " + this.authCode);
            System.out.println("  请在前端配置弹窗中填入此认证码");
            System.out.println("========================================");
        } else {
            this.authCode = authCode;
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        String path = req.getRequestURI();
        if (path.equals("/api/health") || path.startsWith("/api/public-image/") || "OPTIONS".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String authorization = req.getHeader("Authorization");
        String token = null;
        if (authorization != null && authorization.startsWith("Bearer ")) {
            token = authorization.substring(7);
        }

        if (token == null || !token.equals(authCode)) {
            resp.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            resp.setContentType("application/json;charset=UTF-8");
            objectMapper.writeValue(resp.getWriter(), ApiResponse.fail("认证失败，请检查认证码"));
            return;
        }

        chain.doFilter(request, response);
    }
}