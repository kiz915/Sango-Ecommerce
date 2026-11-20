-- ============================================================
-- Sango Fiora — Supabase Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. PRODUCTS TABLE (replaces hardcoded plants.json)
CREATE TABLE IF NOT EXISTS products (
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

-- 2. USER PROFILES (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
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

-- 4. ORDER LINE ITEMS
CREATE TABLE IF NOT EXISTS order_items (
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

-- 5. COUPONS TABLE (replaces hardcoded coupons)
CREATE TABLE IF NOT EXISTS coupons (
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

-- 6. ANALYTICS EVENTS
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  product_slug TEXT,
  user_id UUID,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. CART (for logged-in user sync)
CREATE TABLE IF NOT EXISTS user_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  items JSONB DEFAULT '[]',
  coupon_code TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. WISHLIST (for logged-in user sync)
CREATE TABLE IF NOT EXISTS user_wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  items JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Helper function to check if current user is admin (SECURITY DEFINER bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (
      role = 'admin' OR 
      email IN ('kishorevk40@gmail.com', 'shamnaraja07@gmail.com')
    )
  ) OR (
    auth.jwt() ->> 'email' IN ('kishorevk40@gmail.com', 'shamnaraja07@gmail.com')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wishlists ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Public can read active products" ON products;
DROP POLICY IF EXISTS "Admins can do everything with products" ON products;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
DROP POLICY IF EXISTS "Admins can do everything with orders" ON orders;
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
DROP POLICY IF EXISTS "Users can insert own order items" ON order_items;
DROP POLICY IF EXISTS "Admins can do everything with order items" ON order_items;
DROP POLICY IF EXISTS "Public can read active coupons" ON coupons;
DROP POLICY IF EXISTS "Admins can manage coupons" ON coupons;
DROP POLICY IF EXISTS "Anyone can insert analytics" ON analytics_events;
DROP POLICY IF EXISTS "Admins can read analytics" ON analytics_events;
DROP POLICY IF EXISTS "Users can manage own cart" ON user_carts;
DROP POLICY IF EXISTS "Users can manage own wishlist" ON user_wishlists;

-- PRODUCTS: Anyone can read active products; only admins can write
CREATE POLICY "Public can read active products" ON products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can do everything with products" ON products
  FOR ALL USING (is_admin());

-- PROFILES: Users can read/update own profile; admins can read all
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ORDERS: Users see own orders; admins see all
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "Users can insert own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update orders" ON orders
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete orders" ON orders
  FOR DELETE USING (is_admin());

-- ORDER ITEMS: Follow parent order access or admin
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can insert own order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Admins can update order items" ON order_items
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete order items" ON order_items
  FOR DELETE USING (is_admin());

-- COUPONS: Anyone can read active coupons; admins can write
CREATE POLICY "Public can read active coupons" ON coupons
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage coupons" ON coupons
  FOR ALL USING (is_admin());

-- ANALYTICS: Admins can read; anyone can insert
CREATE POLICY "Anyone can insert analytics" ON analytics_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can read analytics" ON analytics_events
  FOR SELECT USING (is_admin());

-- USER CARTS: Users can manage own cart
CREATE POLICY "Users can manage own cart" ON user_carts
  FOR ALL USING (auth.uid() = user_id);

-- USER WISHLISTS: Users can manage own wishlist
CREATE POLICY "Users can manage own wishlist" ON user_wishlists
  FOR ALL USING (auth.uid() = user_id);


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

DROP TRIGGER IF EXISTS products_updated_at ON products;
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS orders_updated_at ON orders;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- SEED DEFAULT COUPONS (from the original hardcoded ones)
-- ============================================================
INSERT INTO coupons (code, percent, label, min_subtotal, is_active) VALUES
  ('WELCOME10', 10, '10% New Member Discount', 0, true),
  ('PLANTLOVE15', 15, '15% Plant Lover Discount', 0, true),
  ('BULK20', 20, '20% Bulk Order Discount', 5000, true),
  ('SANGO10', 10, '10% Welcome Discount', 0, true)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- SEED PRODUCTS FROM EXISTING plants.json
-- (Run the import script separately — see scripts/seed-products.js)
-- ============================================================
-- Products are imported via the seed script which reads _data/plants.json
-- and inserts all 76 products into this table.


-- ============================================================
-- SEED PRODUCTS (All 75 botanical items from plants.json)
-- ============================================================
INSERT INTO products (slug, name, variant, category, size, pot_included, price, mrp, discount, rating, reviews, image, description, stock, is_active, is_sold_out)
VALUES
  ('rose-plant-white-colour-90cm', 'Rose Plant', 'White', 'Flowering', '90cm', true, 4904, 6800, 28, 4.8, 84, '/images/products/rose-plant-white-colour-90cm.jpg', 'Rose Plant standing approximately 90cm tall, delivered in a decorative pot. Seasonal colour and fragrance for your home — enjoy beautiful blooms with simple, low-effort care.', 100, true, false),
  ('rose-plant-yellow-colour-90cm', 'Rose Plant', 'Yellow', 'Flowering', '90cm', true, 4904, 6300, 22, 4.9, 303, '/images/products/rose-plant-yellow-colour-90cm.jpg', 'Rose Plant standing approximately 90cm tall, delivered in a decorative pot. Seasonal colour and fragrance for your home — enjoy beautiful blooms with simple, low-effort care.', 100, true, false),
  ('fiddle-leaf-fig-180cm', 'Fiddle Leaf Fig', '', 'Trees', '180cm', true, 7340, 9450, 22, 4.6, 249, '/images/products/fiddle-leaf-fig-180cm.jpg', 'Fiddle Leaf Fig standing approximately 180cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('fan-palm-tree-120cm', 'Fan Palm Tree', '', 'Palms', '120cm', true, 3936, 5600, 30, 4.7, 202, '/images/products/fan-palm-tree-120cm.jpg', 'Fan Palm Tree standing approximately 120cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('ficus-benjamina-tree-210cm', 'Ficus Benjamina Tree', '', 'Trees', '210cm', true, 8940, 12150, 26, 4.9, 451, '/images/products/ficus-benjamina-tree-210cm.jpg', 'Ficus Benjamina Tree standing approximately 210cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('dracaena-marginata-plant-140cm', 'Dracaena Marginata Plant', '', 'Foliage', '140cm', true, 4716, 6750, 30, 4.4, 453, '/images/products/dracaena-marginata-plant-140cm.jpg', 'Dracaena Marginata Plant standing approximately 140cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('common-fig-tree-with-fruits-40cm', 'Common Fig Tree', 'With Fruits', 'Trees', '40cm', true, 2324, 3050, 24, 4.9, 372, '/images/products/common-fig-tree-with-fruits-40cm.jpg', 'Common Fig Tree standing approximately 40cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('common-fig-tree-with-fruits-120cm', 'Common Fig Tree', 'With Fruits', 'Trees', '120cm', true, 4600, 6600, 30, 4.4, 33, '/images/products/common-fig-tree-with-fruits-120cm.jpg', 'Common Fig Tree standing approximately 120cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('citrus-tree-with-frut-90cm', 'Citrus Tree', 'With Fruit', 'Trees', '90cm', true, 3352, 4450, 25, 4.2, 323, '/images/products/citrus-tree-with-frut-90cm.jpg', 'Citrus Tree standing approximately 90cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('citrus-tree-with-frut-80cm', 'Citrus Tree', 'With Fruit', 'Trees', '80cm', true, 3236, 4600, 30, 4.3, 292, '/images/products/citrus-tree-with-frut-80cm.jpg', 'Citrus Tree standing approximately 80cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('philodendron-selloum-90cm', 'Philodendron Selloum', '', 'Foliage', '90cm', true, 2496, 3400, 27, 4.2, 112, '/images/products/philodendron-selloum-90cm.jpg', 'Philodendron Selloum standing approximately 90cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('dracaena-marginata-120cm', 'Dracaena Marginata', '', 'Foliage', '120cm', true, 4772, 6650, 28, 4.4, 454, '/images/products/dracaena-marginata-120cm.jpg', 'Dracaena Marginata standing approximately 120cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('citrus-tree-with-frut-90cm-2', 'Citrus Tree', 'With Fruit', 'Trees', '90cm', true, 3636, 4850, 25, 4.7, 119, '/images/products/citrus-tree-with-frut-90cm-2.jpg', 'Citrus Tree standing approximately 90cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('fiddle-leaf-fig-90cm', 'Fiddle Leaf Fig', '', 'Trees', '90cm', true, 3236, 4450, 27, 4.2, 72, '/images/products/fiddle-leaf-fig-90cm.jpg', 'Fiddle Leaf Fig standing approximately 90cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('areca-palm-tree-100cm', 'Areca Palm Tree', '', 'Palms', '100cm', true, 4576, 6250, 27, 4.6, 232, '/images/products/areca-palm-tree-100cm.jpg', 'Areca Palm Tree standing approximately 100cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('paradise-palm-tree-110cm', 'Paradise Palm Tree', '', 'Palms', '110cm', true, 4772, 6550, 27, 4.2, 412, '/images/products/paradise-palm-tree-110cm.jpg', 'Paradise Palm Tree standing approximately 110cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('sago-palm-tree-70cm', 'Sago Palm Tree', '', 'Palms', '70cm', true, 2780, 3750, 26, 4.4, 250, '/images/products/sago-palm-tree-70cm.svg', 'Sago Palm Tree standing approximately 70cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('areca-palm-tree-100cm-2', 'Areca Palm Tree', '', 'Palms', '100cm', true, 3124, 4200, 26, 4.3, 474, '/images/products/areca-palm-tree-100cm-2.jpg', 'Areca Palm Tree standing approximately 100cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('tropical-green-foliage-tree-70cm', 'Tropical Green Foliage Tree', '', 'Trees', '70cm', true, 2496, 3450, 28, 4.7, 453, '/images/products/tropical-green-foliage-tree-70cm.jpg', 'Tropical Green Foliage Tree standing approximately 70cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('ficus-benjamina-tree-120cm', 'Ficus Benjamina Tree', '', 'Trees', '120cm', true, 4828, 6100, 21, 4.7, 451, '/images/products/ficus-benjamina-tree-120cm.jpg', 'Ficus Benjamina Tree standing approximately 120cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('olive-tree-180cm', 'Olive Tree', '', 'Trees', '180cm', true, 9364, 12250, 24, 4.8, 336, '/images/products/olive-tree-180cm.jpg', 'Olive Tree standing approximately 180cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('philodendron-selloum-70cm', 'Philodendron Selloum', '', 'Foliage', '70cm', true, 1928, 2700, 29, 4.8, 174, '/images/products/philodendron-selloum-70cm.jpg', 'Philodendron Selloum standing approximately 70cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('fiddle-leaf-fig-160cm', 'Fiddle Leaf Fig', '', 'Trees', '160cm', true, 3636, 4750, 23, 4.4, 311, '/images/products/fiddle-leaf-fig-160cm.jpg', 'Fiddle Leaf Fig standing approximately 160cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('areca-palm-tree-190cm', 'Areca Palm Tree', '', 'Palms', '190cm', true, 5744, 7800, 26, 4.5, 46, '/images/products/areca-palm-tree-190cm.jpg', 'Areca Palm Tree standing approximately 190cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('bamboo-tree-155cm', 'Bamboo Tree', '', 'Trees', '155cm', true, 4904, 6850, 28, 4.5, 335, '/images/products/bamboo-tree-155cm.jpg', 'Bamboo Tree standing approximately 155cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('elephant-ear-plant-80cm', 'Elephant Ear Plant', '', 'Foliage', '80cm', true, 3636, 4800, 24, 4.9, 92, '/images/products/elephant-ear-plant-80cm.jpg', 'Elephant Ear Plant standing approximately 80cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('fiddle-leaf-fig-80cm', 'Fiddle Leaf Fig', '', 'Trees', '80cm', true, 3124, 4000, 22, 4.9, 103, '/images/products/fiddle-leaf-fig-80cm.jpg', 'Fiddle Leaf Fig standing approximately 80cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('topiary-bay-laurel-double-boll-tree-120cm', 'Topiary Bay Laurel', 'Double Boll Tree', 'Trees', '120cm', true, 7344, 10500, 30, 4.8, 378, '/images/products/topiary-bay-laurel-double-boll-tree-120cm.jpg', 'Topiary Bay Laurel standing approximately 120cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('fan-palm-tree-160cm', 'Fan Palm Tree', '', 'Palms', '160cm', true, 5928, 8200, 28, 4.3, 78, '/images/products/fan-palm-tree-160cm.jpg', 'Fan Palm Tree standing approximately 160cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('citrus-tree-with-frut-115cm', 'Citrus Tree', 'With Fruit', 'Trees', '115cm', true, 5348, 7350, 27, 4.2, 417, '/images/products/citrus-tree-with-frut-115cm.jpg', 'Citrus Tree standing approximately 115cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('dracaena-fragrans-160cm', 'Dracaena Fragrans', '', 'Foliage', '160cm', true, 5180, 6900, 25, 4.6, 33, '/images/products/dracaena-fragrans-160cm.jpg', 'Dracaena Fragrans standing approximately 160cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('calathea-orbifolia-green-with-siver-100cm', 'Calathea Orbifolia', 'Green With Silver', 'Foliage', '100cm', true, 3868, 5450, 29, 4.6, 236, '/images/products/calathea-orbifolia-green-with-siver-100cm.jpg', 'Calathea Orbifolia standing approximately 100cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('rubber-plant-55cm', 'Rubber Plant', '', 'Foliage', '55cm', true, 2728, 3950, 31, 4.9, 224, '/images/products/rubber-plant-55cm.jpg', 'Rubber Plant standing approximately 55cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('calathea-orbifolia-140cm', 'Calathea Orbifolia', '', 'Foliage', '140cm', true, 3508, 4700, 25, 4.3, 299, '/images/products/calathea-orbifolia-140cm.jpg', 'Calathea Orbifolia standing approximately 140cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('phoenix-palm-tree-140cm', 'Phoenix Palm Tree', '', 'Palms', '140cm', true, 5292, 7100, 25, 4.7, 169, '/images/products/phoenix-palm-tree-140cm.jpg', 'Phoenix Palm Tree standing approximately 140cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('ming-aralia-tree-80cm', 'Ming Aralia Tree', '', 'Trees', '80cm', true, 3508, 4550, 23, 4.2, 24, '/images/products/ming-aralia-tree-80cm.jpg', 'Ming Aralia Tree standing approximately 80cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('bamboo-tree-120cm', 'Bamboo Tree', '', 'Trees', '120cm', true, 4498, 6200, 27, 4.7, 118, '/images/products/bamboo-tree-120cm.jpg', 'Bamboo Tree standing approximately 120cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('swiss-cheese-plant-160cm', 'Swiss Cheese Plant', '', 'Foliage', '160cm', true, 5920, 8400, 30, 4.7, 302, '/images/products/swiss-cheese-plant-160cm.jpg', 'Swiss Cheese Plant standing approximately 160cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('olive-tree-120cm', 'Olive Tree', '', 'Trees', '120cm', true, 4264, 5350, 20, 4.6, 150, '/images/products/olive-tree-120cm.jpg', 'Olive Tree standing approximately 120cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('snake-plant-65cm', 'Snake Plant', '', 'Foliage', '65cm', true, 4264, 6000, 29, 4.2, 426, '/images/products/snake-plant-65cm.jpg', 'Snake Plant standing approximately 65cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('snake-plant-90cm', 'Snake Plant', '', 'Foliage', '90cm', true, 5576, 7400, 25, 4.2, 23, '/images/products/snake-plant-90cm.jpg', 'Snake Plant standing approximately 90cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('snake-plant-90cm-2', 'Snake Plant', '', 'Foliage', '90cm', true, 5748, 7450, 23, 4.7, 145, '/images/products/snake-plant-90cm-2.jpg', 'Snake Plant standing approximately 90cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('snake-plant-120cm', 'Snake Plant', '', 'Foliage', '120cm', true, 5180, 7400, 30, 4.4, 253, '/images/products/snake-plant-120cm.jpg', 'Snake Plant standing approximately 120cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('aloe-vera-60cm', 'Aloe Vera', '', 'Foliage', '60cm', true, 4608, 6000, 23, 4.3, 205, '/images/products/aloe-vera-60cm.jpg', 'Aloe Vera standing approximately 60cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('areca-palm-tree-180cm', 'Areca Palm Tree', '', 'Palms', '180cm', true, 8700, 10900, 20, 4.6, 15, '/images/products/areca-palm-tree-180cm.jpg', 'Areca Palm Tree standing approximately 180cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('china-doll-tree-160cm', 'China Doll Tree', '', 'Trees', '160cm', true, 6660, 8450, 21, 4.8, 287, '/images/products/china-doll-tree-160cm.jpg', 'China Doll Tree standing approximately 160cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('dracaena-lemon-lime-100cm', 'Dracaena Lemon Lime', '', 'Foliage', '100cm', true, 3868, 5400, 28, 4.5, 360, '/images/products/dracaena-lemon-lime-100cm.jpg', 'Dracaena Lemon Lime standing approximately 100cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('fiddle-leaf-fig-90cm-2', 'Fiddle Leaf Fig', '', 'Trees', '90cm', true, 5920, 7950, 26, 4.7, 89, '/images/products/fiddle-leaf-fig-90cm-2.jpg', 'Fiddle Leaf Fig standing approximately 90cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('calathea-orbifolia-50cm', 'Calathea Orbifolia', '', 'Foliage', '50cm', true, 2496, 3350, 25, 4.7, 399, '/images/products/calathea-orbifolia-50cm.jpg', 'Calathea Orbifolia standing approximately 50cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('fan-palm-tree-96cm', 'Fan Palm Tree', '', 'Palms', '96cm', true, 3808, 5100, 25, 4.7, 479, '/images/products/fan-palm-tree-96cm.jpg', 'Fan Palm Tree standing approximately 96cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('fan-palm-tree-160cm-2', 'Fan Palm Tree', '', 'Palms', '160cm', true, 3640, 4550, 20, 4.6, 140, '/images/products/fan-palm-tree-160cm-2.jpg', 'Fan Palm Tree standing approximately 160cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('swiss-cheese-plant-130cm', 'Swiss Cheese Plant', '', 'Foliage', '130cm', true, 3640, 4700, 23, 4.2, 209, '/images/products/swiss-cheese-plant-130cm.jpg', 'Swiss Cheese Plant standing approximately 130cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('bird-of-paradise-160cm', 'Bird of Paradise', '', 'Foliage', '160cm', true, 5348, 7600, 30, 4.3, 152, '/images/products/bird-of-paradise-160cm.jpg', 'Bird of Paradise standing approximately 160cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('elephant-ear-plant-45cm', 'Elephant Ear Plant', '', 'Foliage', '45cm', true, 2156, 2850, 24, 4.2, 123, '/images/products/elephant-ear-plant-45cm.jpg', 'Elephant Ear Plant standing approximately 45cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('calathea-orbifolia-yellow-60cm', 'Calathea Orbifolia', 'Yellow', 'Foliage', '60cm', true, 2328, 3000, 22, 4.9, 143, '/images/products/calathea-orbifolia-yellow-60cm.jpg', 'Calathea Orbifolia standing approximately 60cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('bird-of-paradise-80cm', 'Bird of Paradise', '', 'Foliage', '80cm', true, 3808, 4850, 21, 4.4, 82, '/images/products/bird-of-paradise-80cm.jpg', 'Bird of Paradise standing approximately 80cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('elephant-ear-plant-70cm', 'Elephant Ear Plant', '', 'Foliage', '70cm', true, 2728, 3850, 29, 4.2, 61, '/images/products/elephant-ear-plant-70cm.jpg', 'Elephant Ear Plant standing approximately 70cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('banana-tree-80cm', 'Banana Tree', '', 'Trees', '80cm', true, 3296, 4400, 25, 4.3, 429, '/images/products/banana-tree-80cm.jpg', 'Banana Tree standing approximately 80cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('ficus-plant-90cm', 'Ficus Plant', '', 'Trees', '90cm', true, 3808, 5150, 26, 4.4, 215, '/images/products/ficus-plant-90cm.jpg', 'Ficus Plant standing approximately 90cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('olive-tree-160cm', 'Olive Tree', '', 'Trees', '160cm', true, 4780, 6150, 22, 4.2, 274, '/images/products/olive-tree-160cm.jpg', 'Olive Tree standing approximately 160cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('tropical-green-foliage-tree-85cm', 'Tropical Green Foliage Tree', '', 'Trees', '85cm', true, 2896, 4100, 29, 4.3, 267, '/images/products/tropical-green-foliage-tree-85cm.jpg', 'Tropical Green Foliage Tree standing approximately 85cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('swiss-cheese-plant-150cm', 'Swiss Cheese Plant', '', 'Foliage', '150cm', true, 5168, 6750, 23, 4.8, 271, '/images/products/swiss-cheese-plant-150cm.jpg', 'Swiss Cheese Plant standing approximately 150cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('areca-palm-tree-120cm', 'Areca Palm Tree', '', 'Palms', '120cm', true, 5348, 7450, 28, 4.4, 294, '/images/products/areca-palm-tree-120cm.jpg', 'Areca Palm Tree standing approximately 120cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('bamboo-tree-150cm', 'Bamboo Tree', '', 'Trees', '150cm', true, 5236, 6550, 20, 4.2, 25, '/images/products/bamboo-tree-150cm.jpg', 'Bamboo Tree standing approximately 150cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('mini-fan-palm-tree-130cm', 'Mini Fan Palm Tree', '', 'Palms', '130cm', true, 9556, 11950, 20, 4.6, 470, '/images/products/mini-fan-palm-tree-130cm.jpg', 'Mini Fan Palm Tree standing approximately 130cm tall, delivered in a decorative pot. Architectural fronds bring resort-style calm to any space — perfect beside sofas, in entryways or on covered balconies.', 100, true, false),
  ('fiddle-leaf-fig-225cm', 'Fiddle Leaf Fig', '', 'Trees', '225cm', true, 11792, 15200, 22, 4.2, 249, '/images/products/fiddle-leaf-fig-225cm.jpg', 'Fiddle Leaf Fig standing approximately 225cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('bamboo-tree-170cm', 'Bamboo Tree', '', 'Trees', '170cm', true, 6900, 9850, 30, 4.4, 428, '/images/products/bamboo-tree-170cm.jpg', 'Bamboo Tree standing approximately 170cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('cherry-blossom-tree-white-195cm', 'Cherry Blossom Tree', 'White', 'Flowering', '195cm', true, 9512, 12450, 24, 4.8, 201, '/images/products/cherry-blossom-tree-white-195cm.jpg', 'Cherry Blossom Tree standing approximately 195cm tall, delivered in a decorative pot. Seasonal colour and fragrance for your home — enjoy beautiful blooms with simple, low-effort care.', 100, true, false),
  ('elephant-ear-plant-160cm', 'Elephant Ear Plant', '', 'Foliage', '160cm', true, 7632, 9850, 23, 4.2, 144, '/images/products/elephant-ear-plant-160cm.jpg', 'Elephant Ear Plant standing approximately 160cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false),
  ('topiary-bay-laurel-double-boll-tree-150cm', 'Topiary Bay Laurel', 'Double Boll Tree', 'Trees', '150cm', true, 10480, 14250, 26, 4.5, 471, '/images/products/topiary-bay-laurel-double-boll-tree-150cm.jpg', 'Topiary Bay Laurel standing approximately 150cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('agave-plant-100cm', 'Agave Plant', '', 'Trees', '100cm', true, 6776, 9150, 26, 4.8, 385, '/images/products/agave-plant-100cm.jpg', 'Agave Plant standing approximately 100cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('banyan-ficus-tree-200cm', 'Banyan Ficus Tree', '', 'Trees', '200cm', true, 8940, 12450, 28, 4.4, 24, '/images/products/banyan-ficus-tree-200cm.jpg', 'Banyan Ficus Tree standing approximately 200cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('slim-mango-tree-180cm', 'Slim Mango Tree', '', 'Trees', '180cm', true, 4964, 6350, 22, 4.9, 173, '/images/products/slim-mango-tree-180cm.jpg', 'Slim Mango Tree standing approximately 180cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('banana-leaf-tree-160cm', 'Banana Leaf Tree', '', 'Trees', '160cm', true, 5348, 7250, 26, 4.5, 301, '/images/products/banana-leaf-tree-160cm.jpg', 'Banana Leaf Tree standing approximately 160cm tall, delivered in a decorative pot. A sculptural indoor tree handpicked for structure and healthy growth, ideal as a natural focal point in modern interiors.', 100, true, false),
  ('swiss-cheese-plant-200cm', 'Swiss Cheese Plant', '', 'Foliage', '200cm', true, 8940, 12250, 27, 4.6, 147, '/images/products/swiss-cheese-plant-200cm.jpg', 'Swiss Cheese Plant standing approximately 200cm tall, delivered in a decorative pot. A lush statement plant that thrives in bright, indirect light and instantly elevates living rooms, bedrooms and office corners.', 100, true, false)
ON CONFLICT (slug) DO NOTHING;
