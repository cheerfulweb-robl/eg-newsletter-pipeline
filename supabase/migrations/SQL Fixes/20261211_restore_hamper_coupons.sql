-- Migration: Restore permissions for Welcome Hamper, Digital Wallet & Coupon QR/6-digit code redemption
-- Date: 2026-11-17

-- 1. Presentation token & coupon functions (6-digit fallback codes & QR code presentation)
grant execute on function public.generate_presentation_token(uuid) to anon, authenticated, service_role;
grant execute on function public.verify_presentation_code(text, text) to anon, authenticated, service_role;
grant execute on function public.redeem_coupon_code(text, text) to anon, authenticated, service_role;

-- 2. Welcome Hamper RPCs (Resident application, digital wallet, merchant QR check/redeem, staff management)
grant execute on function public.hamper_apply(jsonb) to anon, authenticated, service_role;
grant execute on function public.hamper_my_wallet() to anon, authenticated, service_role;
grant execute on function public.hamper_merchant_check(text) to anon, authenticated, service_role;
grant execute on function public.hamper_merchant_redeem(text) to anon, authenticated, service_role;
grant execute on function public.hamper_admin_list_applications() to authenticated, service_role;
grant execute on function public.hamper_admin_set_status(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.hamper_admin_save_note(uuid, text) to authenticated, service_role;
grant execute on function public.hamper_admin_delete_application(uuid) to authenticated, service_role;
grant execute on function public.hamper_admin_issue_coupons(uuid, date) to authenticated, service_role;
grant execute on function public.hamper_admin_list_offers() to authenticated, service_role;
grant execute on function public.hamper_admin_save_offer(jsonb) to authenticated, service_role;
grant execute on function public.hamper_admin_list_coupons(uuid) to authenticated, service_role;
grant execute on function public.hamper_admin_void_coupon(uuid) to authenticated, service_role;

-- Verification
select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
 where routine_name in ('generate_presentation_token', 'verify_presentation_code', 'redeem_coupon_code', 'hamper_apply', 'hamper_my_wallet', 'hamper_merchant_check', 'hamper_merchant_redeem')
 order by routine_name, grantee;
