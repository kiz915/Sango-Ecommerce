package com.sangofiora.backend.model;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "order_id", nullable = false, unique = true)
    private String orderId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Column(name = "customer_email")
    private String customerEmail;

    @Column(name = "shipping_address", nullable = false, columnDefinition = "TEXT")
    private String shippingAddress;

    private String landmark;

    @Column(nullable = false)
    private String pincode;

    private String city;

    private String state;

    private String gstin;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(name = "payment_status")
    private String paymentStatus;

    @Column(name = "txn_id")
    private String txnId;

    private Integer subtotal;

    @Column(name = "mrp_total")
    private Integer mrpTotal;

    @Column(name = "mrp_savings")
    private Integer mrpSavings;

    @Column(name = "coupon_code")
    private String couponCode;

    @Column(name = "coupon_discount")
    private Integer couponDiscount;

    @Column(name = "volume_discount")
    private Integer volumeDiscount;

    @Column(name = "volume_discount_percent")
    private Integer volumeDiscountPercent;

    @Column(name = "delivery_fee")
    private Integer deliveryFee;

    @Column(name = "gst_amount")
    private Integer gstAmount;

    @Column(name = "net_total", nullable = false)
    private Integer netTotal;

    private String status;

    @Column(name = "status_step")
    private Integer statusStep;

    @Column(name = "est_delivery_date")
    private String estDeliveryDate;

    @Column(name = "tracking_notes", columnDefinition = "TEXT")
    private String trackingNotes;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonManagedReference
    @Builder.Default
    private List<OrderItem> items = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
