package com.sangofiora.backend.config;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Value("${spring.h2.console.enabled:false}")
    private boolean h2ConsoleEnabled;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configure(http))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setContentType("application/json");
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.getWriter().write("{\"error\":\"Unauthorized\",\"message\":\"Authentication token required or invalid.\"}");
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setContentType("application/json");
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.getWriter().write("{\"error\":\"Forbidden\",\"message\":\"Access denied. Insufficient privileges.\"}");
                })
            )
            .authorizeHttpRequests(auth -> {
                // CORS preflight requests
                auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

                // Public Catalog, Health & Static Resources
                auth.requestMatchers(
                    "/api/health",
                    "/api/products/**",
                    "/api/categories/**",
                    "/api/contact",
                    "/api/coupons/validate",
                    "/uploads/**",
                    "/error"
                ).permitAll();

                // Public Checkout & Payment Routes (with rate-limiting & signature protection)
                auth.requestMatchers(HttpMethod.POST, "/api/orders").permitAll();
                auth.requestMatchers(HttpMethod.GET, "/api/orders/track/**").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/payments/intent").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/payments/stripe/create-intent").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/payments/stripe/confirm").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/payments/verify").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/payments/webhook").permitAll();

                // Admin-only endpoints
                auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
                auth.requestMatchers("/api/spreadsheet/deliveries/**").hasRole("ADMIN");
                auth.requestMatchers("/api/spreadsheet/contacts/**").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.POST, "/api/products/upload-image").hasRole("ADMIN");
                auth.requestMatchers(HttpMethod.POST, "/api/admin/products/upload-image").hasRole("ADMIN");

                // Public Cart validation (allows guests & logged in users to validate price/stock)
                auth.requestMatchers(HttpMethod.POST, "/api/cart/validate").permitAll();

                // Protected Customer & Order endpoints (Ownership verified in controller)
                auth.requestMatchers("/api/orders/**").authenticated();
                auth.requestMatchers("/api/cart/**").authenticated();
                auth.requestMatchers("/api/customer/**").authenticated();

                // H2 Console (Development/Test only)
                if (h2ConsoleEnabled) {
                    auth.requestMatchers("/h2-console/**").permitAll();
                } else {
                    auth.requestMatchers("/h2-console/**").denyAll();
                }

                // Actuator endpoints (health/info public; remaining require ADMIN)
                auth.requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll();
                auth.requestMatchers("/actuator/**").hasRole("ADMIN");

                // Lock down all other /api/** endpoints by default
                auth.requestMatchers("/api/**").authenticated();

                // Public static storefront HTML pages, JS, CSS & images (HTML shells enforce client/RLS auth)
                auth.requestMatchers(HttpMethod.GET, "/**").permitAll();

                // Reject all other unauthenticated write requests
                auth.anyRequest().authenticated();
            })
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        if (h2ConsoleEnabled) {
            http.headers(h -> h.frameOptions(f -> f.sameOrigin()));
        } else {
            http.headers(h -> h.frameOptions(f -> f.deny()));
        }

        return http.build();
    }
}
