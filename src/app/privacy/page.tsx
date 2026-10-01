import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const n = PLATFORM.name;
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what {n} (operated by {PLATFORM.legalName}) collects, why, and your choices.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong className="text-ink">Organisers and officials:</strong> name, email, phone (optional), organisation and password (stored hashed).</li>
        <li><strong className="text-ink">Participants:</strong> the details an organiser&apos;s registration form asks for, such as name, email, phone and college, plus attendance, meal and submission records created during the event.</li>
        <li><strong className="text-ink">Payments:</strong> the amount, status and Razorpay order and payment IDs. Card, UPI and bank details are handled by Razorpay and never reach us.</li>
        <li><strong className="text-ink">Technical:</strong> sign-in cookies and basic logs needed to run and secure the service.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to provide the service: running the hackathon, signing you in, processing payments, sending service emails, preventing abuse and meeting legal obligations. We do not sell personal data or use it for advertising.</p>
      <h2>Who we share it with</h2>
      <ul>
        <li>The organiser of the hackathon you registered for, and the officials they authorise.</li>
        <li>Service providers that host or process it for us: Supabase (database and storage), Vercel (website hosting) and Razorpay (payments).</li>
        <li>Authorities, where the law requires it.</li>
      </ul>
      <h2>How long we keep it</h2>
      <p>Organisers can export and close a hackathon at any time. We keep account and payment records for as long as the law requires (for example, tax records).</p>
      <h2>Your rights</h2>
      <p>You can ask us to access, correct or delete your personal data by contacting us below. Participants can also contact the organiser of their hackathon.</p>
      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
