import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import MultiSelect from '../MultiSelect';

const STATES = ['Gujarat', 'Haryana', 'Karnataka', 'Maharashtra'].map((s) => ({ value: s, label: s }));

function Harness({ onChange, initial = null, options = STATES }) {
  const [value, setValue] = useState(initial);
  return (
    <MultiSelect label="State" options={options} value={value} placeholder="Choose states" allLabel="All states" noun="states"
      onChange={(v) => { onChange(v); setValue(v); }} />
  );
}

describe('MultiSelect', () => {
  test('nothing is chosen at first; ticking applies only when the list closes', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'State' });
    expect(button).toHaveTextContent('Choose states');
    await user.click(button);
    const list = screen.getByRole('group', { name: 'State' });
    await user.click(within(list).getByRole('checkbox', { name: 'Haryana' }));
    await user.click(within(list).getByRole('checkbox', { name: 'Karnataka' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['Haryana', 'Karnataka']);
    expect(button).toHaveTextContent('2 states');
  });

  test('“All” is its own choice; unticking one from All leaves the rest; none is nothing', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'State' }));
    await user.click(screen.getByRole('checkbox', { name: 'All states' }));
    await user.keyboard('{Escape}');
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(screen.getByRole('button', { name: 'State' })).toHaveTextContent('All states');

    await user.click(screen.getByRole('button', { name: 'State' }));
    await user.click(screen.getByRole('checkbox', { name: 'Gujarat' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith(['Haryana', 'Karnataka', 'Maharashtra']);

    await user.click(screen.getByRole('button', { name: 'State' }));
    for (const s of ['Haryana', 'Karnataka', 'Maharashtra']) await user.click(screen.getByRole('checkbox', { name: s }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('a long list has a search box', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `p${i}`, label: `Party ${i}` }));
    render(<Harness onChange={vi.fn()} options={many} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'State' }));
    await user.type(screen.getByLabelText('Search state'), 'Party 1');
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label').textContent)).toEqual(['All states', 'Party 1', 'Party 10', 'Party 11']);
  });
});
