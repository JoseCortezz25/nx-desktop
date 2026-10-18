import { useEffect, useState } from 'react';
import { useConversationCatalog } from '@/features/conversations/hooks/use-conversation-catalog';
import { useComposerSelection } from '@/features/providers/hooks/use-composer-selection';
import { useProjectCatalog } from '@/features/projects/hooks/use-project-catalog';
import { useWorkspaceBranches } from '@/features/projects/hooks/use-workspace-branches';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import { FilePanel } from '@/features/files/ui/organisms/file-panel';
import { EMPTY_CREATE_PROJECT_DRAFT } from '@/features/projects/model/create-project';
import type {
  CreateProjectDraft,
  CreateProjectInput
} from '@/features/projects/model/create-project.types';
import { CreateProjectDialog } from '@/features/projects/ui/organisms/create-project-dialog';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type {
  ConversationId,
  SubagentId
} from '@/shared/domain/value-objects.types';
import {
  EMPTY_COMPOSER_DRAFT,
  type ComposerDraft
} from '@/shared/ui/organisms/composer-draft';
import { Composer } from '@/shared/ui/organisms/composer';
import { ConversationView } from '@/shared/ui/organisms/conversation-view';
import { HomeView } from '@/shared/ui/organisms/home-view';
import { MainPane } from '@/shared/ui/organisms/main-pane';
import { Rail } from '@/shared/ui/organisms/rail';
import { Sidebar } from '@/shared/ui/organisms/sidebar';
import {
  LAYOUT_BREAKPOINTS,
  resolveRegionLayout
} from '@/shared/ui/layout/region-visibility';
import {
  INITIAL_SHELL_STATE,
  navigateHome,
  openConversation,
  revealFileInPanel,
  revealChangesInPanel,
  revealSubagentsInPanel,
  toggleShellRegion,
  type ShellState
} from './shell-state';
import './app-shell.css';

/**
 * Tracks the window width so the shell can pick each region's presentation from
 * the layout breakpoints (`resolveRegionLayout`). A static/server render has no
 * `window`; it resolves to the widest arrangement, which is the layout the
 * wireframes draw, so the shell still renders fully without a viewport.
 *
 * The listener is the shell's one synchronization with the window; cleanup is
 * idempotent.
 */
function useWindowWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}

/**
 * Window-shell composition root (`docs/wireframes/README.md`, "Layout
 * regions"). It owns the shell's ephemeral presentation state — the open
 * conversation, the visible regions and the open-file request in `shell-state`,
 * the unsent composer draft, and the composer's reconciled selection chain —
 * resolves the catalogs the shell, the composer, the sidebar and the
 * conversation read through their typed ports (providers, projects,
 * conversations, the active workspace's branches), and slots the content each
 * later ticket fills.
 *
 * Each piece of state has one owner here:
 *
 * - the open conversation (#10) is owned once so the sidebar highlight and the
 *   conversation region read the same id; `navigateHome` is its return path;
 * - the composer selection (#7/#8) lives in the feature hook, and the **draft**
 *   is hoisted here beside it so it survives the view switch — the composer no
 *   longer owns (and therefore no longer loses) it when the main pane re-slots
 *   it under the conversation;
 * - the open-file request (#11) is owned once so a file chip's click has a
 *   single seam the right panel (#12) consumes without a second copy. A request
 *   also reveals the right panel, so opening a file shows it instead of leaving
 *   the region hidden;
 * - the create-project draft (#9) is owned once, and `null` means the dialog is
 *   closed. Creation goes through this shell's one `useProjectCatalog`, so the
 *   picker and the sidebar see the new project immediately instead of through a
 *   second repository instance.
 *
 * It holds no persisted state and calls no IPC.
 */
export function AppShell() {
  const [shell, setShell] = useState<ShellState>(INITIAL_SHELL_STATE);
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_COMPOSER_DRAFT);
  /**
   * The in-progress create-project form, or `null` while the dialog is closed.
   * One value, one owner: `null` is the closed state, and opening the dialog is
   * seeding the draft, so the dialog can never be open without a draft to render.
   */
  const [createProjectDraft, setCreateProjectDraft] =
    useState<CreateProjectDraft | null>(null);
  const { providers } = useProviderCatalog();
  const { resolved, selectProvider, selectModel, selectEffort } =
    useComposerSelection(providers);
  const {
    projects,
    activeProject,
    selectProject,
    changeApprovalMode,
    createProject
  } = useProjectCatalog();
  const { conversations } = useConversationCatalog();
  const branches = useWorkspaceBranches(activeProject?.id ?? null);

  const {
    activeConversationId,
    visibility,
    openFileRequest,
    openChangesRequestCount,
    openSubagentsRequestCount,
    openSubagentsRequestSubagentId
  } = shell;

  // Region *presentation* is derived from the measured window width; region
  // *visibility* stays the ephemeral state the rail toggles own. Overlaying a
  // region therefore never negates a manual toggle — it only stops the region
  // from taking a column and squeezing the composer.
  const windowWidth = useWindowWidth();
  const regionLayout = resolveRegionLayout(windowWidth);

  const activeConversation =
    conversations.find(
      conversation => conversation.id === activeConversationId
    ) ?? null;

  // The draft is hoisted here, one owner beside the selection chain, so the
  // composer renders what it is handed and never keeps (or loses) a copy when
  // the main pane re-slots it under the conversation.
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
      onCreateProject={handleOpenCreateProject}
      onChangeApprovalMode={changeApprovalMode}
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={handleSubmitPrompt}
    />
  );

  function handleToggleSidebar() {
    setShell(toggleShellRegion(shell, 'sidebar'));
  }

  function handleToggleRightPanel() {
    setShell(toggleShellRegion(shell, 'rightPanel'));
  }

  function handleSelectConversation(conversationId: ConversationId) {
    setShell(openConversation(shell, conversationId));
  }

  /** Both Home entry points — the rail's house icon and the sidebar's new chat. */
  function handleNavigateHome() {
    setShell(navigateHome(shell));
  }

  function handleRequestOpenFile(request: OpenFileRequest) {
    // Stores the request for the right panel (#12) and reveals the region, so a
    // chip click actually shows the file. Opening the tab is #12's; the shell
    // only holds the one value both consumers read.
    setShell(revealFileInPanel(shell, request));
  }

  function handleRequestOpenChanges() {
    setShell(revealChangesInPanel(shell));
  }

  function handleRequestOpenSubagent(subagentId: SubagentId) {
    setShell(revealSubagentsInPanel(shell, subagentId));
  }

  function handleSubmitPrompt(prompt: string) {
    // Starting the run this prompt asks for is owned by #23 (live conversation
    // and cancel). This ticket proves the composer hands the text up; the shell
    // holds no state for it yet.
    void prompt;
  }

  /** The picker's `Nuevo proyecto` row opens the dialog on a fresh draft. */
  function handleOpenCreateProject() {
    setCreateProjectDraft(EMPTY_CREATE_PROJECT_DRAFT);
  }

  function handleCreateProjectDraftChange(next: CreateProjectDraft) {
    setCreateProjectDraft(next);
  }

  function handleCloseCreateProject() {
    setCreateProjectDraft(null);
  }

  /**
   * Creates the project through the one catalog hook that owns the list, then
   * closes the dialog. The new project is selected by the hook, so the composer's
   * project chip and the sidebar both show it without a second catalog instance.
   */
  function handleSubmitCreateProject(input: CreateProjectInput) {
    createProject(input);
    setCreateProjectDraft(null);
  }

  return (
    <div
      className={
        windowWidth < LAYOUT_BREAKPOINTS.rightPanelInlineMin
          ? 'window-shell window-shell--compact'
          : 'window-shell'
      }
    >
      <div className="window-shell__body">
        <Rail
          isSidebarOpen={visibility.sidebar}
          isRightPanelOpen={visibility.rightPanel}
          onNavigateHome={handleNavigateHome}
          onToggleSidebar={handleToggleSidebar}
          onToggleRightPanel={handleToggleRightPanel}
        />
        {visibility.sidebar ? (
          <Sidebar
            projects={projects}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNavigateHome}
            isOverlay={regionLayout.sidebar === 'overlay'}
            onClose={handleToggleSidebar}
          />
        ) : null}
        <MainPane>
          {activeConversation ? (
            <ConversationView
              conversation={activeConversation}
              openFileRequest={openFileRequest}
              onRequestOpenFile={handleRequestOpenFile}
              onRequestOpenChanges={handleRequestOpenChanges}
              onRequestOpenSubagent={handleRequestOpenSubagent}
              composer={composer}
            />
          ) : (
            <HomeView composer={composer} />
          )}
        </MainPane>
        {/*
          The panel is kept mounted while the region is closed: `visibility`
          only hides it, so the open-tab working set survives a close/reopen
          instead of being rebuilt from the single last request.
        */}
        <FilePanel
          openFileRequest={openFileRequest}
          openChangesRequestCount={openChangesRequestCount}
          openSubagentsRequestCount={openSubagentsRequestCount}
          openSubagentsRequestSubagentId={openSubagentsRequestSubagentId}
          isOpen={visibility.rightPanel}
          isOverlay={regionLayout.rightPanel === 'overlay'}
          onClose={handleToggleRightPanel}
        />
      </div>
      {/*
        The create-project modal (#9) is mounted by the shell, not by the
        composer, because the catalog it creates into is the shell's and because
        the modal must cover every region — rail, sidebar and panel included. It
        draws nothing while no draft is in progress.
      */}
      <CreateProjectDialog
        draft={createProjectDraft}
        onDraftChange={handleCreateProjectDraftChange}
        onSubmit={handleSubmitCreateProject}
        onClose={handleCloseCreateProject}
      />
    </div>
  );
}
