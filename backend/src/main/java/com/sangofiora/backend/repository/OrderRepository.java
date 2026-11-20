package com.sangofiora.backend.repository;

import com.sangofiora.backend.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {

    Optional<Order> findByOrderId(String orderId);

    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<Order> findByCustomerEmailIgnoreCaseOrderByCreatedAtDesc(String customerEmail);

    long countByCustomerEmailIgnoreCase(String customerEmail);

    List<Order> findAllByOrderByCreatedAtDesc();
}
