#!/usr/bin/env bash
#
# Milestone 00 — Repository foundation
# ------------------------------------
# Initializes Git, lays down the top-level directory architecture, and writes
# the baseline meta files (.gitignore, README, .nvmrc, .editorconfig).
# No application dependencies are installed here on purpose: this milestone is
# the deterministic skeleton everything else builds on.
#
# Safe to run once from the repo root. Verifies a clean, initialized repo.

set -euo pipefail

# --- guard: must run from repo root -----------------------------------------
ROOT="$(pwd)"
if [[ ! -d "$ROOT/scripts" ]]; then
  echo "ERROR: run this from the repo root (the dir that contains scripts/)." >&2
  exit 1
fi

echo "==> Milestone 00: repository foundation in $ROOT"

# --- git init (idempotent) ---------------------------------------------------
if [[ ! -d .git ]]; then
  git init -q
  echo "  - git initialized"
else
  echo "  - git already initialized"
fi

# Ensure a committer identity exists so this script is self-contained.
git config user.name  >/dev/null 2>&1 || git config user.name  "mandate-bot"
git config user.email >/dev/null 2>&1 || git config user.email "mandate-bot@localhost"

# Default branch -> main
git symbolic-ref HEAD refs/heads/main 2>/dev/null || true

# --- directory architecture --------------------------------------------------
# This is the product's spine. Kept flat and legible; maps to the PRD's
# information architecture (routes) and data model.
DIRS=(
  "src/app"                 # Next.js App Router routes (milestone 01/04)
  "src/components"          # shared UI primitives
  "src/lib"                 # framework-agnostic logic (engine, adapters)
  "src/lib/data"            # data adapter interface + implementations
  "src/lib/engine"          # deterministic recommendation engine
  "src/lib/domain"          # PRD data-model types
  "src/config"              # chain / app config
  "data/seed"               # seeded JSON: agents, outcomes, evidence
  "tests"                   # vitest specs
  "scripts"                 # milestone build scripts (this dir)
  "docs"                    # architecture notes
)
for d in "${DIRS[@]}"; do
  mkdir -p "$ROOT/$d"
done
echo "  - directory architecture created (${#DIRS[@]} dirs)"

# Keep intentionally-empty dirs tracked until code lands in them.
for d in src/components src/config tests docs; do
  [[ -z "$(ls -A "$ROOT/$d" 2>/dev/null)" ]] && touch "$ROOT/$d/.gitkeep"
done

# --- .gitignore --------------------------------------------------------------
cat > "$ROOT/.gitignore" <<'EOF'
# deps
node_modules/
.pnp
.pnp.js

# next
.next/
out/
next-env.d.ts

# build / test output
dist/
coverage/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local

# os / editor
.DS_Store
Thumbs.db
*.log
npm-debug.log*
.vscode/
.idea/
EOF
echo "  - .gitignore written"

# --- node version pin --------------------------------------------------------
echo "22" > "$ROOT/.nvmrc"

# --- editorconfig ------------------------------------------------------------
cat > "$ROOT/.editorconfig" <<'EOF'
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2
EOF

# --- README ------------------------------------------------------------------
cat > "$ROOT/README.md" <<'EOF'
# mandate

Consumer marketplace for BNB Chain financial agents. Users start from a
financial **outcome** ("keep my Venus position safe", "put idle stablecoins to
work") or browse agents directly. The product turns the agent ecosystem into
understandable, evidence-backed outcomes.

Built for the BNB Chain *Build the Era* hackathon.

## Architecture

```
src/
  app/            Next.js App Router routes
  components/     shared UI primitives
  lib/
    domain/       data-model types (Agent, Outcome, Recommendation, ...)
    data/         data adapter interface + seeded JSON implementation
    engine/       deterministic recommendation engine (no LLM)
  config/         chain / app config (BNB Smart Chain)
data/
  seed/           seeded JSON: agents, outcomes, evidence (demo-labeled)
tests/            vitest specs
scripts/          numbered milestone build scripts
```

## Milestone build workflow

The repo is built through numbered, self-verifying Bash milestones. Each is
safe to run once from the repo root, creates its files, installs what it needs,
runs its own tests, and commits on green.

```
bash scripts/00_init_repo.sh
bash scripts/01_scaffold_app.sh
bash scripts/02_data_layer.sh
bash scripts/03_recommendation_engine.sh
bash scripts/04_routes_and_wallet.sh
```

After each milestone commits, push it:

```
git push origin main
```

## Data honesty

Seeded/demo evidence is labeled as such in the data layer. The product never
presents demo data as live production data, and never fabricates projected
returns. See `data/seed/` and `src/lib/domain/`.
EOF
echo "  - README written"

# --- architecture note -------------------------------------------------------
cat > "$ROOT/docs/architecture.md" <<'EOF'
# Architecture decisions

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind for styling
- wagmi + viem for BNB Smart Chain wallet connection
- Vitest for unit tests

## Data
- Seeded JSON behind a `DataAdapter` interface. A live agent-inventory source
  (e.g. an ERC-8004 / 8004scan API) can be swapped in later by implementing the
  same interface, without touching the UI or engine.

## Recommendation engine
- Deterministic and inspectable (PRD §22). No LLM in the core consumer flow.
- Produces Safe / Balanced / Aggressive setups and a transparent Fit Score
  with exposed reasons (PRD §14).

## Data provenance
- Every evidence record carries a `provenance` field: `live | historical |
  demo | unavailable`. The UI must distinguish these; demo data is labeled.
EOF

# --- verification ------------------------------------------------------------
echo "==> Verifying milestone 00"
test -d .git                     || { echo "FAIL: no .git"; exit 1; }
test -f .gitignore               || { echo "FAIL: no .gitignore"; exit 1; }
test -f README.md                || { echo "FAIL: no README"; exit 1; }
for d in "${DIRS[@]}"; do
  test -d "$ROOT/$d" || { echo "FAIL: missing dir $d"; exit 1; }
done
echo "  - all checks passed"

# --- commit ------------------------------------------------------------------
git add -A
if git diff --cached --quiet; then
  echo "  - nothing to commit (already up to date)"
else
  git commit -q -m "Milestone 00: repository foundation, structure, and meta files"
  echo "  - committed"
fi

echo "==> Milestone 00 complete."
echo "    Next: git push origin main   (then: bash scripts/01_scaffold_app.sh)"
