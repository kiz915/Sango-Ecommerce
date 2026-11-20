package com.sangofiora.backend.controller;

import com.sangofiora.backend.model.Enquiry;
import com.sangofiora.backend.repository.EnquiryRepository;
import com.sangofiora.backend.service.SpreadsheetService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class ContactController {

    private final EnquiryRepository enquiryRepository;
    private final SpreadsheetService spreadsheetService;

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

        Enquiry saved = enquiryRepository.save(enquiry);

        // Record in live spreadsheet for Admin Studio
        try {
            Map<String, Object> data = new HashMap<>();
            data.put("ticketId", "TICK-" + (saved.getId() != null ? saved.getId().toString().substring(0, 8) : System.currentTimeMillis() % 100000));
            data.put("name", req.getName());
            data.put("phone", req.getPhone() != null ? req.getPhone() : "");
            data.put("email", req.getEmail());
            data.put("topic", req.getSubject() != null ? req.getSubject() : "General Inquiry");
            data.put("message", req.getMessage());
            data.put("status", "Open");
            spreadsheetService.recordContactInquiry(data);
        } catch (Exception e) {
            log.error("Failed to record contact inquiry to spreadsheet", e);
        }

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
