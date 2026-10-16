import { useState } from 'react';
import { useProjectCatalog } from '@/features/projects/hooks/use-project-catalog';
import { useWorkspaceBranches } from '@/features/projects/hooks/use-workspace-branches';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import {
  INITIAL_REGION_VISIBILITY,
  toggleRegion,
  type RegionVisibility
} from '@/shared/ui/layout/region-visibility';
import { HomeView } from '@/shared/ui/organisms/home-view';
import { MainPane } from '@/shared/ui/organisms/main-pane';
import { Rail } from '@/shared/ui/organisms/rail';
import { RightPanel } from '@/shared/ui/organisms/right-panel';
import { Sidebar } from '@/shared/ui/organisms/sidebar';
import { TitleBar } from '@/shared/ui/organisms/title-bar';
import './app-shell.css';

/**
 * Window-shell composition root (`docs/wireframes/README.md`, "Layout
 * regions"). It owns the ephemeral region visibility, resolves the catalogs the
 * shell and the composer read through their typed ports (providers, projects,
 * the active workspace's branches), and slots the content each later ticket
 * fills. It holds no persisted state and calls no IPC.
 */
export function AppShell() {
  const [visibility, setVisibility] = useState<RegionVisibility>(
    INITIAL_REGION_VISIBILITY
  );
  const { providers, activeProvider } = useProviderCatalog();
  const { projects, activeProject, selectProject, changeApprovalMode } =
    useProjectCatalog();
  const branches = useWorkspaceBranches(activeProject?.id ?? null);

  function handleToggleSidebar() {
    setVisibility(current => toggleRegion(current, 'sidebar'));
  }

  function handleToggleRightPanel() {
    setVisibility(current => toggleRegion(current, 'rightPanel'));
  }

  function handleSubmitPrompt(prompt: string) {
    // Starting the run this prompt asks for is owned by #23 (live conversation
    // and cancel). This ticket proves the composer hands the text up; the shell
    // holds no state for it yet.
    void prompt;
  }

  return (
    <div className="window-shell">
      <TitleBar
        isSidebarOpen={visibility.sidebar}
        isRightPanelOpen={visibility.rightPanel}
        onToggleSidebar={handleToggleSidebar}
        onToggleRightPanel={handleToggleRightPanel}
      />
      <div className="window-shell__body">
        <Rail />
        {visibility.sidebar ? (
          <Sidebar providerName={activeProvider?.displayName ?? null} />
        ) : null}
        <MainPane>
          <HomeView
            providers={providers}
            projects={projects}
            activeProject={activeProject}
            branches={branches}
            onSelectProject={selectProject}
            onChangeApprovalMode={changeApprovalMode}
            onSubmit={handleSubmitPrompt}
          />
        </MainPane>
        {visibility.rightPanel ? (
          <RightPanel onClose={handleToggleRightPanel} />
        ) : null}
      </div>
    </div>
  );
}
