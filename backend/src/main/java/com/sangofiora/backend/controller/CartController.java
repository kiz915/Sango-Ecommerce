package com.sangofiora.backend.controller;

import com.sangofiora.backend.dto.CouponValidationResponse;
import com.sangofiora.backend.dto.OrderItemRequest;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.model.UserCart;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.repository.UserCartRepository;
import com.sangofiora.backend.security.UserPrincipal;
import com.sangofiora.backend.service.CouponService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/cart")
@RequiredArgsConstructor
@Slf4j
public class CartController {

    private final ProductRepository productRepository;
    private final CouponService couponService;
    private final UserCartRepository userCartRepository;

    @Data
    public static class CartValidationRequest {
        private List<OrderItemRequest> items;
        private String couponCode;
        private String email;
    }

    @Data
    public static class CartSyncRequest {
        private String email;
        private String itemsJson;
        private Integer itemCount;
        private Integer subtotal;
        private String couponCode;
    }

    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validateCart(@RequestBody CartValidationRequest request) {
        int subtotal = 0;
        int mrpTotal = 0;
        int totalQty = 0;
        List<Map<String, Object>> verifiedItems = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        if (request.getItems() != null) {
            for (OrderItemRequest it : request.getItems()) {
                int unitPrice = it.getPrice();
                int unitMrp = it.getMrp() != null ? it.getMrp() : unitPrice;
                boolean inStock = true;

                Optional<Product> p = Optional.empty();
                if (it.getProductId() != null) {
                    p = productRepository.findById(it.getProductId());
                } else if (it.getProductSlug() != null && !it.getProductSlug().trim().isEmpty()) {
                    p = productRepository.findBySlug(it.getProductSlug().trim());
                }
                if (p.isPresent()) {
                    Product prod = p.get();
                    unitPrice = prod.getPrice();
                    unitMrp = prod.getMrp() != null ? prod.getMrp() : unitPrice;
                    if (Boolean.TRUE.equals(prod.getIsSoldOut()) || (prod.getStock() != null && prod.getStock() < it.getQty())) {
                        inStock = false;
                        warnings.add("'" + prod.getName() + "' has insufficient stock.");
                    }
                }

                subtotal += (unitPrice * it.getQty());
                mrpTotal += (unitMrp * it.getQty());
                totalQty += it.getQty();

                verifiedItems.add(Map.of(
                        "name", it.getProductName(),
                        "price", unitPrice,
                        "mrp", unitMrp,
                        "qty", it.getQty(),
                        "inStock", inStock
                ));
            }
        }

        // Dynamic MRP Savings calculation (MRP list price vs actual Selling price)
        int mrpSavings = Math.max(0, mrpTotal - subtotal);

        // Apply Coupon Validation (includes First-Time Buyer check)
        int couponDiscount = 0;
        String couponMessage = null;
        if (request.getCouponCode() != null && !request.getCouponCode().trim().isEmpty()) {
            CouponValidationResponse couponRes = couponService.validateCoupon(request.getCouponCode(), subtotal, request.getEmail());
            if (couponRes.isValid()) {
                couponDiscount = couponRes.getDiscountAmount();
                couponMessage = couponRes.getMessage();
            } else {
                couponMessage = couponRes.getMessage();
            }
        }

        int deliveryFee = (subtotal >= 999 || verifiedItems.isEmpty()) ? 0 : 99;
        int netTotal = Math.max(0, subtotal - couponDiscount + deliveryFee);
        int gstAmount = (int) Math.round((netTotal * 0.18) / 1.18);

        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("valid", warnings.isEmpty());
        response.put("warnings", warnings);
        response.put("subtotal", subtotal);
        response.put("mrpTotal", mrpTotal);
        response.put("mrpSavings", mrpSavings);
        response.put("totalQty", totalQty);
        response.put("volumeDiscountPercent", 0);
        response.put("volumeDiscount", 0);
        response.put("volumeMessage", "");
        response.put("couponDiscount", couponDiscount);
        response.put("couponMessage", couponMessage != null ? couponMessage : "");
        response.put("deliveryFee", deliveryFee);
        response.put("gstAmount", gstAmount);
        response.put("netTotal", netTotal);
        response.put("verifiedItems", verifiedItems);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/sync")
    public ResponseEntity<?> syncCart(
            @RequestBody CartSyncRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        String email = (principal != null && principal.getEmail() != null)
                ? principal.getEmail().trim()
                : (request.getEmail() != null ? request.getEmail().trim() : null);

        if (email == null || email.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required to sync cart"));
        }

        UserCart cart = userCartRepository.findByUserEmailIgnoreCase(email)
                .orElseGet(() -> UserCart.builder().userEmail(email).build());

        cart.setItemsJson(request.getItemsJson());
        cart.setItemCount(request.getItemCount() != null ? request.getItemCount() : 0);
        cart.setSubtotal(request.getSubtotal() != null ? request.getSubtotal() : 0);
        if (request.getCouponCode() != null) {
            cart.setCouponCode(request.getCouponCode().trim());
        }
        cart.setIsRecovered(false);

        UserCart saved = userCartRepository.save(cart);
        return ResponseEntity.ok(Map.of("success", true, "cartId", saved.getId()));
    }

    @GetMapping("/sync")
    public ResponseEntity<?> getSyncedCart(
            @RequestParam(required = false) String email,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        String targetEmail = (principal != null && principal.getEmail() != null)
                ? principal.getEmail().trim()
                : (email != null ? email.trim() : null);

        if (targetEmail == null || targetEmail.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        Optional<UserCart> cartOpt = userCartRepository.findByUserEmailIgnoreCase(targetEmail);
        if (cartOpt.isPresent()) {
            return ResponseEntity.ok(cartOpt.get());
        }
        return ResponseEntity.ok(Map.of("exists", false));
    }

    @DeleteMapping("/sync")
    public ResponseEntity<?> clearSyncedCart(
            @RequestParam(required = false) String email,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        String targetEmail = (principal != null && principal.getEmail() != null)
                ? principal.getEmail().trim()
                : (email != null ? email.trim() : null);

        if (targetEmail == null || targetEmail.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        userCartRepository.findByUserEmailIgnoreCase(targetEmail).ifPresent(userCartRepository::delete);
        return ResponseEntity.ok(Map.of("success", true, "message", "Cart cleared"));
    }

    @PostMapping("/trigger-recovery")
    public ResponseEntity<?> triggerAbandonedCartRecovery(@RequestParam(defaultValue = "2") int hours) {
        OffsetDateTime cutoff = OffsetDateTime.now().minusHours(hours);
        List<UserCart> abandonedCarts = userCartRepository.findByUpdatedAtBeforeAndIsRecoveredFalse(cutoff);
        int recoveredCount = 0;

        for (UserCart cart : abandonedCarts) {
            if (cart.getItemCount() != null && cart.getItemCount() > 0) {
                log.info("[ABANDONED CART RECOVERY] Automated gentle reminder email dispatched to {} | Items: {} | Value: ₹{} | Subject: '🌿 Your Sango Fiora botanical picks are safely reserved for you'",
                        cart.getUserEmail(), cart.getItemCount(), cart.getSubtotal());
                cart.setIsRecovered(true);
                userCartRepository.save(cart);
                recoveredCount++;
            }
        }

        return ResponseEntity.ok(Map.of(
                "dispatchedCount", recoveredCount,
                "message", "Dispatched " + recoveredCount + " abandoned cart recovery notification(s)."
        ));
    }
}
