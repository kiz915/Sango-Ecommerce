package com.sangofiora.backend.security;

import lombok.Builder;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;

import java.security.Principal;
import java.util.Collection;
import java.util.UUID;

@Getter
@Builder
public class UserPrincipal implements Principal {

    private final UUID id;
    private final String email;
    private final String role;
    private final Collection<? extends GrantedAuthority> authorities;

    @Override
    public String getName() {
        return id != null ? id.toString() : (email != null ? email : "anonymous");
    }

    public boolean isAdmin() {
        return authorities != null && authorities.stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
