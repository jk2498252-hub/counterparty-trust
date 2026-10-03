import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Counterparty Trust Workbench",
  description: "Internal workbench for pre-transaction supplier verification in Kenya",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
