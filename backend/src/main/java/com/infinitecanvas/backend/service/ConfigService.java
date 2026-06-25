package com.infinitecanvas.backend.service;

import com.infinitecanvas.backend.entity.Config;
import com.infinitecanvas.backend.repository.ConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ConfigService {

    private final ConfigRepository repository;

    public ConfigService(ConfigRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Config getConfig() {
        return repository.findById(1L).orElse(null);
    }

    @Transactional
    public Config saveConfig(String data) {
        Config config = repository.findById(1L).orElseGet(() -> {
            Config c = new Config();
            c.setId(1L);
            return c;
        });
        config.setData(data);
        config.setUpdatedAt(Instant.now());
        return repository.save(config);
    }
}