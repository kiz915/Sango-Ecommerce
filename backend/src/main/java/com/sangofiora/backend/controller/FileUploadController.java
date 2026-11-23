package com.sangofiora.backend.controller;

import com.sangofiora.backend.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class FileUploadController {

    private static final Logger log = LoggerFactory.getLogger(FileUploadController.class);

    private final AppProperties appProperties;

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".webp", ".svg", ".avif");
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/avif"
    );

    private Path resolveUploadDirectory() {
        String configuredDir = (appProperties != null && appProperties.getUpload() != null && appProperties.getUpload().getDir() != null)
                ? appProperties.getUpload().getDir()
                : "uploads/plants";

        Path primary = Paths.get(configuredDir).toAbsolutePath().normalize();
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
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> uploadProductImage(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No file selected"));
        }

        long maxBytes = appProperties != null && appProperties.getUpload() != null
                ? appProperties.getUpload().getMaxFileSize()
                : 15 * 1024 * 1024;

        if (file.getSize() > maxBytes) {
            return ResponseEntity.badRequest().body(Map.of("error", "File exceeds maximum permitted size of " + (maxBytes / (1024 * 1024)) + "MB"));
        }

        String rawFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "product.webp";
        String originalFilename = StringUtils.cleanPath(rawFilename);
        String extension = getFileExtension(originalFilename).toLowerCase();

        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid file extension. Allowed: JPG, PNG, WEBP, AVIF, SVG"));
        }

        String contentType = file.getContentType();
        if (contentType != null && !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid MIME type: " + contentType));
        }

        // Validate Magic Bytes for binary image formats to prevent file spoofing
        if (!validateImageMagicBytes(file, extension)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Corrupt or spoofed image file: magic bytes do not match declared extension."));
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
            Path targetLocation = targetDir.resolve(uniqueFilename).normalize();

            // Guard against Path Traversal
            if (!targetLocation.startsWith(targetDir)) {
                log.warn("[Security] Path traversal attempt detected: {}", originalFilename);
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Invalid file destination"));
            }

            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            String fileUrl = "/uploads/plants/" + uniqueFilename;
            log.info("Product image uploaded successfully by admin: {} -> {}", originalFilename, fileUrl);

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

    private boolean validateImageMagicBytes(MultipartFile file, String ext) {
        if (".svg".equals(ext)) return true; // SVG is XML text

        try (InputStream is = file.getInputStream()) {
            byte[] header = new byte[12];
            int read = is.read(header);
            if (read < 4) return false;

            // JPEG: FF D8 FF
            if (ext.equals(".jpg") || ext.equals(".jpeg")) {
                return (header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF;
            }
            // PNG: 89 50 4E 47
            if (ext.equals(".png")) {
                return (header[0] & 0xFF) == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47;
            }
            // WEBP: RIFF .... WEBP
            if (ext.equals(".webp")) {
                return read >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
                        && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P';
            }
            // AVIF: ....ftypavif
            if (ext.equals(".avif")) {
                return read >= 12 && header[4] == 'f' && header[5] == 't' && header[6] == 'y' && header[7] == 'p';
            }
            return true;
        } catch (Exception e) {
            log.warn("Failed to read magic bytes: {}", e.getMessage());
            return false;
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null || filename.lastIndexOf('.') == -1) {
            return "";
        }
        return filename.substring(filename.lastIndexOf('.'));
    }
}
