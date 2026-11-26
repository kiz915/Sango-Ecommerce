package com.sangofiora.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sangofiora.backend.config.AppProperties;
import com.sangofiora.backend.dto.ChatRequest;
import com.sangofiora.backend.dto.ChatResponse;
import com.sangofiora.backend.model.Coupon;
import com.sangofiora.backend.model.Order;
import com.sangofiora.backend.model.Product;
import com.sangofiora.backend.repository.CouponRepository;
import com.sangofiora.backend.repository.OrderRepository;
import com.sangofiora.backend.repository.ProductRepository;
import com.sangofiora.backend.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatService {

    private final AppProperties appProperties;
    private final ProductRepository productRepository;
    private final CouponRepository couponRepository;
    private final OrderRepository orderRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public List<String> getDynamicSuggestions(UserPrincipal principal) {
        List<String> suggestions = new ArrayList<>();

        List<String> categories = productRepository.findDistinctCategories();
        if (!categories.isEmpty()) {
            String topCat = categories.get(0);
            suggestions.add("Show me popular " + topCat + " under ₹5,000");
        } else {
            suggestions.add("What artificial plants do you have?");
        }

        boolean hasActiveCoupons = couponRepository.findAll().stream()
                .anyMatch(this::isCouponCurrentlyValid);
        if (hasActiveCoupons) {
            suggestions.add("Any active promo codes right now?");
        }

        if (principal != null) {
            suggestions.add("Where is my latest order?");
        } else {
            suggestions.add("How does delivery & tracking work?");
        }

        suggestions.add("Help me choose a plant for my living room");
        return suggestions;
    }

    public ChatResponse chat(ChatRequest request, UserPrincipal principal) {
        String userMessage = request.getMessage().trim();
        String apiKey = appProperties.getNvidia() != null ? appProperties.getNvidia().getApiKey() : "";
        String model = (appProperties.getNvidia() != null && appProperties.getNvidia().getModel() != null && !appProperties.getNvidia().getModel().isBlank())
                ? appProperties.getNvidia().getModel()
                : "nvidia/nemotron-3.5-bolt-e4b";
        String apiUrl = (appProperties.getNvidia() != null && appProperties.getNvidia().getApiUrl() != null && !appProperties.getNvidia().getApiUrl().isBlank())
                ? appProperties.getNvidia().getApiUrl()
                : "https://integrate.api.nvidia.com/v1/chat/completions";

        List<String> suggestions = getDynamicSuggestions(principal);

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("NVIDIA API key not configured; returning dynamic store summary fallback.");
            return ChatResponse.builder()
                    .reply(buildDynamicFallbackReply(userMessage, principal))
                    .model("fallback")
                    .suggestions(suggestions)
                    .aiPowered(false)
                    .build();
        }

        try {
            String systemPrompt = buildDynamicSystemPrompt(userMessage, principal);
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("model", model);
            payload.put("temperature", 0.35);
            payload.put("max_tokens", 420);

            ArrayNode messages = payload.putArray("messages");
            ObjectNode sysMsg = messages.addObject();
            sysMsg.put("role", "system");
            sysMsg.put("content", systemPrompt);

            if (request.getHistory() != null) {
                int start = Math.max(0, request.getHistory().size() - 6);
                for (int i = start; i < request.getHistory().size(); i++) {
                    ChatRequest.ChatMessageTurn turn = request.getHistory().get(i);
                    if (turn == null || turn.getContent() == null || turn.getContent().isBlank()) continue;
                    String role = "assistant".equalsIgnoreCase(turn.getRole()) ? "assistant" : "user";
                    ObjectNode histMsg = messages.addObject();
                    histMsg.put("role", role);
                    histMsg.put("content", turn.getContent().trim());
                }
            }

            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", userMessage);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl))
                    .timeout(Duration.ofSeconds(25))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode choice = root.path("choices").isArray() && !root.path("choices").isEmpty()
                        ? root.path("choices").get(0)
                        : null;
                if (choice != null) {
                    String content = choice.path("message").path("content").asText("");
                    if (!content.isBlank()) {
                        return ChatResponse.builder()
                                .reply(content.trim())
                                .model(model)
                                .suggestions(suggestions)
                                .aiPowered(true)
                                .build();
                    }
                }
            } else {
                log.warn("NVIDIA NIM API returned status {}: {}", response.statusCode(), response.body());
            }
        } catch (Exception ex) {
            log.error("Error calling NVIDIA NIM API", ex);
        }

        return ChatResponse.builder()
                .reply(buildDynamicFallbackReply(userMessage, principal))
                .model(model)
                .suggestions(suggestions)
                .aiPowered(false)
                .build();
    }

    private String buildDynamicSystemPrompt(String userMessage, UserPrincipal principal) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are Flora, the Sango Fiora botanical shopping & support assistant. ")
          .append("Be concise, warm, accurate, and helpful (2-5 sentences unless listing products). ")
          .append("ONLY state products, prices, categories, coupons, and order statuses that appear in the live database context below. Never invent products, promo codes, or delivery dates.\n\n");

        sb.append("STORE POLICIES & ROUTES:\n")
          .append("- Delivery: Free delivery on orders ₹999 and above; ₹99 delivery below ₹999.\n")
          .append("- Useful pages: Collection (/products/), Categories (/collections/), Cart (/cart/), Checkout (/checkout/), Wishlist (/wishlist/), Order Tracking (/track/), Contact (/contact/).\n\n");

        // Dynamic categories & matching/featured products from DB
        List<String> categories = productRepository.findDistinctCategories();
        sb.append("LIVE CATEGORIES: ").append(String.join(", ", categories)).append("\n");

        List<Product> matchedProducts = findRelevantProducts(userMessage);
        sb.append("LIVE PRODUCTS FROM DATABASE (prices in INR ₹):\n");
        for (Product p : matchedProducts) {
            String stockNote = Boolean.TRUE.equals(p.getIsSoldOut()) || p.getStock() <= 0
                    ? "Out of stock"
                    : (p.getStock() <= 5 ? "Low stock (" + p.getStock() + " left)" : "In stock");
            sb.append("- ").append(p.getName())
              .append(" | Category: ").append(p.getCategory())
              .append(" | Price: ₹").append(p.getPrice())
              .append(" (MRP ₹").append(p.getMrp()).append(")")
              .append(" | ").append(stockNote)
              .append(" | Link: /product-live/?slug=").append(p.getSlug())
              .append("\n");
        }
        sb.append("\n");

        // Dynamic active coupons from DB
        List<Coupon> activeCoupons = couponRepository.findAll().stream()
                .filter(this::isCouponCurrentlyValid)
                .toList();
        sb.append("LIVE ACTIVE PROMO CODES:\n");
        if (activeCoupons.isEmpty()) {
            sb.append("- No active promo codes right now.\n");
        } else {
            for (Coupon c : activeCoupons) {
                sb.append("- ").append(c.getCode())
                  .append(": ").append(c.getPercent()).append("% off")
                  .append(" (").append(c.getLabel()).append(")")
                  .append(c.getMinSubtotal() != null && c.getMinSubtotal() > 0 ? ", min order ₹" + c.getMinSubtotal() : "")
                  .append(Boolean.TRUE.equals(c.getFirstTimeOnly()) ? ", first-time customers only" : "")
                  .append("\n");
            }
        }
        sb.append("\n");

        // Authenticated customer order context (strictly scoped to current user)
        if (principal != null) {
            List<Order> userOrders = getOrdersForPrincipal(principal);
            sb.append("CURRENT SIGNED-IN CUSTOMER: ").append(principal.getEmail() != null ? principal.getEmail() : "Member").append("\n");
            if (userOrders.isEmpty()) {
                sb.append("CUSTOMER ORDERS: No orders placed yet.\n");
            } else {
                sb.append("CUSTOMER RECENT ORDERS:\n");
                userOrders.stream().limit(5).forEach(o -> sb.append("- Order ").append(o.getOrderId())
                        .append(" | Status: ").append(o.getStatus())
                        .append(" | Total: ₹").append(o.getNetTotal())
                        .append(" | Payment: ").append(o.getPaymentMethod())
                        .append(" (").append(o.getPaymentStatus()).append(")")
                        .append(o.getEstDeliveryDate() != null ? " | Est: " + o.getEstDeliveryDate() : "")
                        .append("\n"));
            }
        } else {
            sb.append("CURRENT USER: Guest (not signed in). If they ask about personal orders, politely tell them to sign in or visit /track/ with their Order ID.\n");
        }

        return sb.toString();
    }

    private List<Product> findRelevantProducts(String userMessage) {
        String lower = userMessage.toLowerCase(Locale.ROOT);
        List<Product> allActive = productRepository.findByIsActiveTrue();
        if (allActive.isEmpty()) return List.of();

        String[] tokens = lower.replaceAll("[^a-z0-9\\s]", " ").split("\\s+");
        List<Product> scored = allActive.stream()
                .sorted(Comparator.comparingInt((Product p) -> scoreProductMatch(p, tokens)).reversed()
                        .thenComparing(Product::getPrice))
                .limit(18)
                .collect(Collectors.toList());
        return scored;
    }

    private int scoreProductMatch(Product p, String[] tokens) {
        int score = 0;
        String haystack = ((p.getName() != null ? p.getName() : "") + " "
                + (p.getCategory() != null ? p.getCategory() : "") + " "
                + (p.getDescription() != null ? p.getDescription() : "")).toLowerCase(Locale.ROOT);
        for (String t : tokens) {
            if (t.length() >= 3 && haystack.contains(t)) {
                score += 2;
            }
        }
        if (Boolean.FALSE.equals(p.getIsSoldOut()) && p.getStock() != null && p.getStock() > 0) {
            score += 1;
        }
        return score;
    }

    private List<Order> getOrdersForPrincipal(UserPrincipal principal) {
        if (principal.getId() != null) {
            List<Order> byId = orderRepository.findByUserIdOrderByCreatedAtDesc(principal.getId());
            if (!byId.isEmpty()) return byId;
        }
        if (principal.getEmail() != null && !principal.getEmail().isBlank()) {
            return orderRepository.findByCustomerEmailIgnoreCaseOrderByCreatedAtDesc(principal.getEmail());
        }
        return List.of();
    }

    private boolean isCouponCurrentlyValid(Coupon c) {
        if (c == null || !Boolean.TRUE.equals(c.getIsActive())) return false;
        if (c.getExpiresAt() != null && c.getExpiresAt().isBefore(OffsetDateTime.now())) return false;
        if (c.getUsageLimit() != null && c.getTimesUsed() != null && c.getTimesUsed() >= c.getUsageLimit()) return false;
        return true;
    }

    private String buildDynamicFallbackReply(String userMessage, UserPrincipal principal) {
        List<Product> products = findRelevantProducts(userMessage);
        List<String> categories = productRepository.findDistinctCategories();
        StringBuilder sb = new StringBuilder();
        sb.append("Here is live info from Sango Fiora:\n");
        if (!categories.isEmpty()) {
            sb.append("• Categories: ").append(String.join(", ", categories)).append("\n");
        }
        if (!products.isEmpty()) {
            sb.append("• Matching plants: ");
            sb.append(products.stream().limit(3)
                    .map(p -> p.getName() + " (₹" + p.getPrice() + ")")
                    .collect(Collectors.joining(", ")));
            sb.append("\n");
        }
        if (principal != null) {
            List<Order> orders = getOrdersForPrincipal(principal);
            if (!orders.isEmpty()) {
                Order latest = orders.get(0);
                sb.append("• Your latest order ").append(latest.getOrderId()).append(" is currently ").append(latest.getStatus()).append(".\n");
            }
        }
        sb.append("You can browse all plants at /products/ or track orders at /track/.");
        return sb.toString();
    }
}
