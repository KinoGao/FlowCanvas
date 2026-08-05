package com.infinitecanvas.backend.middleware;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.service.AuthService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Optional;

@Component
public class AuthFilter implements Filter {

    private final AuthService authService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuthFilter(AuthService authService) {
        this.authService = authService;
    }

    private boolean isPublicApi(String path, String method, String queryString) {
        // ai-proxy / comfyui-proxy 是有任意目标转发能力的代理：
        // - ai-proxy 的 GET 用于浏览器 <img>/<video> 直接加载生成媒体（无法带请求头），
        //   保持公开但由 controller 拒绝内网目标（SSRF 防护）；非 GET 必须登录。
        // - comfyui-proxy 仅 /view 媒体读取保持公开（<img> 加载 ComfyUI 输出，
        //   且公开路径由 controller 强制使用配置的 ComfyUI 地址），
        //   其余操作（提交任务、上传、状态查询）必须登录。
        if ("GET".equalsIgnoreCase(method)) {
            if (path.equals("/api/ai-proxy")) return true;
            if (path.equals("/api/comfyui-proxy") && isComfyViewRequest(queryString)) return true;
        }
        return path.equals("/api/health")
                || path.equals("/api/prompts")
                || path.equals("/api/upload-public")
                || path.startsWith("/api/model-capabilities/")
                || path.equals("/api/runtime-config")
                // 模型运行时目录仅 GET（浏览器媒体加载）公开；POST 模型调用必须登录，
                // 否则未登录用户可经代理消耗管理员配置的付费模型额度。
                || ("GET".equalsIgnoreCase(method)
                        && (path.startsWith("/api/model-runtime/providers/") || path.startsWith("/api/model-runtime/models/")))
                || ("GET".equalsIgnoreCase(method) && (path.equals("/api/workflows") || path.startsWith("/api/workflows/")))
                || path.equals("/api/auth/login")
                || path.equals("/api/auth/admin-login")
                || path.equals("/api/auth/register")
                // 仅 GET 媒体读取公开（带签名校验）；上传 / 签名等写操作必须登录。
                || ("GET".equalsIgnoreCase(method) && path.startsWith("/api/user/files/"))
                || path.startsWith("/api/public-image/");
    }

    /** comfyui-proxy 仅放行 path=/view 的媒体读取；query 参数需 URL 解码后取 path。 */
    private boolean isComfyViewRequest(String queryString) {
        if (queryString == null || queryString.isBlank()) return false;
        for (String part : queryString.split("&")) {
            if (!part.startsWith("path=")) continue;
            String value = java.net.URLDecoder.decode(part.substring(5), java.nio.charset.StandardCharsets.UTF_8);
            int queryIndex = value.indexOf('?');
            return "/view".equals(queryIndex < 0 ? value : value.substring(0, queryIndex));
        }
        return false;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        String path = req.getRequestURI();
        if (isPublicApi(path, req.getMethod(), req.getQueryString()) || "OPTIONS".equalsIgnoreCase(req.getMethod())) {
            String sessionToken = req.getHeader("X-FlowCanvas-Session");
            if (sessionToken != null && !sessionToken.isBlank()) {
                authService.authenticate(sessionToken).ifPresent(user -> req.setAttribute(UserRequestContext.USER_ATTR, user));
            }
            chain.doFilter(request, response);
            return;
        }

        String token = bearerToken(req);
        var user = token != null && !token.isBlank() ? authService.authenticate(token) : Optional.<User>empty();

        // 生成请求会携带占位 Authorization（后端代理模式下 apiKey 为
        // "backend-managed"），真实会话在 X-FlowCanvas-Session 头中。
        // Bearer 无效时回退校验会话头，保证生成通道（图片/视频/音频/文本/ComfyUI）可用。
        if (user.isEmpty()) {
            String sessionToken = req.getHeader("X-FlowCanvas-Session");
            if (sessionToken != null && !sessionToken.isBlank()) {
                user = authService.authenticate(sessionToken);
            }
        }

        if (user.isPresent()) {
            req.setAttribute(UserRequestContext.USER_ATTR, user.get());
            chain.doFilter(request, response);
            return;
        }

        {
            resp.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            resp.setContentType("application/json;charset=UTF-8");
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
