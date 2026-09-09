import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
export const metadata: Metadata = {
  title: "Mandate — Your money. Your mandate.",
  description:
    "Discover BNB agents and outcomes for what you want your money to achieve.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
  openGraph: {
    title: "Mandate — Your money. Your mandate.",
    description: "Choose an outcome, assemble BNB financial agents, and keep evidence of the work.",
    type: "website",
  },
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
                Marketplace on BNB Chain · Evidence read from each agent, not live
                performance.
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
