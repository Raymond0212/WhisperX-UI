# Repository Knowledge Policy

This file should NOT be edited without explicit human review and approval.

## Purpose

This policy defines how repository knowledge must be structured, maintained, and used so that both humans and agents can navigate the codebase effectively. The goal is to keep repository knowledge discoverable, current, verifiable, and aligned with real system behavior.

This repository does **not** treat `AGENTS.md` as a complete manual. Instead, `AGENTS.md` serves as a concise navigation layer, while the structured documentation under `docs/` acts as the primary knowledge base and system of record.

---

## Guiding Principles

### 1. Progressive disclosure

Documentation must be organized so that a reader or agent can begin with a small, stable entry point and then drill down into more specific documents only when needed.

### 2. Source-of-truth discipline

Detailed knowledge must live in well-defined files and folders rather than in a single monolithic instruction document.

### 3. Verifiability

Documentation should be structured in a way that supports validation through reviews, linters, CI checks, ownership tracking, cross-linking, and freshness checks.

### 4. Repository-local context

Plans, design reasoning, product specifications, technical debt, and generated references should be versioned in the repository whenever they are intended to guide implementation or maintenance.

### 5. Removal over decoration

Documentation structure should reflect actual project needs. If a file or folder does not exist, is obsolete, or has no meaningful content for the current project, it may be removed rather than kept as an empty or misleading placeholder.

---

# Knowledge Structure Standard

## Top-level navigation files

### `AGENTS.md`

`AGENTS.md` must be a short, stable, agent-facing navigation document.

It should:

- provide a concise repository overview;
- identify major documentation entry points;
- explain where to find deeper source-of-truth documents;
- define a minimal set of operational conventions for agents.

It must **not** become a large encyclopedia of rules, implementation detail, or long-lived duplicated content from elsewhere in the repository.

### `ARCHITECTURE.md`

`ARCHITECTURE.md` should provide a top-level architectural map of the system.

It should describe:

- major domains and subsystems;
- layering and dependency direction;
- package or module boundaries;
- system-wide architectural constraints.

This file should help a reader understand how the system is organized before consulting detailed design documents.

---

## `docs/` as the system of record

The `docs/` directory is the repository’s structured knowledge base and should be treated as the primary system of record for detailed project knowledge.

It should contain durable documentation grouped by purpose, rather than accumulating loosely related markdown files without taxonomy.

A representative structure may look like this:

```text
AGENTS.md
ARCHITECTURE.md
docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── ...
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
│   └── db-schema.md
├── product-specs/
│   ├── index.md
│   ├── new-user-onboarding.md
│   └── ...
├── references/
│   ├── design-system-reference-llms.txt
│   ├── nixpacks-llms.txt
│   ├── uv-llms.txt
│   └── ...
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

This layout is illustrative, not mandatory in every case. The repository may omit or remove files and folders that are not applicable to the project.

---

# Folder and File Usage Policy

## `docs/design-docs/`

This directory contains detailed design documentation for important technical decisions, solution structures, constraints, and rationale.

### `docs/design-docs/index.md`

This file should act as the catalog for design documentation. It should help readers locate relevant design documents quickly and may include metadata such as status, ownership, or verification state.

### `docs/design-docs/core-beliefs.md`

This file should document the project’s core engineering and agent-operating principles. It is intended to make foundational assumptions explicit and support consistent decision-making.

### Other files under `docs/design-docs/`

Each document should focus on a bounded design concern. Design documents should explain the problem, constraints, design choice, alternatives considered where relevant, and implications for implementation or maintenance.

---

## `docs/exec-plans/`

This directory contains execution plans and related planning artifacts. Plans are first-class repository knowledge and should be versioned when they matter to implementation continuity.

### `docs/exec-plans/active/`

This directory stores plans for ongoing work. Active plans may include progress status, task decomposition, key decisions, blockers, and updated understanding as implementation proceeds.

### `docs/exec-plans/completed/`

This directory stores completed execution plans for historical reference. Completed plans help preserve decision history and make past implementation logic auditable.

### `docs/exec-plans/tech-debt-tracker.md`

This file should track known technical debt, deferred cleanups, unresolved structural issues, and important maintenance liabilities. It should be concise, current, and actionable.

---

## `docs/generated/`

This directory stores generated reference artifacts derived mechanically from the codebase or related assets.

Generated files must be clearly distinguishable from human-authored documents.

### `docs/generated/db-schema.md`

This file should contain a generated representation of the database schema or data model, where applicable. It should be regenerated from source systems rather than manually curated.

If no database exists or schema generation is not relevant to the project, this file may be omitted.

---

## `docs/product-specs/`

This directory contains product specifications describing intended behavior from a feature and user perspective.

### `docs/product-specs/index.md`

This file should act as a navigation page for product specifications so agents and developers can quickly locate the correct feature-level documentation.

### `docs/product-specs/new-user-onboarding.md`

This file, when applicable, should define the intended behavior, flows, and constraints for the new-user onboarding experience.

### Other files under `docs/product-specs/`

Each specification should describe a bounded product area, feature, or workflow. Product specs should state what the system is expected to do, not merely how it happens to be implemented today.

---

## `docs/references/`

This directory contains curated reference material intended to support implementation work.

Reference material should be concise, relevant, and retrieval-friendly. It should not become a dumping ground for arbitrary external documentation.

### `docs/references/design-system-reference-llms.txt`

This file may contain a compact design-system reference optimized for agent consumption.

### `docs/references/nixpacks-llms.txt`

This file may contain concise guidance relevant to Nixpacks if the project uses Nixpacks in build or deployment workflows.

### `docs/references/uv-llms.txt`

This file may contain concise guidance relevant to `uv` if the project relies on that tool for Python environments or package workflows.

### Other files under `docs/references/`

Additional reference files may be added only when they are materially useful to recurring engineering tasks in the repository.

If a reference file is not used, is stale, or is irrelevant to the project, it should be removed.

---

# Thematic Guidance Documents

The following files under `docs/` are intended as stable, domain-level guidance documents.

## `docs/DESIGN.md`

Defines high-level design standards, conventions, and decision principles for the repository.

## `docs/FRONTEND.md`

Defines frontend-specific conventions, patterns, constraints, and implementation expectations where the project contains a frontend.

## `docs/PLANS.md`

Defines planning conventions, including when to use lightweight plans versus formal execution plans, and how such plans should be maintained.

## `docs/PRODUCT_SENSE.md`

Defines product judgment principles to guide implementation decisions that require more than purely technical reasoning.

## `docs/QUALITY_SCORE.md`

Tracks quality by product domain, subsystem, or architectural layer and highlights known gaps or maturity differences over time.

## `docs/RELIABILITY.md`

Defines reliability expectations, operational safeguards, fault-handling practices, and resilience standards.

## `docs/SECURITY.md`

Defines security expectations, constraints, and implementation guardrails.

These files are optional by project need. A project should include only the files that are genuinely relevant and maintainable.

---

# Existence and Removal Policy

## Principle

Documentation structure must match real project needs.

Accordingly:

- If a listed file or folder does **not exist**, it should not be assumed to be required by default.
- If a file exists but has **no actual content**, no project-specific value, or only placeholder text, there is an explicit option to **remove it**.
- If a file was once relevant but is now obsolete, misleading, or redundant, it should be **deleted or consolidated** rather than preserved as noise.
- Empty structure should not be kept merely for appearance or symmetry.

A smaller, accurate documentation tree is preferred over a larger but partially fake one.

---

# Maintenance Requirements

## Accuracy

All documentation must reflect the actual current system, or clearly state when it is aspirational, historical, or under revision.

## Cross-linking

Important documents should link to adjacent source-of-truth documents where helpful, so that navigation is intentional rather than dependent on search alone.

## Ownership

Important documentation areas should have clear ownership or at least an implicit responsible maintainer group.

## Freshness

Stale documentation should be corrected, archived, or removed. Documentation that cannot be trusted is worse than missing documentation.

## No duplication without purpose

The same rule, specification, or explanation should not be copied into multiple files unless there is a clear reason and a controlled synchronization approach.

## Generated versus authored separation

Generated documentation must be stored separately from authored documentation and should not be edited manually unless explicitly intended.

---

# Agent Rules

These rules apply to agents working in this repository. Keep this file concise and enforceable.

## 1. Load context selectively

Agents must not consume the entire repository knowledge base by default.

Use this order:

1. Read `AGENTS.md`.
2. Inspect the files directly involved in the task.
3. Search for exact symbols, paths, tests, or errors.
4. Open deeper documentation only when it is clearly relevant.

Do not read broad design, product, or planning docs unless the task depends on them.

## 2. Follow existing behavior first

Before changing code, identify the existing local pattern.

Prefer repository conventions over generic best practices when they conflict, unless the convention is unsafe or the task explicitly asks for a change.

## 3. Keep changes narrow

A change should solve the requested problem with the smallest reasonable diff.

Avoid opportunistic rewrites, mass formatting, renames, dependency changes, or architecture changes unless they are required for the task.

## 4. Preserve architecture boundaries

Respect domain boundaries, dependency direction, layering, and ownership conventions.

If architecture rules are documented or enforced by tests or linters, treat them as mandatory. If they are unclear, infer from nearby code and keep the change local.

## 5. Validate with relevant checks

Run the narrowest useful validation for the change.

Examples:

- changed one function: run its unit tests if available;
- changed a route or component: run related tests and type checks if available;
- changed schema or generated output: run generation or migration checks;
- changed documentation only: verify links, filenames, and line count.

Report any validation that could not be run.

## 6. Prefer executable rules over prose

When the same rule causes repeated review comments or bugs, prefer encoding it into tooling.

Use tests, linters, scripts, CI checks, or generated references when practical.

Documentation should explain durable rules. Tooling should enforce recurring invariants.

## 7. Capture durable knowledge

Update repository documentation when a task creates or changes durable knowledge, such as:

- architectural decisions;
- product behavior;
- setup or deployment steps;
- recurring implementation patterns;
- debugging or operational procedures;
- known technical debt.

Do not document transient observations that will not help future work.

## 8. Keep Markdown small

Markdown files must not exceed **500 lines**.

Aim for **about 200 lines** per file. Split by concern when a file grows.

Use links instead of copying the same rule into multiple files.

## 9. Escalate ambiguous judgment

Escalate or clearly flag uncertainty when a task requires unresolved judgment about:

- product direction;
- security risk;
- privacy or compliance;
- foundational architecture;
- ownership boundaries;
- destructive migrations;
- behavior that cannot be validated locally.

Do not hide unresolved tradeoffs behind implementation details.

## 10. Report honestly

Final responses must distinguish completed work from unvalidated assumptions.

Include:

- changed files or areas;
- validation performed;
- validation not performed;
- follow-up risks, if any.
