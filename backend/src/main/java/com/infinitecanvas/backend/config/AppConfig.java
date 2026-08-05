package com.infinitecanvas.backend.config;

import com.infinitecanvas.backend.middleware.AuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

@Configuration
public class AppConfig implements WebMvcConfigurer {

    private final String[] corsAllowedOrigins;

    public AppConfig(@Value("${app.cors-allowed-origins:}") String corsAllowedOrigins) {
        // 默认仅同源（浏览器跨域请求会被拒绝）。cpolar 隧道等场景下浏览器与
        // 后端同源代理访问，无需 CORS；确需跨域时通过 CORS_ALLOWED_ORIGINS
        // 环境变量配置逗号分隔的 origin 列表。
        this.corsAllowedOrigins = corsAllowedOrigins == null || corsAllowedOrigins.isBlank()
                ? new String[0]
                : Arrays.stream(corsAllowedOrigins.split(",")).map(String::trim).filter(value -> !value.isBlank()).toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (corsAllowedOrigins.length == 0) return;
        registry.addMapping("/api/**")
                .allowedOriginPatterns(corsAllowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    @Bean
    public FilterRegistrationBean<AuthFilter> authFilterRegistration(AuthFilter authFilter) {
        FilterRegistrationBean<AuthFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(authFilter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(1);
        return registration;
    }
}
