package com.infinitecanvas.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthCodeService {
    private final String authCode;

    public AuthCodeService(@Value("${app.auth-code:gycode}") String authCode) {
        if (authCode == null || authCode.isBlank()) {
            this.authCode = UUID.randomUUID().toString().replace("-", "");
            System.out.println("========================================");
            System.out.println("  AUTH_CODE 未设置，已自动生成: " + this.authCode);
            System.out.println("  请在注册账号时填写此鉴权码");
            System.out.println("========================================");
        } else {
            this.authCode = authCode;
        }
    }

    public boolean matches(String value) {
        return value != null && value.equals(authCode);
    }

    public String value() {
        return authCode;
    }
}
