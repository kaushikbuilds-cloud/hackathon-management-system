-- Until Razorpay API keys are issued, organisers can pay on a Razorpay Payment
-- Page (a plain link) and the Super Admin approves the payment by hand.
alter table public.platform_settings add column if not exists payment_link text
  check (payment_link is null or payment_link ~ '^https://[^[:space:]]+$');
