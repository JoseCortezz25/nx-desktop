# Issue 47 — Fabrica PR title judge compatibility

## Objective

Make the repository PR-title judge accept the required Fabrica
`Agent-<task-id>-<short-title>` title without relaxing commit messages,
branch/body checks, or other guards. This unblocks PR #46 without an exception
or a title change.

## Problem and authorization

The current `--pr` path calls `validateCommitMessage(PR_TITLE)` and rejects
`Agent-42-native-window-chrome`; the user confirmed the Agent title must remain
and no one-off exception is acceptable. Issue:
https://github.com/JoseCortezz25/nx-desktop/issues/47. Existing PR:
https://github.com/JoseCortezz25/nx-desktop/pull/46.

## Scope and constraints

Authorized paths: `scripts/verify-pr-conventions.mjs`,
`scripts/verify-pr-conventions.test.mjs`, `AGENTS.md`,
`.agents/skills/commit-conventions/SKILL.md`, this task document. Do not modify
PR #46's branch/title or commit messages. Preserve unrelated working-tree
content. Technical artifacts are in English. CI has account-level
`startup_failure`; report only local checks. Forecast: under 250 authored
changed lines, one work-unit commit. Delivery strategy: ask-on-risk; not expected
to cross 400 lines.

## Checklist

- [x] **T1 — Test-first judge reconciliation.** Reproduce the actual Agent title
      failure with PR_TITLE set, add focused negative/positive tests, narrowly
      accept valid Agent titles in `--pr` only, update the repository authority
      and commit-conventions skill, run focused and applicable repository
      checks. Route: delegated direct writer (script, tests and two policy
      docs), with an independent verifier because the deterministic delivery
      gate is high risk. Acceptance: valid Agent title and
      Conventional Commit PR title pass; malformed Agent titles fail; invalid
      commit message remains rejected; branch/body/attribution enforcement stays
      intact; no implementation changes to #46.

## Progress and evidence

- Issue #47 created and read back; base
  `f71ccaaa1a08dc7bf68f4e8c180b0e8c7141acde`, isolated worktree under
  `~/.fabrica/workspaces/nx-desktop/issue-47`, branch
  `fix/issue-47-fabrica-pr-title`.
- T1 done. Risk tier high. Engram mirror pending: Engram tools unavailable in
  this session; local task file is the recovery source.
- Delivered as one conventional work-unit commit
  (`fix(harness): accept Fabrica Agent PR titles in the judge`) and PR titled
  `Agent-47-fabrica-pr-title-judge` with `Closes #47`. The exact commit SHA and
  PR URL are recorded in the `Coder Agent says:` receipt on issue #47 and the
  PR, because a commit cannot embed its own hash.

### T1 RED evidence (base judge, before the fix)

`node --test scripts/verify-pr-conventions.test.mjs`, base script
`f71ccaa`, exit 1 — `ℹ tests 22 / ℹ pass 10 / ℹ fail 12`. The 12 failures are
the 3 Agent-title acceptance tests plus the 9 malformed-Agent tests (base emits
`Invalid commit header` instead of the new narrow message).

```text
[DETERMINISTIC JUDGE FAILED] Invalid commit header: "Agent-42-native-window-chrome"
Expected Conventional Commit format: <type>(<scope>): <description>
Allowed types: feat, fix, chore, docs, test, style, refactor, perf, build, ci, revert.
```

`PR_BRANCH=feat/issue-42-native-window-chrome PR_TITLE=Agent-42-native-window-chrome
PR_BODY="$(gh pr view 46 --json body -q .body)" node
scripts/verify-pr-conventions.mjs --pr` → exit 1 with the same
`Invalid commit header` failure.

RED reproduction (builder re-run, base copy outside the staged tree, after the
prior process interruption): the file
`git show f71ccaa:scripts/verify-pr-conventions.mjs` (SHA-256
`da563c12910bc095f5a380bd97d48e80b83fe257eb6565af60d7c765106df131`) was placed
in a scratch directory with this same staged test file (SHA-256
`de03cbd0c3e4960c90242b7a136b6c9830ab6b12566c3bb99781160e82e3b0a0`) and run
with `node --test` → exit 1, `ℹ tests 22 / ℹ pass 10 / ℹ fail 12`, reproducing
the recorded RED exactly. This reproduction wrote only to a scratch directory
outside the worktree, so the staged tree was not modified.

### T1 GREEN evidence (fixed judge)

`node --test scripts/verify-pr-conventions.test.mjs` → exit 0,
`ℹ tests 22 / ℹ pass 22 / ℹ fail 0`.

The same PR #46 payload now passes:
`[JUDGE OK] Branch and PR conventions verified.` (exit 0). Negative controls:
`--pr` with `Agent-0-native-window-chrome` fails with
`Invalid Fabrica Agent PR title`; `--commit-msg` rejects
`Agent-42-native-window-chrome` and `updated the judge` and accepts
`fix(harness): accept Fabrica Agent PR titles in the judge`.

### T1 repository checks (builder re-run)

- `node --test scripts/verify-pr-conventions.test.mjs` → exit 0,
  `ℹ tests 22 / ℹ pass 22 / ℹ fail 0`.
- `pnpm test` → exit 0, `Test Files 38 passed (38)`, `Tests 207 passed (207)`.
- `pnpm run check` → exit 0 for `format:check && lint && typecheck &&
rust:fmt:check && rust:clippy` (clippy finished in 57.89s on a warm target).
- Real PR #46 payload — `PR_TITLE=Agent-42-native-window-chrome`,
  `PR_BRANCH=feat/issue-42-native-window-chrome`,
  `PR_BODY="$(gh pr view 46 --json body -q .body)"` →
  `[JUDGE OK] Branch and PR conventions verified.` (exit 0). PR #46 itself was
  not modified: title, body, branch, labels and commits untouched.
- `--commit-msg` isolated controls: rejects `Agent-42-native-window-chrome`
  (exit 1) and `updated the judge` (exit 1); accepts
  `fix(harness): accept Fabrica Agent PR titles in the judge` (exit 0).
- `git diff --cached --check` → exit 0 (no whitespace errors).

## Next step

Independent Verifier dispatched against the pushed diff; the Verifier must
rerun the focused title/negative tests before `ready-for-qa`. Merge the judge fix
only after gates; rerun PR #46's real full title judge before its merge.
