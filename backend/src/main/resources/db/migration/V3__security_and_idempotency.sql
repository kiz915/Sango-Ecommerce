-- ============================================================
-- Sango Fiora — Security, Idempotency & Indexing (Flyway V3)
-- Safe, non-destructive migration for production PostgreSQL
-- ============================================================

-- 1. Add idempotency_key to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index on idempotency_key (where not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Indexes for fast, secure lookup and IDOR ownership checks
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);

-- 3. Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
