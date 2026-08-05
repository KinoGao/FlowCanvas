package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> responseStatus(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(ApiResponse.fail(error.getReason()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> badRequest(IllegalArgumentException error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.fail(error.getMessage()));
    }

    /** 请求体 JSON 解析失败属于客户端错误，返回 400 而非 500。 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> unreadableBody(HttpMessageNotReadableException error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.fail("请求体格式无效"));
    }

    /** 兜底：未捕获异常统一返回 500，不向客户端透出内部细节。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> unexpected(Exception error) {
        log.error("未处理的服务器异常", error);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.fail("服务器内部错误"));
    }
}
