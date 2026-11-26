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

-- 6. Sync place_order(): remove deprecated bulk volume discount (v_vol = 0) and enforce dynamic first_time_only coupon check
CREATE OR REPLACE FUNCTION public.place_order(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  uid uuid := auth.uid();
  it jsonb; prod public.products%rowtype; cp public.coupons%rowtype;
  qty int; v_sub int := 0; v_mrp int := 0; v_cnt int := 0; v_vol int := 0; v_cpn int := 0;
  v_del int := 0; v_taxable int; v_net int; v_gst int;
  v_method text := upper(coalesce(nullif(p->>'paymentMethod',''),'COD'));
  v_phone text := right(regexp_replace(coalesce(p->>'customerPhone',''), '\D', '', 'g'), 10);
  v_pin text := regexp_replace(coalesce(p->>'pincode',''), '\s', '', 'g');
  v_code text := upper(nullif(trim(coalesce(p->>'couponCode','')),''));
  v_order_id text; v_oid uuid; v_created timestamptz;
  v_prior_orders int := 0;
begin
  if uid is null then raise exception 'Please sign in to place your order'; end if;
  if v_method not in ('COD','ONLINE') then v_method := 'ONLINE'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p->'items') > 60 then raise exception 'Too many items in one order'; end if;
  if char_length(trim(coalesce(p->>'customerName',''))) < 2 then raise exception 'Please enter your full name'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit mobile number'; end if;
  if char_length(trim(coalesce(p->>'shippingAddress',''))) < 8 then raise exception 'Please enter your complete delivery address'; end if;
  if v_pin !~ '^[1-9][0-9]{5}$' then raise exception 'Please enter a valid 6-digit pincode'; end if;

  perform public.release_unpaid_orders();

  loop
    v_order_id := 'SANGO-' || (100000 + floor(random() * 900000))::int;
    exit when not exists (select 1 from public.orders where order_id = v_order_id);
  end loop;

  insert into public.orders (order_id, user_id, customer_name, customer_phone, customer_email, shipping_address, landmark,
    pincode, city, state, gstin, payment_method, payment_status, status, status_step, est_delivery_date)
  values (v_order_id, uid, trim(p->>'customerName'), v_phone, nullif(trim(coalesce(p->>'customerEmail','')),''),
    trim(p->>'shippingAddress'), nullif(trim(coalesce(p->>'landmark','')),''), v_pin,
    nullif(trim(coalesce(p->>'city','')),''), nullif(trim(coalesce(p->>'state','')),''), nullif(trim(coalesce(p->>'gstin','')),''),
    v_method, case when v_method = 'COD' then 'Pending (COD)' else 'Pending' end, 'Order Placed', 1,
    to_char(now() + interval '4 days', 'Dy, DD Mon'))
  returning id, created_at into v_oid, v_created;

  for it in select * from jsonb_array_elements(p->'items') loop
    qty := greatest(1, least(50, coalesce(nullif(it->>'qty','')::int, 1)));
    select * into prod from public.products where slug = it->>'productSlug' and is_active for update;
    if not found then raise exception 'An item in your cart is no longer available. Please review your cart.'; end if;
    if prod.is_sold_out or coalesce(prod.stock,0) < qty then
      raise exception '% is out of stock or has fewer than % units left', prod.name, qty;
    end if;
    update public.products set stock = stock - qty, is_sold_out = (stock - qty) <= 0, updated_at = now() where id = prod.id;
    insert into public.order_items (order_id, product_id, product_name, product_slug, product_image, product_variant, product_category, size, price, mrp, qty)
    values (v_oid, prod.id, prod.name, prod.slug, prod.image, coalesce(prod.variant,''), prod.category, prod.size, prod.price, prod.mrp, qty);
    v_sub := v_sub + prod.price * qty;
    v_mrp := v_mrp + prod.mrp * qty;
    v_cnt := v_cnt + qty;
  end loop;

  -- Dynamic MRP Savings replaced bulk volume tiers (v_vol stays 0 to match storefront totals)
  v_vol := 0;

  if v_code is not null then
    select * into cp from public.coupons where upper(code) = v_code and is_active
      and (expires_at is null or expires_at > now())
      and (usage_limit is null or times_used < usage_limit) for update;
    if found and v_sub >= coalesce(cp.min_subtotal, 0) then
      if cp.first_time_only then
        select count(*) into v_prior_orders from public.orders
        where user_id = uid and id <> v_oid and coalesce(status, '') <> 'Cancelled';
      end if;
      if not cp.first_time_only or v_prior_orders = 0 then
        v_cpn := round(v_sub * cp.percent / 100.0);
        update public.coupons set times_used = times_used + 1 where id = cp.id;
      else
        v_code := null;
      end if;
    else
      v_code := null;
    end if;
  end if;

  v_del := case when v_sub >= 999 then 0 else 99 end;
  v_taxable := greatest(0, v_sub - v_cpn);
  v_net := v_taxable + v_del;
  v_gst := round(v_taxable * 0.18 / 1.18);

  update public.orders set subtotal = v_sub, mrp_total = v_mrp, mrp_savings = greatest(0, v_mrp - v_sub),
    volume_discount = 0, coupon_code = v_code, coupon_discount = v_cpn, delivery_fee = v_del,
    gst_amount = v_gst, net_total = v_net where id = v_oid;

  return jsonb_build_object('orderId', v_order_id, 'id', v_oid, 'netTotal', v_net, 'subtotal', v_sub,
    'couponCode', v_code, 'couponDiscount', v_cpn, 'volumeDiscount', 0, 'deliveryFee', v_del, 'gstAmount', v_gst,
    'paymentMethod', v_method, 'status', 'Order Placed', 'createdAt', v_created);
end;
$$;

