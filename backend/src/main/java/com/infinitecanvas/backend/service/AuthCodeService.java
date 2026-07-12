package com.infinitecanvas.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class AuthCodeService {
    private final String registrationCode;
    private final String adminCode;

    public AuthCodeService(
            @Value("${app.registration-code:${app.auth-code:gycode}}") String registrationCode,
            @Value("${app.admin-code:admincode}") String adminCode
    ) {
        this.registrationCode = registrationCode == null || registrationCode.isBlank()
                ? UUID.randomUUID().toString().replace("-", "") : registrationCode;
        this.adminCode = adminCode == null ? "" : adminCode;
    }

    public boolean matches(String value) { return matchesRegistration(value); }
    public boolean matchesRegistration(String value) { return value != null && value.equals(registrationCode); }
    public boolean matchesAdmin(String value) { return value != null && !adminCode.isBlank() && value.equals(adminCode); }
    public String value() { return registrationCode; }
}
