import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { GlassFilter } from "@/components/glass-filter";

// Geometric and even-width, with restrained terminals. Nunito's very round
// letterforms read as cartoonish once they get heavy, which is exactly where
// the big figures live; this keeps the warmth without the bounce. Capped at
// 700 for the same reason.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Helia",
  description: "A daily log of weigh-ins and meals.",
  manifest: "/manifest.webmanifest",
  // iPhone only delivers push to a Home Screen app, so being installable is
  // not a nicety here — it is what makes reminders possible at all.
  appleWebApp: { capable: true, title: "Helia", statusBarStyle: "default" },
  // 180×180 and opaque, because iOS composites a transparent touch icon onto
  // black and applies its own corner radius to whatever it is given.
  icons: {
    icon: "/icon-192.png",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f9f9",
  // Without this, `env(safe-area-inset-*)` resolves to 0 on iPhone and the
  // bottom bar sits under the home indicator.
  viewportFit: "cover",
  // Pinch-zoom off, owner's call (2026-08-12): this is an invited six-person
  // app that should feel installed, and stray zooms broke that. The
  // accessibility cost was weighed. Both properties, because iOS honours
  // maximum-scale more reliably than user-scalable.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlassFilter />
        {children}
      </body>
    </html>
  );
}
