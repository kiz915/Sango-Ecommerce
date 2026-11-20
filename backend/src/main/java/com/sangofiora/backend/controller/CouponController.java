package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.CouponValidationRequest;
import com.sangofiora.backend.dto.CouponValidationResponse;
import com.sangofiora.backend.service.CouponService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/coupons")
@RequiredArgsConstructor
public class CouponController {

    private final CouponService couponService;

    @PostMapping("/validate")
    public ResponseEntity<CouponValidationResponse> validateCoupon(
            @Valid @RequestBody CouponValidationRequest request
    ) {
        CouponValidationResponse response = couponService.validateCoupon(request.getCode(), request.getSubtotal(), request.getEmail());
        return ResponseEntity.ok(response);
    }
}
