import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
export const metadata: Metadata = {
  title: "Mandate — Your money. Your mandate.",
  description:
    "Discover BNB agents and outcomes for what you want your money to achieve.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          {children}
          <footer className="footer">
            <div className="shell">
              <span>mandate. · Your money. Your mandate.</span>
              <span>
                Demo marketplace on BNB Chain · Seeded evidence, not live
                performance.
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
