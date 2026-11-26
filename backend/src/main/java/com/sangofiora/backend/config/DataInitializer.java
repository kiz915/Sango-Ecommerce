package com.sangofiora.backend.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sangofiora.backend.model.Coupon;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.CouponRepository;
import com.sangofiora.backend.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final ProductRepository productRepository;
    private final CouponRepository couponRepository;
    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void run(String... args) {
        seedProductsIfEmpty();
        seedCouponsIfEmpty();
    }

    private void seedProductsIfEmpty() {
        if (productRepository.count() > 0) {
            log.info("Products already present in database (count: {}). Ensuring realistic stock levels...", productRepository.count());
            // Ensure some items have low stock (2 or 3) for the low-stock alert badge
            List<Product> prods = productRepository.findAll();
            boolean updated = false;
            for (Product p : prods) {
                int hash = Math.abs(p.getSlug().hashCode());
                if (hash % 11 == 0 && (p.getStock() == null || p.getStock() > 5)) {
                    p.setStock(2);
                    updated = true;
                } else if (hash % 7 == 0 && (p.getStock() == null || p.getStock() > 5)) {
                    p.setStock(3);
                    updated = true;
                }
            }
            if (updated) {
                productRepository.saveAll(prods);
                log.info("Realistic low-stock levels calibrated for urgent items.");
            }
            return;
        }

        try {
            Resource resource = resourceLoader.getResource("classpath:data/plants.json");
            if (!resource.exists()) {
                log.warn("classpath:data/plants.json not found. Skipping product seed.");
                return;
            }

            try (InputStream is = resource.getInputStream()) {
                JsonNode root = objectMapper.readTree(is);
                JsonNode productsNode = root.get("products");

                if (productsNode != null && productsNode.isArray()) {
                    List<Product> products = new ArrayList<>();
                    for (JsonNode node : productsNode) {
                        int stock = node.path("stock").asInt(0);
                        if (stock == 0) {
                            int hash = Math.abs(node.path("slug").asText().hashCode());
                            if (hash % 11 == 0) {
                                stock = 2; // Low-stock alert trigger
                            } else if (hash % 7 == 0) {
                                stock = 3; // Low-stock alert trigger
                            } else if (hash % 5 == 0) {
                                stock = 4;
                            } else {
                                stock = 12 + (hash % 20);
                            }
                        }

                        Product p = Product.builder()
                                .slug(node.path("slug").asText())
                                .name(node.path("name").asText())
                                .variant(node.path("variant").asText(""))
                                .category(node.path("category").asText("Foliage"))
                                .size(node.path("size").asText(""))
                                .potIncluded(node.path("potIncluded").asBoolean(true))
                                .price(node.path("price").asInt(0))
                                .mrp(node.path("mrp").asInt(0))
                                .discount(node.path("discount").asInt(0))
                                .rating(BigDecimal.valueOf(node.path("rating").asDouble(4.5)))
                                .reviews(node.path("reviews").asInt(0))
                                .image(node.path("image").asText(""))
                                .description(node.path("description").asText(""))
                                .stock(stock)
                                .isActive(true)
                                .isSoldOut(false)
                                .build();
                        products.add(p);
                    }
                    productRepository.saveAll(products);
                    log.info("Successfully seeded {} products into database!", products.size());
                }
            }
        } catch (Exception e) {
            log.error("Failed to seed products from JSON: {}", e.getMessage(), e);
        }
    }

    private void seedCouponsIfEmpty() {
        if (couponRepository.count() > 0) {
            return;
        }

        List<Coupon> defaultCoupons = List.of(
                Coupon.builder().code("WELCOME10").percent(10).label("10% New Member Discount").minSubtotal(0).isActive(true).firstTimeOnly(true).timesUsed(0).build(),
                Coupon.builder().code("PLANTLOVE15").percent(15).label("15% Plant Lover Discount").minSubtotal(0).isActive(true).timesUsed(0).build(),
                Coupon.builder().code("BULK20").percent(20).label("20% Bulk Order Discount").minSubtotal(5000).isActive(true).timesUsed(0).build(),
                Coupon.builder().code("SANGO10").percent(10).label("10% Welcome Discount").minSubtotal(0).isActive(true).timesUsed(0).build()
        );

        couponRepository.saveAll(defaultCoupons);
        log.info("Successfully seeded default promo coupons!");
    }
}
