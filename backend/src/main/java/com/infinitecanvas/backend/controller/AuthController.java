package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import com.infinitecanvas.backend.dto.AuthResponse;
import com.infinitecanvas.backend.dto.UserDto;
import com.infinitecanvas.backend.service.AuthCodeService;
import com.infinitecanvas.backend.service.AuthService;
import com.infinitecanvas.backend.service.UserRequestContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final AuthCodeService authCodeService;

    public AuthController(AuthService authService, AuthCodeService authCodeService) {
        this.authService = authService;
        this.authCodeService = authCodeService;
    }

    @PostMapping("/register")
    public ApiResponse<AuthResponse> register(@RequestBody Map<String, Object> body) {
        if (!authCodeService.matchesRegistration(text(body.get("authCode")))) {
            throw new IllegalArgumentException("注册鉴权码错误");
        }
        AuthService.LoginResult result = authService.register(
                text(body.get("username")), text(body.get("password")), text(body.get("displayName"))
        );
        return response(result);
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@RequestBody Map<String, Object> body) {
        return response(authService.login(text(body.get("username")), text(body.get("password"))));
    }

    @PostMapping("/admin-login")
    public ApiResponse<AuthResponse> adminLogin(@RequestBody Map<String, Object> body) {
        if (!authCodeService.matchesAdmin(text(body.get("adminCode")))) {
            throw new IllegalArgumentException("管理员授权码错误");
        }
        return response(authService.adminLogin(text(body.get("username")), text(body.get("password"))));
    }

    @GetMapping("/me")
    public ApiResponse<UserDto> me(HttpServletRequest request) {
        return ApiResponse.ok(new UserDto(UserRequestContext.requireUser(request)));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request) {
        // 同时支持 Authorization Bearer 与 X-FlowCanvas-Session（生成任务 / ComfyUI 代理使用）。
        String token = null;
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) token = authorization.substring(7);
        if (token == null || token.isBlank()) token = request.getHeader("X-FlowCanvas-Session");
        if (token != null && !token.isBlank()) authService.logout(token);
        return ApiResponse.ok();
    }

    private ApiResponse<AuthResponse> response(AuthService.LoginResult result) {
        return ApiResponse.ok(new AuthResponse(result.token(), new UserDto(result.user())));
    }

    private String text(Object value) {
        return value instanceof String text ? text : "";
    }
}
