package com.sangofiora.backend.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSecurityRoutesTest {

    @LocalServerPort
    private int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .GET()
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> postJson(String path, String json) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    @DisplayName("Storefront static HTML pages and JS/CSS assets must be publicly accessible (200 OK)")
    void publicStorefrontPagesAccessible() throws Exception {
        assertEquals(200, get("/").statusCode());
        assertEquals(200, get("/checkout/").statusCode());
        assertEquals(200, get("/wishlist/").statusCode());
        assertEquals(200, get("/js/cart.js").statusCode());
        assertEquals(200, get("/api/health").statusCode());
    }

    @Test
    @DisplayName("Protected API endpoints must reject unauthenticated callers with 401 Unauthorized")
    void protectedApisRequireAuth() throws Exception {
        assertEquals(401, get("/api/admin/orders").statusCode());
        assertEquals(401, get("/api/customer/profile").statusCode());
        assertEquals(401, postJson("/api/cart/sync", "{\"email\":\"test@example.com\"}").statusCode());
        assertEquals(200, postJson("/api/cart/validate", "{\"items\":[]}").statusCode());
    }
}
