package com.infinitecanvas.backend.controller;

import com.infinitecanvas.backend.dto.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> responseStatus(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(ApiResponse.fail(error.getReason()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> badRequest(IllegalArgumentException error) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResponse.fail(error.getMessage()));
    }
}
