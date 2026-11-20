package com.sangofiora.backend;

import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.OrderItem;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class OrderServiceTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private ProductRepository productRepository;

    private Product testProduct;
    private Order testOrder;

    @BeforeEach
    void setup() {
        testProduct = Product.builder()
                .slug("test-plant-" + UUID.randomUUID())
                .name("Test Plant")
                .category("Foliage")
                .size("90cm")
                .price(1000)
                .mrp(1500)
                .image("/images/plants/test.jpg")
                .stock(5)
                .isActive(true)
                .isSoldOut(false)
                .build();
        testProduct = productRepository.save(testProduct);

        testOrder = Order.builder()
                .orderId("ORD-TEST-" + System.currentTimeMillis())
                .customerName("Jane Doe")
                .customerEmail("jane@example.com")
                .customerPhone("9876543210")
                .shippingAddress("123 Green Street, Indiranagar")
                .city("Bengaluru")
                .state("Karnataka")
                .pincode("560038")
                .paymentMethod("COD")
                .paymentStatus("Pending (COD)")
                .subtotal(2000)
                .netTotal(2000)
                .status("Order Placed")
                .createdAt(OffsetDateTime.now())
                .build();

        OrderItem item = OrderItem.builder()
                .order(testOrder)
                .productId(testProduct.getId())
                .productSlug(testProduct.getSlug())
                .productName(testProduct.getName())
                .price(1000)
                .qty(2)
                .build();

        testOrder.setItems(new ArrayList<>(List.of(item)));
        testOrder = orderRepository.save(testOrder);
    }

    @Test
    void testCancelOrderAndInventoryRestock() {
        int initialStock = testProduct.getStock();

        Order cancelled = orderService.cancelOrder(testOrder.getOrderId(), "Customer changed mind");

        assertEquals("Cancelled", cancelled.getStatus());
        assertEquals(0, cancelled.getStatusStep());

        Product reloaded = productRepository.findById(testProduct.getId()).orElseThrow();
        assertEquals(initialStock + 2, reloaded.getStock());
    }

    @Test
    void testCannotCancelNonPlacedOrder() {
        testOrder.setStatus("Shipped");
        orderRepository.save(testOrder);

        assertThrows(IllegalStateException.class, () -> {
            orderService.cancelOrder(testOrder.getOrderId(), "Too late");
        });
    }
}
