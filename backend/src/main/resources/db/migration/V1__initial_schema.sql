-- ============================================================
-- Sango Fiora — Initial Database Schema (Flyway Migration V1)
-- Adapted from Supabase schema for standalone PostgreSQL
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PRODUCTS TABLE
-- ============================================================
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  variant TEXT DEFAULT '',
  category TEXT NOT NULL,
  size TEXT NOT NULL,
  pot_included BOOLEAN DEFAULT true,
  price INTEGER NOT NULL,
  mrp INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  rating NUMERIC(2,1) DEFAULT 4.5,
  reviews INTEGER DEFAULT 0,
  image TEXT NOT NULL,
  description TEXT,
  stock INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  is_sold_out BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. USER PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY, -- References Supabase auth.users(id) or local user ID
  full_name TEXT,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. ORDERS TABLE
-- ============================================================
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES profiles(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  shipping_address TEXT NOT NULL,
  landmark TEXT,
  pincode TEXT NOT NULL,
  city TEXT,
  state TEXT,
  gstin TEXT,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  payment_status TEXT DEFAULT 'Pending',
  txn_id TEXT,
  subtotal INTEGER DEFAULT 0,
  mrp_total INTEGER DEFAULT 0,
  mrp_savings INTEGER DEFAULT 0,
  coupon_code TEXT,
  coupon_discount INTEGER DEFAULT 0,
  delivery_fee INTEGER DEFAULT 0,
  gst_amount INTEGER DEFAULT 0,
  net_total INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'Order Placed',
  status_step INTEGER DEFAULT 1,
  est_delivery_date TEXT,
  tracking_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. ORDER LINE ITEMS
-- ============================================================
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_slug TEXT,
  product_image TEXT,
  product_variant TEXT DEFAULT '',
  product_category TEXT DEFAULT '',
  size TEXT,
  price INTEGER NOT NULL,
  mrp INTEGER DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. COUPONS TABLE
-- ============================================================
CREATE TABLE coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER NOT NULL CHECK (percent > 0 AND percent <= 100),
  label TEXT NOT NULL,
  min_subtotal INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  usage_limit INTEGER DEFAULT NULL,
  times_used INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. ANALYTICS EVENTS
-- ============================================================
CREATE TABLE analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  product_slug TEXT,
  user_id UUID,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. CART (for logged-in user sync)
-- ============================================================
CREATE TABLE user_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  items JSONB DEFAULT '[]',
  coupon_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. WISHLIST (for logged-in user sync)
-- ============================================================
CREATE TABLE user_wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  items JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_profiles_email ON profiles(email);

-- ============================================================
-- AUTO-UPDATE TRIGGER (updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_carts_updated_at BEFORE UPDATE ON user_carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_wishlists_updated_at BEFORE UPDATE ON user_wishlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DEFAULT COUPONS
-- ============================================================
INSERT INTO coupons (code, percent, label, min_subtotal, is_active) VALUES
  ('WELCOME10', 10, '10% New Member Discount', 0, true),
  ('PLANTLOVE15', 15, '15% Plant Lover Discount', 0, true),
  ('BULK20', 20, '20% Bulk Order Discount', 5000, true),
  ('SANGO10', 10, '10% Welcome Discount', 0, true)
ON CONFLICT (code) DO NOTHING;