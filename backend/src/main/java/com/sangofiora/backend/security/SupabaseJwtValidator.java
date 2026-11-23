package com.sangofiora.backend.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSKeySelector;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.sangofiora.backend.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
public class SupabaseJwtValidator {

    private final AppProperties appProperties;
    private final Map<String, ConfigurableJWTProcessor<SecurityContext>> jwkProcessorCache = new ConcurrentHashMap<>();

    public SupabaseJwtValidator(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    /**
     * Validates a JWT string and returns a UserPrincipal if valid, or null if invalid/expired.
     */
    public UserPrincipal validateToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }

        try {
            SignedJWT signedJWT = SignedJWT.parse(token);
            JWSHeader header = signedJWT.getHeader();
            JWSAlgorithm alg = header.getAlgorithm();

            boolean signatureVerified = false;

            // 1. Signature Verification
            String secret = appProperties.getJwt().getSecret();
            if (JWSAlgorithm.Family.HMAC_SHA.contains(alg)) {
                if (secret == null || secret.isBlank()) {
                    log.error("[JWT Security] Received HMAC JWT but app.jwt.secret is not configured. Rejecting token.");
                    return null;
                }
                MACVerifier verifier = new MACVerifier(secret.getBytes(StandardCharsets.UTF_8));
                signatureVerified = signedJWT.verify(verifier);
            } else if (JWSAlgorithm.Family.RSA.contains(alg) || JWSAlgorithm.Family.EC.contains(alg)) {
                String jwksUrl = appProperties.getJwt().getJwksUrl();
                if (jwksUrl == null || jwksUrl.isBlank()) {
                    String issuer = appProperties.getJwt().getIssuer();
                    if (issuer != null && !issuer.isBlank()) {
                        jwksUrl = issuer.replaceAll("/+$", "") + "/.well-known/jwks.json";
                    }
                }
                if (jwksUrl == null || jwksUrl.isBlank()) {
                    log.error("[JWT Security] Asymmetric JWT received but JWKS URL is not configured. Rejecting token.");
                    return null;
                }

                ConfigurableJWTProcessor<SecurityContext> jwtProcessor = getOrCreateJwkProcessor(jwksUrl, alg);
                JWTClaimsSet processedClaims = jwtProcessor.process(signedJWT, null);
                return buildPrincipalFromClaims(processedClaims);
            }

            if (!signatureVerified) {
                log.warn("[JWT Security] JWT signature verification failed for token with algorithm: {}", alg);
                return null;
            }

            // 2. Claims Validation
            JWTClaimsSet claimsSet = signedJWT.getJWTClaimsSet();
            return buildPrincipalFromClaims(claimsSet);

        } catch (Exception e) {
            log.warn("[JWT Security] Token validation failed: {}", e.getMessage());
            return null;
        }
    }

    private UserPrincipal buildPrincipalFromClaims(JWTClaimsSet claimsSet) {
        if (claimsSet == null) return null;

        // A. Expiration validation (with 60-second clock skew tolerance)
        Date now = new Date();
        Date exp = claimsSet.getExpirationTime();
        if (exp != null && exp.before(new Date(now.getTime() - 60_000))) {
            log.warn("[JWT Security] Token has expired. Expiry: {}, Now: {}", exp, now);
            return null;
        }

        // B. Not-before validation
        Date nbf = claimsSet.getNotBeforeTime();
        if (nbf != null && nbf.after(new Date(now.getTime() + 60_000))) {
            log.warn("[JWT Security] Token is not yet valid (nbf: {})", nbf);
            return null;
        }

        // C. Issuer validation
        String expectedIssuer = appProperties.getJwt().getIssuer();
        if (expectedIssuer != null && !expectedIssuer.isBlank()) {
            String tokenIssuer = claimsSet.getIssuer();
            if (tokenIssuer == null || !expectedIssuer.trim().equalsIgnoreCase(tokenIssuer.trim())) {
                log.warn("[JWT Security] Token issuer mismatch. Expected: {}, Received: {}", expectedIssuer, tokenIssuer);
                return null;
            }
        }

        // D. Audience validation
        String expectedAudience = appProperties.getJwt().getAudience();
        if (expectedAudience != null && !expectedAudience.isBlank()) {
            List<String> aud = claimsSet.getAudience();
            if (aud == null || aud.stream().noneMatch(a -> a.equalsIgnoreCase(expectedAudience))) {
                log.warn("[JWT Security] Token audience mismatch. Expected: {}, Received: {}", expectedAudience, aud);
                return null;
            }
        }

        // E. Subject validation
        String sub = claimsSet.getSubject();
        if (sub == null || sub.isBlank()) {
            log.warn("[JWT Security] Token missing subject claim");
            return null;
        }

        UUID userId = null;
        try {
            userId = UUID.fromString(sub.trim());
        } catch (IllegalArgumentException e) {
            log.warn("[JWT Security] Subject is not a valid UUID: {}", sub);
        }

        // F. Email extraction
        String email = null;
        try {
            email = claimsSet.getStringClaim("email");
        } catch (Exception ignored) {}

        // G. Role extraction (Strict: NEVER trust user_metadata)
        String role = "customer";
        try {
            Object appMetaObj = claimsSet.getClaim("app_metadata");
            if (appMetaObj instanceof Map<?, ?> appMap) {
                Object r = appMap.get("role");
                if (r != null) {
                    role = r.toString().toLowerCase();
                }
            }
        } catch (Exception ignored) {}

        // Check if verified email is an authorized administrator
        boolean isAdmin = "admin".equalsIgnoreCase(role) || isAuthorizedAdmin(email);

        List<SimpleGrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        if (isAdmin) {
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        } else {
            authorities.add(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
        }

        return UserPrincipal.builder()
                .id(userId)
                .email(email != null ? email.trim().toLowerCase() : null)
                .role(isAdmin ? "admin" : "customer")
                .authorities(authorities)
                .build();
    }

    private boolean isAuthorizedAdmin(String email) {
        if (email == null || email.isBlank()) return false;
        String normalized = email.trim().toLowerCase();

        List<String> adminList = appProperties.adminEmails();
        if (adminList != null) {
            for (String entry : adminList) {
                if (entry == null) continue;
                for (String part : entry.split(",")) {
                    if (part.trim().equalsIgnoreCase(normalized)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    private ConfigurableJWTProcessor<SecurityContext> getOrCreateJwkProcessor(String jwksUrl, JWSAlgorithm alg) {
        return jwkProcessorCache.computeIfAbsent(jwksUrl + ":" + alg.getName(), key -> {
            try {
                ConfigurableJWTProcessor<SecurityContext> jwtProcessor = new DefaultJWTProcessor<>();
                JWKSource<SecurityContext> keySource = new RemoteJWKSet<>(URI.create(jwksUrl).toURL());
                JWSKeySelector<SecurityContext> keySelector = new JWSVerificationKeySelector<>(alg, keySource);
                jwtProcessor.setJWSKeySelector(keySelector);
                return jwtProcessor;
            } catch (Exception e) {
                throw new IllegalStateException("Failed to configure JWKS key selector for URL: " + jwksUrl, e);
            }
        });
    }
}
