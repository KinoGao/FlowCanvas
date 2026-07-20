package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.User;
import com.infinitecanvas.backend.repository.UserFileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserFileServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void removesWrittenFileWhenDatabaseSaveFails() throws Exception {
        UserFileRepository repository = mock(UserFileRepository.class);
        when(repository.save(any())).thenThrow(new IllegalStateException("database unavailable"));
        UserFileService service = new UserFileService(tempDir.toString(), repository);
        User user = new User();
        user.setId("user-a");
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "frame.png",
                "image/png",
                new byte[] {1, 2, 3, 4}
        );

        assertThrows(IllegalStateException.class, () -> service.save(user, file));
        try (var paths = Files.walk(tempDir)) {
            assertEquals(0, paths.filter(Files::isRegularFile).count());
        }
    }
}
