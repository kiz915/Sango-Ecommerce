package com.sangofiora.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "payment_id", nullable = false, unique = true)
    private String paymentId;

    @Column(name = "order_id", nullable = false)
    private String orderId;

    @Column(nullable = false)
    private Integer amount;

    @Column(nullable = false)
    @Builder.Default
    private String currency = "INR";

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod; // UPI, CARD, NETBANKING, COD

    @Column(name = "payment_gateway")
    @Builder.Default
    private String paymentGateway = "RAZORPAY_SIMULATED";

    @Column(name = "gateway_order_id")
    private String gatewayOrderId;

    @Column(name = "gateway_payment_id")
    private String gatewayPaymentId;

    @Column(name = "gateway_signature", columnDefinition = "TEXT")
    private String gatewaySignature;

    @Column(nullable = false)
    @Builder.Default
    private String status = "PENDING"; // PENDING, COMPLETED, FAILED, CANCELLED, REFUNDED

    @Column(name = "vpa")
    private String vpa;

    @Column(name = "card_last4")
    private String cardLast4;

    @Column(name = "card_network")
    private String cardNetwork;

    @Column(name = "bank_name")
    private String bankName;

    @Column(name = "error_code")
    private String errorCode;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "idempotency_key", unique = true)
    private String idempotencyKey;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
