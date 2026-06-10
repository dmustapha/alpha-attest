import type { Metadata } from "next";
import { Figtree, DM_Mono } from "next/font/google";
import Providers from "../components/Providers";
import "./globals.css";

const figtree = Figtree({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AlphaAttest — AI Financial Signal Marketplace",
  description:
    "Every AI financial analysis cryptographically committed to IPFS before publication. Hold AI to account.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "AlphaAttest — AI Financial Signal Marketplace",
    description:
      "Every AI financial analysis cryptographically committed to IPFS before publication. Hold AI to account.",
    url: "https://alpha-attest.vercel.app",
    siteName: "AlphaAttest",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AlphaAttest" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlphaAttest — AI Financial Signal Marketplace",
    description: "Every AI financial analysis cryptographically committed to IPFS before publication.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${dmMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
