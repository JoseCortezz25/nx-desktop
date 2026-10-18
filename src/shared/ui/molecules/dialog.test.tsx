import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from './dialog';

/**
 * The shared modal surface (`docs/wireframes/README.md`, "Reusable components":
 * `Dialog` — "Title, close, body, footer actions"; screens 05/06/14/15).
 *
 * The behavioural half — Escape, Tab containment, backdrop press and focus
 * restoration — is document synchronization the node runner cannot exercise;
 * the browser pass covers it against the mounted composer flow.
 * What is asserted here is the contract every caller depends on: an accessible
 * modal named by its title with a labelled close control, drawing the body it is
 * handed and no copy of its own.
 */
describe('dialog molecule', () => {
  it('draws an accessible modal named by its title', () => {
    const markup = renderToStaticMarkup(
      <Dialog
        title="Crear proyecto"
        closeLabel="Cerrar"
        onClose={() => undefined}
      >
        <p>Body</p>
      </Dialog>
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-label="Crear proyecto"');
    expect(markup).toContain('>Crear proyecto<');
    expect(markup).toContain('>Body<');
  });

  it('keeps the compact surface by default and widens only on request', () => {
    const compact = renderToStaticMarkup(
      <Dialog title="T" closeLabel="Cerrar" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>
    );
    const wide = renderToStaticMarkup(
      <Dialog
        title="T"
        closeLabel="Cerrar"
        onClose={() => undefined}
        size="wide"
      >
        <p>Body</p>
      </Dialog>
    );

    // Screens 05/06 keep the 572px surface; the review dialogs of 14/15 ask for
    // the wider one so the note and its three actions share a line.
    expect(compact).toContain('class="dialog"');
    expect(compact).not.toContain('dialog--wide');
    expect(wide).toContain('class="dialog dialog--wide"');
  });

  it('carries a labelled close control', () => {
    const markup = renderToStaticMarkup(
      <Dialog
        title="Crear proyecto"
        closeLabel="Cerrar"
        onClose={() => undefined}
      >
        <p>Body</p>
      </Dialog>
    );

    expect(markup).toContain('aria-label="Cerrar"');
  });

  it('names no copy of its own beyond the title it is handed', () => {
    const markup = renderToStaticMarkup(
      <Dialog title="Alpha" closeLabel="Beta" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>
    );

    expect(markup).toContain('>Alpha<');
    expect(markup).toContain('aria-label="Beta"');
    expect(markup).not.toContain('Crear proyecto');
  });
});
