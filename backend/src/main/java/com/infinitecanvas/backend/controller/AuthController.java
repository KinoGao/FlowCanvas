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
        if (!authCodeService.matches(text(body.get("authCode")))) throw new IllegalArgumentException("鉴权码错误，无法注册账号");
        AuthService.LoginResult result = authService.register(text(body.get("username")), text(body.get("password")), text(body.get("displayName")));
        return ApiResponse.ok(new AuthResponse(result.token(), new UserDto(result.user())));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@RequestBody Map<String, Object> body) {
        AuthService.LoginResult result = authService.login(text(body.get("username")), text(body.get("password")));
        return ApiResponse.ok(new AuthResponse(result.token(), new UserDto(result.user())));
    }

    @GetMapping("/me")
    public ApiResponse<UserDto> me(HttpServletRequest request) {
        return ApiResponse.ok(new UserDto(UserRequestContext.requireUser(request)));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) authService.logout(authorization.substring(7));
        return ApiResponse.ok();
    }

    private String text(Object value) {
        return value instanceof String s ? s : "";
    }
}
