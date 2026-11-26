-- Add dynamic first_time_only flag to coupons table (eliminates hardcoded coupon code checks)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS first_time_only BOOLEAN DEFAULT FALSE;
