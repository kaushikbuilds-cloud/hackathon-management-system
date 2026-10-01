import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: "Shipping & Delivery Policy" };

export default function ShippingPolicyPage() {
  return (
    <LegalPage title="Shipping & Delivery Policy">
      <p>{PLATFORM.name} is an online software service. Nothing physical is shipped.</p>
      <h2>Delivery</h2>
      <ul>
        <li>Your hackathon workspace is delivered <strong className="text-ink">instantly</strong>: it is created automatically as soon as your payment is confirmed, and you are taken straight to it.</li>
        <li>You can reach it at any time by signing in on this website with the email and password you registered.</li>
        <li>If your payment succeeded but you cannot see your hackathon within 1 hour, contact us and we will set it up or refund you.</li>
      </ul>
      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
