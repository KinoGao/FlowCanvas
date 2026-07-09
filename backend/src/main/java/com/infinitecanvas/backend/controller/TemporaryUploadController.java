package com.infinitecanvas.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/upload-public")
public class TemporaryUploadController {
    private static final long MAX_FILE_SIZE = 20L * 1024L * 1024L;
    private final WebClient webClient = WebClient.builder().build();

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file, @RequestParam(defaultValue = "auto") String source) {
        if (file == null || file.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "文件为空"));
        if (file.getSize() > MAX_FILE_SIZE) return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "文件超过 20MB 限制"));
        String mime = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!mime.isBlank() && !mime.startsWith("image/")) return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).body(Map.of("error", "仅支持图片类型，收到 " + mime));

        String requestedSource = source == null ? "auto" : source.toLowerCase();
        List<Map<String, Object>> attempts = new ArrayList<>();
        if (requestedSource.equals("temp.sh") || requestedSource.equals("auto")) {
            Attempt attempt = tryTempSh(file);
            attempts.add(attempt.toMap());
            if (attempt.ok) return ResponseEntity.ok(Map.of("url", attempt.body, "source", "temp.sh"));
            if (requestedSource.equals("temp.sh")) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "temp.sh 上传失败", "attempts", attempts));
        }
        if (requestedSource.equals("litterbox") || requestedSource.equals("auto")) {
            Attempt attempt = tryLitterbox(file);
            attempts.add(attempt.toMap());
            if (attempt.ok) return ResponseEntity.ok(Map.of("url", attempt.body, "source", "litterbox"));
            if (requestedSource.equals("litterbox")) return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "litterbox 上传失败", "attempts", attempts));
        }
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "所有临时图床都失败", "attempts", attempts));
    }

    private Attempt tryTempSh(MultipartFile file) {
        try {
            MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
            form.add("file", file.getResource());
            String body = webClient.post().uri("https://temp.sh/upload").contentType(MediaType.MULTIPART_FORM_DATA).body(BodyInserters.fromMultipartData(form)).retrieve().bodyToMono(String.class).block(Duration.ofSeconds(30));
            String text = body == null ? "" : body.trim();
            return text.matches("(?i)^https?://.*") ? Attempt.ok("temp.sh", text) : Attempt.fail("temp.sh", text);
        } catch (Exception e) {
            return Attempt.fail("temp.sh", e.getMessage());
        }
    }

    private Attempt tryLitterbox(MultipartFile file) {
        try {
            MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
            form.add("reqtype", "fileupload");
            form.add("time", "72h");
            form.add("fileToUpload", file.getResource());
            String body = webClient.post().uri("https://litterbox.catbox.moe/resources/internals/api.php").contentType(MediaType.MULTIPART_FORM_DATA).body(BodyInserters.fromMultipartData(form)).retrieve().bodyToMono(String.class).block(Duration.ofSeconds(30));
            String text = body == null ? "" : body.trim();
            return text.matches("(?i)^https?://.*") ? Attempt.ok("litterbox", text) : Attempt.fail("litterbox", text);
        } catch (Exception e) {
            return Attempt.fail("litterbox", e.getMessage());
        }
    }

    private record Attempt(String source, boolean ok, String body, String error) {
        static Attempt ok(String source, String body) { return new Attempt(source, true, body, null); }
        static Attempt fail(String source, String error) { return new Attempt(source, false, null, error == null ? "未知错误" : truncate(error)); }
        Map<String, Object> toMap() { return Map.of("source", source, "ok", ok, "error", error == null ? "" : error); }
        static String truncate(String value) { return value.length() <= 400 ? value : value.substring(0, 400) + "..."; }
    }
}
