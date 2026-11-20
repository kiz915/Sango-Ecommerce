package com.sangofiora.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CouponValidationRequest {

    @NotBlank(message = "Coupon code is required")
    private String code;

    @NotNull(message = "Cart subtotal is required")
    @Min(value = 0, message = "Subtotal cannot be negative")
    private Integer subtotal;

    private String email;
}
