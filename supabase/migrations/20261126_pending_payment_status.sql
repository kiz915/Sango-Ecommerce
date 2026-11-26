-- =============================================================================
-- Sango Fiora: Pending Payment Status for Unpaid Online Orders
-- Ensures ONLINE orders are NOT marked "Order Placed" until payment confirms.
-- =============================================================================

-- Fix any existing unpaid online orders stuck as "Order Placed"
UPDATE public.orders
SET status = 'Pending Payment',
    status_step = 0,
    tracking_notes = 'Awaiting online payment confirmation.'
WHERE UPPER(COALESCE(payment_method, 'COD')) <> 'COD'
  AND COALESCE(payment_status, 'Pending') = 'Pending'
  AND COALESCE(status, '') = 'Order Placed';

-- Update place_order() so ONLINE orders start as 'Pending Payment' (step 0)
-- and only COD orders start immediately as 'Order Placed' (step 1)
CREATE OR REPLACE FUNCTION public.place_order(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  uid uuid := auth.uid();
  v_order_id text; v_oid uuid; v_created timestamptz;
  v_sub int := 0; v_mrp int := 0; v_cnt int := 0;
  v_vol int := 0; v_cpn int := 0; v_del int; v_gst int; v_net int; v_taxable int;
  v_code text := nullif(upper(trim(coalesce(p->>'couponCode',''))), '');
  v_method text := case when upper(coalesce(p->>'paymentMethod','COD')) = 'COD' then 'COD' else 'ONLINE' end;
  v_initial_status text := case when v_method = 'COD' then 'Order Placed' else 'Pending Payment' end;
  v_initial_step int := case when v_method = 'COD' then 1 else 0 end;
  v_initial_notes text := case when v_method = 'COD' then 'Order received and queued for Quality Inspection.' else 'Awaiting online payment confirmation.' end;
  v_phone text := regexp_replace(coalesce(p->>'customerPhone',''), '\D', '', 'g');
  v_pin text := regexp_replace(coalesce(p->>'pincode',''), '\D', '', 'g');
  v_prior_orders bigint := 0;
  it jsonb; prod record; cp record; qty int;
begin
  if uid is null then raise exception 'Please sign in to place an order'; end if;
  if length(v_phone) < 10 then raise exception 'Please enter a valid 10-digit phone number'; end if;
  if length(v_pin) <> 6 then raise exception 'Please enter a valid 6-digit pincode'; end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Your cart is empty';
  end if;

  loop
    v_order_id := 'SANGO-' || (100000 + floor(random() * 900000))::int;
    exit when not exists (select 1 from public.orders where order_id = v_order_id);
  end loop;

  insert into public.orders (order_id, user_id, customer_name, customer_phone, customer_email, shipping_address, landmark,
    pincode, city, state, gstin, payment_method, payment_status, status, status_step, tracking_notes, est_delivery_date)
  values (v_order_id, uid, trim(p->>'customerName'), v_phone, nullif(trim(coalesce(p->>'customerEmail','')),''),
    trim(p->>'shippingAddress'), nullif(trim(coalesce(p->>'landmark','')),''), v_pin,
    nullif(trim(coalesce(p->>'city','')),''), nullif(trim(coalesce(p->>'state','')),''), nullif(trim(coalesce(p->>'gstin','')),''),
    v_method, case when v_method = 'COD' then 'Pending (COD)' else 'Pending' end, v_initial_status, v_initial_step, v_initial_notes,
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
    'paymentMethod', v_method, 'status', v_initial_status, 'createdAt', v_created);
end;
$$;
