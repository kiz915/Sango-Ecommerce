package com.sangofiora.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentIntentResponse {
    private String paymentId;
    private String orderId;
    private Integer amount;
    private String currency;
    private String paymentMethod;
    private String paymentGateway;
    private String gatewayOrderId;
    private String status;
    private OffsetDateTime expiresAt;
    private String merchantName;
    private String merchantVpa;
    private String clientChecksum; // HMAC token given to client
}
