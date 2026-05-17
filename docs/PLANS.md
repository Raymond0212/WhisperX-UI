# Planning Guidance

## Purpose

Plans are repository knowledge when they guide implementation continuity. Store durable plans under `docs/exec-plans/`.

## Active Plans

Use `docs/exec-plans/active/` for plans that still guide unfinished work. Active plans may include:

- implementation phases
- acceptance criteria
- known blockers
- decisions made during development
- deferred work discovered during implementation

## Completed Plans

Use `docs/exec-plans/completed/` only when completed plans exist and remain useful for historical reference. Do not create empty completed-plan placeholders.

## Tech Debt

Use [docs/exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) for concise, actionable deferred work and maintenance liabilities.

## Plan Maintenance

- Update active plans when implementation changes direction.
- Move or summarize completed plans when they no longer represent active work.
- Prefer one clear plan per initiative over several overlapping plans.
