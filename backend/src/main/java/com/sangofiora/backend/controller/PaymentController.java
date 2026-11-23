package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.CodConfirmRequest;
import com.sangofiora.backend.dto.CreatePaymentIntentRequest;
import com.sangofiora.backend.dto.PaymentIntentResponse;
import com.sangofiora.backend.dto.PaymentVerificationResponse;
import com.sangofiora.backend.dto.StripeIntentRequest;
import com.sangofiora.backend.dto.StripeIntentResponse;
import com.sangofiora.backend.dto.VerifyPaymentRequest;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Payment;
import com.sangofiora.backend.security.UserPrincipal;
import com.sangofiora.backend.service.OrderService;
import com.sangofiora.backend.service.PaymentService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Slf4j
public class PaymentController {

    private final PaymentService paymentService;
    private final OrderService orderService;

    @PostMapping("/intent")
    public ResponseEntity<?> createIntent(@Valid @RequestBody CreatePaymentIntentRequest request) {
        try {
            PaymentIntentResponse response = paymentService.createPaymentIntent(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Payment API] Intent creation error: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to initiate payment intent: " + e.getMessage()));
        }
    }

    @PostMapping("/stripe/create-intent")
    public ResponseEntity<?> createStripeIntent(@Valid @RequestBody StripeIntentRequest request) {
        try {
            StripeIntentResponse response = paymentService.createStripeIntent(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Stripe API] Intent creation error: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to initiate Stripe payment intent: " + e.getMessage()));
        }
    }

    @Data
    public static class StripeConfirmRequest {
        private String paymentId;
        private String stripePaymentIntentId;
        private String cardLast4;
        private String cardBrand;
    }

    @PostMapping("/stripe/confirm")
    public ResponseEntity<?> confirmStripe(@RequestBody StripeConfirmRequest request) {
        try {
            PaymentVerificationResponse response = paymentService.confirmStripePayment(
                    request.getPaymentId(),
                    request.getStripePaymentIntentId(),
                    request.getCardLast4(),
                    request.getCardBrand()
            );
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Stripe API] Confirmation error: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Stripe payment confirmation failed: " + e.getMessage()));
        }
    }

    @PostMapping("/verify")
    public ResponseEntity<?> verifyPayment(@Valid @RequestBody VerifyPaymentRequest request) {
        try {
            PaymentVerificationResponse response = paymentService.verifyPayment(request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (SecurityException e) {
            log.warn("[Payment API] Security violation during verification: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Payment API] Payment verification error: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Payment authorization verification failed: " + e.getMessage()));
        }
    }

    @Data
    public static class FailPaymentRequest {
        private String paymentId;
        private String errorCode;
        private String errorMessage;
    }

    @PostMapping("/fail")
    public ResponseEntity<?> failPayment(
            @RequestBody FailPaymentRequest req,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        try {
            Payment p = paymentService.getPayment(req.getPaymentId());
            if (!isAuthorizedForPayment(p, principal)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied."));
            }
            Payment updated = paymentService.markPaymentFailed(req.getPaymentId(), req.getErrorCode(), req.getErrorMessage());
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{paymentId}")
    public ResponseEntity<?> getPayment(
            @PathVariable String paymentId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        try {
            Payment p = paymentService.getPayment(paymentId);
            if (!isAuthorizedForPayment(p, principal)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied to payment record."));
            }
            return ResponseEntity.ok(p);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<?> getPaymentsForOrder(
            @PathVariable String orderId,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Order order = orderService.getOrderByOrderId(orderId).orElse(null);
        if (order == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Order not found"));
        }
        if (!isAuthorizedForOrder(order, principal)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Access denied to order payments."));
        }
        return ResponseEntity.ok(paymentService.getPaymentsForOrder(orderId));
    }

    @PostMapping("/cod/confirm")
    public ResponseEntity<?> confirmCod(@RequestBody CodConfirmRequest request) {
        try {
            PaymentVerificationResponse response = paymentService.confirmCod(request);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Payment API] COD confirmation error: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to confirm COD order: " + e.getMessage()));
        }
    }

    /**
     * Webhook endpoint with HMAC signature check and replay protection.
     */
    @PostMapping("/webhook")
    public ResponseEntity<?> handleWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "X-Webhook-Signature", required = false) String sig,
            @RequestHeader(value = "Stripe-Signature", required = false) String stripeSig,
            @RequestHeader(value = "X-Webhook-Timestamp", required = false) String timestamp
    ) {
        String signature = sig != null ? sig : stripeSig;
        if (signature == null || signature.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Missing webhook signature header"));
        }

        try {
            PaymentVerificationResponse response = paymentService.processWebhook(payload, signature, timestamp);
            return ResponseEntity.ok(Map.of("status", "processed", "paymentId", response.getPaymentId()));
        } catch (SecurityException e) {
            log.warn("[Webhook] Rejected due to security check: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("[Webhook] Processing failure: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/webhook/stripe")
    public ResponseEntity<?> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String sigHeader,
            @RequestHeader(value = "X-Webhook-Timestamp", required = false) String timestamp
    ) {
        return handleWebhook(payload, sigHeader, sigHeader, timestamp);
    }

    private boolean isAuthorizedForPayment(Payment payment, UserPrincipal principal) {
        if (principal == null) return false;
        if (principal.isAdmin()) return true;
        Order order = orderService.getOrderByOrderId(payment.getOrderId()).orElse(null);
        return order != null && isAuthorizedForOrder(order, principal);
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
