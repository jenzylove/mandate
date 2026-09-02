import type { Config } from "tailwindcss";

// Financial, high-trust, consumer surface. Ink-on-paper base with a single
// confident green as the action color; risk states carry their own hues so the
// UI can speak Safe / Balanced / Aggressive without extra chrome.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12130F",
        paper: "#FBFBF7",
        muted: "#6B6F63",
        line: "#E4E4DC",
        action: "#0F9D58",       // primary CTA
        safe: "#2E7D66",
        balanced: "#B8860B",
        aggressive: "#C1503B",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
