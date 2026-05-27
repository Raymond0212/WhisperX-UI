# Orchestration Guide

This guide defines the repository's multi-agent implementation workflow. Use it when a task is broad enough to benefit from independent verification, implementation, and documentation review.

## Required Starting Context

Every orchestrated agent starts by reading:

- `docs/REPOSITORY-KNOWLEDGE-POLICY.md`
- `AGENTS.md`

Agents must discover requirements from repository documentation, source code, and tests. They should not infer durable project requirements from a user prompt alone.

## Roles

### Main Orchestrator

- Grounds the task in repository policy, documentation, source, and tests.
- Spawns and supervises subagents.
- Consolidates verifier findings into implementation briefs.
- Reviews subagent output before accepting completion.
- Stops repeated loops when the same blocker persists.

### Test Coverage Verifier

- Reviews relevant tests, source, and documented testing expectations.
- Identifies missing coverage, weak assertions, brittle tests, and untested edge cases.
- Reports findings without making implementation changes unless explicitly instructed.

### Completeness Verifier

- Compares the current repository state against repository-discovered requirements.
- Identifies missing behavior, integration gaps, regressions, and unresolved ambiguity.
- Reports findings without making implementation changes unless explicitly instructed.

### Developer

- Uses verifier outputs as the primary work queue.
- Inspects relevant documentation and source before editing.
- Makes minimal, targeted code, configuration, and test changes.
- Reports changed files, tests added or updated, tests run, remaining risks, and blockers.

### Documentation Generator

- Runs after implementation and test coverage are acceptable, or for documentation-only reconsolidation tasks.
- Updates documentation according to repository policy and actual source/test behavior.
- Prefers updating existing documents over creating overlapping files.
- Distinguishes intended product behavior from current implementation facts.

### Documentation Reviewer

- Reviews generated documentation against source code, tests, and repository policy.
- Flags unsupported implementation claims, stale links, duplicated guidance, and missing source-of-truth references.
- Confirms whether documentation is ready or needs another generator pass.

## Standard Workflow

1. Ground in `docs/REPOSITORY-KNOWLEDGE-POLICY.md`, `AGENTS.md`, and relevant repository docs.
2. Run test coverage and completeness verification before implementation work.
3. Convert verifier findings into a concise developer brief.
4. Run developer work only when verifiers identify real gaps.
5. Repeat verification before accepting implementation completion.
6. Run documentation generation after implementation and tests are acceptable, or immediately for documentation-only tasks.
7. Run documentation review against the final diff.
8. Produce a final summary with requirements discovered, changes made, tests run, remaining risks, and final verdict.

For documentation-only reconsolidation, use a shortened loop:

```text
documentation generator -> documentation reviewer -> orchestrator reconciliation -> final validation
```

## Global Rules

- Treat the repository implementation and tests as ground truth for current behavior.
- Treat product specs and design docs as intended behavior, but label planned or deferred items when code does not support them.
- Keep `AGENTS.md` short and navigational.
- Keep durable knowledge under `docs/` and avoid duplicating long guidance across multiple files.
- Remove or correct stale placeholders, broken links, and obsolete claims.
- Report only tests that were actually run.
