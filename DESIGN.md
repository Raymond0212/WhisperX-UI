---
version: "alpha"
name: "WhisperX UI"
description: "Local-first transcription review workspace using a rail, derived tree sidebar, and main work pane."
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.148 0.004 228.8)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.148 0.004 228.8)"
  primary: "oklch(0.218 0.008 223.9)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.963 0.002 197.1)"
  secondary-foreground: "oklch(0.218 0.008 223.9)"
  muted: "oklch(0.963 0.002 197.1)"
  muted-foreground: "oklch(0.495 0.013 225.4)"
  accent: "oklch(0.963 0.002 197.1)"
  accent-foreground: "oklch(0.218 0.008 223.9)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-foreground: "oklch(0.985 0 0)"
  border: "oklch(0.925 0.005 214.3)"
  input: "oklch(0.925 0.005 214.3)"
  ring: "oklch(0.723 0.014 214.4)"
typography:
  heading:
    fontFamily: "Geist Variable"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0px"
  body:
    fontFamily: "Geist Variable"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0px"
  label:
    fontFamily: "Geist Variable"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  transcript:
    fontFamily: "Geist Variable"
    fontSize: "0.9375rem"
    fontWeight: 450
    lineHeight: 1.5
    letterSpacing: "0px"
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.625rem"
  lg: "0.875rem"
  xl: "1rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  rail: "4.75rem"
  secondary-sidebar: "18rem"
  header: "4rem"
  pane-gap: "0px"
components:
  section-rail:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    width: "{spacing.rail}"
    padding: "{spacing.sm}"
  tree-sidebar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    width: "{spacing.secondary-sidebar}"
    padding: "{spacing.lg}"
  main-pane:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "2.5rem"
  secondary-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
    height: "2.5rem"
  rail-button-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    size: "3.5rem"
  tree-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  transcript-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.transcript}"
    padding: "{spacing.lg}"
  inline-editing:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
    typography: "{typography.transcript}"
    rounded: "{rounded.sm}"
framework:
  runtime: "Vite React"
  designSystem: "official shadcn/ui"
  shadcnPreset: "b7BYR8lAg"
  shadcnStyle: "radix-vega"
  shadcnBaseColor: "mist"
  icons: "lucide-react"
  cssSource: "frontend/src/styles.css"
---

# DESIGN.md

## Overview

WhisperX UI is a single-user, local-first transcription workspace. The interface must feel like a compact desktop tool: calm, structured, information-dense, and predictable. It is not a marketing site, dashboard sampler, or decorative demo surface.

The durable visual model is a three-level hierarchy: a left section rail for top-level mode changes, a secondary derived tree/sidebar for choosing records or smart views, and a main pane for detailed transcription work. Backend API contracts and persisted schemas do not define folders; tree structure is derived from current audio, jobs, speakers, transcript state, and settings categories.

This file is the design-system memory for future UI work. Token values are normative where they match `frontend/src/styles.css`; prose explains how to apply them.

## Colors

Use a quiet neutral system with dark ink actions. The current shadcn preset supplies the base: white surfaces, cool mist secondary areas, dark primary controls, and subtle borders. Avoid purple defaults, gradient-heavy decoration, glass panels, and high-saturation accents unless a future product spec explicitly introduces them.

Primary actions such as `Process` use `primary` on `primary-foreground`. Secondary actions use white or muted card treatments with clear borders. Destructive actions use `destructive` only when the action deletes persisted data or cancels a running workflow.

Selection is expressed with dark rail buttons, subtle sidebar row fills, checkmarks, or light inline highlights. Do not use large blue debugging-style fills as intentional app styling.

## Typography

Use `Geist Variable` for the product UI. The typographic tone is compact and utilitarian: short labels, clear metadata, and readable transcript text.

Headings should be concise and task-oriented, for example `Library`, `Jobs`, `Speakers`, `Settings`, `Current file`, and `Speaker Settings`. Labels use uppercase sparingly for section grouping and metadata, not for long text.

Transcript text should not change font, size, line height, or margins when entering inline edit mode. Editing may add a small highlight and caret only. Use the reusable `.inline-editing` class for inline text or speaker-name edits.

## Layout

The desktop shell uses three columns: `4.75rem` rail, `18rem` secondary sidebar, and a flexible main pane. The secondary sidebar header and main-pane file header align at `4rem` high. This alignment is part of the product structure and should not drift between sections.

The left rail shows icon plus name below the icon. `Library`, `Jobs`, and `Speakers` sit in the primary navigation group. `Settings` sits at the bottom with a divider above it and opens a modal; it must not mutate the active background section just to show settings content.

The secondary sidebar is a tree-like chooser, not a persisted folder system. Use derived groups such as audio items, smart job views, not started jobs, completed jobs, failed jobs, and speakers from the selected transcript.

The main pane owns the active workflow. Empty main-pane states must occupy the whole right section and center the message `Select Something to Begin Your Journey`.

## Elevation & Depth

Depth is minimal. Prefer borders, row dividers, and muted fills over shadows. Modals may use a backdrop and a modest shadow to indicate focus. Sidebars should feel attached to the shell, not like floating cards.

The settings dialog overlays the existing app state. Do not change the rail selection, secondary sidebar contents, or selected file purely because the dialog is open.

## Shapes

Use restrained rounded corners. Buttons and inputs use medium radius. Rail active buttons may use stronger rounding to read as mode selection. Large panels should usually be squared to the shell with borders instead of floating rounded cards.

Inline editing uses a small-radius highlight only. It should never introduce text boxes, layout shifts, new margins, or font-size changes.

## Components

Core reusable components are:

- `AppShell`: owns rail, secondary sidebar, main-pane layout, and settings modal state.
- `SectionRail`: renders top-level sections with icon/name vertical buttons and bottom settings action.
- `TreeSidebar`: renders section-specific derived navigation and smart views.
- `MainPane`: hosts the active file workspace, empty journey state, and transcript review.
- `PaneHeader`: aligned header pattern shared by tree sidebar and main pane.
- `ActionToolbar`: compact action grouping for process, stop, download, delete, and export controls.
- `TranscriptWorkbench`: tabs, sentence list, speaker-turn list, audio strip, and editor flows.

Use official `shadcn/ui` React components for primitives where practical. Do not replace the system with handwritten component libraries or Vue-specific shadcn ports unless the repository product direction changes again.

## Do's and Don'ts

- Do preserve the rail/tree/main hierarchy for every primary workflow.
- Do derive tree contents from existing API data instead of inventing backend folders.
- Do keep selected rail items visibly highlighted.
- Do keep settings modal-only unless a future requirement introduces a full settings workspace.
- Do keep transcript and speaker inline editing visually stable with `.inline-editing`.
- Do validate desktop and mobile layouts in the browser after structural UI changes.
- Do not reintroduce the old two-pane or glass-style layout.
- Do not persist visual tree state as backend schema without a product spec.
- Do not use generic empty cards when the main pane has no active content.
- Do not let edit mode change transcript row typography, spacing, or row height.

## Stitch Workflow Notes

When using AI-assisted visual iteration, describe the intended structure before describing decorative styling. Start with the product task, the hierarchy, and the reusable components. Then specify constraints: local-first app, no backend schema changes for folders, shadcn preset, and transcript workflow parity.

Useful prompt shape for future design iteration:

`Design a local-first transcription review workspace with a left section rail, derived tree sidebar, and main pane. Preserve upload, process, stop, transcript edit, speaker rename, playback, settings, and VTT export workflows. Use official shadcn/ui with the existing mist/radix-vega tokens. Keep inline editing visually stable and avoid decorative marketing layouts.`

AI-generated designs must be treated as drafts. Before implementation, map every visual idea to current data, API contracts, and reusable components. After implementation, verify in the browser rather than relying on static screenshots.

## Implementation Mapping

The authoritative implementation files are:

- `frontend/components.json` for shadcn setup, preset metadata, aliases, and icon library.
- `frontend/src/styles.css` for actual CSS variables, layout classes, and reusable utility classes.
- `frontend/src/components/AppShell.jsx` for the shell hierarchy.
- `frontend/src/components/LibraryPanel.jsx` for the secondary derived tree/sidebar.
- `frontend/src/components/WorkspacePanel.jsx` for main-pane workflow content.

If this file and implementation drift, update both in the same change when the drift represents durable design knowledge.

## Validation

Design changes should pass the narrowest relevant checks before being reported complete:

- `cd frontend && npm test`
- `cd frontend && npm run build`
- Browser inspection at desktop width for rail/sidebar/header alignment.
- Browser inspection at mobile width for usable stacking or scrolling behavior.
- Manual workflow checks for upload, process/stop, transcript sentence edit, speaker rename, playback, VTT export, delete actions, and settings save when the affected UI touches those flows.
