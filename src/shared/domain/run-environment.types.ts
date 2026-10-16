/**
 * Where a run executes, as chosen in the composer environment popover.
 *
 * `docs/wireframes/README.md` (screen 09) and
 * `.claude/knowledge/business-logic.md` §2 (`RunEnvironment`).
 */
export interface RunEnvironment {
  /** Run in a fresh git worktree instead of the current checkout. */
  readonly useNewWorktree: boolean;
  /** Branch selected from the repository's branches. */
  readonly gitBranch: string;
  readonly environmentName: string;
}
