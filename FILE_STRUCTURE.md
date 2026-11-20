# 🌿 Sango Fiora — Project File Structure

```text
Sango-Ecommerce/
│
├── .github/
│   └── workflows/
│       └── ci.yml                     # Continuous integration (Node 11ty build + Maven test suite)
│
├── _data/                             # Eleventy global data files
│   ├── plants.json                    # Botanical catalogue dataset (76 varieties)
│   └── site.json                      # Site metadata and configuration
│
├── admin/                             # Admin Single Page Application
│   └── index.html                     # Live Admin Panel (Catalog, Orders, Inventory, Coupons)
│
├── backend/                           # Spring Boot 3 Java Microservice
│   ├── mvnw                           # Maven wrapper script (Unix)
│   ├── mvnw.cmd                       # Maven wrapper script (Windows)
│   ├── pom.xml                        # Maven dependencies & build configuration
│   └── src/
│       ├── main/
│       │   ├── java/com/sangofiora/backend/
│       │   │   ├── config/            # Security, AppProperties, Exception Handlers, Filters
│       │   │   │   ├── AppProperties.java
│       │   │   │   ├── GlobalExceptionHandler.java
│       │   │   │   ├── JwtAuthFilter.java
│       │   │   │   ├── RequestLoggingFilter.java
│       │   │   │   └── SecurityConfig.java
│       │   │   ├── controller/        # REST Endpoints (Products, Orders, Payments, Cart, Admin)
│       │   │   │   ├── AdminController.java
│       │   │   │   ├── CartController.java
│       │   │   │   ├── CouponController.java
│       │   │   │   ├── OrderController.java
│       │   │   │   ├── PaymentController.java
│       │   │   │   └── ProductController.java
│       │   │   ├── dto/               # Request / Response Data Transfer Objects
│       │   │   │   └── CodConfirmRequest.java
│       │   │   ├── model/             # JPA Entities (Product, Order, OrderItem, Coupon, Cart)
│       │   │   │   ├── Cart.java
│       │   │   │   ├── CartItem.java
│       │   │   │   ├── Coupon.java
│       │   │   │   ├── Order.java
│       │   │   │   ├── OrderItem.java
│       │   │   │   └── Product.java
│       │   │   ├── repository/        # Spring Data JPA Repositories (Pessimistic write locks)
│       │   │   │   ├── CartRepository.java
│       │   │   │   ├── CouponRepository.java
│       │   │   │   ├── OrderRepository.java
│       │   │   │   └── ProductRepository.java
│       │   │   ├── service/           # Business logic & 3P integrations (Razorpay, Stripe, Sheets)
│       │   │   │   ├── CouponService.java
│       │   │   │   ├── DataInitializer.java
│       │   │   │   ├── OrderService.java
│       │   │   │   ├── PaymentService.java
│       │   │   │   ├── ProductService.java
│       │   │   │   └── SpreadsheetService.java
│       │   │   └── SangofioraBackendApplication.java
│       │   └── resources/
│       │       ├── application.properties # Dynamic configuration (H2 dev / PostgreSQL prod)
│       │       └── data/plants.json
│       └── test/java/com/sangofiora/backend/ # JUnit 5 Integration Test Suite
│           ├── CouponServiceTest.java
│           ├── OrderServiceTest.java
│           ├── PaymentServiceTest.java
│           ├── ProductServiceTest.java
│           └── SangofioraBackendApplicationTests.java
│
├── content/                           # Eleventy content views & category hubs
│   ├── all-products.html              # Full botanical catalogue view
│   ├── collections-pages.html         # Dynamic category template (Foliage, Palms, Trees, Flowering)
│   └── collections.html               # Collections hub landing page
│
├── css/                               # Compiled Tailwind stylesheet
│   └── main.css                       # Minified production CSS
│
├── js/                                # Modular client-side browser engines
│   ├── admin.js                       # Admin dashboard dynamic CRUD & metrics
│   ├── api-client.js                  # Unified SangoAPI client abstraction
│   ├── cart.js                        # Cart engine with v3 storage & Supabase sync
│   ├── catalog.js                     # Live search, category filtering & sorting
│   ├── checkout.js                    # Step-by-step checkout wizard & order placement
│   ├── discount-engine.js             # Consolidated coupon and tier discount math
│   ├── inquiry.js                     # Commercial & wholesale contact forms
│   ├── mobile-menu.js                 # Responsive navigation drawer
│   ├── orders-tracker.js              # 5-stage live order fulfillment tracker
│   ├── pincode-lookup.js              # India Post pin code lookup & validation
│   ├── product-orbit-carousel.js      # Interactive 3D product showcase carousel
│   ├── supabase-auth.js               # Magic link & Google OAuth with session persistence
│   ├── supabase-client.js             # Supabase client singleton
│   └── wishlist.js                    # Wishlist persistence & Supabase sync
│
├── layouts/                           # Eleventy Nunjucks master layouts
│   ├── base.html                      # Root HTML shell with asset hashing & global headers
│   └── product-detail.html            # Botanical product detail page template
│
├── partials/                          # Reusable template components
│   ├── footer.html                    # Storefront footer & newsletter
│   ├── header.html                    # Responsive navigation bar & cart/wishlist counters
│   └── product-card.html              # Reusable responsive product card with add-to-cart
│
├── public/                            # Static public web assets
│   ├── favicon.ico
│   ├── favicon.svg
│   └── plants/                        # Optimized transparent botanical product WebPs
│
├── scripts/                           # Maintenance and database seeding scripts
│   ├── append-seed-sql.js
│   ├── audit-site.js
│   ├── build-data.js
│   ├── canonical-data.js
│   ├── check-links.js
│   ├── clean-cutouts.js
│   ├── extract-images.js
│   ├── optimize-images.js
│   ├── process-images.js
│   ├── process-logo.js
│   └── seed-products.js               # Supabase database seeder
│
├── src/                               # Frontend source assets
│   ├── css/main.css                   # Tailwind source definitions
│   └── images/                        # Product photos, collection cards & icons
│
├── .eleventy.js                       # Eleventy configuration (filters & asset hashing)
├── .env.example                       # Reference environment variables for deployments
├── .gitignore                         # Strict exclusion rules for clean git history
├── 404.html                           # Custom 404 Not Found page
├── about.html                         # Brand story & craftsmanship page
├── account.html                       # Customer profile & past orders view
├── cart.html                          # Shopping bag view
├── checkout.html                      # Checkout page
├── contact.html                       # Contact & B2B inquiry page
├── index.html                         # Storefront homepage & hero carousel
├── order-success.html                 # Post-purchase confirmation & receipt
├── package.json                       # Node dependencies & NPM build commands
├── payment.html                       # Payment gateway & server-verified COD screen
├── products.html                      # Individual product pages generator
├── README.md                          # Documentation and developer instructions
├── server.js                          # Production Node server (Brotli/Gzip, CSP headers)
├── supabase-schema.sql                # Complete PostgreSQL schema (RLS, orders, inventory)
├── tailwind.config.js                 # Tailwind design system configuration
└── track.html                         # Order tracking lookup page
```
