import { useState } from 'react';
import { useConversationCatalog } from '@/features/conversations/hooks/use-conversation-catalog';
import { useComposerSelection } from '@/features/providers/hooks/use-composer-selection';
import { useProjectCatalog } from '@/features/projects/hooks/use-project-catalog';
import { useWorkspaceBranches } from '@/features/projects/hooks/use-workspace-branches';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { ConversationId } from '@/shared/domain/value-objects.types';
import {
  INITIAL_REGION_VISIBILITY,
  toggleRegion,
  type RegionVisibility
} from '@/shared/ui/layout/region-visibility';
import { Composer } from '@/shared/ui/organisms/composer';
import { ConversationView } from '@/shared/ui/organisms/conversation-view';
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
 * regions, the composer's reconciled selection chain, the open conversation and
 * the open-file request — resolves the catalogs the shell, the composer, the
 * sidebar and the conversation read through their typed ports (providers,
 * projects, conversations, the active workspace's branches), and slots the
 * content each later ticket fills.
 *
 * Each piece of state has one owner here. The open conversation (#10) is owned
 * once so the sidebar highlight and the conversation region read the same id,
 * and the open-file request (#11) is owned once so a file chip's click has a
 * single seam the right panel (#12) consumes without a second copy. The shell
 * stores that request and never resolves it: rendering the file belongs to #12.
 *
 * It holds no persisted state and calls no IPC.
 */
export function AppShell() {
  const [visibility, setVisibility] = useState<RegionVisibility>(
    INITIAL_REGION_VISIBILITY
  );
  const [activeConversationId, setActiveConversationId] =
    useState<ConversationId | null>(null);
  const [openFileRequest, setOpenFileRequest] =
    useState<OpenFileRequest | null>(null);
  const { providers } = useProviderCatalog();
  const { resolved, selectProvider, selectModel, selectEffort } =
    useComposerSelection(providers);
  const { projects, activeProject, selectProject, changeApprovalMode } =
    useProjectCatalog();
  const { conversations } = useConversationCatalog();
  const branches = useWorkspaceBranches(activeProject?.id ?? null);

  const activeConversation =
    conversations.find(
      conversation => conversation.id === activeConversationId
    ) ?? null;

  const composer = (
    <Composer
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
  );

  function handleToggleSidebar() {
    setVisibility(current => toggleRegion(current, 'sidebar'));
  }

  function handleToggleRightPanel() {
    setVisibility(current => toggleRegion(current, 'rightPanel'));
  }

  function handleSelectConversation(conversationId: ConversationId) {
    setActiveConversationId(conversationId);
  }

  function handleRequestOpenFile(request: OpenFileRequest) {
    // Stores the request for the right panel (#12). The shell neither opens the
    // panel region nor renders the file: resolving the request is #12's.
    setOpenFileRequest(request);
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
          {activeConversation ? (
            <ConversationView
              conversation={activeConversation}
              openFileRequest={openFileRequest}
              onRequestOpenFile={handleRequestOpenFile}
              composer={composer}
            />
          ) : (
            <HomeView composer={composer} />
          )}
        </MainPane>
        {visibility.rightPanel ? (
          <RightPanel onClose={handleToggleRightPanel} />
        ) : null}
      </div>
    </div>
  );
}
