package com.sangofiora.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
@Slf4j
public class RateLimitingFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000L; // 1-minute window
    private static final int MAX_ENTRIES = 50_000;

    // Route-specific limits (requests per minute per IP)
    private static final int LIMIT_AUTH_ADMIN = 15;
    private static final int LIMIT_ORDERS = 10;
    private static final int LIMIT_PAYMENTS = 20;
    private static final int LIMIT_CONTACT = 5;
    private static final int LIMIT_UPLOADS = 10;
    private static final int LIMIT_GENERAL = 120;

    private final Map<String, ConcurrentLinkedDeque<Long>> requestLog = new ConcurrentHashMap<>();
    private final AtomicLong lastCleanupTime = new AtomicLong(System.currentTimeMillis());

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // Skip OPTIONS preflight
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        // Only rate limit API endpoints
        if (!path.startsWith("/api")) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientIp = resolveClientIp(request);
        int maxAllowed = resolveLimit(path, request.getMethod());
        String bucketKey = pathCategory(path) + ":" + clientIp;

        long now = System.currentTimeMillis();
        maybeCleanup(now);

        ConcurrentLinkedDeque<Long> timestamps = requestLog.computeIfAbsent(bucketKey, k -> new ConcurrentLinkedDeque<>());

        // Evict expired timestamps from the client's deque
        while (!timestamps.isEmpty() && now - timestamps.peekFirst() > WINDOW_MS) {
            timestamps.pollFirst();
        }

        if (timestamps.size() >= maxAllowed) {
            log.warn("[RateLimit] Rate limit exceeded for IP: {} on endpoint: {} (Count: {} / Limit: {})",
                    clientIp, path, timestamps.size(), maxAllowed);
            response.setStatus(429);
            response.setContentType("application/json");
            response.setHeader("Retry-After", "60");
            response.getWriter().write(String.format(
                    "{\"error\":\"Too Many Requests\",\"message\":\"Rate limit exceeded for %s. Please retry in 60 seconds.\"}",
                    pathCategory(path)
            ));
            return;
        }

        timestamps.addLast(now);
        filterChain.doFilter(request, response);
    }

    private int resolveLimit(String path, String method) {
        if (path.startsWith("/api/admin")) return LIMIT_AUTH_ADMIN;
        if (path.startsWith("/api/orders") && "POST".equalsIgnoreCase(method)) return LIMIT_ORDERS;
        if (path.startsWith("/api/payments")) return LIMIT_PAYMENTS;
        if (path.startsWith("/api/contact")) return LIMIT_CONTACT;
        if (path.contains("upload-image")) return LIMIT_UPLOADS;
        return LIMIT_GENERAL;
    }

    private String pathCategory(String path) {
        if (path.startsWith("/api/admin")) return "admin";
        if (path.startsWith("/api/orders")) return "orders";
        if (path.startsWith("/api/payments")) return "payments";
        if (path.startsWith("/api/contact")) return "contact";
        if (path.contains("upload-image")) return "uploads";
        return "general";
    }

    private String resolveClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isBlank()) {
            return xRealIp.trim();
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "127.0.0.1";
    }

    private void maybeCleanup(long now) {
        // Run sweep every 5 minutes if map exceeds safety threshold
        if (now - lastCleanupTime.get() > 300_000L || requestLog.size() > MAX_ENTRIES) {
            lastCleanupTime.set(now);
            Iterator<Map.Entry<String, ConcurrentLinkedDeque<Long>>> iterator = requestLog.entrySet().iterator();
            while (iterator.hasNext()) {
                Map.Entry<String, ConcurrentLinkedDeque<Long>> entry = iterator.next();
                ConcurrentLinkedDeque<Long> dq = entry.getValue();
                while (!dq.isEmpty() && now - dq.peekFirst() > WINDOW_MS) {
                    dq.pollFirst();
                }
                if (dq.isEmpty()) {
                    iterator.remove();
                }
            }
        }
    }
}
