package com.sangofiora.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
public class CreateOrderRequest {

    private UUID userId;

    @NotBlank(message = "Customer name is required")
    private String customerName;

    @NotBlank(message = "Customer phone number is required")
    private String customerPhone;

    private String customerEmail;

    @NotBlank(message = "Shipping address is required")
    private String shippingAddress;

    private String landmark;

    @NotBlank(message = "Pincode is required")
    private String pincode;

    private String city;
    private String state;
    private String gstin;

    @NotBlank(message = "Payment method is required (e.g., COD, UPI, CARD)")
    private String paymentMethod;

    private String couponCode;

    @NotEmpty(message = "Order must contain at least one item")
    @Valid
    private List<OrderItemRequest> items;
}
