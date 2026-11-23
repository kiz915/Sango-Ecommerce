package com.sangofiora.backend.repository;

import com.sangofiora.backend.model.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {

    Optional<Product> findBySlug(String slug);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdWithLock(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.slug = :slug")
    Optional<Product> findBySlugWithLock(@Param("slug") String slug);

    List<Product> findByIsActiveTrue();

    List<Product> findByCategoryIgnoreCaseAndIsActiveTrue(String category);

    @Query("SELECT p FROM Product p WHERE p.isActive = true AND " +
           "(LOWER(p.name) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(p.category) LIKE LOWER(CONCAT('%', :query, '%')) OR " +
           "LOWER(p.description) LIKE LOWER(CONCAT('%', :query, '%')))")
    List<Product> searchProducts(@Param("query") String query);

    @Query("SELECT DISTINCT p.category FROM Product p WHERE p.isActive = true")
    List<String> findDistinctCategories();
}
