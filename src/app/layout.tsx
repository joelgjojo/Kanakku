import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/AppShell";
// Self-hosted so the app keeps its look with no internet at the shop.
import "@fontsource-variable/anek-malayalam/standard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kanakku",
  description: "Your shop's accounts from your notebook and WhatsApp. Speak a bill, photograph a page, track pattu.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#eef1ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
