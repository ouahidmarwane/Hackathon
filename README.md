# Workshop Flow Intelligence

An operational intelligence layer for automotive workshop workflows, built for
hackathon challenge C02. It sits above existing workshop systems. For each job it
shows workshop managers where the recorded state and the operational evidence
agree, where they conflict and what evidence is missing. It shows the reasoning
behind each conclusion, and a human approves every change to workflow state.

## Status

Milestone M02: Reviewed operational model deployed to the existing Supabase
project. PostgreSQL regression, C02 source loading, and remote idempotency checks
passed. Real public configuration and browser/server client initialization are
verified. The M02 checkpoint includes the reviewed migration and regression tests.

The repository contains:

- the architecture documentation
- the supplied C02 data, as a fixture
- the canonical domain contracts
- a minimal Next.js application shell
- local operational schema, validated ingestion boundary, and C02 fixture loader

No product features are implemented yet.

Stack: Next.js (App Router), TypeScript, Tailwind CSS, Supabase and Vitest.

## Development

Requirements: Node.js 24 and npm.

```bash
npm install
cp .env.example .env.local   # optional until Supabase is used
npm run dev                  # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js route types, then run `tsc --noEmit` |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Create a production build |

Environment variables are listed in [.env.example](.env.example). Put real
values only in `.env.local`, which git ignores.

The official Supabase CLI is pinned as a project dev dependency. Use
`npx --no-install supabase <command>`. Install dependencies with lifecycle scripts
disabled (`npm install --ignore-scripts`); do not approve the skipped resolver
script. `supabase/config.toml` is local CLI configuration with automatic seeding
disabled. Linking state and deployment preparation under `supabase/.temp/`
are ignored. Remote application remains subject to the reviewed deployment gate.

## Where to start

| Document | Covers |
|---|---|
| [docs/architecture/product.md](docs/architecture/product.md) | What the product is, who uses it, principles, non-goals |
| [docs/architecture/architecture.md](docs/architecture/architecture.md) | Layers, deterministic vs AI boundary, ingestion path, human approval boundary, security baseline |
| [docs/architecture/glossary.md](docs/architecture/glossary.md) | Canonical terms, evidence classifications, contract values |
| [docs/architecture/data-provenance.md](docs/architecture/data-provenance.md) | SUPPLIED / SYNTHETIC / GENERATED / HUMAN_VALIDATED, supplied-vs-synthetic policy |
| [docs/architecture/c02-fixture.md](docs/architecture/c02-fixture.md) | Fixture format, supplied data, interpretation constraints |
| [docs/architecture/simulation-contract.md](docs/architecture/simulation-contract.md) | Rules the future demo simulator must follow |
| [docs/architecture/domain-model.md](docs/architecture/domain-model.md) | M02 schema, ingestion, fixture loading, RLS assumptions, and deferred decisions |

Supplied data: [fixtures/c02/c02-supplied.json](fixtures/c02/c02-supplied.json).

## Invariants

1. Facts that can be computed come from the deterministic engine, never from an LLM.
2. Evidence classification (`SUPPORTED`, `CONFLICTING_EVIDENCE`,
   `INSUFFICIENT_EVIDENCE`) and operational diagnosis are separate dimensions.
3. The system proposes changes to workflow state. They run on the server only
   after a human approves them.
4. Every record carries its provenance. Synthetic data is never presented as
   supplied.
5. All inputs enter through the same validated event ingestion interface. This
   includes the future demo simulator.
6. The product never produces employee performance scores.
