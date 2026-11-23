package com.sangofiora.backend.service;

import com.sangofiora.backend.dto.CouponValidationResponse;
import com.sangofiora.backend.dto.CreateOrderRequest;
import com.sangofiora.backend.dto.OrderItemRequest;
import com.sangofiora.backend.model.CustomerProfile;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.OrderItem;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.CustomerProfileRepository;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final CouponService couponService;
    private final CustomerProfileRepository customerProfileRepository;
    private final SpreadsheetService spreadsheetService;

    private static final int FREE_SHIPPING_THRESHOLD = 999;
    private static final int STANDARD_DELIVERY_FEE = 99;

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        int calculatedSubtotal = 0;
        int calculatedMrpTotal = 0;

        List<OrderItem> items = new ArrayList<>();

        for (OrderItemRequest itemReq : request.getItems()) {
            int unitPrice = itemReq.getPrice();
            int unitMrp = itemReq.getMrp() != null && itemReq.getMrp() > 0 ? itemReq.getMrp() : unitPrice;

            // Look up product by ID or by Slug in database
            Optional<Product> prodOpt = Optional.empty();
            if (itemReq.getProductId() != null) {
                prodOpt = productRepository.findById(itemReq.getProductId());
            } else if (itemReq.getProductSlug() != null && !itemReq.getProductSlug().trim().isEmpty()) {
                prodOpt = productRepository.findBySlug(itemReq.getProductSlug().trim());
            }

            if (prodOpt.isPresent()) {
                Product prod = prodOpt.get();
                if (Boolean.TRUE.equals(prod.getIsSoldOut())) {
                    throw new IllegalStateException("Product '" + prod.getName() + "' is sold out.");
                }
                if (prod.getStock() != null && prod.getStock() < itemReq.getQty()) {
                    throw new IllegalStateException("Insufficient stock for '" + prod.getName() + "'. Available: " + prod.getStock());
                }

                // Enforce canonical server-side price to prevent client tampering
                unitPrice = prod.getPrice();
                unitMrp = prod.getMrp() != null ? prod.getMrp() : unitPrice;

                // Deduct inventory
                prod.setStock(prod.getStock() - itemReq.getQty());
                if (prod.getStock() <= 0) {
                    prod.setIsSoldOut(true);
                }
                productRepository.save(prod);
                itemReq.setProductId(prod.getId());
            }

            calculatedSubtotal += (unitPrice * itemReq.getQty());
            calculatedMrpTotal += (unitMrp * itemReq.getQty());

            OrderItem item = OrderItem.builder()
                    .productId(itemReq.getProductId())
                    .productName(itemReq.getProductName())
                    .productSlug(itemReq.getProductSlug())
                    .productImage(itemReq.getProductImage())
                    .productVariant(itemReq.getProductVariant())
                    .productCategory(itemReq.getProductCategory())
                    .size(itemReq.getSize())
                    .price(unitPrice)
                    .mrp(unitMrp)
                    .qty(itemReq.getQty())
                    .build();

            items.add(item);
        }

        // Dynamic MRP Savings calculation
        int totalQty = items.stream().mapToInt(OrderItem::getQty).sum();
        int volumeDiscountPercent = 0;
        int volumeDiscount = 0;

        // Apply Coupon Validation Server-Side (incorporates First-Time Buyer check)
        int couponDiscount = 0;
        String appliedCouponCode = null;
        if (request.getCouponCode() != null && !request.getCouponCode().trim().isEmpty()) {
            CouponValidationResponse couponRes = couponService.validateCoupon(request.getCouponCode(), calculatedSubtotal, request.getCustomerEmail());
            if (couponRes.isValid()) {
                couponDiscount = couponRes.getDiscountAmount();
                appliedCouponCode = couponRes.getCode();
            }
        }

        // Delivery Fee
        int deliveryFee = (calculatedSubtotal >= FREE_SHIPPING_THRESHOLD) ? 0 : STANDARD_DELIVERY_FEE;

        // GST calculation (18% embedded)
        int netTotal = Math.max(0, calculatedSubtotal - couponDiscount + deliveryFee);
        int gstAmount = (int) Math.round((netTotal * 0.18) / 1.18);

        // Estimated delivery: 4 days from today
        LocalDate estDate = LocalDate.now().plusDays(4);
        String estDeliveryDate = estDate.format(DateTimeFormatter.ofPattern("EEE, d MMM yyyy"));

        String uniqueOrderId = generateUniqueOrderId();

        Order order = Order.builder()
                .orderId(uniqueOrderId)
                .userId(request.getUserId())
                .customerName(request.getCustomerName())
                .customerPhone(request.getCustomerPhone())
                .customerEmail(request.getCustomerEmail())
                .shippingAddress(request.getShippingAddress())
                .landmark(request.getLandmark())
                .pincode(request.getPincode())
                .city(request.getCity())
                .state(request.getState())
                .gstin(request.getGstin())
                .paymentMethod(request.getPaymentMethod())
                .paymentStatus("COD".equalsIgnoreCase(request.getPaymentMethod()) ? "Pending (COD)" : "Pending")
                .txnId("TXN-" + ThreadLocalRandom.current().nextInt(10000000, 99999999))
                .subtotal(calculatedSubtotal)
                .mrpTotal(calculatedMrpTotal)
                .mrpSavings(Math.max(0, calculatedMrpTotal - calculatedSubtotal))
                .couponCode(appliedCouponCode)
                .couponDiscount(couponDiscount)
                .volumeDiscount(volumeDiscount)
                .volumeDiscountPercent(volumeDiscountPercent)
                .deliveryFee(deliveryFee)
                .gstAmount(gstAmount)
                .netTotal(netTotal)
                .status("Order Placed")
                .statusStep(1)
                .estDeliveryDate(estDeliveryDate)
                .trackingNotes("Order received and queued for Quality Inspection.")
                .items(new ArrayList<>())
                .build();

        for (OrderItem item : items) {
            item.setOrder(order);
            order.getItems().add(item);
        }

        Order savedOrder = orderRepository.save(order);

        // Record in live delivery spreadsheet for Admin Studio
        try {
            if (spreadsheetService != null) {
                Map<String, Object> deliv = new HashMap<>();
                deliv.put("orderId", savedOrder.getOrderId());
                deliv.put("paymentId", savedOrder.getTxnId() != null ? savedOrder.getTxnId() : "");
                deliv.put("customerName", savedOrder.getCustomerName());
                deliv.put("phone", savedOrder.getCustomerPhone());
                deliv.put("email", savedOrder.getCustomerEmail() != null ? savedOrder.getCustomerEmail() : "");
                deliv.put("address", savedOrder.getShippingAddress());
                deliv.put("city", savedOrder.getCity() != null ? savedOrder.getCity() : "");
                deliv.put("state", savedOrder.getState() != null ? savedOrder.getState() : "");
                deliv.put("pincode", savedOrder.getPincode());
                deliv.put("instructions", savedOrder.getLandmark() != null ? savedOrder.getLandmark() : "");
                deliv.put("items", items.stream().map(i -> i.getProductName() + " (x" + i.getQty() + ")").reduce((a, b) -> a + "; " + b).orElse(""));
                deliv.put("total", String.valueOf(savedOrder.getNetTotal()));
                deliv.put("paymentMethod", savedOrder.getPaymentMethod() != null ? savedOrder.getPaymentMethod() : "UPI");
                deliv.put("paymentStatus", savedOrder.getStatus());
                spreadsheetService.recordDeliveryOrder(deliv);
            }
        } catch (Exception ex) {
            log.error("Failed to record delivery order to spreadsheet", ex);
        }

        // 1-Click Checkout: Auto-save shipping address to customer profile
        if (request.getCustomerEmail() != null && !request.getCustomerEmail().trim().isEmpty()) {
            try {
                String email = request.getCustomerEmail().trim();
                CustomerProfile profile = customerProfileRepository.findByEmailIgnoreCase(email)
                        .orElseGet(() -> CustomerProfile.builder().email(email).build());
                profile.setFullName(request.getCustomerName());
                profile.setPhone(request.getCustomerPhone());
                profile.setShippingAddress(request.getShippingAddress());
                profile.setLandmark(request.getLandmark());
                profile.setPincode(request.getPincode());
                profile.setCity(request.getCity());
                profile.setState(request.getState());
                profile.setOrderCount(profile.getOrderCount() == null ? 1 : profile.getOrderCount() + 1);
                customerProfileRepository.save(profile);
            } catch (Exception ex) {
                // Non-blocking log if profile save fails
            }
        }

        return savedOrder;
    }

    @Transactional(readOnly = true)
    public Optional<Order> getOrderByOrderId(String orderId) {
        return orderRepository.findByOrderId(orderId);
    }

    @Transactional(readOnly = true)
    public List<Order> getOrdersByUserId(UUID userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public List<Order> getOrdersByCustomerEmail(String email) {
        return orderRepository.findByCustomerEmailIgnoreCaseOrderByCreatedAtDesc(email);
    }

    @Transactional(readOnly = true)
    public List<Order> getAllOrders() {
        return orderRepository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public Order cancelOrder(String orderId, String reason) {
        Order order = orderRepository.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found with ID: " + orderId));

        // Pessimistic lock the order row
        Order lockedOrder = orderRepository.findByIdWithLock(order.getId())
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));

        if (!"Order Placed".equalsIgnoreCase(lockedOrder.getStatus())) {
            throw new IllegalStateException("Order cannot be cancelled because it is already in '" + lockedOrder.getStatus() + "' status.");
        }

        if (lockedOrder.getCreatedAt() != null) {
            long elapsedMinutes = Duration.between(lockedOrder.getCreatedAt(), OffsetDateTime.now()).toMinutes();
            if (elapsedMinutes > 60) {
                throw new IllegalStateException("The 1-hour cancellation window has expired (" + elapsedMinutes + " minutes elapsed). Please contact concierge support.");
            }
        }

        // Restock inventory for cancelled order items
        if (lockedOrder.getItems() != null) {
            for (OrderItem item : lockedOrder.getItems()) {
                if (item.getProductId() != null) {
                    productRepository.findById(item.getProductId()).ifPresent(prod -> {
                        int currentStock = prod.getStock() != null ? prod.getStock() : 0;
                        int restoredStock = currentStock + item.getQty();
                        prod.setStock(restoredStock);
                        if (restoredStock > 0) {
                            prod.setIsSoldOut(false);
                        }
                        productRepository.save(prod);
                    });
                }
            }
        }

        lockedOrder.setStatus("Cancelled");
        lockedOrder.setStatusStep(0);
        lockedOrder.setTrackingNotes("Order cancelled by customer within 1-hour window. Reason: " + (reason != null && !reason.trim().isEmpty() ? reason.trim() : "Customer requested cancellation"));
        return orderRepository.save(lockedOrder);
    }

    @Transactional
    public Optional<Order> updateOrderStatus(UUID id, String status, Integer step, String trackingNotes) {
        return orderRepository.findById(id).map(order -> {
            if (status != null) order.setStatus(status);
            if (step != null) order.setStatusStep(step);
            if (trackingNotes != null) order.setTrackingNotes(trackingNotes);
            return orderRepository.save(order);
        });
    }

    @Transactional
    public Order updateOrderDelivery(String orderId, Map<String, String> deliveryData) {
        Order order = orderRepository.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));

        if (deliveryData.containsKey("customerName") && deliveryData.get("customerName") != null) {
            order.setCustomerName(deliveryData.get("customerName"));
        }
        if (deliveryData.containsKey("customerPhone") && deliveryData.get("customerPhone") != null) {
            order.setCustomerPhone(deliveryData.get("customerPhone"));
        }
        if (deliveryData.containsKey("shippingAddress") && deliveryData.get("shippingAddress") != null) {
            order.setShippingAddress(deliveryData.get("shippingAddress"));
        }
        if (deliveryData.containsKey("city") && deliveryData.get("city") != null) {
            order.setCity(deliveryData.get("city"));
        }
        if (deliveryData.containsKey("state") && deliveryData.get("state") != null) {
            order.setState(deliveryData.get("state"));
        }
        if (deliveryData.containsKey("pincode") && deliveryData.get("pincode") != null) {
            order.setPincode(deliveryData.get("pincode"));
        }
        if (deliveryData.containsKey("landmark") && deliveryData.get("landmark") != null) {
            order.setLandmark(deliveryData.get("landmark"));
        }

        return orderRepository.save(order);
    }

    @Transactional
    public boolean deleteOrder(UUID id) {
        if (orderRepository.existsById(id)) {
            orderRepository.deleteById(id);
            return true;
        }
        return false;
    }

    private String generateUniqueOrderId() {
        String datePrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        int rand = ThreadLocalRandom.current().nextInt(10000, 99999);
        return "SANGO-" + datePrefix + "-" + rand;
    }
}
