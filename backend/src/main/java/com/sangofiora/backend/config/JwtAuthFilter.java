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

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthFilter extends OncePerRequestFilter {

    private final AppProperties appProperties;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            String email = jwt.getJWTClaimsSet().getStringClaim("email");
            String role = jwt.getJWTClaimsSet().getStringClaim("role");
            String userId = jwt.getJWTClaimsSet().getSubject();

            boolean isAdmin = false;
            if (email != null) {
                String normalizedEmail = email.toLowerCase().trim();
                List<String> adminList = appProperties.adminEmails();
                if (adminList != null) {
                    isAdmin = adminList.stream().anyMatch(e -> e.equalsIgnoreCase(normalizedEmail));
                }
            }
            if ("admin".equalsIgnoreCase(role)) {
                isAdmin = true;
            }

            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
            if (isAdmin) {
                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            } else {
                authorities.add(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
            }

            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userId != null ? userId : email, null, authorities
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (ParseException e) {
            log.debug("Invalid JWT: {}", e.getMessage());
        }
        filterChain.doFilter(request, response);
    }
}
