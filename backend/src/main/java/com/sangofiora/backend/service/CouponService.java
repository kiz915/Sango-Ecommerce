package com.sangofiora.backend.service;

import com.sangofiora.backend.dto.CouponValidationResponse;
import com.sangofiora.backend.model.Coupon;
import com.sangofiora.backend.repository.CouponRepository;
import com.sangofiora.backend.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CouponService {

    private final CouponRepository couponRepository;
    private final OrderRepository orderRepository;

    @Transactional(readOnly = true)
    public CouponValidationResponse validateCoupon(String code, Integer subtotal) {
        return validateCoupon(code, subtotal, null);
    }

    @Transactional(readOnly = true)
    public CouponValidationResponse validateCoupon(String code, Integer subtotal, String email) {
        if (code == null || code.trim().isEmpty()) {
            return CouponValidationResponse.builder()
                    .valid(false)
                    .message("Coupon code cannot be empty")
                    .build();
        }

        String normalizedCode = code.trim();
        Optional<Coupon> opt = couponRepository.findByCodeIgnoreCaseAndIsActiveTrue(normalizedCode);
        if (opt.isEmpty()) {
            return CouponValidationResponse.builder()
                    .valid(false)
                    .code(normalizedCode)
                    .message("Invalid coupon code")
                    .build();
        }

        Coupon coupon = opt.get();

        // First-Time Buyer Promo Code Rule: WELCOME10
        if ("WELCOME10".equalsIgnoreCase(coupon.getCode())) {
            if (email != null && !email.trim().isEmpty()) {
                long orderCount = orderRepository.countByCustomerEmailIgnoreCase(email.trim());
                if (orderCount > 0) {
                    return CouponValidationResponse.builder()
                            .valid(false)
                            .code(coupon.getCode())
                            .message("This discount is exclusive to first-time botanical buyers.")
                            .build();
                }
            }
        }

        // Check expiration
        if (coupon.getExpiresAt() != null && coupon.getExpiresAt().isBefore(OffsetDateTime.now())) {
            return CouponValidationResponse.builder()
                    .valid(false)
                    .code(coupon.getCode())
                    .message("Coupon has expired")
                    .build();
        }

        // Check usage limit
        if (coupon.getUsageLimit() != null && coupon.getTimesUsed() != null && coupon.getTimesUsed() >= coupon.getUsageLimit()) {
            return CouponValidationResponse.builder()
                    .valid(false)
                    .code(coupon.getCode())
                    .message("Coupon usage limit has been reached")
                    .build();
        }

        // Check minimum subtotal
        int minSub = coupon.getMinSubtotal() != null ? coupon.getMinSubtotal() : 0;
        int currentSub = subtotal != null ? subtotal : 0;
        if (currentSub < minSub) {
            return CouponValidationResponse.builder()
                    .valid(false)
                    .code(coupon.getCode())
                    .message("Minimum order subtotal of ₹" + minSub + " required to use this coupon")
                    .build();
        }

        // Calculate discount amount
        int discountAmount = (currentSub * coupon.getPercent()) / 100;

        return CouponValidationResponse.builder()
                .valid(true)
                .code(coupon.getCode())
                .percent(coupon.getPercent())
                .label(coupon.getLabel())
                .discountAmount(discountAmount)
                .message("Coupon applied successfully!")
                .build();
    }
}
