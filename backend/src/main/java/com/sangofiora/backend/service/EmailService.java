package com.sangofiora.backend.service;

import com.resend.Resend;
import com.resend.core.exception.ResendException;
import com.resend.services.emails.model.CreateEmailOptions;
import com.resend.services.emails.model.CreateEmailResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
@Slf4j
public class EmailService {

    private final Resend resend;

    @Value("${app.resend.from-email:orders@sangofiora.com}")
    private String fromEmail;

    @Value("${app.resend.from-name:Sango Fiora}")
    private String fromName;

    @Value("${app.frontend.url:https://sango-storefront-production.up.railway.app}")
    private String frontendUrl;

    public EmailService(@Value("${app.resend.api-key:}") String apiKey) {
        if (apiKey != null && !apiKey.isBlank()) {
            this.resend = new Resend(apiKey);
        } else {
            this.resend = null;
        }
    }

    /**
     * Send order confirmation email
     */
    public CompletableFuture<Void> sendOrderConfirmation(
            String customerEmail,
            String customerName,
            String orderId,
            List<Map<String, Object>> items,
            Integer netTotal) {

        return CompletableFuture.runAsync(() -> {
            try {
                String itemsHtml = buildItemsHtml(items);
                String html = buildEmailTemplate(
                    "Order Confirmed 🌿",
                    "Hi " + customerName + ",",
                    "Your order <strong>" + orderId + "</strong> has been confirmed and is being processed.",
                    itemsHtml,
                    "Total: <strong>₹" + String.format("%,.2f", netTotal / 100.0) + "</strong>",
                    frontendUrl + "/track/?orderId=" + orderId,
                    "Track Your Order"
                );

                sendEmail(customerEmail, "🌿 Order Confirmed: " + orderId, html);
                log.info("Order confirmation email sent to {} for order {}", customerEmail, orderId);
            } catch (Exception e) {
                log.error("Failed to send order confirmation email for order {}", orderId, e);
            }
        });
    }

    /**
     * Send shipping update email
     */
    public CompletableFuture<Void> sendShippingUpdate(
            String customerEmail,
            String customerName,
            String orderId,
            String trackingUrl) {

        return CompletableFuture.runAsync(() -> {
            try {
                String html = buildEmailTemplate(
                    "Your Order is On the Way! 📦",
                    "Hi " + customerName + ",",
                    "Great news! Your order <strong>" + orderId + "</strong> has been shipped and is on its way to you.",
                    "",
                    "You can track your delivery using the link below:",
                    trackingUrl,
                    "Track Delivery"
                );

                sendEmail(customerEmail, "📦 Shipped: " + orderId, html);
                log.info("Shipping update email sent to {} for order {}", customerEmail, orderId);
            } catch (Exception e) {
                log.error("Failed to send shipping update email for order {}", orderId, e);
            }
        });
    }

    /**
     * Send abandoned cart recovery email
     */
    public CompletableFuture<Void> sendAbandonedCart(
            String customerEmail,
            List<Map<String, Object>> items) {

        return CompletableFuture.runAsync(() -> {
            try {
                String itemsHtml = buildItemsHtml(items);
                String html = buildEmailTemplate(
                    "Your Botanical Picks Are Waiting 🌿",
                    "Hi there,",
                    "You left some beautiful plants in your cart. They're still reserved for you!",
                    itemsHtml,
                    "Complete your order now before they're gone:",
                    frontendUrl + "/cart/",
                    "Complete My Order"
                );

                sendEmail(customerEmail, "🌿 Your Cart is Waiting", html);
                log.info("Abandoned cart email sent to {}", customerEmail);
            } catch (Exception e) {
                log.error("Failed to send abandoned cart email to {}", customerEmail, e);
            }
        });
    }

    /**
     * Send contact form confirmation
     */
    public CompletableFuture<Void> sendContactConfirmation(
            String customerEmail,
            String customerName,
            String ticketId) {

        return CompletableFuture.runAsync(() -> {
            try {
                String html = buildEmailTemplate(
                    "We Received Your Message ✉️",
                    "Hi " + customerName + ",",
                    "Thank you for contacting Sango Fiora. Your inquiry <strong>" + ticketId + "</strong> has been received and our plant experts will get back to you within 24 hours.",
                    "",
                    "If you have any urgent questions, feel free to WhatsApp us:",
                    "https://wa.me/918870889222",
                    "Chat on WhatsApp"
                );

                sendEmail(customerEmail, "✉️ Ticket " + ticketId + " Created", html);
                log.info("Contact confirmation email sent to {}", customerEmail);
            } catch (Exception e) {
                log.error("Failed to send contact confirmation email to {}", customerEmail, e);
            }
        });
    }

    private void sendEmail(String to, String subject, String html) {
        if (resend == null) {
            log.warn("Resend client not configured - skipping email to {}", to);
            return;
        }

        CreateEmailOptions options = CreateEmailOptions.builder()
                .from(fromName + " <" + fromEmail + ">")
                .to(to)
                .subject(subject)
                .html(html)
                .build();

        try {
            CreateEmailResponse response = resend.emails().send(options);
            log.debug("Email sent successfully to {}: {}", to, response.getId());
        } catch (ResendException e) {
            log.error("Resend API error sending email to {}: {}", to, e.getMessage());
            throw new RuntimeException("Failed to send email", e);
        }
    }

    private String buildItemsHtml(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("<table style=\"width:100%;border-collapse:collapse;margin:16px 0;\">");
        sb.append("<thead><tr style=\"border-bottom:1px solid #e9e8e6;\">");
        sb.append("<th style=\"padding:12px 0;text-align:left;color:#41493E;\">Item</th>");
        sb.append("<th style=\"padding:12px 0;text-align:right;color:#41493E;\">Qty</th>");
        sb.append("<th style=\"padding:12px 0;text-align:right;color:#41493E;\">Price</th>");
        sb.append("</tr></thead><tbody>");

        for (Map<String, Object> item : items) {
            String name = (String) item.getOrDefault("name", "Botanical Item");
            Integer qty = (Integer) item.getOrDefault("qty", 1);
            Integer price = (Integer) item.getOrDefault("price", 0);
            sb.append("<tr style=\"border-bottom:1px solid #e9e8e6;\">");
            sb.append("<td style=\"padding:12px 0;\">").append(name).append("</td>");
            sb.append("<td style=\"padding:12px 0;text-align:right;\">").append(qty).append("</td>");
            sb.append("<td style=\"padding:12px 0;text-align:right;color:#1B4332;\">₹")
              .append(String.format("%,.2f", (price * qty) / 100.0)).append("</td>");
            sb.append("</tr>");
        }

        sb.append("</tbody></table>");
        return sb.toString();
    }

    private String buildEmailTemplate(
            String title,
            String greeting,
            String message,
            String itemsHtml,
            String ctaText,
            String ctaUrl,
            String ctaLabel) {

        return "<!DOCTYPE html>" +
                "<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"></head>" +
                "<body style=\"margin:0;padding:0;background:#faf9f7;font-family:Inter,sans-serif;\">" +
                "<table role=\"presentation\" width=\"100%\" style=\"max-width:600px;margin:0 auto;padding:20px;\">" +
                "<tr><td style=\"background:#fff;border-radius:16px;padding:32px;\">" +
                "<!-- Header -->" +
                "<tr><td style=\"text-align:center;padding-bottom:24px;border-bottom:1px solid #e9e8e6;\">" +
                "<img src=\"" + frontendUrl + "/images/logo.png\" alt=\"Sango Fiora\" width=\"120\" style=\"display:block;margin:0 auto 16px;\">" +
                "<h1 style=\"margin:0;font-family:'Playfair Display',serif;color:#1B4332;font-size:28px;\">" + title + "</h1>" +
                "</td></tr>" +
                "<!-- Content -->" +
                "<tr><td style=\"padding:24px 0;\">" +
                "<p style=\"font-size:16px;color:#1A1C1B;\">" + greeting + "</p>" +
                "<p style=\"font-size:16px;color:#1A1C1B;\">" + message + "</p>" +
                itemsHtml +
                "<p style=\"font-size:16px;color:#1A1C1B;\">" + ctaText + "</p>" +
                "</td></tr>" +
                "<!-- CTA -->" +
                "<tr><td style=\"text-align:center;padding-top:16px;\">" +
                "<a href=\"" + ctaUrl + "\" style=\"background:#1B4332;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;\">" + ctaLabel + "</a>" +
                "</td></tr>" +
                "<!-- Footer -->" +
                "<tr><td style=\"padding-top:24px;border-top:1px solid #e9e8e6;text-align:center;\">" +
                "<p style=\"font-size:12px;color:#717A6D;margin:0;\">Sango Fiora • Premium Artificial Plants & Trees</p>" +
                "<p style=\"font-size:12px;color:#717A6D;margin:8px 0 0;\">Salem, Tamil Nadu • <a href=\"" + frontendUrl + "\" style=\"color:#1B4332;\">sangofiora.com</a></p>" +
                "</td></tr>" +
                "</td></tr></table></body></html>";
    }
}