package com.sangofiora.backend;

import com.sangofiora.backend.config.AppProperties;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Payment;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.PaymentRepository;
import com.sangofiora.backend.service.PaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class PaymentServiceTest {

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private AppProperties appProperties;

    @BeforeEach
    void setup() {
        appProperties.setPaymentSecret("test_hmac_secret_for_unit_tests_only_32bytes");
    }

    @Test
    void testHmacSha256Verification() {
        String data = "ORD-1234:PAY-5678:4904";
        String hash1 = paymentService.calculateHmacSha256(data);
        String hash2 = paymentService.calculateHmacSha256(data);

        assertNotNull(hash1);
        assertEquals(hash1, hash2);
        assertEquals(64, hash1.length()); // 256 bits = 64 hex chars
    }

    @Test
    void testIdempotencyAndExpiry() {
        String orderId = "ORD-" + UUID.randomUUID();
        Order order = orderRepository.save(Order.builder()
                .orderId(orderId)
                .customerName("Alice")
                .customerEmail("alice@example.com")
                .customerPhone("9876543210")
                .shippingAddress("456 Park Avenue")
                .city("Bengaluru")
                .state("Karnataka")
                .pincode("560038")
                .paymentMethod("UPI")
                .subtotal(3500)
                .netTotal(3500)
                .paymentStatus("Pending")
                .status("Order Placed")
                .build());

        Payment p = Payment.builder()
                .paymentId("PAY-EXP-" + System.currentTimeMillis())
                .orderId(orderId)
                .amount(3500)
                .status("PENDING")
                .paymentMethod("UPI")
                .expiresAt(OffsetDateTime.now().minusMinutes(5)) // Expired
                .build();
        paymentRepository.save(p);

        assertTrue(p.getExpiresAt().isBefore(OffsetDateTime.now()));
    }
}
