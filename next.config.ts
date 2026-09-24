import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera is needed on the attendance scanner (same origin only).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Photo/logo (2 MB) and support attachment (5 MB) uploads go through Server Actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // Fonts embedded in ID-card PDFs are read from disk at runtime.
  outputFileTracingIncludes: {
    "/api/teams/*": ["./assets/fonts/**/*"],
    "/api/id-cards/*": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
