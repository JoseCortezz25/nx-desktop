# Issue 31 — Provider/model reasoning-effort research

## Objective

Produce a grounded research document for https://github.com/JoseCortezz25/nx-desktop/issues/31 covering per-provider, per-model available reasoning-effort levels for OpenCode, Codex/OpenAI and Claude/Anthropic, including models with no control and uncertainty. No implementation or product decision is authorized.

## Scope and constraints

Authorized new research artifact: `docs/research-tecnico/effort-levels-by-provider.md`; this recovery task file may be committed with it. Branch `docs/issue-31-effort-level-research`, isolated worktree under `~/.fabrica/workspaces/nx-desktop/issue-31`, base `cc079940eac38a327fbc760a0572ef19dd57d980`. Do not edit UI, types, Rust, harness policy, issue #42/#43, or any wireframes. The local OpenCode model catalogue is evidence, not authority; never expose credentials or private config. Prefer current primary vendor docs and pin access dates/versions. Docs artifact in English. Forecast under 400 authored changed lines, advisory only. Delivery strategy ask-on-risk.

## Checklist

- [x] **T1 — Source-backed mapping and recommendation.** Gather official docs and local catalogue safely; distinguish API provider/model capabilities from OpenCode variants/aliases, document per-provider/model ordered levels and known no-control models with citation per material claim, open gaps and contradictions, and runtime adapter consequences (#25–#27). Decide no final product copy. Verify cited URLs and catalogue field references; validate Markdown/links and structural completeness. Route: delegated direct research writer with independent evidence verifier; passive research document (no executable source change). No test-first RED for research-only prose.

## Progress and evidence

- Issue #31 read with no blocking dependency and `ready-for-agent`; #43 separately moved to `needs-info` for product decisions and pending #42 shell merge. Worktree initialized from remote main. Engram mirror pending because Engram tools unavailable in this session; local task file is recovery source.
- T1 delivered: `docs/research-tecnico/effort-levels-by-provider.md` — per-provider/per-model ordered effort tables (Anthropic 15, OpenAI 50, OpenCode Zen 112, OpenCode Go 42 models), explicit no-control lists, gaps/contradictions, adapter consequences (#25–#27) and a structural UI-scale recommendation with no product copy decision.
- Evidence: 8 first-party sources registered in a citation ledger and cited inline (`[1]`–`[8]`); all eight cited URLs returned HTTP `200` on 2026-10-17 (an earlier ninth candidate was not part of the committed `## Sources` block and is dropped, not asserted reachable). Local catalogue provenance pinned: `~/.cache/opencode/models.json`, cache version `18`, mtime `2026-09-26 20:51:02 -0500`, `sha256` prefix `a37427ede35e2a0bcfd5cdd90ecfffcb`.
- Finding to carry forward: the ticket's claim that the catalogue carries per-model `variants` blocks is wrong for this snapshot — the field is `reasoning_options` and there is no `variants` key (documented as gap G1).
- Clarity correction C1 (round 3, non-counted QA observation, not a QA failure): §5 line 166's audit note grouped the Codex CLI model IDs as all appearing under `openai` and `opencode`. A programmatic re-parse of `~/.cache/opencode/models.json` (`version 18`) shows only `gpt-5.3-codex` and `gpt-5.3-codex-spark` under **both**; `gpt-5.2-codex` and the `gpt-5.1-codex*` family (`gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex-max`) are `opencode`-only (`opencode-go` carries none of these families). The sentence now states the per-provider coverage explicitly and separates the Codex CLI client from the `openai`/`opencode` catalogue providers. No table, model count, citation or provider-level conclusion changed; `gpt-5-codex` stays outside the parenthetical scope exactly as before. Checks: `git diff --check` clean and targeted Prettier on the two authorized paths; docs-only, one sentence. Exact commit and checks recorded in the round-3 Builder handoff comment on issue #31 / PR #49.

## Next step

Dispatch research Builder, gate receipt and references, then independent source/evidence verification and research-only QA according to factory contract. Keep #42 unmerged until its PR title policy is resolved.
