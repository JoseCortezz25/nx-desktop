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

/**
 * The environment the composer starts from: the current checkout, on the
 * repository's default branch, with no named environment.
 *
 * `gitBranch` is deliberately empty instead of a hardcoded name. The branch must
 * come from the repository's own branch list through the workspace port — the
 * wireframe's `main` is a placeholder (`.claude/knowledge/business-logic.md`
 * §3.4) — and the composer reconciles this default against that list during
 * render.
 */
export const DEFAULT_RUN_ENVIRONMENT: RunEnvironment = {
  useNewWorktree: false,
  gitBranch: '',
  environmentName: ''
};
