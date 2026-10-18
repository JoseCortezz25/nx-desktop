# Issue 14 — Subagents: list and detail

## Objective and authority

Implement [issue #14](https://github.com/JoseCortezz25/nx-desktop/issues/14) on
branch `feat/issue-14-subagents`, stacked on `feat/issue-13-diff-view` merged on
2026-10-18; base commit `8fca4df` (48 test files / 307 tests, `format:check`,
`lint`, `typecheck` clean).

The maintainer set the integration model this session: the right panel is
opened by the rail's panel toggle; inside the panel each viewer is reachable
(files/code, diff — #13 built it — and subagents). The #13 reachability pattern
(surface + the way it is reached, mirrored one-to-one) is the reference the
maintainer approved ("ya está listo el issue 13, podemos tomarlo de
referencia"). No IPC, no Rust, no provider contracts; all data is typed mock.

The full view surface follows wireframes 21 (`21-subagents-list.html`) and 22
(`22-subagent-detail.html`).

## Specs

S1. Issue #14, "What to build": "Right panel 'Subagents' tab: grouped list with
avatar, name, status and elapsed time, and a detail view with model, effort and
transcript (collapsed earlier messages)."

S2. Acceptance criterion: "List to detail navigation and back".

S3. Acceptance criterion: "Status is a discriminated union, not a string". The
locked vocabulary is `business-logic.md` §3.2 / decision 2026-10-16 (recorded in
`docs/wireframes/README.md` "Open questions" item 7): `processing`, `finished`,
`failed`, `cancelled`, and a subagent can be stopped individually.

S4. Acceptance criterion: "Components classified into `atoms/`, `molecules/`,
`organisms/` with correct import direction".

S5. Acceptance criterion: "All UI copy lives in `messages.ts`; no wireframe
placeholder text hardcoded (`ChatGPT`, `GPT-6.1 Sol`, ...)". Wireframe names
and model strings stay mock **data** (typed fixture values), never component
constants;了解到 the seeded demo follows the repository's existing mock ids.

S6. Acceptance criterion: "Data comes from typed interfaces backed by mock data
(no IPC yet)". The shared domain record already exists
(`src/shared/domain/subagent.types.ts`, seeded by #5, zero consumers): it is
**reused, not redefined**, and evolves to satisfy the S3 AC — `SubagentStatus`
becomes the discriminated union `{ kind }` over the locked four-state
vocabulary. Same seam shape as #12/#13: a `SubagentRepository` port + mock
adapter + a feature hook owning the local state, including the individual stop
transition (`processing` → `cancelled`, `business-logic.md` §3.2).

S7. Acceptance criterion (maintainer integration decision): the Subagentes tab
follows the #13 `Cambios` pattern — `PanelTab` gains a `subagents` kind, the
strip draws it with the user glyph and **no close control** (deviation the
closest wireframe draws a close X; recorded: with no conversation opener the
close would strand the only reachable viewer, exactly the rationale #13 used).
The tab opens with the wireframe-drawn conversation subagent-activity rows:
`ToolCallKind` gains `subagent`, the row of that kind becomes a control, and
pressing a row opens the tab **and** that subagent's detail.

S8. Acceptance criterion: "`pnpm typecheck`, `pnpm lint` and `pnpm format:check`
pass", plus the full suite at delivery.

S9. Locked contrast: `business-logic.md` §3.4 — no hardcoded placeholder data
for provider/model catalogs; the mock `Subagent` seed exists behind the
repository port, labeled as demo data, and its `modelId`/`effortLevel` values
reference the existing provider catalog (`mock-provider-repository`) and stops
that the referenced model really advertises. The detail header resolves the
model's display name through that same catalog (the organism consumes
`useProviderCatalog`), so the meta line works like the wireframe's
`<model display name> · <effort label>` without adding a second model copy.

S10. Existing contracts that must keep working: #12 file tabs, #13 `Cambios`
tab and its reveal, file chips, region visibility/overlay behaviour (#40, #43)
— every existing test on those seams keeps passing unchanged.

## Tasks

- [x] T1 — Subagents data seam: `src/shared/domain/subagent.types.ts` (the
      discriminated `SubagentStatus` union of S3, the typed `Subagent` record,
      transcript entries, id), a `SubagentRepository` port + mock adapter, the
      `use-subagent-catalog` hook that owns the local mock state and the individually
      stop transition, and the pure model (`groupSubagents`, transcript recent
      window + earlier count, stop rule, elapsed formatting). Tests for every pure
      rule and the seed's own consistency. S3, S6, S9. Commit `6dcd87a`.
- [x] T2 — Subagents list surface: the `SubagentAvatar` atom (decorative SVG
      variants + tokens, the wireframe colours), the `SubagentRow` molecule
      (avatar, name, status, elapsed; wireframe 21), copy in `messages.ts`, unit
      tests. S1, S4, S5. Commit `cb00484`.
- [x] T3 — Subagents detail surface: the `SubagentDetail` molecule (back, avatar,
      name, model·effort meta, scrollable transcript with the collapsed earlier
      window; wireframe 22), the `SubagentsViewer` organism owning the list-to-detail
      navigation (S2), the individual stop control (`business-logic.md` §3.2),
      copy + tests. Commit `2185b51` (writer-assisted round; parent reviewed and
      committed the files the writer produced).
- [x] T4 — Reachability, the #13 pattern: the `PanelTab` kind + the single
      `Subagentes` tab's strip rendering, `FilePanel` viewer dispatch by kind,
      shell `revealSubagentsInPanel(state, subagentId)`, `ToolCallKind`
      `subagent`, the subagent-activity row as a control, mock conversation seed
      rows, an additive `user` icon. Tests, including the S10 regressions.
      Commit `6598f77` (writer-assisted round; the parent reviewed the diff
      against the #13 reference commit and committed).

## Log

L1 (maintainer, verbatim): "Amigo, quiero que en una rama aparte, basada en
main, comiences a trabajar en la issue 14"

L2 (maintainer decisions, this session): the right panel opens with the rail's
toggle and the different viewers (files/code, diff, subagents) live inside it;
the #13 reference: "ya esta listo el issue 13, podemos tomarlo de referencia".
Consequently the branch stacks on `feat/issue-13-diff-view` (main alone holds a
panel whose Cambios tab and shell state would conflict); recorded in the
delivery section below alongside the #13 reality check this session observed
(fixes, PR #54/#55 chain (all merged), and 10 local commits behind origin).

L3 (maintainer, verbatim): "Cuando termines, deja PR relacionada con la issue
y dejando status, puedes seguir la nomenclatura de PR de la fabrica-skills"
— delivery: one PR for this feature, title/body per
`.github/PULL_REQUEST_TEMPLATE.md` + the commit-conventions skill, and the
issue's status label updated, as Fabrica rounds do (e.g. issue #9's
ready-for-qa → ready-for-human chain).

L4 (base evidence): `origin/feat/issue-13-diff-view` @ `8fca4df`; before the
first edit: `pnpm test` 48 files / 307 tests, `pnpm run typecheck` and `lint`
clean, `pnpm run format:check` clean.

## Verification observed (builder self-check — not QA)

Base `origin/feat/issue-13-diff-view` @ `8fca4df` was green before the first
edit: 48 files / 307 tests, `format:check`, `lint`, `typecheck` clean. After
the change (HEAD `6598f77`):

| Check                   | Result                               |
| ----------------------- | ------------------------------------ |
| `pnpm test`             | 366 passed (56 files; +59 over base) |
| `pnpm run typecheck`    | clean                                |
| `pnpm run lint`         | clean                                |
| `pnpm run format:check` | clean                                |
| `git diff --check`      | clean                                |

Every rule has a test that observes its effect, in the repository's node-only
style (`renderToStaticMarkup` plus pure-model tests; `@testing-library` is not
installed and was not added):

- S1/S4/S5 — the list rows and the detail molecules render avatar (known
  variants with a filtered class, unknown falls back without crashing the
  unknown string into a class name), name/status/elapsed (wireframe 21), the
  detail header with model·effort meta and the scrollable transcript's
  collapsed earlier window (wireframe 22); every printed string resolves
  through `messages.ts` — no wireframe placeholder is a component constant.
- S2 — `subagent-focus.ts` holds the select/back/request transitions
  (immutability, repeated-count no-op) and the viewer renders both focus
  states; row press wiring is asserted via the forwarded handler.
- S3 — `SubagentStatus` is the `{ kind }` discriminated union over
  `SUBAGENT_STATUS_KINDS`; the copy maps and the group order are typed by it,
  so a new state cannot compile without label and placement;
  `stopSubagent` resolves `processing → cancelled` and re-stops nothing.
- S6/S9 — the mock seed (`mock-subagent-repository.test.ts`) proves the
  wireframe mirror (two `processing` rows, the 12+3 transcript window, the
  profiled elapsed values), avatar-variant truth and that every `modelId`/
  `effortLevel` pair is one the provider catalog advertises.
- S7/S10 — `file-tabs.test.ts` pins the single Subagentes tab next to the
  untouched file/changes rules; `file-panel.test.tsx` keeps every #12/#13
  expectation green and adds the subagents dispatch; `shell-state.test.tsx`,
  `app-shell-panel-seam.test.tsx`, `app-shell-navigation-seam.test.tsx` prove
  the reveal chain (row press → `revealSubagentsInPanel` → counter + child id →
  panel), and `tool-activity-row`/`tool-activity-group`/conversation tests
  prove diff rows still open Cambios and ordinary tools stay inert.

Not verified by this round: the browser/native visual comparison against
wireframes 21 and 22 (the issue's stated validation type) belongs to the
independent QA round on its own evidence branch, exactly as #42/#43/#9
delivered it.

## Delivery and progress

Four work-unit commits on `feat/issue-14-subagents`, in reviewable slices
(branch forked from `origin/feat/issue-13-diff-view`, itself not yet merged to
`main`, so the counter the hooks print from `main` covers both features):

| Commit    | Slice                                            | Authored |
| --------- | ------------------------------------------------ | -------- |
| `6dcd87a` | subagents data seam (domain union, port, mock,   | ~540     |
|           | hook, pure model)                                |          |
| `cb00484` | list surface (tokens, avatar atom, row molecule, | ~330     |
|           | copy)                                            |          |
| `2185b51` | detail surface + navigation organism             | ~560     |
| `6598f77` | reachability (tab model, strip, panel, shell,    | ~600     |
|           | conversation trigger, icon)                      |          |

Delivery: one PR with base `feat/issue-13-diff-view` (the same pattern PR #55
used inside the chain; it keeps the PR's own diff reviewable), linked to
issue #14 with status labels per the maintainer's request (Log L3). Push, PR
creation and merge are the maintainer's decisions.
