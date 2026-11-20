package com.sangofiora.backend.service;

import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    @Transactional(readOnly = true)
    public List<Product> getAllActiveProducts() {
        return productRepository.findByIsActiveTrue();
    }

    @Transactional(readOnly = true)
    public Optional<Product> getProductBySlug(String slug) {
        return productRepository.findBySlug(slug);
    }

    @Transactional(readOnly = true)
    public Optional<Product> getProductById(UUID id) {
        return productRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public List<Product> getProductsByCategory(String category) {
        return productRepository.findByCategoryIgnoreCaseAndIsActiveTrue(category);
    }

    @Transactional(readOnly = true)
    public List<Product> searchProducts(String query) {
        if (query == null || query.trim().isEmpty()) {
            return getAllActiveProducts();
        }
        return productRepository.searchProducts(query.trim());
    }

    @Transactional(readOnly = true)
    public List<String> getAllCategories() {
        return productRepository.findDistinctCategories();
    }

    @Transactional
    public Product saveProduct(Product product) {
        if (product.getSlug() == null || product.getSlug().trim().isEmpty()) {
            String base = (product.getName() + "-" + (product.getSize() != null ? product.getSize() : ""))
                    .toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
            product.setSlug(base);
        }
        if (product.getRating() == null) product.setRating(java.math.BigDecimal.valueOf(4.8));
        if (product.getReviews() == null) product.setReviews(12);
        if (product.getIsActive() == null) product.setIsActive(true);
        if (product.getIsSoldOut() == null) product.setIsSoldOut(false);
        if (product.getPotIncluded() == null) product.setPotIncluded(true);
        if (product.getDiscount() == null && product.getMrp() != null && product.getPrice() != null && product.getMrp() > product.getPrice()) {
            product.setDiscount((int) Math.round(((double) (product.getMrp() - product.getPrice()) / product.getMrp()) * 100));
        }
        Product saved = productRepository.save(product);
        syncToFile();
        return saved;
    }

    @Transactional
    public Optional<Product> updateProduct(UUID id, Product updated) {
        return productRepository.findById(id).map(existing -> {
            existing.setName(updated.getName());
            existing.setCategory(updated.getCategory());
            existing.setSize(updated.getSize());
            existing.setPrice(updated.getPrice());
            existing.setMrp(updated.getMrp());
            existing.setDiscount(updated.getDiscount());
            existing.setImage(updated.getImage());
            existing.setDescription(updated.getDescription());
            existing.setStock(updated.getStock());
            if (updated.getIsActive() != null) existing.setIsActive(updated.getIsActive());
            if (updated.getIsSoldOut() != null) existing.setIsSoldOut(updated.getIsSoldOut());
            if (updated.getPotIncluded() != null) existing.setPotIncluded(updated.getPotIncluded());
            Product saved = productRepository.save(existing);
            syncToFile();
            return saved;
        });
    }

    @Transactional
    public boolean deleteProduct(UUID id) {
        return productRepository.findById(id).map(p -> {
            p.setIsActive(false); // soft-delete
            productRepository.save(p);
            syncToFile();
            return true;
        }).orElse(false);
    }

    @Transactional
    public Optional<Product> toggleSoldOut(UUID id) {
        return productRepository.findById(id).map(p -> {
            p.setIsSoldOut(!Boolean.TRUE.equals(p.getIsSoldOut()));
            Product saved = productRepository.save(p);
            syncToFile();
            return saved;
        });
    }

    public synchronized void syncToFile() {
        try {
            List<Product> activeProducts = productRepository.findByIsActiveTrue();
            List<java.util.Map<String, Object>> productList = new java.util.ArrayList<>();
            int maxDiscount = 0;
            for (Product p : activeProducts) {
                java.util.Map<String, Object> map = new java.util.LinkedHashMap<>();
                map.put("slug", p.getSlug());
                map.put("name", p.getName());
                map.put("variant", p.getVariant() != null ? p.getVariant() : "");
                map.put("category", p.getCategory());
                map.put("size", p.getSize());
                map.put("potIncluded", Boolean.TRUE.equals(p.getPotIncluded()));
                map.put("price", p.getPrice());
                map.put("mrp", p.getMrp());
                int disc = p.getDiscount() != null ? p.getDiscount() : 0;
                map.put("discount", disc);
                if (disc > maxDiscount) maxDiscount = disc;
                map.put("rating", p.getRating() != null ? p.getRating().doubleValue() : 4.8);
                map.put("reviews", p.getReviews() != null ? p.getReviews() : 10);
                map.put("image", p.getImage());
                map.put("description", p.getDescription() != null ? p.getDescription() : "");
                map.put("stock", p.getStock() != null ? p.getStock() : 15);
                map.put("isSoldOut", Boolean.TRUE.equals(p.getIsSoldOut()));
                productList.add(map);
            }

            java.util.Map<String, Object> root = new java.util.LinkedHashMap<>();
            root.put("products", productList);
            root.put("stats", java.util.Map.of("totalProducts", productList.size(), "maxDiscount", maxDiscount));

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            mapper.enable(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT);

            String[] paths = new String[]{
                "../_data/plants.json",
                "_data/plants.json",
                "src/main/resources/data/plants.json"
            };

            for (String p : paths) {
                java.io.File f = new java.io.File(p);
                if (f.exists()) {
                    mapper.writerWithDefaultPrettyPrinter().writeValue(f, root);
                }
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(ProductService.class).warn("Failed to sync products to plants.json: {}", e.getMessage());
        }
    }
}
