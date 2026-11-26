package com.sangofiora.backend;

import com.sangofiora.backend.controller.CartController;
import com.sangofiora.backend.dto.OrderItemRequest;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.model.UserCart;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.repository.UserCartRepository;
import com.sangofiora.backend.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("default")
@Transactional
public class CartControllerTest {

    @Autowired
    private CartController cartController;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private UserCartRepository userCartRepository;

    private Product testProduct;

    @BeforeEach
    void setUp() {
        userCartRepository.deleteAll();

        testProduct = productRepository.findBySlug("fiddle-leaf-fig-80cm")
                .orElseGet(() -> productRepository.save(Product.builder()
                        .name("Fiddle Leaf Fig")
                        .slug("fiddle-leaf-fig-80cm")
                        .price(7340)
                        .mrp(9450)
                        .stock(15)
                        .isSoldOut(false)
                        .category("Trees")
                        .build()));
    }

    @Test
    @DisplayName("Guest cart validation computes canonical prices, MRP savings, and free delivery")
    void testValidateCartSuccess() {
        CartController.CartValidationRequest req = new CartController.CartValidationRequest();
        OrderItemRequest item = new OrderItemRequest();
        item.setProductSlug(testProduct.getSlug());
        item.setProductName(testProduct.getName());
        item.setPrice(testProduct.getPrice());
        item.setMrp(testProduct.getMrp());
        item.setQty(1);

        req.setItems(List.of(item));

        ResponseEntity<Map<String, Object>> response = cartController.validateCart(req);
        assertEquals(200, response.getStatusCode().value());

        Map<String, Object> body = response.getBody();
        assertNotNull(body);
        assertEquals(true, body.get("valid"));
        int expectedSubtotal = testProduct.getPrice();
        int expectedMrp = testProduct.getMrp() != null ? testProduct.getMrp() : expectedSubtotal;
        int expectedSavings = Math.max(0, expectedMrp - expectedSubtotal);
        int expectedDelivery = expectedSubtotal >= 999 ? 0 : 99;

        assertEquals(expectedSubtotal, body.get("subtotal"));
        assertEquals(expectedMrp, body.get("mrpTotal"));
        assertEquals(expectedSavings, body.get("mrpSavings"));
        assertEquals(expectedDelivery, body.get("deliveryFee"));
        assertEquals(expectedSubtotal + expectedDelivery, body.get("netTotal"));
    }

    @Test
    @DisplayName("Sync cart persists user items, coupon code, and supports retrieval and clearing")
    void testSyncCartLifecycle() {
        String testEmail = "testuser@example.com";
        UserPrincipal principal = UserPrincipal.builder()
                .email(testEmail)
                .role("customer")
                .build();

        CartController.CartSyncRequest syncReq = new CartController.CartSyncRequest();
        syncReq.setEmail(testEmail);
        syncReq.setItemsJson("[{\"slug\":\"fiddle-leaf-fig-80cm\",\"qty\":2,\"price\":7340}]");
        syncReq.setItemCount(2);
        syncReq.setSubtotal(14680);
        syncReq.setCouponCode("WELCOME10");

        // 1. Sync cart
        ResponseEntity<?> syncRes = cartController.syncCart(syncReq, principal);
        assertEquals(200, syncRes.getStatusCode().value());

        // 2. Retrieve synced cart
        ResponseEntity<?> getRes = cartController.getSyncedCart(testEmail, principal);
        assertEquals(200, getRes.getStatusCode().value());
        assertTrue(getRes.getBody() instanceof UserCart);
        UserCart retrieved = (UserCart) getRes.getBody();
        assertEquals(testEmail, retrieved.getUserEmail());
        assertEquals("WELCOME10", retrieved.getCouponCode());
        assertEquals(2, retrieved.getItemCount());
        assertEquals(14680, retrieved.getSubtotal());

        // 3. Invalid coupon passed to syncCart must be stripped cleanly to null
        CartController.CartSyncRequest invalidCouponReq = new CartController.CartSyncRequest();
        invalidCouponReq.setEmail(testEmail);
        invalidCouponReq.setItemsJson("[{\"slug\":\"fiddle-leaf-fig-80cm\",\"qty\":1,\"price\":3124}]");
        invalidCouponReq.setItemCount(1);
        invalidCouponReq.setSubtotal(3124);
        invalidCouponReq.setCouponCode("RONALDO");

        cartController.syncCart(invalidCouponReq, principal);
        UserCart afterInvalid = (UserCart) cartController.getSyncedCart(testEmail, principal).getBody();
        assertNotNull(afterInvalid);
        assertNull(afterInvalid.getCouponCode(), "Non-existent coupon must be purged during cart sync");

        // 4. Clear synced cart
        ResponseEntity<?> clearRes = cartController.clearSyncedCart(testEmail, principal);
        assertEquals(200, clearRes.getStatusCode().value());

        // Verify cart is deleted
        Optional<UserCart> deleted = userCartRepository.findByUserEmailIgnoreCase(testEmail);
        assertTrue(deleted.isEmpty());
    }
}
