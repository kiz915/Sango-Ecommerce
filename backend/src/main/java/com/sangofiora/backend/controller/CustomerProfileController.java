package com.sangofiora.backend.controller;

import com.sangofiora.backend.model.CustomerProfile;
import com.sangofiora.backend.repository.CustomerProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/customer")
@RequiredArgsConstructor
public class CustomerProfileController {

    private final CustomerProfileRepository customerProfileRepository;

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(@RequestParam String email) {
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
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
    public ResponseEntity<?> updateProfile(@RequestBody CustomerProfile updated) {
        if (updated.getEmail() == null || updated.getEmail().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        String email = updated.getEmail().trim();
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
