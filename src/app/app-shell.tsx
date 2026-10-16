import { useState } from 'react';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import {
  INITIAL_REGION_VISIBILITY,
  toggleRegion,
  type RegionVisibility
} from '@/shared/ui/layout/region-visibility';
import { MainPane } from '@/shared/ui/organisms/main-pane';
import { Rail } from '@/shared/ui/organisms/rail';
import { RightPanel } from '@/shared/ui/organisms/right-panel';
import { Sidebar } from '@/shared/ui/organisms/sidebar';
import { TitleBar } from '@/shared/ui/organisms/title-bar';
import './app-shell.css';

/**
 * Window-shell composition root (`docs/wireframes/README.md`, "Layout
 * regions"). It owns the ephemeral region visibility, resolves the active
 * provider through the typed port, and slots the content each later ticket
 * fills. It holds no persisted state and calls no IPC.
 */
export function AppShell() {
  const [visibility, setVisibility] = useState<RegionVisibility>(
    INITIAL_REGION_VISIBILITY
  );
  const { activeProvider } = useProviderCatalog();

  function handleToggleSidebar() {
    setVisibility(current => toggleRegion(current, 'sidebar'));
  }

  function handleToggleRightPanel() {
    setVisibility(current => toggleRegion(current, 'rightPanel'));
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
        <MainPane />
        {visibility.rightPanel ? (
          <RightPanel onClose={handleToggleRightPanel} />
        ) : null}
      </div>
    </div>
  );
}
