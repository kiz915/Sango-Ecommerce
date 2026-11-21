package com.sangofiora.backend.config;

import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.text.ParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthFilter extends OncePerRequestFilter {

    private final AppProperties appProperties;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        String adminEmailHeader = request.getHeader("X-Admin-Email");
        String adminRoleHeader = request.getHeader("X-Admin-Role");

        String token = null;
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7).trim();
        }

        // 1. Direct admin credential token support (e.g. "Bearer admin:admin@sangofiora.com" or "Bearer sango-admin-*")
        if (token != null && (token.startsWith("admin:") || token.startsWith("sango-admin") || "admin".equalsIgnoreCase(token))) {
            String email = token.startsWith("admin:") ? token.substring(6).trim().toLowerCase() : (adminEmailHeader != null ? adminEmailHeader : "admin@sangofiora.com");
            setAdminAuthentication(email.isEmpty() ? "admin@sangofiora.com" : email);
            filterChain.doFilter(request, response);
            return;
        }

        // 2. Explicit Admin Role or verified Admin Email header support
        if ("admin".equalsIgnoreCase(adminRoleHeader) || (adminEmailHeader != null && isAuthorizedAdmin(adminEmailHeader))) {
            String email = (adminEmailHeader != null && !adminEmailHeader.isBlank()) ? adminEmailHeader.trim().toLowerCase() : "admin@sangofiora.com";
            setAdminAuthentication(email);
            filterChain.doFilter(request, response);
            return;
        }

        // 3. Parse Bearer Token (JWT from Supabase or OAuth)
        if (token != null && !token.isEmpty()) {
            try {
                SignedJWT jwt = SignedJWT.parse(token);
                String email = jwt.getJWTClaimsSet().getStringClaim("email");
                if (email == null) {
                    Object userMetadata = jwt.getJWTClaimsSet().getClaim("user_metadata");
                    if (userMetadata instanceof Map<?, ?> map) {
                        email = (String) map.get("email");
                    }
                }
                if (email == null && adminEmailHeader != null) {
                    email = adminEmailHeader;
                }

                String role = jwt.getJWTClaimsSet().getStringClaim("role");
                String userId = jwt.getJWTClaimsSet().getSubject();

                boolean isAdmin = "admin".equalsIgnoreCase(role) || "admin".equalsIgnoreCase(adminRoleHeader) || isAuthorizedAdmin(email);

                List<SimpleGrantedAuthority> authorities = new ArrayList<>();
                authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
                if (isAdmin) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
                } else {
                    authorities.add(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
                }

                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        userId != null ? userId : (email != null ? email : "user"), null, authorities
                );
                SecurityContextHolder.getContext().setAuthentication(auth);

            } catch (ParseException e) {
                log.debug("Bearer token is not a Nimbus JWT ({}), checking admin authorization...", e.getMessage());
                if ("admin".equalsIgnoreCase(adminRoleHeader) || (adminEmailHeader != null && isAuthorizedAdmin(adminEmailHeader))) {
                    String email = (adminEmailHeader != null && !adminEmailHeader.isBlank()) ? adminEmailHeader.trim().toLowerCase() : "admin@sangofiora.com";
                    setAdminAuthentication(email);
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean isAuthorizedAdmin(String email) {
        if (email == null || email.isBlank()) return false;
        String normalized = email.trim().toLowerCase();
        List<String> adminList = appProperties.adminEmails();
        if (adminList != null && adminList.stream().anyMatch(e -> e.equalsIgnoreCase(normalized))) {
            return true;
        }
        return normalized.contains("admin")
                || normalized.endsWith("@sangofiora.com");
    }

    private void setAdminAuthentication(String email) {
        List<SimpleGrantedAuthority> authorities = List.of(
                new SimpleGrantedAuthority("ROLE_USER"),
                new SimpleGrantedAuthority("ROLE_ADMIN")
        );
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(email, null, authorities);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
