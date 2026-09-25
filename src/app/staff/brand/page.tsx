import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { brandingUrls, getHackathon } from "@/lib/data/event";
import { formatEventDates } from "@/lib/pdf/id-cards";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Brand Kit" };

export default async function BrandKitPage() {
  await requirePermission("manage_event");
  const h = await getHackathon();
  if (!h) return <EmptyState title="Hackathon not found" />;
  const { logo, organizerLogo } = brandingUrls(h);
  return (
    <>
      <PageHeader title="Brand Kit" description="Your hackathon's logos and colours. Every ID card is generated with them, and your event page and registration form show them too." />
      <BrandForm
        primary={h.primary_color}
        accent={h.accent_color}
        logoUrl={logo}
        organizerLogoUrl={organizerLogo}
        eventName={h.name}
        tagline={h.tagline ?? ""}
        organizer={h.organizer_name ?? ""}
        dates={formatEventDates(h.starts_at, h.ends_at, h.timezone)}
        venue={h.venue ?? ""}
        sampleHref="/api/id-cards/sample"
      />
    </>
  );
}
