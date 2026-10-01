import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact us">
      <p>Questions about the product, a payment, a refund or your account? Get in touch and we&apos;ll reply within 2 working days.</p>
      <BusinessContact />
      <p>For a payment question, please include your registered email and the Razorpay payment ID (it starts with <code>pay_</code>).</p>
    </LegalPage>
  );
}
