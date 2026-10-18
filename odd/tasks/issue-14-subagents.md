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
- [ ] T4 — Reachability, the #13 pattern: the `PanelTab` kind + the single
      `Subagentes` tab's strip rendering, `FilePanel` viewer dispatch by kind, shell
      `revealSubagentsInPanel(state, subagentId)`, `ToolCallKind` `subagent`, the
      subagent-activity row as a control, mock conversation seed rows, an additive
      `user` icon. Tests, including the S10 regressions.

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
