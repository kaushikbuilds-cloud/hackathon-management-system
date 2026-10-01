/** Platform-level branding and contact (the product, not any one hackathon). */
export const PLATFORM = {
  name: process.env.NEXT_PUBLIC_PLATFORM_NAME || "HackGround OS",
  contactEmail: process.env.NEXT_PUBLIC_PLATFORM_CONTACT_EMAIL || "kaushik.builds@gmail.com",
  /** Business details shown on the Contact and policy pages (must match the payment gateway's KYC). */
  legalName: process.env.NEXT_PUBLIC_BUSINESS_NAME || "HackGround OS",
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE || "",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "",
};

/** Public pages a payment gateway checks for, linked from the platform footer. */
export const LEGAL_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact us" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Cancellation & Refunds" },
  { href: "/shipping-policy", label: "Shipping & Delivery" },
];

export function hostRequestMailto(): string {
  const subject = "I want to host a hackathon";
  const body = [
    "Hi,",
    "",
    "We would like to run our hackathon on your platform.",
    "",
    "Hackathon name:",
    "Organising institution:",
    "Dates:",
    "Expected number of teams:",
    "Contact person and phone:",
  ].join("\n");
  return `mailto:${PLATFORM.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
