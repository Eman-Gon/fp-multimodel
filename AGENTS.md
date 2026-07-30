# AGENTS.md

Repository instructions for coding agents working on Final Particle Gesture
Coder.

## Read First

Read `CLAUDE.md` before making product or data-model changes. It contains the
research constraints, controlled vocabularies, pipeline boundaries, timing
rules, and human-review requirements. `docs/product-spec.md` is the behavioral
product specification.

If documentation and code disagree, do not silently choose one. Preserve
research integrity, identify the mismatch, and update the relevant source of
truth as part of the change when it is in scope.

## Repository Map

- `src/fp_multimodel/` — Python Track A: media preparation, transcript
  validation, MFA corpus/alignment, and final-particle detection
- `lib/track-b/` — TypeScript Track B: analysis windows, Pegasus contracts,
  MediaPipe motion intervals, and gesture reconciliation
- `lib/track-c/` — review types, state machine, demo repository, and fixtures
- `app/` and `components/` — Next.js App Router UI and API routes
- `lib/vocab.ts` — complete TypeScript controlled vocabularies
- `src/fp_multimodel/vocab.py` — Track A particle and sentence-type subset
- `tests/` — Python and TypeScript tests
- `docs/product-spec.md` — current product requirements

## Non-Negotiable Data Rules

- Store canonical time as absolute integer milliseconds on the source-video
  timeline. Frames are display-only derived values.
- Preserve `video_id` through every artifact. Never mix timelines, speakers,
  transcripts, or processing state across videos.
- Preserve stable particle `instance_id` values across Track A, B, and C.
- Normalize traditional `嗎` to canonical `吗`, retaining `surface_form`.
- Keep the validated seven-token detector separate from the extended
  researcher-supplied candidate inventory. Candidate and stacked forms require
  contextual human review before inclusion in corpus counts.
- Treat every model value as a suggestion until a human explicitly reviews it.
- Keep the original suggestion and provenance after acceptance or editing.
- Never include draft clips in confirmed-corpus insights.
- Derive `FP_count` from particle instances.
- Treat discourse, utterance, sentence, and clause as distinct hierarchical
  context levels; do not flatten them into one transcript field.
- Store researcher-supplied participant region/dialect metadata with its
  evidence and confirmation state. Never infer regional origin and present it
  as fact.

## Development Commands

```bash
# Python
uv sync
uv run pytest
uv run fp-track-a --help

# TypeScript / Next.js
npm install
npm test
npm run typecheck
npm run build
```

Run targeted tests while iterating and the relevant full suites before
handoff. For cross-track contract changes, test both runtimes.

## Working Conventions

- Keep controlled vocabularies centralized; do not duplicate ad hoc string
  unions in components or routes.
- Keep provider integrations behind the existing narrow interfaces so tests
  do not require credentials or heavyweight CV dependencies.
- Maintain optimistic version checks in Track C review mutations.
- Persist production annotations through a repository or data-file boundary;
  do not rely on browser component state as the saved record.
- Render FP emphasis in the transcript UI; do not add formatting markers to
  canonical transcript text.
- Label fixture/demo data clearly and never present it as research findings.
- Do not edit generated directories or caches (`.next/`, `node_modules/`,
  `.venv/`, `__pycache__/`, `.pytest_cache/`, `tsconfig.tsbuildinfo`).
- Preserve unrelated uncommitted user changes.

## Current Implementation Boundary

Implemented UI routes are `/`, `/queue`, `/clips/[clipId]`, and `/explore`.
Implemented APIs provide clip-detail review commands and demo reset; the queue
currently reads the in-memory demo repository directly. Transcript-review,
ingest/alignment orchestration, Neo4j graph, insights, and export remain
planned unless the codebase has since added them.
