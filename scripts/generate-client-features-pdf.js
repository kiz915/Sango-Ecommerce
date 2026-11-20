const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Generating Client-Facing Features Catalog PDF (A to Z)...');

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sango Fiora — Complete Website Features & Capabilities Guide (A to Z)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600&family=JetBrains+Mono:wght@500;600&display=swap');

  @page {
    size: A4;
    margin: 16mm 14mm 18mm 14mm;
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #717A6D;
    }
    @bottom-left {
      content: "Sango Fiora — Client Feature Specification Guide";
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #717A6D;
    }
  }

  body {
    font-family: 'Inter', sans-serif;
    color: #1A1C1B;
    background: #FFFFFF;
    line-height: 1.5;
    font-size: 9pt;
  }

  h1, h2, h3, h4 {
    font-family: 'Playfair Display', serif;
    color: #1B4332;
    page-break-after: avoid;
  }

  h1 {
    font-size: 24pt;
    line-height: 1.15;
    margin: 0 0 8px 0;
    letter-spacing: -0.5px;
  }

  h2 {
    font-size: 13.5pt;
    border-bottom: 1.5px solid #1B4332;
    padding-bottom: 4px;
    margin-top: 20px;
    margin-bottom: 10px;
    color: #1B4332;
    display: flex;
    align-items: center;
  }

  h3 {
    font-size: 10.5pt;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    color: #2D6A4F;
    margin-top: 10px;
    margin-bottom: 3px;
  }

  p { margin: 4px 0 8px 0; color: #2B2D2B; }
  ul { margin: 4px 0 10px 0; padding-left: 18px; }
  li { margin-bottom: 3px; color: #333; }

  .hero-banner {
    background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 60%, #40916C 100%);
    color: #FFFFFF;
    padding: 22px 24px;
    border-radius: 10px;
    margin-bottom: 18px;
  }

  .hero-banner h1 {
    color: #FFFFFF;
    font-size: 22pt;
    margin-bottom: 6px;
  }

  .hero-tagline {
    font-size: 11pt;
    color: #D8F3DC;
    font-style: italic;
    font-family: 'Playfair Display', serif;
    margin-bottom: 12px;
  }

  .hero-meta {
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    border-top: 1px solid rgba(255,255,255,0.25);
    padding-top: 10px;
    color: #E8F5E9;
  }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    font-size: 7.5pt;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-gold { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
  .badge-green { background: #E8F5E9; color: #1B4332; border: 1px solid #A5D6A7; }
  .badge-blue { background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; }

  .feature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 10px 0 14px 0;
  }

  .feature-card {
    background: #FAFBF9;
    border: 1px solid #E3E8E4;
    border-left: 3.5px solid #1B4332;
    padding: 10px 12px;
    border-radius: 6px;
    page-break-inside: avoid;
  }

  .feature-card.gold-border {
    border-left-color: #D97706;
  }

  .feature-card h4 {
    margin: 0 0 4px 0;
    font-family: 'Inter', sans-serif;
    font-size: 9.5pt;
    font-weight: 700;
    color: #1B4332;
  }

  .feature-card p {
    margin: 0;
    font-size: 8.5pt;
    color: #4A5568;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px 0;
    font-size: 8pt;
    page-break-inside: avoid;
  }

  th, td {
    padding: 6px 8px;
    border: 1px solid #E2E8F0;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #F1F5F2;
    color: #1B4332;
    font-weight: 700;
  }

  .page-break { page-break-before: always; }

  .highlight-box {
    background: #FEF9C3;
    border-left: 4px solid #CA8A04;
    padding: 8px 12px;
    border-radius: 4px;
    margin: 8px 0;
    font-size: 8.5pt;
  }
</style>
</head>
<body>

  <!-- HERO / COVER HEADER -->
  <div class="hero-banner">
    <div style="font-size: 8pt; text-transform: uppercase; letter-spacing: 2px; color: #F59E0B; font-weight: 700; margin-bottom: 4px;">Client Presentation Guide</div>
    <h1>Sango Fiora E-Commerce Platform</h1>
    <div class="hero-tagline">"Handcrafted Luxury Artificial Botanicals for Discerning Homes & Commercial Spaces"</div>
    <div class="hero-meta">
      <div><strong>Live Website:</strong> https://sango-storefront-production.up.railway.app</div>
      <div><strong>Document Scope:</strong> Complete Website Features (A to Z)</div>
      <div><strong>Date:</strong> November 2026</div>
    </div>
  </div>

  <h2>1. Executive Platform Overview</h2>
  <p>
    <strong>Sango Fiora</strong> is an enterprise-grade luxury e-commerce platform designed specifically for premium artificial trees, statement palms, and architectural foliage across India. Built on a modern decoupled architecture, it combines the lightning-fast page delivery of a static pre-rendered storefront with real-time database reactivity, server-verified payments, and live logistics tracking.
  </p>

  <div class="feature-grid">
    <div class="feature-card">
      <h4>⚡ Sub-Second Speed & 100% Uptime</h4>
      <p>Eleventy v3 pre-renders all 76+ botanical product pages into static HTML with Brotli compression, ensuring instant zero-delay loading even on slow 4G/3G mobile networks.</p>
    </div>
    <div class="feature-card gold-border">
      <h4>🛡️ Enterprise Security & Data Isolation</h4>
      <p>Spring Boot 3 backend with JWT signature verification, pessimistic locking against double-orders, and strict role-based access control protecting customer data.</p>
    </div>
    <div class="feature-card gold-border">
      <h4>💳 Dual-Gateway Payment Reliability</h4>
      <p>Server-verified Cash on Delivery (COD) plus instant online payments via Razorpay (UPI, Cards, NetBanking) and Stripe with cryptographic HMAC-SHA256 webhooks.</p>
    </div>
    <div class="feature-card">
      <h4>🌿 Botanical Realism Guarantee</h4>
      <p>Studio-quality transparent WebP cutouts at 600x600 resolution under 60 KB, generated from genuine inventory photos showing real leaf counts and pots.</p>
    </div>
  </div>

  <h2>2. Storefront Experience & Visual Merchandising (A to Z)</h2>

  <h3>A. 3D Product Orbit Carousel & Interactive Showcase</h3>
  <ul>
    <li><strong>Interactive Plant Orbit:</strong> Customers can rotate between flagship statement trees (Fiddle Leaf Fig, Fan Palm, Areca Palm, Monstera, Rose Plants) using fluid GSAP 3D orbit mechanics.</li>
    <li><strong>Organic Idle Sway:</strong> Subtle natural wind sway animation (+/-2.5° sine curve, anchored to the pot base) brings artificial plants to life.</li>
    <li><strong>Pointer Parallax:</strong> Smooth mouse and gyro parallax responsive to desktop cursor position or mobile phone tilt.</li>
    <li><strong>Real-Time Specs Card:</strong> Instantly displays live botanical height (e.g. 180cm), collection name, customer rating, price, and pot inclusion status.</li>
  </ul>

  <h3>B. Comprehensive Botanical Catalogue & Categorization</h3>
  <ul>
    <li><strong>4 Curated Collections:</strong>
      <ul>
        <li><strong>Foliage Collection (26 varieties):</strong> Calatheas, Philodendrons, Agaves, and Elephant Ears.</li>
        <li><strong>Palms Collection (13 varieties):</strong> Statement Fan Palms, Paradise Palms, Sago Palms, and Resort Arecas.</li>
        <li><strong>Trees Collection (33 varieties):</strong> Giant Fiddle Leaf Figs, Benjamina Ficus, Olive Trees, Citrus, and Fruit Trees.</li>
        <li><strong>Flowering Collection (3 varieties):</strong> Hand-finished White and Yellow Rose botanical planters.</li>
      </ul>
    </li>
    <li><strong>Decorative Pot Included:</strong> Every product listing highlights pre-potted status with ceramic-look bases ready for display out of the box.</li>
  </ul>

  <div class="page-break"></div>

  <h2>3. Intelligent Shopping Bag, Pricing & Offers</h2>

  <h3>C. Volume Discount Engine (Automatic Bulk Styling Discounts)</h3>
  <p>The platform features an automated volume discount calculator that rewards customers styling multi-room homes or commercial spaces:</p>
  <table>
    <tr>
      <th>Order Threshold</th>
      <th>Discount Applied</th>
      <th>Client Value & Upsell Trigger</th>
    </tr>
    <tr>
      <td><strong>3 to 4 Items</strong></td>
      <td><span class="badge badge-green">5% Instant Discount</span></td>
      <td>Encourages multi-room botanical styling; auto-applied at checkout.</td>
    </tr>
    <tr>
      <td><strong>5+ Items</strong></td>
      <td><span class="badge badge-gold">10% Bulk Styling Discount</span></td>
      <td>Designed for villas, hospitality, corporate offices, and full-home renovations.</td>
    </tr>
    <tr>
      <td><strong>₹999+ Order Total</strong></td>
      <td><span class="badge badge-blue">Free Delivery Across India</span></td>
      <td>Interactive dynamic progress bar shows remaining amount required for free shipping.</td>
    </tr>
  </table>

  <h3>D. Transparent GST & Tax Breakdown</h3>
  <ul>
    <li><strong>Inclusive GST Display:</strong> All consumer prices include 18% GST with reverse tax calculation visible in the cart.</li>
    <li><strong>B2B GST Invoices:</strong> Automated printable tax invoice generation complete with GSTIN and tax bifurcation for business expense claims.</li>
  </ul>

  <h2>4. Frictionless Checkout & Order Logistics</h2>

  <h3>E. Automated India Post Pincode Lookup</h3>
  <ul>
    <li><strong>Instant City & State Detection:</strong> Entering a 6-digit Indian PIN code instantly verifies serviceability and auto-populates city and state without manual typing.</li>
    <li><strong>Dispatch Time Estimates:</strong> Real-time estimation of delivery dates (3–5 business days standard across metros and tier-1/2 cities).</li>
  </ul>

  <h3>F. Multi-Tier Payment Options</h3>
  <div class="feature-grid">
    <div class="feature-card">
      <h4>📦 Cash on Delivery (Server-Verified)</h4>
      <p>Allows customers to pay upon physical delivery and inspection. Backed by backend pessimistic concurrency locking to prevent fraudulent duplicate submissions.</p>
    </div>
    <div class="feature-card gold-border">
      <h4>⚡ Instant UPI & Card Payments</h4>
      <p>Direct integration with Razorpay supporting Google Pay, PhonePe, Paytm, all major Indian banks, and Visa/Mastercard/RuPay credit & debit cards.</p>
    </div>
  </div>

  <h3>G. Live 5-Stage Order Fulfillment Tracker</h3>
  <p>Customers can track their order in real time using their Order ID on <code>/track/</code> through 5 clear fulfillment checkpoints:</p>
  <ol>
    <li><strong>Order Placed & Confirmed:</strong> Receipt generated and inventory reserved.</li>
    <li><strong>Botanical Quality Inspection:</strong> Foliage, trunk texture, and pot stability checked by quality team.</li>
    <li><strong>Protective Packaging:</strong> Multi-layer shockproof boxing for foliage preservation during transit.</li>
    <li><strong>Out for Delivery:</strong> Dispatch handed over to courier partner with live tracking link.</li>
    <li><strong>Delivered & Styled:</strong> Order marked complete with doorstep delivery confirmation.</li>
  </ol>

  <div class="page-break"></div>

  <h2>5. Member Authentication & Account Management</h2>

  <h3>H. Passwordless Magic Link & Google 1-Click Login</h3>
  <ul>
    <li><strong>No Passwords to Remember:</strong> Customers enter their email address and receive an instant magic sign-in link in their inbox. Clicking the link authenticates them immediately.</li>
    <li><strong>1-Click Google OAuth:</strong> Instant sign-in using existing Google accounts with zero profile setup required.</li>
    <li><strong>Permanent Cross-Session Persistence:</strong> Users remain logged in permanently across page refreshes and browser restarts until they explicitly click <em>Sign Out</em>.</li>
    <li><strong>Multi-Device Cart & Wishlist Sync:</strong> Carts and wishlists are securely tied to the user profile and synchronized across smartphone, tablet, and desktop.</li>
  </ul>

  <h2>6. Business & B2B Commercial Inquiries</h2>

  <h3>I. Dedicated Commercial & Wholesale Concierge</h3>
  <ul>
    <li><strong>Commercial Enquiry Portal:</strong> Specialized inquiry forms for architects, interior decorators, luxury hotels, and corporate campuses on <code>/contact/</code>.</li>
    <li><strong>Instant WhatsApp Concierge:</strong> Floating 1-click WhatsApp button connects clients directly with Sango Fiora botanical specialists for custom plant styling recommendations.</li>
    <li><strong>Automated Inquiry Ticketing:</strong> All inquiries generate a reference ticket ID and sync directly to Google Sheets and backend database.</li>
  </ul>

  <h2>7. Complete Administrator Control Center (<code>/admin/</code>)</h2>

  <p>A secure single-page management dashboard accessible only to authorized administrators (<code>kishorevk40@gmail.com</code> and <code>shamnaraja07@gmail.com</code>):</p>

  <table>
    <tr>
      <th>Admin Module</th>
      <th>Key Features & Administrative Powers</th>
    </tr>
    <tr>
      <td><strong>Live Inventory & Pricing</strong></td>
      <td>1-click price updates, dimension editing, image changes, and instant "Sold Out" status toggling that immediately reflects on the live storefront.</td>
    </tr>
    <tr>
      <td><strong>Order Fulfillment Pipeline</strong></td>
      <td>View incoming orders, inspect customer shipping details, update delivery stages (1–5), and add tracking numbers.</td>
    </tr>
    <tr>
      <td><strong>Promotions & Coupons</strong></td>
      <td>Create promotional discount codes (percentage or flat amount), set minimum order values, and schedule expiration dates.</td>
    </tr>
    <tr>
      <td><strong>Financial Analytics</strong></td>
      <td>Real-time store metrics including gross revenue, active order counts, sold-out item monitoring, and inventory valuation.</td>
    </tr>
  </table>

  <h2>8. Search Engine Optimization (SEO) & Marketing Ready</h2>
  <ul>
    <li><strong>Google Rich Snippets (Schema.org):</strong> Built-in JSON-LD schemas for <code>Product</code>, <code>Organization</code>, <code>WebSite</code>, and <code>Store</code> ensure product prices, star ratings, and stock status appear directly in Google search results.</li>
    <li><strong>Automated Image Sitemap:</strong> Comprehensive XML sitemap indexing all 76+ products with high-resolution image links for maximum Google Images visibility.</li>
    <li><strong>Social Sharing Cards:</strong> OpenGraph and Twitter cards formatted to render luxury preview thumbnails whenever links are shared on WhatsApp, Instagram, or Facebook.</li>
  </ul>

</body>
</html>
  `;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const pdfPath = path.resolve('SANGO_FIORA_CLIENT_FEATURES_A_TO_Z.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    }
  });

  await browser.close();
  console.log('Client Features PDF created successfully at:', pdfPath);
})();
