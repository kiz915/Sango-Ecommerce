package com.sangofiora.backend.controller;

import com.sangofiora.backend.service.SpreadsheetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/spreadsheet")
@RequiredArgsConstructor
public class SpreadsheetController {

    private final SpreadsheetService spreadsheetService;

    /**
     * Download the official Delivery Orders Spreadsheet (.csv) — strictly Admin only.
     */
    @GetMapping("/deliveries/download")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> downloadDeliverySpreadsheet() throws IOException {
        byte[] csvBytes = spreadsheetService.getDeliverySpreadsheetBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sango_fiora_deliveries.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csvBytes);
    }

    /**
     * Download the official Contact Inquiries Spreadsheet (.csv) — strictly Admin only.
     */
    @GetMapping("/contacts/download")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> downloadContactSpreadsheet() throws IOException {
        byte[] csvBytes = spreadsheetService.getContactSpreadsheetBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sango_fiora_contact_inquiries.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csvBytes);
    }

    /**
     * Fetch delivery rows as JSON — strictly Admin only.
     */
    @GetMapping("/deliveries")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Map<String, String>>> getDeliveryRows() {
        return ResponseEntity.ok(spreadsheetService.getDeliveryRows());
    }

    /**
     * Fetch contact rows as JSON — strictly Admin only.
     */
    @GetMapping("/contacts")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Map<String, String>>> getContactRows() {
        return ResponseEntity.ok(spreadsheetService.getContactRows());
    }
}
