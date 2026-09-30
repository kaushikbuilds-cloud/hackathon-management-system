import { NativeSplash } from "@/components/native-splash";
import { PLATFORM } from "@/lib/platform";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// "Clean Light": Inter for everything (clear numbers and IDs at small sizes).
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: PLATFORM.name, template: `%s · ${PLATFORM.name}` },
  description: "Registration, teams, ID cards, attendance and support for the hackathon.",
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-line focus:bg-pop focus:px-3 focus:py-2 focus:font-bold">
          Skip to content
        </a>
        {children}
        <NativeSplash />
      </body>
    </html>
  );
}
