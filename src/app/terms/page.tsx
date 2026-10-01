import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  const n = PLATFORM.name;
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These terms apply to your use of {n} at this website. {n} is operated by {PLATFORM.legalName} (&quot;we&quot;, &quot;us&quot;).
        By creating an account or paying for a hackathon you agree to them.
      </p>
      <h2>1. The service</h2>
      <p>{n} is online software for organising hackathons. A paid hackathon licence gives one organiser account one hackathon workspace with all the features listed on the <a href="/pricing">Pricing</a> page.</p>
      <h2>2. Accounts</h2>
      <ul>
        <li>You must give accurate details and keep your password private. You are responsible for activity on your account and on the accounts of officials you invite.</li>
        <li>You must be at least 18, or have the permission of your institution, to buy a licence.</li>
      </ul>
      <h2>3. Payment</h2>
      <ul>
        <li>Prices are in Indian Rupees and shown on the <a href="/pricing">Pricing</a> page before you pay. Payments are processed by Razorpay; we never see or store your card or bank details.</li>
        <li>Your hackathon is created only after the payment is confirmed. Refunds follow our <a href="/refund-policy">Cancellation &amp; Refund Policy</a>.</li>
      </ul>
      <h2>4. Your data and your participants&apos; data</h2>
      <p>You own the data you and your participants enter. You are responsible for having a lawful reason to collect it and for telling participants how it is used. We handle it as described in our <a href="/privacy">Privacy Policy</a>.</p>
      <h2>5. Acceptable use</h2>
      <p>Do not use {n} for anything unlawful, to send spam, to collect data you are not allowed to collect, or to attack or overload the service. We may suspend accounts that do.</p>
      <h2>6. Availability</h2>
      <p>We work to keep {n} available and your data safe, but the service is provided &quot;as is&quot;. To the extent the law allows, our total liability for any claim is limited to the amount you paid for the hackathon concerned.</p>
      <h2>7. Changes</h2>
      <p>We may update these terms; the date at the top shows the latest version. Changes do not affect hackathons already paid for.</p>
      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of India, and the courts of Tamil Nadu have jurisdiction.</p>
      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
