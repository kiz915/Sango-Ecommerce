package com.sangofiora.backend;

import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.service.ProductService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class ProductServiceTest {

    @Autowired
    private ProductService productService;

    @Autowired
    private ProductRepository productRepository;

    @Test
    void testProductCrudAndRetrieval() {
        String slug = "ficus-test-" + UUID.randomUUID();
        Product p = Product.builder()
                .slug(slug)
                .name("Ficus Test Tree")
                .category("Trees")
                .size("180cm")
                .price(4500)
                .mrp(6000)
                .image("/images/plants/ficus.jpg")
                .stock(10)
                .isActive(true)
                .isSoldOut(false)
                .build();
        productRepository.save(p);

        assertTrue(productService.getProductBySlug(slug).isPresent());
        assertEquals("Ficus Test Tree", productService.getProductBySlug(slug).get().getName());

        List<Product> trees = productService.getProductsByCategory("Trees");
        assertFalse(trees.isEmpty());
    }
}
