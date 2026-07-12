package com.infinitecanvas.backend.middleware;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.service.AuthService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class AuthFilter implements Filter {

    private final AuthService authService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuthFilter(AuthService authService) {
        this.authService = authService;
    }

    private boolean isPublicApi(String path, String method) {
        return path.equals("/api/health")
                || path.equals("/api/ai-proxy")
                || path.equals("/api/comfyui-proxy")
                || path.equals("/api/prompts")
                || path.equals("/api/upload-public")
                || path.equals("/api/webdav-proxy")
                || path.startsWith("/api/model-capabilities/")
                || path.equals("/api/runtime-config")
                || path.startsWith("/api/model-runtime/providers/")
                || path.startsWith("/api/model-runtime/models/")
                || ("GET".equalsIgnoreCase(method) && (path.equals("/api/workflows") || path.startsWith("/api/workflows/")))
                || path.equals("/api/auth/login")
                || path.equals("/api/auth/admin-login")
                || path.equals("/api/auth/register")
                || path.startsWith("/api/public-image/");
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        String path = req.getRequestURI();
        if (isPublicApi(path, req.getMethod()) || "OPTIONS".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String token = bearerToken(req);


        if (token != null) {
            var user = authService.authenticate(token);
            if (user.isPresent()) {
                req.setAttribute(UserRequestContext.USER_ATTR, user.get());
                chain.doFilter(request, response);
                return;
            }
        }

        if (token == null) token = req.getParameter("token");
        if (token != null) {
            var user = authService.authenticate(token);
            if (user.isPresent()) {
                req.setAttribute(UserRequestContext.USER_ATTR, user.get());
                chain.doFilter(request, response);
                return;
            }
        }

        {
            resp.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            resp.setContentType("application/json;charset=UTF-8");
            resp.setHeader("Access-Control-Allow-Origin", req.getHeader("Origin"));
            resp.setHeader("Access-Control-Allow-Credentials", "true");
            objectMapper.writeValue(resp.getWriter(), ApiResponse.fail("登录状态无效"));
            return;
        }

    }

    private String bearerToken(HttpServletRequest req) {
        String authorization = req.getHeader("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) return authorization.substring(7);
        return null;
    }
}
