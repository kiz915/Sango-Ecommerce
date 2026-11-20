package com.sangofiora.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class SpreadsheetService {

    private static final Logger log = LoggerFactory.getLogger(SpreadsheetService.class);

    private final Path spreadsheetDir = Paths.get("data", "spreadsheets");
    private final Path deliveryCsvPath = Paths.get("data", "spreadsheets", "delivery_orders.csv");
    private final Path contactCsvPath = Paths.get("data", "spreadsheets", "contact_inquiries.csv");

    private static final String DELIVERY_HEADER = "Order ID,Payment ID,Date,Customer Name,Phone,Email,Delivery Address,City,State,Pincode,Special Instructions,Items,Total (INR),Payment Method,Payment Status\n";
    private static final String CONTACT_HEADER = "Ticket ID,Date,Customer Name,Phone,Email,Topic,Message,Status\n";

    public SpreadsheetService() {
        initSpreadsheetFiles();
    }

    private synchronized void initSpreadsheetFiles() {
        try {
            if (!Files.exists(spreadsheetDir)) {
                Files.createDirectories(spreadsheetDir);
            }
            if (!Files.exists(deliveryCsvPath)) {
                Files.writeString(deliveryCsvPath, DELIVERY_HEADER, StandardCharsets.UTF_8, StandardOpenOption.CREATE);
                log.info("Initialized Delivery Orders spreadsheet: {}", deliveryCsvPath.toAbsolutePath());
            }
            if (!Files.exists(contactCsvPath)) {
                Files.writeString(contactCsvPath, CONTACT_HEADER, StandardCharsets.UTF_8, StandardOpenOption.CREATE);
                log.info("Initialized Contact Inquiries spreadsheet: {}", contactCsvPath.toAbsolutePath());
            }
        } catch (IOException e) {
            log.error("Failed to initialize spreadsheet files", e);
        }
    }

    private String escapeCsv(String field) {
        if (field == null) return "\"\"";
        String clean = field.replace("\"", "\"\"");
        return "\"" + clean + "\"";
    }

    public synchronized void recordDeliveryOrder(Map<String, Object> data) {
        try {
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            String orderId = String.valueOf(data.getOrDefault("orderId", ""));
            String paymentId = String.valueOf(data.getOrDefault("paymentId", ""));
            String customerName = String.valueOf(data.getOrDefault("customerName", ""));
            String phone = String.valueOf(data.getOrDefault("phone", ""));
            String email = String.valueOf(data.getOrDefault("email", ""));
            String address = String.valueOf(data.getOrDefault("address", ""));
            String city = String.valueOf(data.getOrDefault("city", ""));
            String state = String.valueOf(data.getOrDefault("state", ""));
            String pincode = String.valueOf(data.getOrDefault("pincode", ""));
            String instructions = String.valueOf(data.getOrDefault("instructions", ""));
            String items = String.valueOf(data.getOrDefault("items", ""));
            String total = String.valueOf(data.getOrDefault("total", "0"));
            String paymentMethod = String.valueOf(data.getOrDefault("paymentMethod", "UPI"));
            String paymentStatus = String.valueOf(data.getOrDefault("paymentStatus", "COMPLETED"));

            String row = String.join(",",
                    escapeCsv(orderId),
                    escapeCsv(paymentId),
                    escapeCsv(timestamp),
                    escapeCsv(customerName),
                    escapeCsv(phone),
                    escapeCsv(email),
                    escapeCsv(address),
                    escapeCsv(city),
                    escapeCsv(state),
                    escapeCsv(pincode),
                    escapeCsv(instructions),
                    escapeCsv(items),
                    escapeCsv(total),
                    escapeCsv(paymentMethod),
                    escapeCsv(paymentStatus)
            ) + "\n";

            Files.writeString(deliveryCsvPath, row, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
            log.info("Appended delivery order {} to spreadsheet {}", orderId, deliveryCsvPath);

            // Forward to Google Sheets webhook if configured
            forwardToGoogleSheetsWebhook("delivery", data);

        } catch (IOException e) {
            log.error("Error writing delivery to spreadsheet", e);
        }
    }

    public synchronized void recordContactInquiry(Map<String, Object> data) {
        try {
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            String ticketId = String.valueOf(data.getOrDefault("ticketId", "TICK-" + (10000 + new Random().nextInt(90000))));
            String name = String.valueOf(data.getOrDefault("name", ""));
            String phone = String.valueOf(data.getOrDefault("phone", ""));
            String email = String.valueOf(data.getOrDefault("email", ""));
            String topic = String.valueOf(data.getOrDefault("topic", "General Inquiry"));
            String message = String.valueOf(data.getOrDefault("message", ""));
            String status = String.valueOf(data.getOrDefault("status", "Open"));

            String row = String.join(",",
                    escapeCsv(ticketId),
                    escapeCsv(timestamp),
                    escapeCsv(name),
                    escapeCsv(phone),
                    escapeCsv(email),
                    escapeCsv(topic),
                    escapeCsv(message),
                    escapeCsv(status)
            ) + "\n";

            Files.writeString(contactCsvPath, row, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
            log.info("Appended contact inquiry {} to spreadsheet {}", ticketId, contactCsvPath);

            // Forward to Google Sheets webhook if configured
            forwardToGoogleSheetsWebhook("contact", data);

        } catch (IOException e) {
            log.error("Error writing contact inquiry to spreadsheet", e);
        }
    }

    public byte[] getDeliverySpreadsheetBytes() throws IOException {
        if (!Files.exists(deliveryCsvPath)) {
            initSpreadsheetFiles();
        }
        return Files.readAllBytes(deliveryCsvPath);
    }

    public byte[] getContactSpreadsheetBytes() throws IOException {
        if (!Files.exists(contactCsvPath)) {
            initSpreadsheetFiles();
        }
        return Files.readAllBytes(contactCsvPath);
    }

    public List<Map<String, String>> getDeliveryRows() {
        return parseCsvRows(deliveryCsvPath);
    }

    public List<Map<String, String>> getContactRows() {
        return parseCsvRows(contactCsvPath);
    }

    private List<Map<String, String>> parseCsvRows(Path path) {
        List<Map<String, String>> rows = new ArrayList<>();
        if (!Files.exists(path)) return rows;

        try (BufferedReader br = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String headerLine = br.readLine();
            if (headerLine == null) return rows;
            String[] headers = parseCsvLine(headerLine);

            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                String[] values = parseCsvLine(line);
                Map<String, String> row = new LinkedHashMap<>();
                for (int i = 0; i < headers.length; i++) {
                    String h = headers[i].trim();
                    String v = (i < values.length) ? values[i] : "";
                    row.put(h, v);
                }
                rows.add(row);
            }
        } catch (IOException e) {
            log.error("Failed to parse CSV {}", path, e);
        }
        return rows;
    }

    private String[] parseCsvLine(String line) {
        List<String> tokens = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '\"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '\"') {
                    sb.append('\"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c == ',' && !inQuotes) {
                tokens.add(sb.toString());
                sb.setLength(0);
            } else {
                sb.append(c);
            }
        }
        tokens.add(sb.toString());
        return tokens.toArray(new String[0]);
    }

    private void forwardToGoogleSheetsWebhook(String type, Map<String, Object> data) {
        // Reads optional GOOGLE_SHEETS_WEBHOOK environment variable or system property
        String webhookUrl = System.getenv("GOOGLE_SHEETS_WEBHOOK_URL");
        if (webhookUrl == null || webhookUrl.isBlank()) {
            webhookUrl = System.getProperty("google.sheets.webhook.url");
        }
        if (webhookUrl != null && !webhookUrl.isBlank()) {
            try {
                // Post payload in background
                final String finalUrl = webhookUrl;
                Thread.ofVirtual().start(() -> {
                    try {
                        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
                        Map<String, Object> payload = new HashMap<>(data);
                        payload.put("sheetType", type);
                        payload.put("loggedAt", LocalDateTime.now().toString());

                        StringBuilder json = new StringBuilder("{");
                        int count = 0;
                        for (Map.Entry<String, Object> e : payload.entrySet()) {
                            if (count++ > 0) json.append(",");
                            json.append("\"").append(e.getKey()).append("\":\"")
                                .append(String.valueOf(e.getValue()).replace("\"", "\\\"")).append("\"");
                        }
                        json.append("}");

                        java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                                .uri(java.net.URI.create(finalUrl))
                                .header("Content-Type", "application/json")
                                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(json.toString(), StandardCharsets.UTF_8))
                                .build();
                        client.send(req, java.net.http.HttpResponse.BodyHandlers.discarding());
                        log.info("Successfully pushed {} row to Google Sheets Webhook", type);
                    } catch (Exception ex) {
                        log.warn("Could not push row to Google Sheets webhook: {}", ex.getMessage());
                    }
                });
            } catch (Exception e) {
                log.warn("Error triggering Google Sheets webhook: {}", e.getMessage());
            }
        }
    }
}
