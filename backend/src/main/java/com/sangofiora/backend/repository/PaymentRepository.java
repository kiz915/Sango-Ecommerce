package com.sangofiora.backend.repository;

import com.sangofiora.backend.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, UUID> {
    Optional<Payment> findByPaymentId(String paymentId);
    Optional<Payment> findByGatewayOrderId(String gatewayOrderId);
    Optional<Payment> findByIdempotencyKey(String idempotencyKey);
    List<Payment> findByOrderIdOrderByCreatedAtDesc(String orderId);
    Optional<Payment> findFirstByOrderIdAndStatusOrderByCreatedAtDesc(String orderId, String status);
}
