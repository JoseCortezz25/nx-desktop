import { useState } from 'react';
import { useConversationCatalog } from '@/features/conversations/hooks/use-conversation-catalog';
import { useComposerSelection } from '@/features/providers/hooks/use-composer-selection';
import { useProjectCatalog } from '@/features/projects/hooks/use-project-catalog';
import { useWorkspaceBranches } from '@/features/projects/hooks/use-workspace-branches';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import type { ConversationId } from '@/shared/domain/value-objects.types';
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
 * regions"). It owns the shell's ephemeral presentation state — the visible
 * regions, the composer's reconciled selection chain and the open conversation —
 * resolves the catalogs the shell, the composer and the sidebar read through
 * their typed ports (providers, projects, conversations, the active workspace's
 * branches), and slots the content each later ticket fills.
 *
 * Each piece of state has one owner here: the selection chain is owned once so
 * the sidebar brand and the composer read the same active provider, and the open
 * conversation is owned once so the sidebar highlight and the future main-pane
 * view (#11) read the same id. It holds no persisted state and calls no IPC.
 */
export function AppShell() {
  const [visibility, setVisibility] = useState<RegionVisibility>(
    INITIAL_REGION_VISIBILITY
  );
  const [activeConversationId, setActiveConversationId] =
    useState<ConversationId | null>(null);
  const { providers } = useProviderCatalog();
  const { resolved, selectProvider, selectModel, selectEffort } =
    useComposerSelection(providers);
  const { projects, activeProject, selectProject, changeApprovalMode } =
    useProjectCatalog();
  const { conversations } = useConversationCatalog();
  const branches = useWorkspaceBranches(activeProject?.id ?? null);

  function handleToggleSidebar() {
    setVisibility(current => toggleRegion(current, 'sidebar'));
  }

  function handleToggleRightPanel() {
    setVisibility(current => toggleRegion(current, 'rightPanel'));
  }

  function handleSelectConversation(conversationId: ConversationId) {
    setActiveConversationId(conversationId);
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
          <Sidebar
            providerName={resolved?.provider.displayName ?? null}
            projects={projects}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
          />
        ) : null}
        <MainPane>
          <HomeView
            providers={providers}
            selection={resolved}
            onSelectProvider={selectProvider}
            onSelectModel={selectModel}
            onSelectEffort={selectEffort}
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
