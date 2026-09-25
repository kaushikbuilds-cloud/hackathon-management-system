/** Platform-level branding and contact (the product, not any one hackathon). */
export const PLATFORM = {
  name: process.env.NEXT_PUBLIC_PLATFORM_NAME || "HackathonBase",
  contactEmail: process.env.NEXT_PUBLIC_PLATFORM_CONTACT_EMAIL || "kaushik.builds@gmail.com",
};

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
