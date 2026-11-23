package com.sangofiora.backend.security;

import com.sangofiora.backend.config.AppProperties;
import com.sangofiora.backend.controller.OrderController;
import com.sangofiora.backend.dto.CreateOrderRequest;
import com.sangofiora.backend.dto.OrderItemRequest;
import com.sangofiora.backend.dto.VerifyPaymentRequest;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Payment;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.PaymentRepository;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.service.OrderService;
import com.sangofiora.backend.service.PaymentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class SecurityHardeningTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderController orderController;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private AppProperties appProperties;

    @Autowired
    private SupabaseJwtValidator jwtValidator;

    private static final String TEST_SECRET = "0123456789abcdef0123456789abcdef"; // 32-byte secret

    @BeforeEach
    void setUp() {
        appProperties.setPaymentSecret(TEST_SECRET);
        appProperties.getJwt().setSecret(TEST_SECRET);
        appProperties.setAdminEmails(List.of("admin@sangofiora.com"));
    }

    @Test
    @DisplayName("P0-1: Unsigned or forged admin token must be rejected by JWT validator")
    void testForgedTokenRejected() {
        // Plain forged text
        assertNull(jwtValidator.validateToken("admin:superadmin_token"));
        // Random fake JWT structure
        assertNull(jwtValidator.validateToken("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.tampered_signature"));
    }

    @Test
    @DisplayName("P0-3: IDOR protection - Non-owner user cannot access another user's order details")
    void testIdorOrderAccessDeniedForNonOwner() {
        UUID ownerId = UUID.randomUUID();
        UUID attackerId = UUID.randomUUID();

        // Create an order owned by User A
        Order order = orderRepository.save(Order.builder()
                .orderId("ORD-IDOR-" + UUID.randomUUID())
                .userId(ownerId)
                .customerName("Alpha User")
                .customerEmail("alpha@example.com")
                .customerPhone("9998887770")
                .shippingAddress("123 Alpha St")
                .city("Bengaluru")
                .state("Karnataka")
                .pincode("560001")
                .paymentMethod("UPI")
                .subtotal(5000)
                .netTotal(5000)
                .paymentStatus("Pending")
                .status("Order Placed")
                .build());

        // Authenticated as User B (attacker)
        UserPrincipal attackerPrincipal = UserPrincipal.builder()
                .id(attackerId)
                .email("attacker@example.com")
                .role("USER")
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_USER")))
                .build();

        // Accessing User A's order as User B returns 403 FORBIDDEN
        ResponseEntity<?> response = orderController.getOrderByOrderId(order.getOrderId(), attackerPrincipal);
        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    @DisplayName("P0-3: Admin can access any order; public tracking route sanitizes PII")
    void testAdminOrderAccessAndSanitizedPublicTracking() {
        UUID customerId = UUID.randomUUID();

        Order order = orderRepository.save(Order.builder()
                .orderId("ORD-PUB-" + UUID.randomUUID())
                .userId(customerId)
                .customerName("Sensitive Customer")
                .customerEmail("sensitive@customer.com")
                .customerPhone("9876543210")
                .shippingAddress("Secret Villa, Beverly Hills")
                .city("Mumbai")
                .state("Maharashtra")
                .pincode("400001")
                .paymentMethod("COD")
                .subtotal(4000)
                .netTotal(4000)
                .paymentStatus("Pending")
                .status("Shipped")
                .build());

        // Admin access succeeds
        UserPrincipal adminPrincipal = UserPrincipal.builder()
                .id(UUID.randomUUID())
                .email("admin@sangofiora.com")
                .role("ADMIN")
                .authorities(List.of(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .build();

        ResponseEntity<?> adminResponse = orderController.getOrderByOrderId(order.getOrderId(), adminPrincipal);
        assertEquals(HttpStatus.OK, adminResponse.getStatusCode());
        assertNotNull(adminResponse.getBody());
        Order retrieved = (Order) adminResponse.getBody();
        assertEquals("Sensitive Customer", retrieved.getCustomerName());

        // Public tracking endpoint only returns sanitized fields (no address, no phone, no email)
        ResponseEntity<?> trackingResponse = orderController.getPublicOrderTracking(order.getOrderId());
        assertEquals(HttpStatus.OK, trackingResponse.getStatusCode());
        Map<?, ?> trackingData = (Map<?, ?>) trackingResponse.getBody();
        assertNotNull(trackingData);
        assertEquals("Shipped", trackingData.get("status"));
        assertNull(trackingData.get("shippingAddress"));
        assertNull(trackingData.get("customerPhone"));
        assertNull(trackingData.get("customerEmail"));
    }

    @Test
    @DisplayName("P0-4: Payment verification rejects tampered or spoofed signatures")
    void testPaymentSpoofingRejected() {
        String orderId = "ORD-SPOOF-" + UUID.randomUUID();
        String paymentId = "PAY-SPOOF-" + UUID.randomUUID();

        orderRepository.save(Order.builder()
                .orderId(orderId)
                .customerName("Bob")
                .customerEmail("bob@example.com")
                .customerPhone("9876543210")
                .shippingAddress("123 Street")
                .city("Chennai")
                .state("Tamil Nadu")
                .pincode("600001")
                .paymentMethod("UPI")
                .subtotal(2000)
                .netTotal(2000)
                .paymentStatus("Pending")
                .status("Order Placed")
                .build());

        paymentRepository.save(Payment.builder()
                .paymentId(paymentId)
                .orderId(orderId)
                .amount(2000)
                .status("PENDING")
                .paymentMethod("UPI")
                .expiresAt(OffsetDateTime.now().plusHours(1))
                .build());

        VerifyPaymentRequest spoofRequest = new VerifyPaymentRequest();
        spoofRequest.setOrderId(orderId);
        spoofRequest.setPaymentId(paymentId);
        spoofRequest.setGatewayPaymentId("pay_1234567890");
        spoofRequest.setGatewaySignature("bad_signature_attempting_bypass_12345");

        SecurityException ex = assertThrows(SecurityException.class, () -> {
            paymentService.verifyPayment(spoofRequest);
        });
        assertTrue(ex.getMessage().contains("Invalid HMAC signature"));
    }

    @Test
    @DisplayName("P0-4: Webhook rejects replayed payloads (timestamp > 300s old)")
    void testWebhookReplayProtection() {
        String payload = "{\"event\":\"payment.success\",\"orderId\":\"ORD-123\"}";
        // Expired timestamp: 10 minutes ago
        String expiredTimestamp = String.valueOf(Instant.now().getEpochSecond() - 600);
        String signature = paymentService.calculateHmacSha256(expiredTimestamp + "." + payload);

        SecurityException ex = assertThrows(SecurityException.class, () -> {
            paymentService.processWebhook(payload, signature, expiredTimestamp);
        });
        assertTrue(ex.getMessage().contains("tolerance"));
    }

    @Test
    @DisplayName("P0-7: Catalog price canonicalization - server ignores manipulated client prices")
    void testServerEnforcesCanonicalDatabasePrices() {
        Product p = productRepository.findAll().stream().findFirst()
                .orElseGet(() -> productRepository.save(Product.builder()
                        .name("Fiddle Leaf Fig")
                        .slug("fiddle-leaf-fig-canonical")
                        .price(4904)
                        .stock(50)
                        .category("Trees")
                        .build()));

        int canonicalPrice = p.getPrice();
        assertTrue(canonicalPrice > 0);

        CreateOrderRequest request = new CreateOrderRequest();
        request.setCustomerName("Tamper Tester");
        request.setCustomerEmail("tamper@test.com");
        request.setCustomerPhone("9123456780");
        request.setShippingAddress("Test Street");
        request.setCity("Bengaluru");
        request.setState("Karnataka");
        request.setPincode("560001");
        request.setPaymentMethod("COD");

        // Malicious client claims price is 1 rupee
        OrderItemRequest tamperedItem = new OrderItemRequest();
        tamperedItem.setProductId(p.getId());
        tamperedItem.setQty(2);
        tamperedItem.setPrice(1); // Manipulated price!
        tamperedItem.setProductName(p.getName());
        request.setItems(List.of(tamperedItem));

        Order created = orderService.createOrder(request);

        // Server MUST charge canonical price * quantity
        assertEquals(canonicalPrice * 2, created.getSubtotal(),
                "Server must compute subtotal using canonical DB price, ignoring client tamper");
    }

    @Test
    @DisplayName("P0-7: Reject order if any product does not exist in canonical database")
    void testRejectUnknownProductInOrder() {
        CreateOrderRequest request = new CreateOrderRequest();
        request.setCustomerName("Fake Item Buyer");
        request.setCustomerEmail("buyer@test.com");
        request.setCustomerPhone("9123456780");
        request.setShippingAddress("Test Street");
        request.setCity("Bengaluru");
        request.setState("Karnataka");
        request.setPincode("560001");
        request.setPaymentMethod("COD");

        OrderItemRequest ghostItem = new OrderItemRequest();
        ghostItem.setProductId(UUID.randomUUID());
        ghostItem.setQty(1);
        ghostItem.setPrice(500);
        ghostItem.setProductName("Non-existent Ghost Plant");
        request.setItems(List.of(ghostItem));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> {
            orderService.createOrder(request);
        });
        assertTrue(ex.getMessage().contains("Unknown or invalid product"));
    }

    @Test
    @DisplayName("P0-7 & P1-9: Idempotency key prevents duplicate orders and double decrement")
    void testOrderCreationIdempotency() {
        Product p = productRepository.findAll().stream().findFirst().orElseThrow();
        int initialStock = p.getStock();

        String idempotencyKey = "IDEMP-" + UUID.randomUUID();

        CreateOrderRequest request = new CreateOrderRequest();
        request.setIdempotencyKey(idempotencyKey);
        request.setCustomerName("Idempotent Customer");
        request.setCustomerEmail("idem@customer.com");
        request.setCustomerPhone("9876543210");
        request.setShippingAddress("Idempotent Way");
        request.setCity("Pune");
        request.setState("Maharashtra");
        request.setPincode("411001");
        request.setPaymentMethod("COD");

        OrderItemRequest item = new OrderItemRequest();
        item.setProductId(p.getId());
        item.setQty(1);
        item.setPrice(p.getPrice());
        item.setProductName(p.getName());
        request.setItems(List.of(item));

        // First call
        Order order1 = orderService.createOrder(request);
        assertNotNull(order1);

        // Second call with identical idempotencyKey
        Order order2 = orderService.createOrder(request);
        assertNotNull(order2);

        // Must return the exact same order instance ID without decrementing stock twice
        assertEquals(order1.getOrderId(), order2.getOrderId());

        Product reloaded = productRepository.findById(p.getId()).orElseThrow();
        assertEquals(initialStock - 1, reloaded.getStock(), "Stock must only be decremented once");
    }
}
