import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreditTerms from '../CreditTerms';
import { renderWithProviders, ACCOUNTANT } from '../../../test/renderWithProviders';
import * as reports from '../../../api/reports.api';

vi.mock('../../../api/reports.api', () => ({
  getReportSettings: vi.fn(), updateReportSettings: vi.fn(), updateTerms: vi.fn(), previewTerms: vi.fn(),
}));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const SETTINGS = {
  settings: { default_credit_days: 30, exception_days: 15 },
  terms: [
    { vendor: 'Amazon', credit_days: null, transfer: true, updated_at: null, updated_by_name: null },
    { vendor: 'Blinkit', credit_days: null, transfer: false, updated_at: null, updated_by_name: null },
    { vendor: 'Zepto', credit_days: 15, transfer: false, updated_at: '2026-11-01 10:00:00', updated_by_name: 'Asha' },
  ],
};
const PREVIEW = {
  vendor: 'Zepto', credit_days: 10, effective_days: 10, open_invoices: 140, overdue_now: 20, overdue_after: 43,
  become_overdue: 23, become_overdue_paise: 123456700, stop_overdue: 0, stop_overdue_paise: 0,
};

describe('Credit terms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reports.getReportSettings.mockResolvedValue(SETTINGS);
    reports.previewTerms.mockResolvedValue(PREVIEW);
  });

  test('the default and each marketplace, stock transfers left out', async () => {
    renderWithProviders(<CreditTerms />, { user: ACCOUNTANT });
    expect(await screen.findByText('Default: 30 days')).toBeInTheDocument();
    const zepto = screen.getByText('Zepto').closest('tr');
    expect(within(zepto).getByText('15 days')).toBeInTheDocument();
    expect(within(zepto).getByText(/Asha/)).toBeInTheDocument();
    expect(within(screen.getByText('Blinkit').closest('tr')).getByText('Default (30)')).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Amazon' })).not.toBeInTheDocument();
    expect(screen.getByText(/Amazon is left out/)).toBeInTheDocument();
  });

  test('a change is previewed before it is saved', async () => {
    reports.updateTerms.mockResolvedValue(SETTINGS);
    renderWithProviders(<CreditTerms />, { user: ACCOUNTANT });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Zepto' }));
    const dialog = screen.getByRole('dialog', { name: 'Credit days — Zepto' });
    const days = within(dialog).getByLabelText('Credit days');
    await user.clear(days);
    await user.type(days, '10');
    expect(await within(dialog).findByText(/23 would become overdue/)).toBeInTheDocument();
    expect(reports.previewTerms).toHaveBeenLastCalledWith('Zepto', 10);
    expect(reports.updateTerms).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(reports.updateTerms).toHaveBeenCalledWith('Zepto', 10);
  });

  test('“Use the default” sends null; the default itself is changed on its own', async () => {
    reports.updateTerms.mockResolvedValue(SETTINGS);
    reports.updateReportSettings.mockResolvedValue(SETTINGS);
    renderWithProviders(<CreditTerms />, { user: ACCOUNTANT });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Zepto' }));
    let dialog = screen.getByRole('dialog', { name: 'Credit days — Zepto' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Use the default/ }));
    await waitFor(() => expect(reports.previewTerms).toHaveBeenLastCalledWith('Zepto', null));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(reports.updateTerms).toHaveBeenCalledWith('Zepto', null);

    await user.click(await screen.findByRole('button', { name: /Edit$/ }));
    dialog = screen.getByRole('dialog', { name: 'Default credit days' });
    const days = within(dialog).getByLabelText('Credit days');
    await user.clear(days);
    await user.type(days, '45');
    await waitFor(() => expect(reports.previewTerms).toHaveBeenLastCalledWith(null, 45));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(reports.updateReportSettings).toHaveBeenCalledWith({ default_credit_days: 45 });
  });
});
