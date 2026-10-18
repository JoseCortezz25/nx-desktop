import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';

describe('checkbox', () => {
  it('renders a labelled native checkbox checked only from props', () => {
    const checked = renderToStaticMarkup(
      <Checkbox label="Select lint" isChecked />
    );
    expect(checked).toContain('type="checkbox"');
    expect(checked).toContain('aria-label="Select lint"');
    expect(checked).toContain('checked=""');
    expect(
      renderToStaticMarkup(<Checkbox label="Select lint" isChecked={false} />)
    ).not.toContain('checked=');
  });
  it('reports changes without owning selection', () => {
    const onChange = vi.fn();
    const element = Checkbox({
      label: 'Select lint',
      isChecked: false,
      onChange
    });
    element.props.onChange?.();
    expect(onChange).toHaveBeenCalledOnce();
    expect(element.props.checked).toBe(false);
  });
  it('honors disabled props', () => {
    expect(
      renderToStaticMarkup(
        <Checkbox label="Select lint" isChecked={false} isDisabled />
      )
    ).toContain('disabled=""');
  });
});
