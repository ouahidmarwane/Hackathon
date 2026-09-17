# Workshop Flow Intelligence

An operational intelligence layer for automotive workshop workflows, built for
hackathon challenge C02. It sits above existing workshop systems. For each job it
shows workshop managers where the recorded state and the operational evidence
agree, where they conflict and what evidence is missing. It shows the reasoning
behind each conclusion, and a human approves every change to workflow state.

## Status

Milestone M01.5: Repository & Application Bootstrap.

The repository contains:

- the architecture documentation
- the supplied C02 data, as a fixture
- the canonical domain contracts
- a minimal Next.js application shell

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

## Where to start

| Document | Covers |
|---|---|
| [docs/architecture/product.md](docs/architecture/product.md) | What the product is, who uses it, principles, non-goals |
| [docs/architecture/architecture.md](docs/architecture/architecture.md) | Layers, deterministic vs AI boundary, ingestion path, human approval boundary, security baseline |
| [docs/architecture/glossary.md](docs/architecture/glossary.md) | Canonical terms, evidence classifications, contract values |
| [docs/architecture/data-provenance.md](docs/architecture/data-provenance.md) | SUPPLIED / SYNTHETIC / GENERATED / HUMAN_VALIDATED, supplied-vs-synthetic policy |
| [docs/architecture/c02-fixture.md](docs/architecture/c02-fixture.md) | Fixture format, supplied data, interpretation constraints |
| [docs/architecture/simulation-contract.md](docs/architecture/simulation-contract.md) | Rules the future demo simulator must follow |
| [docs/architecture/domain-model.md](docs/architecture/domain-model.md) | Proposed relationship model for M02 |

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
