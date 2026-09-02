import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mandate",
  description:
    "Start from what you want your money to do. mandate turns BNB Chain agents into understandable, evidence-backed outcomes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
