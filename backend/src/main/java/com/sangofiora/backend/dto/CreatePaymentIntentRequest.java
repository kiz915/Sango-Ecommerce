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
public class CreatePaymentIntentRequest {

    @NotBlank(message = "Order ID is required")
    private String orderId;

    @NotBlank(message = "Payment method is required")
    private String paymentMethod; // UPI, CARD, NETBANKING, COD

    private String idempotencyKey;
    private String vpa;
    private String cardNetwork;
    private String bankName;
}
