package com.sangofiora.backend;

import com.sangofiora.backend.dto.CouponValidationResponse;
import com.sangofiora.backend.model.Coupon;
import com.sangofiora.backend.repository.CouponRepository;
import com.sangofiora.backend.service.CouponService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class CouponServiceTest {

    @Autowired
    private CouponService couponService;

    @Autowired
    private CouponRepository couponRepository;

    @Test
    void testWelcome10Validation() {
        CouponValidationResponse res = couponService.validateCoupon("WELCOME10", 2500, null);
        assertNotNull(res);
        assertTrue(res.isValid());
        assertEquals(10, res.getPercent());
    }

    @Test
    void testInvalidCouponValidation() {
        CouponValidationResponse res = couponService.validateCoupon("NONEXISTENT99", 2500, null);
        assertNotNull(res);
        assertFalse(res.isValid());
    }
}
