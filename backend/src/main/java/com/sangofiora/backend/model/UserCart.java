package com.sangofiora.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_carts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserCart {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_email", nullable = false, unique = true)
    private String userEmail;

    @Column(name = "items_json", columnDefinition = "TEXT")
    private String itemsJson;

    @Column(name = "item_count")
    private Integer itemCount;

    @Column(name = "subtotal")
    private Integer subtotal;

    @Column(name = "coupon_code")
    private String couponCode;

    @Builder.Default
    @Column(name = "is_recovered")
    private Boolean isRecovered = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
