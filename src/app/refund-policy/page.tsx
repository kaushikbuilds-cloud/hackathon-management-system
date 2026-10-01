import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: "Cancellation & Refund Policy" };

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Cancellation & Refund Policy">
      <p>This policy applies to hackathon licences bought on {PLATFORM.name}.</p>
      <h2>Cancellation</h2>
      <p>You can cancel within 7 days of payment as long as no team has registered for your hackathon yet. Contact us with your registered email and payment ID.</p>
      <h2>Refunds</h2>
      <ul>
        <li><strong className="text-ink">Full refund</strong> if you cancel within 7 days of payment and no team has registered.</li>
        <li><strong className="text-ink">No refund</strong> once teams have registered for the hackathon or after 7 days, because the service has been used.</li>
        <li><strong className="text-ink">Charged twice or charged but no hackathon created?</strong> We refund the extra or failed payment in full.</li>
      </ul>
      <p>Approved refunds are sent to the original payment method through Razorpay within 5–7 working days. Your bank may take a few more days to show it.</p>
      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
