package com.sangofiora.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VerifyPaymentRequest {

    @NotBlank(message = "Payment ID is required")
    private String paymentId;

    @NotBlank(message = "Order ID is required")
    private String orderId;

    private String gatewayPaymentId;
    private String gatewaySignature;
    private String paymentMethod;
    private String vpa;
    private String cardLast4;
    private String cardNetwork;
    private String bankName;
    private String securityOtp;
}
