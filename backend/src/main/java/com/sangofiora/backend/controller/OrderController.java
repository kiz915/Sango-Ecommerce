package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.CreateOrderRequest;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.security.UserPrincipal;
import com.sangofiora.backend.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<?> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        try {
            // If user is authenticated, ensure order userId matches authenticated principal
            if (principal != null && request.getUserId() == null) {
                request.setUserId(principal.getId());
            }
            if (principal != null && request.getCustomerEmail() == null) {
                request.setCustomerEmail(principal.getEmail());
            }

            Order order = orderService.createOrder(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(order);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to process order: " + e.getMessage()));
        }
    }

    /**
     * Public order status lookup — strictly sanitizes PII (no customer email, phone, or delivery address).
     */
    @GetMapping("/track/{orderId}")
    public ResponseEntity<?> getPublicOrderTracking(@PathVariable String orderId) {
        return orderService.getOrderByOrderId(orderId)
                .map(o -> ResponseEntity.ok(Map.of(
                        "orderId", o.getOrderId(),
                        "status", o.getStatus() != null ? o.getStatus() : "Order Placed",
                        "statusStep", o.getStatusStep() != null ? o.getStatusStep() : 1,
                        "estDeliveryDate", o.getEstDeliveryDate() != null ? o.getEstDeliveryDate() : "",
                        "trackingNotes", o.getTrackingNotes() != null ? o.getTrackingNotes() : "",
                        "itemCount", o.getItems() != null ? o.getItems().size() : 0,
                        "createdAt", o.getCreatedAt() != null ? o.getCreatedAt().toString() : ""
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Authenticated full order details — verifies ownership (or ROLE_ADMIN).
     */
    @GetMapping("/{orderId}")
    public ResponseEntity<?> getOrderByOrderId(
            @PathVariable String orderId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Order order = orderService.getOrderByOrderId(orderId).orElse(null);
        if (order == null) {
            return ResponseEntity.notFound().build();
        }

        if (!isAuthorizedForOrder(order, principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: you do not have permission to view this order."));
        }

        return ResponseEntity.ok(order);
    }

    /**
     * Authenticated order history by user ID — verifies ownership (or ROLE_ADMIN).
     */
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getOrdersByUserId(
            @PathVariable UUID userId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        if (principal == null || (!principal.isAdmin() && !userId.equals(principal.getId()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot access another user's orders."));
        }
        return ResponseEntity.ok(orderService.getOrdersByUserId(userId));
    }

    /**
     * Authenticated order history by customer email — verifies ownership (or ROLE_ADMIN).
     */
    @GetMapping("/customer")
    public ResponseEntity<?> getOrdersByCustomerEmail(
            @RequestParam String email,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        if (principal == null || (!principal.isAdmin() && !email.trim().equalsIgnoreCase(principal.getEmail()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot access another customer's orders."));
        }
        return ResponseEntity.ok(orderService.getOrdersByCustomerEmail(email));
    }

    @PostMapping("/{orderId}/delivery")
    public ResponseEntity<?> updateOrderDelivery(
            @PathVariable String orderId,
            @RequestBody Map<String, String> deliveryData,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Order existing = orderService.getOrderByOrderId(orderId).orElse(null);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Order not found"));
        }

        if (!isAuthorizedForOrder(existing, principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot modify delivery details for this order."));
        }

        try {
            Order order = orderService.updateOrderDelivery(orderId, deliveryData);
            return ResponseEntity.ok(order);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to update delivery details: " + e.getMessage()));
        }
    }

    @PostMapping("/{orderId}/cancel")
    public ResponseEntity<?> cancelOrder(
            @PathVariable String orderId,
            @RequestBody(required = false) Map<String, String> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Order existing = orderService.getOrderByOrderId(orderId).orElse(null);
        if (existing == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Order not found"));
        }

        if (!isAuthorizedForOrder(existing, principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot cancel this order."));
        }

        try {
            String reason = body != null ? body.get("reason") : "Customer cancelled within window";
            Order order = orderService.cancelOrder(orderId, reason);
            return ResponseEntity.ok(order);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to cancel order: " + e.getMessage()));
        }
    }

    private boolean isAuthorizedForOrder(Order order, UserPrincipal principal) {
        if (principal == null) return false;
        if (principal.isAdmin()) return true;
        if (order.getUserId() != null && order.getUserId().equals(principal.getId())) return true;
        return order.getCustomerEmail() != null
                && principal.getEmail() != null
                && order.getCustomerEmail().trim().equalsIgnoreCase(principal.getEmail().trim());
    }
}
