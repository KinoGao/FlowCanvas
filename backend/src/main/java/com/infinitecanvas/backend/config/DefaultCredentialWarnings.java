package com.infinitecanvas.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 启动时检测默认 / 弱凭证并输出醒目警告。
 *
 * application.yml 为内部部署提供了硬编码默认值（AUTH_CODE=gycode、
 * ADMIN_CODE=admincode、MEDIA_SIGNING_SECRET 继承 admincode）。这些默认值
 * 一旦暴露到公网，任何人都能注册账号、进入管理后台，甚至伪造媒体访问
 * 签名下载任意用户文件。公网部署必须通过环境变量覆盖。
 */
@Component
public class DefaultCredentialWarnings implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DefaultCredentialWarnings.class);

    private static final String DEFAULT_AUTH_CODE = "gycode";
    private static final String DEFAULT_ADMIN_CODE = "admincode";

    private final String authCode;
    private final String adminCode;
    private final String mediaSigningSecret;

    public DefaultCredentialWarnings(
            @Value("${app.auth-code:}") String authCode,
            @Value("${app.admin-code:}") String adminCode,
            @Value("${app.media-signing-secret:}") String mediaSigningSecret
    ) {
        this.authCode = authCode;
        this.adminCode = adminCode;
        this.mediaSigningSecret = mediaSigningSecret;
    }

    @Override
    public void run(ApplicationArguments args) {
        warnIf(DEFAULT_AUTH_CODE.equals(authCode),
                "AUTH_CODE 仍在使用已知默认值 \"gycode\"：公网部署下任何人都能注册账号。"
                        + "请通过环境变量 AUTH_CODE 设置随机鉴权码。");
        warnIf(DEFAULT_ADMIN_CODE.equals(adminCode),
                "ADMIN_CODE 仍在使用已知默认值 \"admincode\"：公网部署下任何人都能以管理员授权码登录管理后台。"
                        + "请通过环境变量 ADMIN_CODE 设置随机管理员授权码。");
        warnIf(mediaSigningSecret == null || mediaSigningSecret.isBlank()
                        || DEFAULT_ADMIN_CODE.equals(mediaSigningSecret) || DEFAULT_AUTH_CODE.equals(mediaSigningSecret),
                "MEDIA_SIGNING_SECRET 缺失或为已知默认值：媒体访问签名可被伪造，任意用户文件可能被下载。"
                        + "请通过环境变量 MEDIA_SIGNING_SECRET 设置随机密钥。");
    }

    private void warnIf(boolean condition, String message) {
        if (!condition) return;
        log.warn("");
        log.warn("======================================================================");
        log.warn("安全警告：{}", message);
        log.warn("======================================================================");
    }
}
