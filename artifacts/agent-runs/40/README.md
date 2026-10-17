# Builder command transcripts — issue #40 / PR #44

Receipt-correction artifacts for the Builder round on
`feat/issue-40-navigation-and-layout-seams` at
`f6f30a4872a45b6836d938aa195d0e5427d5e2d4`.

These files exist because two `evidence[].reference` values in the original
Builder result record were bare command names (`pnpm test` and
`pnpm run typecheck && ...`), which the result contract does not accept. The
record is corrected by pointing at these transcripts, which hold the exact
observed output of the re-run commands on the same commit.

| Transcript                                    | Commands it records                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `builder-test-transcript.txt`                 | `pnpm test`                                                                                             |
| `builder-static-checks-transcript.txt`        | `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm run build`                        |
| `builder-diff-and-conventions-transcript.txt` | `node scripts/verify-pr-conventions.mjs --branch`, `gh pr view 44 --json ...`, `git status --porcelain` |

Scope: evidence only. No implementation, test, or source file is touched by
this artifacts commit, and PR #44 keeps its 18-file diff.
