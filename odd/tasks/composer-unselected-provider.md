# Composer — require an explicit provider selection

## Objective and authority

Product decision (2026-10-20, from the maintainer): the composer must not auto-select a default provider. Until then the provider picker defaulted to the first catalog row (the Rust registration order). Recorded as `.claude/knowledge/business-logic.md` §3.1, item 6.

## Scope and constraints

Branch `feat/composer-unselected-provider`. Frontend only: no Rust change and no change to the provider registration order. Atoms/molecules stay pure, all copy lives in `src/shared/i18n/messages.ts`, strict TypeScript, Vitest in `node` (no DOM).

## Implemented design

- `src/shared/domain/selection-chain.ts` — `resolveSelection` no longer falls back to the catalog's first provider. It returns `null` (the unselected state) when nothing is chosen, while the catalog is empty, and when the chosen provider left the catalog. A chosen provider whose model/effort left the catalog still reconciles to that provider's defaults.
- `src/features/providers/hooks/use-composer-selection.ts` — when a loaded (non-empty) catalog no longer contains the chosen provider, the hook drops the choice during render, so the provider coming back later is not re-selected on the user's behalf. An empty catalog (loading) keeps the choice.
- `src/shared/ui/organisms/composer.tsx` — unselected state: provider chip value `Selecciona un proveedor` (accessible name `Proveedor: sin seleccionar`), a disabled model chip (`Modelo`, accessible name `Modelo: selecciona primero un proveedor`), no effort chip, the send control disabled and described (`aria-describedby`) by a visible hint under the box: `Selecciona un proveedor y un modelo para poder enviar el mensaje.`
- `src/shared/ui/organisms/composer-draft.ts` — pure `submitDraftWithSelection`: with no selection the send is blocked, `onSubmit` is not called and the draft is returned untouched.
- `Button` atom gains `describedBy`; `SelectTrigger` gains `isDisabled`; `ComposerBar` gains `isSendDisabled` / `sendDescriptionId`. All remain props-only.
- `src/app/app-shell.tsx` — unchanged: `handleSubmitPrompt` already returns when the chain is unresolved, which now covers the unselected state.

## Behaviour decisions

- **Model defaulting kept**: after an explicit provider choice, the model and effort still default to the provider's first model at its first supported stop (§3.1, item 2). The provider is the user's explicit decision; the model default is always valid for it and can be changed, so requiring a second explicit pick would add friction without protecting any invariant.
- **Model/effort chips**: the model chip is rendered disabled (it signals the chain order); the effort chip is not rendered until a model exists, because its stops belong to the model.
- **Enter to send**: the composer has no Enter-to-send binding today; the send button and the pure submit rule are the only submit paths, and both are blocked while unselected.

## Actionable checklist

- [x] **T1 — Domain.** `selection-chain.test.ts`: unselected initial state, explicit choice enables the chain, model reconciliation inside a chosen provider, removed provider → unselected, empty catalog.
- [x] **T2 — Hook.** `use-composer-selection.test.ts` (new): starts unselected, model/effort ignored while unselected, provider choice enables the chain, removed provider → unselected and not re-selected, empty catalog keeps the choice.
- [x] **T3 — Composer.** `composer.test.tsx`: "not defined yet" chip, disabled model chip, no effort chip, disabled send described by the hint, draft kept, hint dropped once selected. `composer-draft.test.ts`: send blocked keeps the draft.
- [x] **T4 — Shell.** `app-shell-live-run-seam.test.tsx`: no run starts while unselected or after the chosen provider leaves the catalog.

## Verification observed (builder self-check — not QA)

| Check                | Result                                           |
| -------------------- | ------------------------------------------------ |
| `pnpm test`          | 584 passed (93 files); +16 tests                 |
| `pnpm run check`     | clean (format, lint, typecheck, rustfmt, clippy) |
| `pnpm run rust:test` | green                                            |

Known limitation: not exercised in a browser or the native webview; covered by static-render and hook-runner tests only.
