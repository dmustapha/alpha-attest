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
