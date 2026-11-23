-- Applied to project hyecifzfswwrhsyrrxmw on 2026-11-23 (already live; kept here for reproducibility).
-- 1. api.* views ran as postgres and anon/authenticated had full DML on them (RLS bypass: anon could read profiles + orders).
do $$ declare v record; begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'api' and c.relkind = 'v' loop
    execute format('alter view api.%I set (security_invoker = true)', v.relname);
    execute format('revoke all on api.%I from public, anon, authenticated', v.relname);
  end loop;
end $$;
revoke usage on schema api from anon, authenticated;

-- 2. EXECUTE is granted to PUBLIC by default; revoking only anon had no effect.
revoke execute on function public.place_order(jsonb), public.cancel_order(text, text), public.admin_stats(),
  public.release_unpaid_orders(), public.handle_new_user(), public.protect_profile_columns() from public, anon, authenticated;
grant execute on function public.place_order(jsonb), public.cancel_order(text, text), public.admin_stats() to authenticated;
revoke execute on function public.is_admin(), public.validate_coupon(text, int), public.get_order_public(text, text) from public;
grant execute on function public.is_admin(), public.validate_coupon(text, int), public.get_order_public(text, text) to anon, authenticated;

-- 3. is_admin(): app_metadata.role (shared with the Spring backend) OR profile role OR bootstrap email with a strong sign-in method.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false)
      or (coalesce((auth.jwt() ->> 'email') in ('kishorevk40@gmail.com','shamnaraja07@gmail.com'), false)
          and exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
                      where a ->> 'method' in ('otp','oauth','magiclink','sso/saml')));
$$;

-- 4. Spring reads the admin role from app_metadata (writable only with the service role).
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email in ('kishorevk40@gmail.com','shamnaraja07@gmail.com');
