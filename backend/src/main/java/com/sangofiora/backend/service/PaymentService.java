package com.sangofiora.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sangofiora.backend.config.AppProperties;
import com.sangofiora.backend.dto.CodConfirmRequest;
import com.sangofiora.backend.dto.CreatePaymentIntentRequest;
import com.sangofiora.backend.dto.PaymentIntentResponse;
import com.sangofiora.backend.dto.PaymentVerificationResponse;
import com.sangofiora.backend.dto.StripeIntentRequest;
import com.sangofiora.backend.dto.StripeIntentResponse;
import com.sangofiora.backend.dto.VerifyPaymentRequest;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Payment;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final SpreadsheetService spreadsheetService;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String MERCHANT_NAME = "Sango Fiora Botanicals Pvt Ltd";
    private static final long WEBHOOK_TOLERANCE_SECONDS = 300L; // 5 minutes replay protection

    @Transactional
    public PaymentIntentResponse createPaymentIntent(CreatePaymentIntentRequest request) {
        Order order = orderRepository.findByOrderId(request.getOrderId())
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + request.getOrderId()));

        if ("Paid".equalsIgnoreCase(order.getPaymentStatus())) {
            throw new IllegalStateException("Order #" + order.getOrderId() + " is already paid.");
        }

        // Check idempotency if key provided
        if (request.getIdempotencyKey() != null && !request.getIdempotencyKey().trim().isEmpty()) {
            Optional<Payment> existing = paymentRepository.findByIdempotencyKey(request.getIdempotencyKey().trim());
            if (existing.isPresent()) {
                Payment p = existing.get();
                if ("PENDING".equals(p.getStatus()) && p.getExpiresAt().isAfter(OffsetDateTime.now())) {
                    return toIntentResponse(p);
                }
            }
        }

        String datePrefix = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        int randomNum = ThreadLocalRandom.current().nextInt(10000, 99999);
        String paymentId = "PAY-" + datePrefix + "-" + randomNum;
        String gatewayOrderId = "order_sango_" + ThreadLocalRandom.current().nextLong(1000000000L, 9999999999L);
        OffsetDateTime expiresAt = OffsetDateTime.now().plusMinutes(15);

        Payment payment = Payment.builder()
                .paymentId(paymentId)
                .orderId(order.getOrderId())
                .amount(order.getNetTotal())
                .currency("INR")
                .paymentMethod(request.getPaymentMethod().toUpperCase())
                .paymentGateway(resolveGateway(request.getPaymentMethod()))
                .gatewayOrderId(gatewayOrderId)
                .status("PENDING")
                .vpa(request.getVpa())
                .cardNetwork(request.getCardNetwork())
                .bankName(request.getBankName())
                .idempotencyKey(request.getIdempotencyKey())
                .expiresAt(expiresAt)
                .build();

        Payment saved = paymentRepository.save(payment);
        log.info("[Payment] Created payment intent: {} for order: {} amount: ₹{}", saved.getPaymentId(), order.getOrderId(), order.getNetTotal());

        return toIntentResponse(saved);
    }

    @Transactional
    public PaymentVerificationResponse verifyPayment(VerifyPaymentRequest request) {
        Payment payment = paymentRepository.findByPaymentId(request.getPaymentId())
                .orElseThrow(() -> new IllegalArgumentException("Payment record not found: " + request.getPaymentId()));

        if (!payment.getOrderId().equalsIgnoreCase(request.getOrderId())) {
            throw new SecurityException("Security violation: Payment does not match Order ID.");
        }

        Order order = orderRepository.findByOrderId(payment.getOrderId())
                .orElseThrow(() -> new IllegalStateException("Order not found: " + payment.getOrderId()));

        // Idempotency: If already completed, return receipt
        if ("COMPLETED".equals(payment.getStatus())) {
            return buildCompletedResponse(payment, "Payment already verified and completed.");
        }

        // Expiration check
        if (payment.getExpiresAt() != null && payment.getExpiresAt().isBefore(OffsetDateTime.now())) {
            payment.setStatus("FAILED");
            payment.setErrorCode("PAYMENT_EXPIRED");
            payment.setErrorMessage("Payment session expired after 15 minutes.");
            paymentRepository.save(payment);
            throw new IllegalStateException("Payment session has expired. Please initiate a new payment.");
        }

        boolean isCod = "COD".equalsIgnoreCase(payment.getPaymentMethod());

        if (isCod) {
            log.info("[Payment] Processing COD confirmation for order: {}", order.getOrderId());
            payment.setStatus("COMPLETED");
            payment.setGatewayPaymentId("COD-" + ThreadLocalRandom.current().nextInt(100000, 999999));
            payment.setVerifiedAt(OffsetDateTime.now());
            order.setPaymentStatus("Pending (COD)");
            order.setStatus("Order Placed");
            order.setTxnId(payment.getGatewayPaymentId());
        } else {
            // Online Gateway (UPI, Card, NetBanking) Cryptographic Signature Verification
            String gatewayPaymentId = request.getGatewayPaymentId();
            if (gatewayPaymentId == null || gatewayPaymentId.trim().isEmpty()) {
                throw new IllegalArgumentException("Gateway payment ID is required");
            }

            String secret = appProperties != null ? appProperties.paymentSecret() : "";
            if (secret == null || secret.isBlank()) {
                log.error("[Payment Security] Payment secret is not configured. Cannot verify payment.");
                throw new IllegalStateException("Payment provider secret is not configured on server.");
            }

            String expectedSignature = calculateHmacSha256(payment.getGatewayOrderId() + "|" + gatewayPaymentId);
            String receivedSignature = request.getGatewaySignature();

            if (receivedSignature == null || receivedSignature.trim().isEmpty()) {
                log.warn("[Payment Security] Missing gateway signature for payment: {}", payment.getPaymentId());
                payment.setStatus("FAILED");
                payment.setErrorCode("MISSING_SIGNATURE");
                payment.setErrorMessage("Signature is required for online payment verification.");
                paymentRepository.save(payment);
                throw new SecurityException("Payment verification failed: Missing cryptographic signature.");
            }

            // Constant-time comparison to prevent timing attacks
            byte[] expectedBytes = expectedSignature.toLowerCase().getBytes(StandardCharsets.UTF_8);
            byte[] receivedBytes = receivedSignature.trim().toLowerCase().getBytes(StandardCharsets.UTF_8);

            if (!MessageDigest.isEqual(expectedBytes, receivedBytes)) {
                log.warn("[Payment Security] Cryptographic signature check failed for payment: {}", payment.getPaymentId());
                payment.setStatus("FAILED");
                payment.setErrorCode("INVALID_SIGNATURE");
                payment.setErrorMessage("Cryptographic signature check failed.");
                paymentRepository.save(payment);
                throw new SecurityException("Payment verification failed: Invalid HMAC signature.");
            }

            payment.setStatus("COMPLETED");
            payment.setGatewayPaymentId(gatewayPaymentId);
            payment.setGatewaySignature(expectedSignature);
            payment.setVerifiedAt(OffsetDateTime.now());
            if (request.getVpa() != null) payment.setVpa(request.getVpa());
            if (request.getCardLast4() != null) payment.setCardLast4(request.getCardLast4());
            if (request.getCardNetwork() != null) payment.setCardNetwork(request.getCardNetwork());
            if (request.getBankName() != null) payment.setBankName(request.getBankName());

            order.setPaymentStatus("Paid");
            order.setStatus("Order Placed");
            order.setTxnId(gatewayPaymentId);
        }

        paymentRepository.save(payment);
        orderRepository.save(order);

        recordToSpreadsheet(order, payment);

        log.info("[Payment] Successfully verified payment: {} for order: {}", payment.getPaymentId(), order.getOrderId());

        return buildCompletedResponse(payment, "Payment successfully authorized and confirmed.");
    }

    /**
     * Secure Webhook Handler with HMAC signature verification and replay attack protection.
     */
    @Transactional
    public PaymentVerificationResponse processWebhook(String payload, String signatureHeader, String timestampHeader) {
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException("Webhook payload cannot be empty");
        }

        // 1. Replay attack protection (check timestamp within 5 minutes)
        if (timestampHeader != null && !timestampHeader.isBlank()) {
            try {
                long timestamp = Long.parseLong(timestampHeader.trim());
                long now = Instant.now().getEpochSecond();
                if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
                    log.warn("[Webhook Security] Replay attack detected or timestamp expired: {} (now: {})", timestamp, now);
                    throw new SecurityException("Webhook rejected: timestamp is outside tolerance window.");
                }
            } catch (NumberFormatException e) {
                throw new SecurityException("Webhook rejected: invalid timestamp header format.");
            }
        }

        // 2. Cryptographic signature check
        String webhookSecret = (appProperties != null && appProperties.getStripe() != null && !appProperties.getStripe().getWebhookSecret().isBlank())
                ? appProperties.getStripe().getWebhookSecret()
                : (appProperties != null ? appProperties.paymentSecret() : "");

        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.error("[Webhook Security] Webhook secret not configured. Rejecting webhook.");
            throw new IllegalStateException("Webhook signing secret is not configured.");
        }

        if (signatureHeader == null || signatureHeader.isBlank()) {
            throw new SecurityException("Missing webhook signature header");
        }

        String dataToSign = (timestampHeader != null && !timestampHeader.isBlank())
                ? timestampHeader.trim() + "." + payload
                : payload;

        String expectedSignature = calculateHmacSha256WithSecret(dataToSign, webhookSecret);
        byte[] expectedBytes = expectedSignature.toLowerCase().getBytes(StandardCharsets.UTF_8);
        byte[] receivedBytes = signatureHeader.trim().toLowerCase().getBytes(StandardCharsets.UTF_8);

        if (!MessageDigest.isEqual(expectedBytes, receivedBytes)) {
            log.warn("[Webhook Security] Invalid webhook signature received.");
            throw new SecurityException("Webhook signature verification failed.");
        }

        // 3. Parse JSON payload and process idempotently
        try {
            JsonNode root = objectMapper.readTree(payload);
            String eventType = root.path("type").asText(root.path("event").asText("payment.succeeded"));
            log.info("[Webhook] Processing event type: {}", eventType);
            String paymentId = root.path("data").path("paymentId").asText(root.path("paymentId").asText(null));
            String orderId = root.path("data").path("orderId").asText(root.path("orderId").asText(null));

            if (paymentId == null && orderId == null) {
                throw new IllegalArgumentException("Webhook payload missing paymentId or orderId");
            }

            Payment payment = paymentId != null
                    ? paymentRepository.findByPaymentId(paymentId).orElse(null)
                    : paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId).stream().findFirst().orElse(null);

            if (payment == null) {
                log.warn("[Webhook] Payment record not found for webhook event: {}", payload);
                throw new IllegalArgumentException("Payment record not found for webhook payload");
            }

            if ("COMPLETED".equals(payment.getStatus())) {
                log.info("[Webhook] Payment {} is already COMPLETED (idempotent ACK).", payment.getPaymentId());
                return buildCompletedResponse(payment, "Webhook processed idempotently.");
            }

            Order order = orderRepository.findByOrderId(payment.getOrderId())
                    .orElseThrow(() -> new IllegalStateException("Order not found: " + payment.getOrderId()));

            payment.setStatus("COMPLETED");
            payment.setVerifiedAt(OffsetDateTime.now());
            order.setPaymentStatus("Paid");
            order.setStatus("Order Placed");

            paymentRepository.save(payment);
            orderRepository.save(order);

            recordToSpreadsheet(order, payment);
            log.info("[Webhook] Webhook successfully processed payment: {} for order: {}", payment.getPaymentId(), order.getOrderId());

            return buildCompletedResponse(payment, "Webhook successfully verified and applied.");

        } catch (Exception e) {
            log.error("[Webhook] Failed to process webhook body: {}", e.getMessage());
            throw new RuntimeException("Failed to process webhook: " + e.getMessage(), e);
        }
    }

    @Transactional
    public StripeIntentResponse createStripeIntent(StripeIntentRequest request) {
        Order order = orderRepository.findByOrderId(request.getOrderId())
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + request.getOrderId()));

        if ("Paid".equalsIgnoreCase(order.getPaymentStatus())) {
            throw new IllegalStateException("Order #" + order.getOrderId() + " is already paid.");
        }

        String datePrefix = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        int randomNum = ThreadLocalRandom.current().nextInt(10000, 99999);
        String paymentId = "PAY-STRIPE-" + datePrefix + "-" + randomNum;
        String stripePiId = "pi_sango_" + ThreadLocalRandom.current().nextLong(1000000000L, 9999999999L);
        String clientSecret = stripePiId + "_secret_" + ThreadLocalRandom.current().nextLong(100000000L, 999999999L);
        OffsetDateTime expiresAt = OffsetDateTime.now().plusMinutes(30);

        String currency = (request.getCurrency() != null && !request.getCurrency().trim().isEmpty())
                ? request.getCurrency().toUpperCase() : "INR";

        Payment payment = Payment.builder()
                .paymentId(paymentId)
                .orderId(order.getOrderId())
                .amount(order.getNetTotal())
                .currency(currency)
                .paymentMethod("STRIPE")
                .paymentGateway("STRIPE")
                .gatewayOrderId(stripePiId)
                .status("PENDING")
                .expiresAt(expiresAt)
                .build();

        Payment saved = paymentRepository.save(payment);
        log.info("[Stripe] Created Stripe payment intent {} for order {}", stripePiId, order.getOrderId());

        String publishableKey = (appProperties != null && appProperties.getStripe() != null && !appProperties.getStripe().getPublishableKey().isBlank())
                ? appProperties.getStripe().getPublishableKey()
                : "pk_test_placeholder";

        return StripeIntentResponse.builder()
                .paymentId(saved.getPaymentId())
                .orderId(order.getOrderId())
                .clientSecret(clientSecret)
                .stripePaymentIntentId(stripePiId)
                .publishableKey(publishableKey)
                .amount(order.getNetTotal())
                .currency(currency)
                .status("requires_payment_method")
                .expiresAt(expiresAt)
                .receiptEmail(order.getCustomerEmail())
                .build();
    }

    @Transactional
    public PaymentVerificationResponse confirmStripePayment(String paymentId, String stripePaymentIntentId, String cardLast4, String cardBrand) {
        Payment payment = paymentRepository.findByPaymentId(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment record not found: " + paymentId));

        Order order = orderRepository.findByOrderId(payment.getOrderId())
                .orElseThrow(() -> new IllegalStateException("Order not found: " + payment.getOrderId()));

        payment.setStatus("COMPLETED");
        payment.setGatewayPaymentId(stripePaymentIntentId != null ? stripePaymentIntentId : payment.getGatewayOrderId());
        payment.setCardLast4(cardLast4 != null ? cardLast4 : "4242");
        payment.setCardNetwork(cardBrand != null ? cardBrand.toUpperCase() : "VISA");
        payment.setVerifiedAt(OffsetDateTime.now());

        order.setPaymentStatus("Paid");
        order.setStatus("Order Placed");
        order.setTxnId(payment.getGatewayPaymentId());

        paymentRepository.save(payment);
        orderRepository.save(order);

        recordToSpreadsheet(order, payment);

        return buildCompletedResponse(payment, "Stripe Payment successfully authorized and captured.");
    }

    @Transactional
    public PaymentVerificationResponse confirmCod(CodConfirmRequest request) {
        Order order = orderRepository.findByOrderId(request.getOrderId())
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + request.getOrderId()));

        if (!"Order Placed".equalsIgnoreCase(order.getStatus())) {
            throw new IllegalStateException("Order cannot be confirmed for COD in status: " + order.getStatus());
        }

        order.setPaymentStatus("Pending (COD)");
        String codTxnId = "COD-" + ThreadLocalRandom.current().nextInt(100000, 999999);
        order.setTxnId(codTxnId);
        orderRepository.save(order);

        recordToSpreadsheet(order, null);

        return PaymentVerificationResponse.builder()
                .success(true)
                .orderId(order.getOrderId())
                .paymentId(codTxnId)
                .txnId(codTxnId)
                .status("COMPLETED")
                .amount(order.getNetTotal())
                .currency("INR")
                .paymentMethod("COD")
                .message("Cash On Delivery confirmed.")
                .verifiedAt(OffsetDateTime.now())
                .build();
    }

    @Transactional
    public Payment markPaymentFailed(String paymentId, String errorCode, String errorMessage) {
        Payment payment = paymentRepository.findByPaymentId(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
        payment.setStatus("FAILED");
        payment.setErrorCode(errorCode != null ? errorCode : "PAYMENT_FAILED");
        payment.setErrorMessage(errorMessage != null ? errorMessage : "Payment authorization was declined.");
        log.warn("[Payment] Payment marked failed: {} reason: {}", paymentId, errorMessage);
        return paymentRepository.save(payment);
    }

    @Transactional(readOnly = true)
    public Payment getPayment(String paymentId) {
        return paymentRepository.findByPaymentId(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found: " + paymentId));
    }

    @Transactional(readOnly = true)
    public List<Payment> getPaymentsForOrder(String orderId) {
        return paymentRepository.findByOrderIdOrderByCreatedAtDesc(orderId);
    }

    public String calculateHmacSha256(String data) {
        String secret = appProperties != null ? appProperties.paymentSecret() : "";
        return calculateHmacSha256WithSecret(data, secret);
    }

    public String calculateHmacSha256WithSecret(String data, String secret) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("HMAC signing secret is missing or blank.");
        }
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] hmacBytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hmacBytes);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("Failed to calculate HMAC signature", e);
        }
    }

    private void recordToSpreadsheet(Order order, Payment payment) {
        try {
            java.util.Map<String, Object> sheetMap = new java.util.HashMap<>();
            sheetMap.put("orderId", order.getOrderId());
            sheetMap.put("paymentId", payment != null ? payment.getPaymentId() : "COD");
            sheetMap.put("customerName", order.getCustomerName());
            sheetMap.put("phone", order.getCustomerPhone());
            sheetMap.put("email", order.getCustomerEmail());
            sheetMap.put("address", order.getShippingAddress());
            sheetMap.put("city", order.getCity());
            sheetMap.put("state", order.getState());
            sheetMap.put("pincode", order.getPincode());
            sheetMap.put("instructions", order.getLandmark() != null ? order.getLandmark() : "");
            sheetMap.put("items", order.getItems() != null ? order.getItems().size() + " items" : "Botanicals");
            sheetMap.put("total", order.getNetTotal());
            sheetMap.put("paymentMethod", payment != null ? payment.getPaymentMethod() : "COD");
            sheetMap.put("paymentStatus", payment != null ? payment.getStatus() : "Pending (COD)");
            spreadsheetService.recordDeliveryOrder(sheetMap);
        } catch (Exception ex) {
            log.warn("Could not record order {} to delivery spreadsheet: {}", order.getOrderId(), ex.getMessage());
        }
    }

    private PaymentVerificationResponse buildCompletedResponse(Payment payment, String message) {
        return PaymentVerificationResponse.builder()
                .success(true)
                .paymentId(payment.getPaymentId())
                .orderId(payment.getOrderId())
                .status("COMPLETED")
                .txnId(payment.getGatewayPaymentId() != null ? payment.getGatewayPaymentId() : payment.getPaymentId())
                .receiptNumber("RCPT-" + payment.getPaymentId().replace("PAY-", ""))
                .amount(payment.getAmount())
                .currency(payment.getCurrency())
                .paymentMethod(payment.getPaymentMethod())
                .message(message)
                .verifiedAt(payment.getVerifiedAt())
                .build();
    }

    private String resolveGateway(String method) {
        if ("COD".equalsIgnoreCase(method)) return "COD_GUARD";
        if ("UPI".equalsIgnoreCase(method)) return "UPI_INTENT";
        return "GATEWAY_INTENT";
    }

    private PaymentIntentResponse toIntentResponse(Payment p) {
        String secret = appProperties != null ? appProperties.paymentSecret() : "";
        String checksum = (!secret.isBlank())
                ? calculateHmacSha256(p.getOrderId() + ":" + p.getPaymentId() + ":" + p.getAmount())
                : "";

        return PaymentIntentResponse.builder()
                .paymentId(p.getPaymentId())
                .orderId(p.getOrderId())
                .amount(p.getAmount())
                .currency(p.getCurrency())
                .paymentMethod(p.getPaymentMethod())
                .paymentGateway(p.getPaymentGateway())
                .gatewayOrderId(p.getGatewayOrderId())
                .status(p.getStatus())
                .expiresAt(p.getExpiresAt())
                .merchantName(MERCHANT_NAME)
                .merchantVpa(appProperties != null ? appProperties.merchantVpa() : "pay@sangofiora")
                .clientChecksum(checksum)
                .build();
    }
}
