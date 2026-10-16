import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { buildOpenMenuItems } from '../../model/open-menu';
import { OpenMenuList } from './open-menu-list';

const MACHINE_REPORT = [
  { target: 'editor', isInstalled: true },
  { target: 'view_source', isInstalled: true },
  { target: 'search_in_file', isInstalled: true },
  { target: 'reveal_in_file_manager', isInstalled: true },
  { target: 'copy_path', isInstalled: true }
] as const;

describe('open menu list', () => {
  it('draws the offered entries and nothing else', () => {
    const markup = renderToStaticMarkup(
      <OpenMenuList
        items={buildOpenMenuItems(MACHINE_REPORT)}
        onSelect={() => undefined}
      />
    );
    const messages = getSharedMessages();

    expect(markup).toContain('Abrir en VS Code');
    expect(markup.match(/role="menuitem"/g)?.length).toBe(1);
    expect(markup).toContain(
      `aria-label="${messages.fileViewer.openMenu.menuLabel}"`
    );
  });

  it('offers no file-manager row even though the machine reports one', () => {
    const markup = renderToStaticMarkup(
      <OpenMenuList
        items={buildOpenMenuItems(MACHINE_REPORT)}
        onSelect={() => undefined}
      />
    );

    expect(markup).not.toContain('Explorador');
    expect(markup).not.toContain('Finder');
    expect(markup).not.toContain('Ver código fuente');
    expect(markup).not.toContain('Copiar ruta del archivo');
  });

  it('draws no row while VS Code is not installed', () => {
    const markup = renderToStaticMarkup(
      <OpenMenuList
        items={buildOpenMenuItems([
          { target: 'editor', isInstalled: false },
          { target: 'reveal_in_file_manager', isInstalled: true }
        ])}
        onSelect={() => undefined}
      />
    );

    expect(markup).not.toContain('Abrir en VS Code');
    expect(markup).not.toContain('role="menuitem"');
  });
});
