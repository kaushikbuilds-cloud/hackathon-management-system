# HackGround OS — go-live checklist

Work through this before running a real hackathon on https://hackgroundos.vercel.app.

## 1. Database (Supabase → SQL Editor)
- [ ] Every SQL step up to the latest one has been run and showed its OK/DONE message
      (currently up to **26 — self-serve billing**).
- [ ] **Database → Backups**: daily backups are on (Pro plan), or download a backup before the event.

## 2. Keys and secrets
- [ ] **Rotate the Supabase secret (service-role) key** if it was ever pasted into a chat, email or file
      (Supabase → Settings → API keys → create a new secret key, then delete the old one).
- [ ] Put the new key in **Vercel → Settings → Environment Variables** (`SUPABASE_SECRET_KEY`) and redeploy.
- [ ] `SETUP_TOKEN` in Vercel: remove it (or change it) now that the Super Admin exists.
- [ ] Nothing secret is in GitHub: only `.env.example` is committed (checked).

## 3. Addresses
- [ ] Vercel env `NEXT_PUBLIC_APP_URL` = `https://hackgroundos.vercel.app` (it is printed in ID-card QR codes —
      set it **before** printing cards), then redeploy.
- [ ] Vercel env `NEXT_PUBLIC_PLATFORM_NAME` is `HackGround OS` or not set.
- [ ] Supabase → Authentication → URL Configuration: **Site URL** = `https://hackgroundos.vercel.app`,
      and add `https://hackgroundos.vercel.app/**` to **Redirect URLs** (invite and password links).

## 4. Payments (Razorpay)
- [ ] Vercel env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys first; buy a test hackathon at /start
      with UPI `success@razorpay`), then switch to live keys after Razorpay activates your account.
- [ ] Razorpay → Webhooks: `https://hackgroundos.vercel.app/api/razorpay/webhook`, events `payment.captured`
      and `order.paid`, secret = Vercel env `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Super Admin → Payments: set the price per hackathon.

## 5. Accounts
- [ ] Super Admin uses a strong, unique password.
- [ ] Each hackathon's Admin was invited from Super Admin → Hackathons (their own email).
- [ ] Officials have only the permissions they need (scanner, food, judge, mentor …).

## 6. Certificates
- [ ] Re-upload the **signature images** on the Certificates page once. They are now stored privately;
      older uploads were in the public branding bucket. Re-uploading deletes the old public copy.

## 7. Android app (shops & attendance)
- [ ] Optional but recommended: add a fixed signing key so updates install over the old app
      (GitHub → Settings → Secrets → Actions: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Without it, phones must uninstall before each update.
- [ ] Install the latest APK on the shop and scanner phones and sign in once before the event.

## 8. Rehearsal (the day before)
- [ ] Register a test team, approve it, print its ID card, activate the team login.
- [ ] Scan the card at check-in, order food, ask for a mentor, submit a project.
- [ ] Delete the test team afterwards.
