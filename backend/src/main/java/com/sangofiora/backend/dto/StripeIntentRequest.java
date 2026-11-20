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
public class StripeIntentRequest {

    @NotBlank(message = "Order ID is required")
    private String orderId;

    private String currency; // "INR", "USD", etc.
    private String customerEmail;
    private String customerName;
}
