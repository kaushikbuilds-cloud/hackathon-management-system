import type { Metadata } from "next";
import { BusinessContact, LegalPage } from "@/components/legal/legal-page";
import { PLATFORM } from "@/lib/platform";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <LegalPage title={`About ${PLATFORM.name}`}>
      <p>
        {PLATFORM.name} is online software for running hackathons. Colleges, student clubs and companies in India use it to take
        team registrations, issue ID cards with QR codes, mark attendance and meals, manage volunteers and judges, collect project
        submissions, publish results and issue certificates, all from one dashboard.
      </p>
      <p>
        An organiser signs up on this website, pays once per hackathon (see <a href="/pricing">Pricing</a>), and their hackathon
        workspace is created straight away. Participants use it free of charge.
      </p>
      <p>{PLATFORM.name} is built and operated by {PLATFORM.legalName}, an individual based in India.</p>
      <h2>Contact</h2>
      <BusinessContact />
    </LegalPage>
  );
}
