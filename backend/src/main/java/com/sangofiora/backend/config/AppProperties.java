package com.sangofiora.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String paymentSecret = "sango_botanical_sec_9941a8dbf2e4c19a";
    private Payment payment = new Payment();
    private Stripe stripe = new Stripe();
    private String googleSheetsWebhookUrl;
    private List<String> adminEmails = new ArrayList<>();

    public static class Payment {
        private String secret = "sango_botanical_sec_9941a8dbf2e4c19a";
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

    public String paymentSecret() {
        if (payment != null && payment.getSecret() != null && !payment.getSecret().isBlank()) {
            return payment.getSecret();
        }
        return (paymentSecret != null && !paymentSecret.isBlank()) ? paymentSecret : "sango_botanical_sec_9941a8dbf2e4c19a";
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

    public String getGoogleSheetsWebhookUrl() { return googleSheetsWebhookUrl; }
    public void setGoogleSheetsWebhookUrl(String googleSheetsWebhookUrl) { this.googleSheetsWebhookUrl = googleSheetsWebhookUrl; }

    public List<String> getAdminEmails() { return adminEmails; }
    public void setAdminEmails(List<String> adminEmails) { this.adminEmails = adminEmails; }
}
