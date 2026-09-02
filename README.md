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
