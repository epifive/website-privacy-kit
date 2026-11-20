import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Fonts ship with the project (SIL Open Font License) so no third-party CDN is contacted.
// Not preloaded and `optional`: text paints at once in the size-adjusted fallback; the
// font is used when it arrives within the short block period (or from the cache on the
// next page), so slow phones do not wait for ~70 KB of fonts and nothing shifts later.
const body = localFont({
  src: "../fonts/instrument-sans.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "optional",
  preload: false,
});

const display = localFont({
  src: "../fonts/bricolage-grotesque.woff2",
  variable: "--font-display-face",
  weight: "200 800",
  display: "optional",
  preload: false,
});

const code = localFont({
  src: "../fonts/jetbrains-mono.woff2",
  variable: "--font-code",
  weight: "100 800",
  display: "swap",
  // Only code snippets use it: not worth 40 KB before the first paint on slow mobile networks.
  preload: false,
});

export const metadata: Metadata = {
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${display.variable} ${code.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
