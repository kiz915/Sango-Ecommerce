package com.sangofiora.backend.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class OrderItemRequest {

    private UUID productId;

    @NotBlank(message = "Product name is required")
    private String productName;

    private String productSlug;
    private String productImage;
    private String productVariant;
    private String productCategory;
    private String size;

    @NotNull(message = "Price is required")
    @Min(value = 0, message = "Price cannot be negative")
    private Integer price;

    private Integer mrp;

    @NotNull(message = "Quantity is required")
    @Min(value = 1, message = "Quantity must be at least 1")
    private Integer qty;
}
