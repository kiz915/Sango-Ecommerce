package com.sangofiora.backend.controller;

import com.sangofiora.backend.model.CustomerProfile;
import com.sangofiora.backend.repository.CustomerProfileRepository;
import com.sangofiora.backend.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/customer")
@RequiredArgsConstructor
public class CustomerProfileController {

    private final CustomerProfileRepository customerProfileRepository;

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(
            @RequestParam String email,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        // Ownership enforcement: Caller can only view their own profile (or must be ADMIN)
        if (principal == null || (!principal.isAdmin() && !email.trim().equalsIgnoreCase(principal.getEmail()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot view another customer's profile."));
        }

        Optional<CustomerProfile> profile = customerProfileRepository.findByEmailIgnoreCase(email.trim());
        if (profile.isPresent()) {
            return ResponseEntity.ok(profile.get());
        }
        return ResponseEntity.ok(Map.of(
                "email", email.trim(),
                "exists", false
        ));
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(
            @RequestBody CustomerProfile updated,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        if (updated.getEmail() == null || updated.getEmail().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        String email = updated.getEmail().trim();

        // Ownership enforcement: Caller can only update their own profile (or must be ADMIN)
        if (principal == null || (!principal.isAdmin() && !email.equalsIgnoreCase(principal.getEmail()))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: cannot modify another customer's profile."));
        }

        CustomerProfile profile = customerProfileRepository.findByEmailIgnoreCase(email)
                .orElseGet(() -> CustomerProfile.builder().email(email).build());

        if (updated.getFullName() != null) profile.setFullName(updated.getFullName());
        if (updated.getPhone() != null) profile.setPhone(updated.getPhone());
        if (updated.getShippingAddress() != null) profile.setShippingAddress(updated.getShippingAddress());
        if (updated.getLandmark() != null) profile.setLandmark(updated.getLandmark());
        if (updated.getCity() != null) profile.setCity(updated.getCity());
        if (updated.getState() != null) profile.setState(updated.getState());
        if (updated.getPincode() != null) profile.setPincode(updated.getPincode());

        CustomerProfile saved = customerProfileRepository.save(profile);
        return ResponseEntity.ok(saved);
    }
}
