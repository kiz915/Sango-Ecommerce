# 🌿 Sango Fiora — Luxury Artificial Plants & Trees E-Commerce Platform

[![Eleventy](https://img.shields.io/badge/Static%20Generator-Eleventy%20v3-111111?style=for-the-badge&logo=eleventy)](https://www.11ty.dev/)
[![Spring Boot](https://img.shields.io/badge/Backend-Spring%20Boot%203-6DB33F?style=for-the-badge&logo=springboot)](https://spring.io/projects/spring-boot)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Styling-TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)
[![Railway](https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway)](https://railway.com)

Sango Fiora is an enterprise-ready, high-performance E-Commerce platform for premium handcrafted artificial plants, statement trees, resort palms, and luxury botanical foliage delivered across India. 

Built with a **Decoupled Architecture**: Eleventy (11ty v3) powers lightning-fast, SEO-optimized static storefront delivery with Brotli/Gzip compression and asset hashing, backed by a robust **Spring Boot 3 REST API** and **Supabase PostgreSQL** for real-time inventory management, JWT-verified role-based security, server-verified payments, and automated fulfillment.

---

## ✨ Key Features

### 🛍️ Storefront & User Experience
* **76+ Botanical Varieties**: Curated collections (*Foliage*, *Palms*, *Trees*, *Flowering Plants*) with decorative pots.
* **Smart Catalog & Inventory Engine**: Live inventory tracking with automatic sold-out guards and client-side discount engine (`DiscountEngine`).
* **Supabase JWT Authentication**: Magic link email authentication and 1-click Google OAuth 2.0 with persistent cross-session state.
* **Isolated User Carts & Wishlists**: Multi-tier cart synchronization (`user_carts` on Supabase + backend `/api/cart/sync` + local v3 storage).
* **Automated Pincode Lookup**: Instant Indian pin code verification (`PincodeLookup`) with state and city auto-detection.
* **Real-time Order Tracking**: 5-step interactive fulfillment pipeline (Order Placed → Quality Inspection → Packed → Out for Delivery → Delivered).
* **Printable GST Invoices**: Automated printable tax invoice generation with GST breakdown.

### 🛡️ Production Security & Payments
* **Spring Security JWT Filter**: Backend validates Supabase JWT signatures (`JwtAuthFilter`), strictly enforcing `ROLE_ADMIN` on `/api/admin/**` endpoints.
* **Server-Verified COD**: Cash on Delivery requires server confirmation (`/api/payments/cod/confirm`) with pessimistic concurrency locking.
* **Webhook Signature Verification**: Cryptographic HMAC-SHA256 signature verification for payment webhooks.
* **Hardened Headers & CSP**: Built-in Content Security Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy via production server.

### 🛠️ Admin Dashboard (`/admin/`)
* **Product Catalog CRUD**: Add botanical varieties, update pricing, stock status, and dimensions live.
* **Fulfillment Pipeline**: Track and update dispatch checkpoints with tracking IDs and customer notifications.
* **Coupon & Promotions Engine**: Dynamic discount codes with expiration and minimum order value validation.
* **Store Analytics**: Key financial metrics, active inventory valuation, and dispatch velocity.

---

## 🛠️ Tech Stack & Architecture

* **Frontend**: HTML5, Vanilla JavaScript (ES6+), TailwindCSS, Brotli-compressed static assets.
* **Site Generator**: Eleventy (11ty v3) with automated content-based asset hashing (`assetHash`).
* **Backend API**: Java 17, Spring Boot 3, Spring Data JPA, Spring Security, Nimbus JOSE JWT.
* **Database**: Dual-mode architecture:
  * **Development**: Zero-config in-memory H2 database (`jdbc:h2:mem:sangofiora`).
  * **Production**: Managed Supabase PostgreSQL with connection pooling.
* **CI/CD & Hosting**: GitHub Actions CI workflow + Railway Cloud Deployment.

---

## 📁 Repository Structure

```text
├── admin/                 # Standalone Admin Dashboard Single Page App
├── backend/               # Spring Boot 3 Java Backend
│   ├── src/main/java/     # Controllers, Models, Services, Security Filters
│   ├── src/main/resources/# application.properties, schema
│   ├── src/test/java/     # JUnit 5 integration test suite
│   ├── pom.xml            # Maven configuration & dependencies
│   └── mvnw               # Maven wrapper
├── _data/                 # Canonical product data & statistics
├── content/               # Storefront pages (Shop All, Collections, Search)
├── layouts/               # Eleventy layouts with asset hashing
├── partials/              # Reusable UI components
├── js/                    # Application logic
│   ├── api-client.js      # Unified SangoAPI client abstraction
│   ├── discount-engine.js # Shared coupon and tier discount math
│   ├── pincode-lookup.js  # India Post pincode directory lookup
│   ├── cart.js            # Cart state management (v3 schema migration)
│   ├── admin.js           # Admin Dashboard CRUD engine
│   ├── checkout.js        # Checkout wizard & order submission
│   └── supabase-auth.js   # Magic link & Google OAuth handler
├── server.js              # Production static file server with Brotli & CSP
├── .env.example           # Reference environment variables
└── .github/workflows/ci.yml # Automated CI pipeline
```

---

## 🚀 Getting Started Locally

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Java JDK](https://adoptium.net/) (v17+)

### 1. Clone the Repository
```bash
git clone https://github.com/kiz915/Sango-Ecommerce.git
cd Sango-Ecommerce
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your development credentials:
```bash
cp .env.example .env
```

### 3. Run Frontend
```bash
npm install
npm run dev
```

### 4. Run Spring Boot Backend
In a separate terminal:
```bash
cd backend
./mvnw spring-boot:run
```
The backend starts on `http://localhost:8080` with in-memory H2 database enabled by default.

### 5. Run Backend Test Suite
```bash
cd backend
./mvnw test
```

---

## 🚢 Production Deployment (Railway)

1. Connect your repository to **Railway**.
2. Set up two services:
   - **Storefront (Node.js)**: Runs `npm run build && node server.js`.
   - **Backend API (Spring Boot)**: Runs `./mvnw clean package` and `java -jar target/*.jar`.
3. Configure the production environment variables from `.env.example` (including `SPRING_DATASOURCE_URL`, `SUPABASE_URL`, `ADMIN_EMAILS`, and `PAYMENT_SECRET`).

---

## 📄 License

Distributed under the ISC License. Designed & Developed for **Sango Fiora**.
