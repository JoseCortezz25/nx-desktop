import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { EffortLevel } from '@/shared/domain/effort-level.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import type { ResolvedSelection } from '@/shared/domain/selection-chain';
import type {
  ModelId,
  ProjectId,
  ProviderId
} from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Composer } from './composer';
import './home-view.css';

export interface HomeViewProps {
  /**
   * Provider catalog resolved by the shell root through the typed provider port.
   * The composer's selectors read it; empty while the catalog loads.
   */
  readonly providers: readonly Provider[];
  /**
   * The reconciled selection chain the shell root owns, rendered by the
   * composer's selectors and by the sidebar brand from the same value.
   */
  readonly selection: ResolvedSelection | null;
  readonly onSelectProvider: (providerId: ProviderId) => void;
  readonly onSelectModel: (modelId: ModelId) => void;
  readonly onSelectEffort: (effortLevel: EffortLevel) => void;
  /** Project list resolved by the shell root through the project port. */
  readonly projects: readonly Project[];
  /** The project the composer's approval chip shows, or `null` while loading. */
  readonly activeProject: Project | null;
  /** Branches of the active workspace, resolved through the workspace port. */
  readonly branches: readonly string[];
  readonly onSelectProject: (projectId: ProjectId) => void;
  readonly onChangeApprovalMode: (approvalMode: ApprovalMode) => void;
  /** Handed the prompt the user submitted from the composer. */
  readonly onSubmit: (prompt: string) => void;
}

/**
 * Organism: the home view that fills the main pane on screen 01
 * (`docs/wireframes/README.md`, "Screen index" — "Home, no sidebar, empty
 * composer"). It owns the title and the composer dock (context bar + composer);
 * the suggestion rows drawn in the wireframe have no specified copy yet, so they
 * are deliberately absent here.
 */
export function HomeView({
  providers,
  selection,
  onSelectProvider,
  onSelectModel,
  onSelectEffort,
  projects,
  activeProject,
  branches,
  onSelectProject,
  onChangeApprovalMode,
  onSubmit
}: HomeViewProps) {
  const messages = getSharedMessages();

  return (
    <section className="home-view">
      <h1 className="home-view__title">{messages.home.title}</h1>
      <Composer
        providers={providers}
        selection={selection}
        onSelectProvider={onSelectProvider}
        onSelectModel={onSelectModel}
        onSelectEffort={onSelectEffort}
        projects={projects}
        activeProject={activeProject}
        branches={branches}
        onSelectProject={onSelectProject}
        onChangeApprovalMode={onChangeApprovalMode}
        onSubmit={onSubmit}
      />
    </section>
  );
}
