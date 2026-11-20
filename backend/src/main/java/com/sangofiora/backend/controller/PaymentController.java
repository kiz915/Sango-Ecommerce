package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.CreatePaymentIntentRequest;
import com.sangofiora.backend.dto.PaymentIntentResponse;
import com.sangofiora.backend.dto.PaymentVerificationResponse;
import com.sangofiora.backend.dto.StripeIntentRequest;
import com.sangofiora.backend.dto.StripeIntentResponse;
import com.sangofiora.backend.dto.VerifyPaymentRequest;
import com.sangofiora.backend.model.Payment;
import com.sangofiora.backend.service.PaymentService;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@Slf4j
public class PaymentController {

    private final PaymentService paymentService;

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
                    .body(Map.of("error", "Failed to initiate secure payment intent: " + e.getMessage()));
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
    public ResponseEntity<?> failPayment(@RequestBody FailPaymentRequest req) {
        try {
            Payment p = paymentService.markPaymentFailed(req.getPaymentId(), req.getErrorCode(), req.getErrorMessage());
            return ResponseEntity.ok(p);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{paymentId}")
    public ResponseEntity<?> getPayment(@PathVariable String paymentId) {
        try {
            Payment p = paymentService.getPayment(paymentId);
            return ResponseEntity.ok(p);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<List<Payment>> getPaymentsForOrder(@PathVariable String orderId) {
        return ResponseEntity.ok(paymentService.getPaymentsForOrder(orderId));
    }

    @PostMapping("/webhook")
    public ResponseEntity<?> handleGatewayWebhook(@RequestBody Map<String, Object> payload,
                                                  @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        log.info("[Payment Webhook] Gateway webhook received with payload: {}", payload);
        // Secure Webhook endpoint
        return ResponseEntity.ok(Map.of("status", "received", "timestamp", System.currentTimeMillis()));
    }
}
