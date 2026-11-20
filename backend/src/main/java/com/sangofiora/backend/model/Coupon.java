package com.sangofiora.backend.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "coupons")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Coupon {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private Integer percent;

    @Column(nullable = false)
    private String label;

    @Column(name = "min_subtotal")
    private Integer minSubtotal;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "usage_limit")
    private Integer usageLimit;

    @Column(name = "times_used")
    private Integer timesUsed;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;
}
