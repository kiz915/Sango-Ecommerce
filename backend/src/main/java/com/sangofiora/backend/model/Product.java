package com.sangofiora.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT DEFAULT ''")
    private String variant;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String size;

    @Column(name = "pot_included")
    private Boolean potIncluded;

    @Column(nullable = false)
    private Integer price;

    @Column(nullable = false)
    private Integer mrp;

    private Integer discount;

    @Column(precision = 2, scale = 1)
    private BigDecimal rating;

    private Integer reviews;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String image;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private Integer stock;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "is_sold_out")
    private Boolean isSoldOut;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
