/**
 * What the composer resolves before it can start a run.
 *
 * Two chains meet here. The **project context** — the active `Project`, the
 * approval policy it carries, and the `RunEnvironment` chosen in the context bar
 * — and the **selection chain** (`provider -> model -> effort`) stated in
 * `docs/wireframes/README.md` and expanded by
 * `.claude/knowledge/business-logic.md` §3.1.
 *
 * Both are reconciled the same way, in this one module: every helper is pure, it
 * reads the supplied catalog/port data, and it returns a new value without
 * mutating the input. Deriving the result during render is what lets a
 * late-arriving catalog become a valid selection with no effect. The
 * stale-response concurrency rule (§3.1, item 3) is a client concern and
 * deliberately lives outside these functions.
 *
 * The approval policy is **project-scoped** (decision 2026-10-16, issue #30), so
 * it is only ever read from the `Project` here — never from a local default.
 */
import type { ApprovalMode } from './approval-mode.types';
import type { EffortLevel } from './effort-level.types';
import type { Project } from './project.types';
import type { Model, Provider } from './provider.types';
import type { RunEnvironment } from './run-environment.types';
import type { ModelId, ProjectId, ProviderId } from './value-objects.types';

/** A fully reconciled chain ready to be sent with a run request. */
export interface ComposerSelection {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly effortLevel: EffortLevel;
}

/**
 * A reconciled chain together with the catalog rows it resolves to.
 *
 * The effort control renders `effortLevels` and nothing else: the stops belong
 * to the selected model, and this is the single place the UI reads them from
 * (§3.1, item 4).
 */
export interface ResolvedSelection {
  readonly selection: ComposerSelection;
  readonly provider: Provider;
  readonly model: Model;
  /** The stops the selected model exposes — never a shared ladder. */
  readonly effortLevels: readonly EffortLevel[];
}

function findProvider(
  providers: readonly Provider[],
  providerId: ProviderId
): Provider | undefined {
  return providers.find(provider => provider.id === providerId);
}

function findModel(provider: Provider, modelId: ModelId): Model | undefined {
  return provider.availableModels.find(model => model.id === modelId);
}

/**
 * The chain a provider starts from: its first catalog model (the wireframes'
 * "default"/recommended entry) at that model's first supported effort stop.
 */
function defaultSelection(provider: Provider): ComposerSelection | null {
  const model = provider.availableModels[0];
  const effortLevel = model?.supportedEffortLevels[0];
  if (!model || !effortLevel) {
    return null;
  }
  return { providerId: provider.id, modelId: model.id, effortLevel };
}

/**
 * Resets the chain for a provider change.
 *
 * Returns the provider's default model and effort, discarding the previous
 * selection, or `null` when the provider is unknown to the catalog.
 */
export function changeProvider(
  providers: readonly Provider[],
  nextProviderId: ProviderId
): ComposerSelection | null {
  const provider = findProvider(providers, nextProviderId);
  return provider ? defaultSelection(provider) : null;
}

/**
 * Reconciles a desired chain against the catalog.
 *
 * A model that does not belong to the requested provider — the classic result of
 * switching provider — is replaced by the provider's default model. An effort
 * stop the chosen model does not support falls back to that model's first
 * supported stop. Returns `null` when the provider is unknown or the resolved
 * model advertises no effort stops.
 */
export function reconcileSelection(
  providers: readonly Provider[],
  desired: ComposerSelection
): ComposerSelection | null {
  const provider = findProvider(providers, desired.providerId);
  if (!provider) {
    return null;
  }

  const model = findModel(provider, desired.modelId);
  if (!model) {
    return defaultSelection(provider);
  }

  const effortLevel = model.supportedEffortLevels.includes(desired.effortLevel)
    ? desired.effortLevel
    : model.supportedEffortLevels[0];
  if (!effortLevel) {
    return null;
  }

  return { providerId: provider.id, modelId: model.id, effortLevel };
}

/**
 * Resolves the chain the composer should render for the current catalog.
 *
 * The caller keeps the user's last choice (`desired`) and this function derives
 * a display-ready chain during render: the choice reconciled against the
 * catalog. There is **no default provider** (product decision 2026-10-20,
 * `.claude/knowledge/business-logic.md` §3.1, item 6): the result is `null` —
 * the "no provider selected yet" state — while nothing is chosen, while the
 * catalog is empty, and when the chosen provider is no longer in the catalog.
 * The catalog's registration order never picks a provider on the user's
 * behalf. Once a provider is chosen, a model or effort it no longer offers is
 * still reconciled to that provider's defaults.
 */
export function resolveSelection(
  providers: readonly Provider[],
  desired: ComposerSelection | null
): ResolvedSelection | null {
  const selection = desired ? reconcileSelection(providers, desired) : null;
  if (!selection) {
    return null;
  }

  const provider = findProvider(providers, selection.providerId);
  const model = provider ? findModel(provider, selection.modelId) : undefined;
  if (!provider || !model) {
    return null;
  }

  return {
    selection,
    provider,
    model,
    effortLevels: model.supportedEffortLevels
  };
}

/**
 * Resolves the active project of the composer's context bar.
 *
 * The list is owned by the project port, so the caller keeps only the id the
 * user chose (`desired`) and this function derives the project to render: the
 * chosen one while it still exists, otherwise the catalog's first, otherwise
 * `null` while the list is still loading.
 */
export function resolveProject(
  projects: readonly Project[],
  desiredProjectId: ProjectId | null
): Project | null {
  if (desiredProjectId) {
    const desired = projects.find(project => project.id === desiredProjectId);
    if (desired) {
      return desired;
    }
  }
  return projects[0] ?? null;
}

/**
 * The approval policy the composer must show.
 *
 * It is a function of the active `Project` and never a local default: the
 * policy is project-scoped (decision 2026-10-16, issue #30) and enforced in the
 * Rust core, so `null` while no project is active means "no level to show", not
 * "fall back to some level".
 */
export function resolveApprovalMode(
  project: Project | null
): ApprovalMode | null {
  return project?.approvalMode ?? null;
}

/**
 * Reconciles a chosen run environment against the repository's branch list.
 *
 * The branch is picked from the repository's own branches
 * (`.claude/knowledge/business-logic.md` §2 `RunEnvironment`), so a branch that
 * is empty or no longer exists — the classic result of switching project — is
 * replaced by the list's first entry. The worktree flag and the environment name
 * are the user's and are left untouched; an empty list leaves the environment
 * as it is until the list arrives.
 */
export function resolveRunEnvironment(
  environment: RunEnvironment,
  branches: readonly string[]
): RunEnvironment {
  if (environment.gitBranch && branches.includes(environment.gitBranch)) {
    return environment;
  }

  const firstBranch = branches[0];
  return firstBranch ? { ...environment, gitBranch: firstBranch } : environment;
}

/** The environment with the worktree flag changed; branch and name are kept. */
export function changeWorktreeFlag(
  environment: RunEnvironment,
  useNewWorktree: boolean
): RunEnvironment {
  return { ...environment, useNewWorktree };
}

/** The environment with the branch changed; the worktree flag and name are kept. */
export function changeGitBranch(
  environment: RunEnvironment,
  gitBranch: string
): RunEnvironment {
  return { ...environment, gitBranch };
}

/** The environment with its name changed; the worktree flag and branch are kept. */
export function changeEnvironmentName(
  environment: RunEnvironment,
  environmentName: string
): RunEnvironment {
  return { ...environment, environmentName };
}
