package com.sangofiora.backend.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@CrossOrigin(origins = "*")
public class FileUploadController {

    private static final Logger log = LoggerFactory.getLogger(FileUploadController.class);

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".webp", ".svg", ".avif");
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/avif"
    );

    private Path resolveUploadDirectory() {
        Path primary = Paths.get("uploads", "plants").toAbsolutePath().normalize();
        try {
            Files.createDirectories(primary);
            return primary;
        } catch (Exception e) {
            log.warn("Cannot create primary upload dir {}, falling back to temp dir: {}", primary, e.getMessage());
            Path fallback = Paths.get(System.getProperty("java.io.tmpdir"), "uploads", "plants").toAbsolutePath().normalize();
            try {
                Files.createDirectories(fallback);
                return fallback;
            } catch (Exception ex) {
                log.error("Failed to create fallback upload dir {}", fallback, ex);
                return primary;
            }
        }
    }

    @PostMapping(value = {"/api/products/upload-image", "/api/admin/products/upload-image"}, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadProductImage(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file selected"));
        }

        String rawFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "product.webp";
        String originalFilename = StringUtils.cleanPath(rawFilename);
        String extension = getFileExtension(originalFilename).toLowerCase();

        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid file type. Allowed: JPG, PNG, WEBP, AVIF, SVG"));
        }

        String contentType = file.getContentType();
        if (contentType != null && !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid MIME type: " + contentType));
        }

        try {
            Path targetDir = resolveUploadDirectory();

            String baseName = originalFilename.contains(".")
                    ? originalFilename.substring(0, originalFilename.lastIndexOf('.'))
                    : originalFilename;
            baseName = baseName.replaceAll("[^a-zA-Z0-9_-]", "-").toLowerCase();
            if (baseName.length() > 40) {
                baseName = baseName.substring(0, 40);
            }

            String uniqueFilename = baseName + "-" + UUID.randomUUID().toString().substring(0, 8) + extension;
            Path targetLocation = targetDir.resolve(uniqueFilename);

            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            String fileUrl = "/uploads/plants/" + uniqueFilename;
            log.info("Product image uploaded successfully: {} -> {}", originalFilename, fileUrl);

            return ResponseEntity.ok(Map.of(
                    "status", "success",
                    "url", fileUrl,
                    "filename", uniqueFilename,
                    "size", file.getSize(),
                    "contentType", contentType != null ? contentType : "image/webp"
            ));
        } catch (IOException e) {
            log.error("Failed to store file {}", originalFilename, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to store file: " + e.getMessage()));
        }
    }

    private String getFileExtension(String filename) {
        int lastDot = filename.lastIndexOf('.');
        return (lastDot > 0) ? filename.substring(lastDot) : ".webp";
    }
}
