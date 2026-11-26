package com.sangofiora.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String paymentSecret;
    private Payment payment = new Payment();
    private Stripe stripe = new Stripe();
    private Jwt jwt = new Jwt();
    private Cors cors = new Cors();
    private Upload upload = new Upload();
    private Nvidia nvidia = new Nvidia();
    private String googleSheetsWebhookUrl;
    private List<String> adminEmails = new ArrayList<>();

    public static class Payment {
        private String secret;
        private String merchantVpa = "pay@sangofiora";

        public String getSecret() { return secret; }
        public void setSecret(String secret) { this.secret = secret; }
        public String getMerchantVpa() { return merchantVpa; }
        public void setMerchantVpa(String merchantVpa) { this.merchantVpa = merchantVpa; }
    }

    public static class Stripe {
        private String secretKey = "";
        private String publishableKey = "";
        private String webhookSecret = "";

        public String getSecretKey() { return secretKey; }
        public void setSecretKey(String secretKey) { this.secretKey = secretKey; }
        public String getPublishableKey() { return publishableKey; }
        public void setPublishableKey(String publishableKey) { this.publishableKey = publishableKey; }
        public String getWebhookSecret() { return webhookSecret; }
        public void setWebhookSecret(String webhookSecret) { this.webhookSecret = webhookSecret; }
    }

    public static class Jwt {
        private String issuer = "https://hyecifzfswwrhsyrrxmw.supabase.co/auth/v1";
        private String audience = "authenticated";
        private String secret = "";
        private String jwksUrl = "";

        public String getIssuer() { return issuer; }
        public void setIssuer(String issuer) { this.issuer = issuer; }
        public String getAudience() { return audience; }
        public void setAudience(String audience) { this.audience = audience; }
        public String getSecret() { return secret; }
        public void setSecret(String secret) { this.secret = secret; }
        public String getJwksUrl() { return jwksUrl; }
        public void setJwksUrl(String jwksUrl) { this.jwksUrl = jwksUrl; }
    }

    public static class Cors {
        private List<String> allowedOrigins = List.of(
                "https://sango-storefront-production.up.railway.app",
                "https://sangofiora.com",
                "https://www.sangofiora.com",
                "http://localhost:8080",
                "http://localhost:3000"
        );

        public List<String> getAllowedOrigins() { return allowedOrigins; }
        public void setAllowedOrigins(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }
    }

    public static class Upload {
        private String dir = "uploads/plants";
        private long maxFileSize = 15 * 1024 * 1024; // 15MB

        public String getDir() { return dir; }
        public void setDir(String dir) { this.dir = dir; }
        public long getMaxFileSize() { return maxFileSize; }
        public void setMaxFileSize(long maxFileSize) { this.maxFileSize = maxFileSize; }
    }

    public static class Nvidia {
        private String apiKey = "";
        private String model = "nvidia/nemotron-3.5-bolt-e4b";
        private String apiUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }
        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }
        public String getApiUrl() { return apiUrl; }
        public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    }

    public String paymentSecret() {
        if (payment != null && payment.getSecret() != null && !payment.getSecret().isBlank()) {
            return payment.getSecret();
        }
        return (paymentSecret != null && !paymentSecret.isBlank()) ? paymentSecret : "";
    }

    public String merchantVpa() {
        return (payment != null && payment.getMerchantVpa() != null && !payment.getMerchantVpa().isBlank())
                ? payment.getMerchantVpa()
                : "pay@sangofiora";
    }

    public List<String> adminEmails() {
        return adminEmails != null ? adminEmails : List.of();
    }

    public String getPaymentSecret() { return paymentSecret; }
    public void setPaymentSecret(String paymentSecret) { this.paymentSecret = paymentSecret; }

    public Payment getPayment() { return payment; }
    public void setPayment(Payment payment) { this.payment = payment; }

    public Stripe getStripe() { return stripe; }
    public void setStripe(Stripe stripe) { this.stripe = stripe; }

    public Jwt getJwt() { return jwt; }
    public void setJwt(Jwt jwt) { this.jwt = jwt; }

    public Cors getCors() { return cors; }
    public void setCors(Cors cors) { this.cors = cors; }

    public Upload getUpload() { return upload; }
    public void setUpload(Upload upload) { this.upload = upload; }

    public String getGoogleSheetsWebhookUrl() { return googleSheetsWebhookUrl; }
    public void setGoogleSheetsWebhookUrl(String googleSheetsWebhookUrl) { this.googleSheetsWebhookUrl = googleSheetsWebhookUrl; }

    public List<String> getAdminEmails() { return adminEmails; }
    public void setAdminEmails(List<String> adminEmails) { this.adminEmails = adminEmails; }

    public Nvidia getNvidia() { return nvidia; }
    public void setNvidia(Nvidia nvidia) { this.nvidia = nvidia; }
}
