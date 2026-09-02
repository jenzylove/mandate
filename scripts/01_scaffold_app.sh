#!/usr/bin/env bash
#
# Milestone 01 — Application scaffold
# -----------------------------------
# Installs Next.js 14 + TypeScript + Tailwind and Vitest, writes the base
# config, root layout, a minimal home page, and a /health API route so the app
# boots and builds. No product screens yet; that is milestone 04.
#
# Safe to run once from the repo root. Verifies typecheck + production build.

set -euo pipefail
ROOT="$(pwd)"
[[ -d "$ROOT/scripts" ]] || { echo "ERROR: run from repo root." >&2; exit 1; }

echo "==> Milestone 01: application scaffold"

# --- package.json ------------------------------------------------------------
cat > "$ROOT/package.json" <<'EOF'
{
  "name": "mandate",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
EOF

# --- dependencies ------------------------------------------------------------
# Pin majors that are known-compatible with Node 22 and Next 14.
echo "  - installing runtime deps (next/react)..."
npm install --silent --no-audit --no-fund \
  next@14.2.15 react@18.3.1 react-dom@18.3.1

echo "  - installing dev deps (typescript/tailwind/vitest)..."
npm install --silent --no-audit --no-fund --save-dev \
  typescript@5.6.3 @types/node@22.7.5 @types/react@18.3.11 @types/react-dom@18.3.1 \
  tailwindcss@3.4.14 postcss@8.4.47 autoprefixer@10.4.20 \
  vitest@2.1.3

# --- tsconfig ----------------------------------------------------------------
cat > "$ROOT/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "ES2021"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@data/*": ["./data/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# --- next config -------------------------------------------------------------
cat > "$ROOT/next.config.mjs" <<'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
EOF

# --- tailwind / postcss ------------------------------------------------------
cat > "$ROOT/tailwind.config.ts" <<'EOF'
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
EOF

cat > "$ROOT/postcss.config.mjs" <<'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF

# --- app shell ---------------------------------------------------------------
cat > "$ROOT/src/app/globals.css" <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}
body {
  background: theme('colors.paper');
  color: theme('colors.ink');
}
EOF

cat > "$ROOT/src/app/layout.tsx" <<'EOF'
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
EOF

cat > "$ROOT/src/app/page.tsx" <<'EOF'
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-sm text-muted">BNB Chain outcome marketplace</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Start from what you want your money to do.
      </h1>
      <p className="mt-4 max-w-prose text-muted">
        Browse agents if you know what you need. Start from an outcome if you
        do not. Scaffold is live; product surfaces arrive in later milestones.
      </p>
    </main>
  );
}
EOF

# Health route: cheap runtime signal the build/boot is honest.
mkdir -p "$ROOT/src/app/api/health"
cat > "$ROOT/src/app/api/health/route.ts" <<'EOF'
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ status: "ok", service: "mandate" });
}
EOF

# --- vitest config -----------------------------------------------------------
cat > "$ROOT/vitest.config.ts" <<'EOF'
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@data": resolve(__dirname, "data"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
EOF

# A trivial test so `npm test` is green from milestone 01 onward.
cat > "$ROOT/tests/scaffold.test.ts" <<'EOF'
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
EOF
rm -f "$ROOT/tests/.gitkeep"

# --- verification ------------------------------------------------------------
echo "==> Verifying milestone 01"
echo "  - typecheck"
npx tsc --noEmit
echo "  - unit tests"
npx vitest run
echo "  - production build"
npx next build

test -f "$ROOT/.next/BUILD_ID" || { echo "FAIL: no build output"; exit 1; }
echo "  - all checks passed"

# --- commit ------------------------------------------------------------------
git add -A
if git diff --cached --quiet; then
  echo "  - nothing to commit"
else
  git commit -q -m "Milestone 01: Next.js 14 + TS + Tailwind scaffold, health route, vitest"
  echo "  - committed"
fi

echo "==> Milestone 01 complete."
echo "    Next: git push origin main   (then: bash scripts/02_data_layer.sh)"
