---
name: commit-conventions
description: 'Trigger: commit, git commit, branch name, pull request, PR, commitea. Format commits, branches, and PRs to pass deterministic judges.'
license: Apache-2.0
metadata:
  author: 'JoseCortezz25'
  version: '1.0'
---

## Activation Contract

Load this skill when:

- Creating a Git branch, writing a commit message, or opening/updating a Pull Request.
- Fixing a commit message, branch name, or PR body rejected by Husky or CI judges.

## Hard Rules

- **Commit header format**: `<type>(<scope>): <description>` or `<type>: <description>` matching:
  `^(feat|fix|chore|docs|test|style|refactor|perf|build|ci|revert)(\([a-z0-9._-]+\))?!?: .{1,}$`
- Commit header MUST be `<= 100` characters, lowercase type, imperative mood, no trailing period.
- **Zero AI attribution**: NEVER add `Co-Authored-By:` or any AI attribution trailer in commits or PR descriptions.
- **Branch naming format**: `<type>/<description>` matching:
  `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$` (or `main`).
- **PR Contract**: PR title must follow Conventional Commits; PR body must link an issue (`Closes #N`, `Fixes #N`, or `Resolves #N`) and complete `.github/PULL_REQUEST_TEMPLATE.md`.
- Never bypass hooks with `--no-verify` or `-n`.

## Decision Gates

| Change Kind                                             | Commit / Branch Type                    | PR Label        |
| ------------------------------------------------------- | --------------------------------------- | --------------- |
| New capability or vertical slice                        | `feat(<scope>)` / `feat/<slug>`         | `type:feature`  |
| Bug or regression fix                                   | `fix(<scope>)` / `fix/<slug>`           | `type:bug`      |
| Architecture/code restructuring without behavior change | `refactor(<scope>)` / `refactor/<slug>` | `type:refactor` |
| Documentation or ADR update                             | `docs(<scope>)` / `docs/<slug>`         | `type:docs`     |
| Tooling, harness, lint, dependencies, CI                | `chore` / `build` / `ci`                | `type:chore`    |
| Unit, contract, or E2E test additions                   | `test(<scope>)` / `test/<slug>`         | `type:chore`    |

## Execution Steps

1. Verify current branch matches `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`.
2. Run deterministic judges (`pnpm run check`) before committing.
3. Stage logical work units and commit with `<type>(<scope>): <imperative description>` (`<= 100` chars, no `Co-Authored-By`).
4. When opening a PR, validate title, branch, and body with `pnpm run check:pr`.

## Output Contract

Return:

- Validated branch name, commit message, or PR payload passing `.husky/commit-msg` and `scripts/verify-pr-conventions.mjs`.

## References

- `../../.husky/commit-msg` — Deterministic commit message judge.
- `../../scripts/verify-pr-conventions.mjs` — Deterministic branch and PR judge.
- `../../.github/PULL_REQUEST_TEMPLATE.md` — Mandatory PR body template.
