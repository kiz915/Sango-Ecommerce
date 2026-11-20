package com.sangofiora.backend.controller;

import com.sangofiora.backend.model.Enquiry;
import com.sangofiora.backend.repository.EnquiryRepository;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ContactController {

    private final EnquiryRepository enquiryRepository;

    @Data
    public static class ContactRequest {
        @NotBlank(message = "Name is required")
        private String name;

        @NotBlank(message = "Email is required")
        @Email(message = "Valid email is required")
        private String email;

        private String phone;
        private String subject;

        @NotBlank(message = "Message is required")
        private String message;
    }

    @PostMapping("/contact")
    public ResponseEntity<Map<String, Object>> submitEnquiry(@RequestBody ContactRequest req) {
        Enquiry enquiry = Enquiry.builder()
                .name(req.getName())
                .email(req.getEmail())
                .phone(req.getPhone())
                .subject(req.getSubject() != null ? req.getSubject() : "Website Customer Enquiry")
                .message(req.getMessage())
                .build();

        enquiryRepository.save(enquiry);

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "success", true,
                "message", "Thank you for reaching out! Our design studio will contact you shortly."
        ));
    }

    @GetMapping("/admin/enquiries")
    public ResponseEntity<List<Enquiry>> getEnquiries() {
        return ResponseEntity.ok(enquiryRepository.findAllByOrderByCreatedAtDesc());
    }
}
