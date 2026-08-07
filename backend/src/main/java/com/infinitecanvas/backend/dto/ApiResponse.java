package com.infinitecanvas.backend.dto;

public class ApiResponse<T> {
    private int code;
    private T data;
    private String msg;

    public ApiResponse(int code, T data, String msg) {
        this.code = code;
        this.data = data;
        this.msg = msg;
    }

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, data, "ok");
    }

    public static ApiResponse<Void> ok() {
        return new ApiResponse<>(0, null, "ok");
    }

    public static <T> ApiResponse<T> fail(String msg) {
        return new ApiResponse<>(1, null, msg);
    }

    public int getCode() { return code; }
    public T getData() { return data; }
    public String getMsg() { return msg; }
}
