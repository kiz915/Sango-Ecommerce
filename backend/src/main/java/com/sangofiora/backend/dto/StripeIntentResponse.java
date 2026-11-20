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
public class StripeIntentResponse {
    private String paymentId;
    private String orderId;
    private String clientSecret;
    private String stripePaymentIntentId;
    private String publishableKey;
    private Integer amount;
    private String currency;
    private String status;
    private OffsetDateTime expiresAt;
    private String receiptEmail;
}
