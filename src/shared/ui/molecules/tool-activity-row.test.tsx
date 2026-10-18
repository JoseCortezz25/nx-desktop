import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import { ToolActivityRow } from './tool-activity-row';

describe('tool activity row', () => {
  it('uses an explicit subagent accessible name without changing the default diff name', () => {
    const markup = renderToStaticMarkup(
      <ToolActivityRow
        icon="user"
        summary="Inspect repo completed"
        ariaLabel="Ver el subagente en el panel derecho"
        onPress={() => undefined}
      />
    );
    expect(markup).toContain(
      'aria-label="Ver el subagente en el panel derecho"'
    );
    expect(markup).not.toContain(
      getSharedMessages().conversation.toolActivity.openChangesLabel
    );
  });
  it('draws an inert row when the tool opens nothing', () => {
    const markup = renderToStaticMarkup(
      <ToolActivityRow icon="terminal" summary="Ran pnpm test" />
    );

    expect(markup).toContain('Ran pnpm test');
    // A row that opens nothing must not become a control: the conversation's
    // existing tool rows keep the treatment screens 11 and 12 draw (#11).
    expect(markup).not.toContain('<button');
  });

  it('draws a control when the tool opens the change set', () => {
    const markup = renderToStaticMarkup(
      <ToolActivityRow
        icon="git-branch"
        summary="Ran git diff --stat"
        onPress={() => undefined}
      />
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('Ran git diff --stat');
    expect(markup).toContain(
      getSharedMessages().conversation.toolActivity.openChangesLabel
    );
  });
});
