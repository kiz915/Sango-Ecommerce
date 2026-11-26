-- Applied to project hyecifzfswwrhsyrrxmw on 2026-11-26.
-- 1. Support dynamic first_time_only coupons instead of hardcoding coupon codes
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS first_time_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Enforce explicit WITH CHECK on user_carts and user_wishlists RLS
DROP POLICY IF EXISTS "Users can manage own cart" ON public.user_carts;
CREATE POLICY "Users can manage own cart" ON public.user_carts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own wishlist" ON public.user_wishlists;
CREATE POLICY "Users can manage own wishlist" ON public.user_wishlists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Purge invalid/non-existent coupon codes from existing user_carts
UPDATE public.user_carts uc
SET coupon_code = NULL, updated_at = now()
WHERE coupon_code IS NOT NULL
  AND (
    trim(coupon_code) = ''
    OR NOT EXISTS (
      SELECT 1 FROM public.coupons c
      WHERE upper(c.code) = upper(trim(uc.coupon_code))
        AND c.is_active = true
        AND (c.expires_at IS NULL OR c.expires_at > now())
        AND (c.usage_limit IS NULL OR c.times_used < c.usage_limit)
    )
  );

-- 4. Trigger to sanitize user_carts.coupon_code so invalid/inactive coupons cannot persist
CREATE OR REPLACE FUNCTION public.sanitize_user_cart_coupon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_code TEXT;
BEGIN
  IF NEW.coupon_code IS NULL OR trim(NEW.coupon_code) = '' THEN
    NEW.coupon_code := NULL;
    RETURN NEW;
  END IF;

  SELECT c.code INTO matched_code
  FROM public.coupons c
  WHERE upper(c.code) = upper(trim(NEW.coupon_code))
    AND c.is_active = true
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.usage_limit IS NULL OR c.times_used < c.usage_limit)
  LIMIT 1;

  NEW.coupon_code := matched_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_user_cart_coupon ON public.user_carts;
CREATE TRIGGER trg_sanitize_user_cart_coupon
  BEFORE INSERT OR UPDATE ON public.user_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_user_cart_coupon();

-- 5. Update validate_coupon to honor dynamic first_time_only flag cleanly
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text, p_subtotal integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.coupons%rowtype;
  prior_orders integer := 0;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Coupon code cannot be empty');
  END IF;

  SELECT * INTO c
  FROM public.coupons
  WHERE upper(code) = upper(trim(p_code)) AND is_active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invalid or expired coupon code');
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This coupon has expired');
  END IF;

  IF c.usage_limit IS NOT NULL AND c.times_used >= c.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'message', 'This coupon has reached its usage limit');
  END IF;

  IF c.first_time_only AND auth.uid() IS NOT NULL THEN
    SELECT count(*) INTO prior_orders
    FROM public.orders
    WHERE user_id = auth.uid() AND coalesce(status, '') <> 'Cancelled';
    IF prior_orders > 0 THEN
      RETURN jsonb_build_object('valid', false, 'message', 'This discount is exclusive to first-time botanical buyers.');
    END IF;
  END IF;

  IF coalesce(p_subtotal, 0) < coalesce(c.min_subtotal, 0) THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Add items worth ₹' || c.min_subtotal || ' or more to use this coupon');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code', c.code,
    'percent', c.percent,
    'label', c.label,
    'discount', round(p_subtotal * c.percent / 100.0),
    'minSubtotal', c.min_subtotal,
    'firstTimeOnly', c.first_time_only
  );
END;
$$;
