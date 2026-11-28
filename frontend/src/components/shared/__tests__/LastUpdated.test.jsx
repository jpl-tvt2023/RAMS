import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LastUpdatedCell, LastUpdatedLine } from '../LastUpdated';
import { LAST_UPDATED, lastUpdatedText } from '../../../utils/lastUpdated';
import * as audit from '../../../api/audit.api';

vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn() }));

describe('Last updated by', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    audit.getEntityHistory.mockResolvedValue([
      { id: 9, user_name: 'Asha', timestamp: '2026-11-27 04:45:00', description: 'Zepto: credit days 10 → 15', changes: [] },
    ]);
  });

  test('the cell: who, then the date and time in IST under it; a click opens that row’s history', async () => {
    const onRow = vi.fn();
    render(
      <table><tbody><tr onClick={onRow}><td>
        <LastUpdatedCell name="Asha" at="2026-11-27 04:45:00" entityType="vendor_terms" entityId="Zepto" what="Zepto" description="Zepto: credit days 10 → 15" />
      </td></tr></tbody></table>,
    );
    const cell = screen.getByRole('button', { name: 'History of Zepto: last updated by Asha' });
    expect(cell).toHaveTextContent('Asha');
    expect(cell).toHaveTextContent('27 Nov 2026, 10:15'); // 04:45 UTC is 10:15 in India
    expect(cell).toHaveAttribute('title', 'Zepto: credit days 10 → 15');

    const user = userEvent.setup();
    await user.click(cell);
    await waitFor(() => expect(audit.getEntityHistory).toHaveBeenCalledWith('vendor_terms', 'Zepto'));
    expect(await screen.findByRole('dialog', { name: 'History — Zepto' })).toHaveTextContent('Zepto: credit days 10 → 15');
    // A clickable row behind it doesn't open as well.
    await user.click(screen.getByRole('dialog'));
    expect(onRow).not.toHaveBeenCalled();
  });

  test('a row no person has changed shows a dash, and a missing name says Someone', () => {
    const { rerender } = render(<LastUpdatedCell name="Asha" at={null} entityType="user" entityId={1} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<LastUpdatedCell name={null} at="2026-11-27 04:45:00" entityType="user" entityId={1} what="Ravi" />);
    expect(screen.getByRole('button', { name: 'History of Ravi: last updated by Someone' })).toBeInTheDocument();
  });

  test('the one-line form for a settings panel', () => {
    expect(LAST_UPDATED).toBe('Last updated by');
    expect(lastUpdatedText('Asha', '2026-11-27 04:45:00')).toMatch(/^Last updated by Asha · 27 Nov 2026, 10:15\sam$/i);
    expect(lastUpdatedText('Asha', null)).toBe('');
    const { rerender, container } = render(<LastUpdatedLine name="Asha" at="2026-11-27 04:45:00" />);
    expect(screen.getByText(/^Last updated by Asha · 27 Nov 2026, 10:15/)).toBeInTheDocument();
    rerender(<LastUpdatedLine name="Asha" at={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LastUpdatedLine name="Asha" at={null} empty="Not changed yet." />);
    expect(screen.getByText('Not changed yet.')).toBeInTheDocument();
  });
});
