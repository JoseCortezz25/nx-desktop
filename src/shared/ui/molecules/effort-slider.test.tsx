import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EffortSlider } from './effort-slider';

/**
 * Proves the acceptance criterion "effort slider shows the supported stops of
 * the selected model" at the control's seam: the slider draws exactly one stop
 * per level it is handed, so a model that reports two stops shows two and a
 * model that reports four shows four. The composer hands it the selected model's
 * `supportedEffortLevels`, and `mock-provider-repository.test.ts` proves those
 * counts differ between two mock models.
 */
function countStops(markup: string): number {
  return (markup.match(/class="effort-slider__stop"/g) ?? []).length;
}

const narrow = ['light', 'standard'] as const;
const wide = ['light', 'standard', 'high', 'extended'] as const;

describe('effort slider', () => {
  it('draws one stop per level, so the count follows the model', () => {
    const twoStopModel = renderToStaticMarkup(
      <EffortSlider
        label="Esfuerzo"
        modelName="Narrow"
        levels={narrow}
        selectedLevel="light"
        levelLabel={level => level}
        onSelect={() => undefined}
      />
    );
    const fourStopModel = renderToStaticMarkup(
      <EffortSlider
        label="Esfuerzo"
        modelName="Wide"
        levels={wide}
        selectedLevel="extended"
        levelLabel={level => level}
        onSelect={() => undefined}
      />
    );

    expect(countStops(twoStopModel)).toBe(narrow.length);
    expect(countStops(fourStopModel)).toBe(wide.length);
    expect(countStops(fourStopModel)).not.toBe(countStops(twoStopModel));
  });

  it('labels the current stop and names the model the stops belong to', () => {
    const markup = renderToStaticMarkup(
      <EffortSlider
        label="Esfuerzo"
        modelName="Narrow"
        levels={narrow}
        selectedLevel="standard"
        levelLabel={level => `label:${level}`}
        onSelect={() => undefined}
      />
    );

    expect(markup).toContain('label:standard');
    expect(markup).toContain('Narrow');
  });
});
