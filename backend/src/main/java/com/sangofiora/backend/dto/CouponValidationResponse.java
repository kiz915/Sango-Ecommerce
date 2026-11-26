package com.sangofiora.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CouponValidationResponse {

    private boolean valid;
    private String code;
    private Integer percent;
    private String label;
    private Integer discountAmount;
    private Integer minSubtotal;
    private Boolean firstTimeOnly;
    private String message;
}
