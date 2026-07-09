package com.infinitecanvas.backend.dto;

import com.infinitecanvas.backend.entity.User;

public class UserDto {
    private String id;
    private String username;
    private String displayName;

    public UserDto(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.displayName = user.getDisplayName();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public String getDisplayName() { return displayName; }
}
