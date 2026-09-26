import { PLATFORM } from "@/lib/platform";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Pixelify_Sans } from "next/font/google";
import "./globals.css";

// "Pixel Night": Pixelify Sans for headings and UI chrome, DM Sans for reading text.
const display = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-display", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: PLATFORM.name, template: `%s · ${PLATFORM.name}` },
  description: "Registration, teams, ID cards, attendance and support for the hackathon.",
};

export const viewport: Viewport = {
  themeColor: "#17121f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border-2 focus:border-line focus:bg-pop focus:px-3 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
