package com.sangofiora.backend.controller;

import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.service.OrderService;
import com.sangofiora.backend.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final ProductService productService;
    private final OrderService orderService;

    // ─── Products Admin ───
    @GetMapping("/products")
    public ResponseEntity<List<Product>> getAllProducts() {
        return ResponseEntity.ok(productService.getAllProducts());
    }

    @PostMapping("/products")
    public ResponseEntity<Product> createProduct(@RequestBody Product product) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productService.saveProduct(product));
    }

    @PutMapping("/products/{id}")
    public ResponseEntity<Product> updateProduct(@PathVariable UUID id, @RequestBody Product product) {
        return productService.updateProduct(id, product)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable UUID id) {
        if (productService.deleteProduct(id)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    @PatchMapping("/products/{id}/toggle-sold-out")
    public ResponseEntity<Product> toggleSoldOut(@PathVariable UUID id) {
        return productService.toggleSoldOut(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ─── Orders Admin ───
    @GetMapping("/orders")
    public ResponseEntity<List<Order>> getAllOrders() {
        return ResponseEntity.ok(orderService.getAllOrders());
    }

    @PatchMapping("/orders/{id}/status")
    public ResponseEntity<Order> updateOrderStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body
    ) {
        String status = (String) body.get("status");
        Integer step = body.get("step") != null ? ((Number) body.get("step")).intValue() : null;
        String notes = (String) body.get("trackingNotes");

        return orderService.updateOrderStatus(id, status, step, notes)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/orders/{id}")
    public ResponseEntity<Void> deleteOrder(@PathVariable UUID id) {
        if (orderService.deleteOrder(id)) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // ─── Dashboard Stats ───
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getDashboardStats() {
        List<Product> products = productService.getAllActiveProducts();
        List<Order> orders = orderService.getAllOrders();

        long activeProducts = products.size();
        long soldOutProducts = products.stream().filter(p -> Boolean.TRUE.equals(p.getIsSoldOut())).count();
        long totalOrders = orders.size();
        long totalRevenue = orders.stream()
                .filter(o -> !"Cancelled".equalsIgnoreCase(o.getStatus()))
                .mapToLong(o -> o.getNetTotal() != null ? o.getNetTotal() : 0)
                .sum();

        return ResponseEntity.ok(Map.of(
                "activeProducts", activeProducts,
                "soldOutProducts", soldOutProducts,
                "totalOrders", totalOrders,
                "totalRevenue", totalRevenue
        ));
    }
}
