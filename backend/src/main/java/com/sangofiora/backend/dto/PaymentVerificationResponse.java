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
public class PaymentVerificationResponse {
    private boolean success;
    private String paymentId;
    private String orderId;
    private String status;
    private String txnId;
    private String receiptNumber;
    private Integer amount;
    private String currency;
    private String paymentMethod;
    private String message;
    private OffsetDateTime verifiedAt;
}
