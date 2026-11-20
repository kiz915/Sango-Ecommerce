package com.sangofiora.backend.repository;

import com.sangofiora.backend.model.UserCart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserCartRepository extends JpaRepository<UserCart, UUID> {
    Optional<UserCart> findByUserEmailIgnoreCase(String userEmail);
    List<UserCart> findByUpdatedAtBeforeAndIsRecoveredFalse(OffsetDateTime cutoff);
}
