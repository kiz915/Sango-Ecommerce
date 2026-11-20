package com.sangofiora.backend.controller;

import com.sangofiora.backend.service.SpreadsheetService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/spreadsheet")
@CrossOrigin(origins = "*")
public class SpreadsheetController {

    private final SpreadsheetService spreadsheetService;

    public SpreadsheetController(SpreadsheetService spreadsheetService) {
        this.spreadsheetService = spreadsheetService;
    }

    /**
     * Records an order's delivery details into the Delivery Orders Spreadsheet
     */
    @PostMapping("/delivery")
    public ResponseEntity<Map<String, Object>> recordDelivery(@RequestBody Map<String, Object> deliveryData) {
        spreadsheetService.recordDeliveryOrder(deliveryData);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Delivery details successfully recorded in spreadsheet",
                "orderId", deliveryData.getOrDefault("orderId", "")
        ));
    }

    /**
     * Records a contact inquiry into the Contact Inquiries Spreadsheet
     */
    @PostMapping("/contact")
    public ResponseEntity<Map<String, Object>> recordContact(@RequestBody Map<String, Object> contactData) {
        spreadsheetService.recordContactInquiry(contactData);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Contact inquiry successfully recorded in spreadsheet",
                "ticketId", contactData.getOrDefault("ticketId", "")
        ));
    }

    /**
     * Download the official Delivery Orders Spreadsheet (.csv)
     */
    @GetMapping("/deliveries/download")
    public ResponseEntity<byte[]> downloadDeliverySpreadsheet() throws IOException {
        byte[] csvBytes = spreadsheetService.getDeliverySpreadsheetBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sango_fiora_deliveries.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csvBytes);
    }

    /**
     * Download the official Contact Inquiries Spreadsheet (.csv)
     */
    @GetMapping("/contacts/download")
    public ResponseEntity<byte[]> downloadContactSpreadsheet() throws IOException {
        byte[] csvBytes = spreadsheetService.getContactSpreadsheetBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"sango_fiora_contact_inquiries.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(csvBytes);
    }

    /**
     * Fetch delivery rows as JSON for admin viewing
     */
    @GetMapping("/deliveries")
    public ResponseEntity<List<Map<String, String>>> getDeliveryRows() {
        return ResponseEntity.ok(spreadsheetService.getDeliveryRows());
    }

    /**
     * Fetch contact rows as JSON for admin viewing
     */
    @GetMapping("/contacts")
    public ResponseEntity<List<Map<String, String>>> getContactRows() {
        return ResponseEntity.ok(spreadsheetService.getContactRows());
    }
}
