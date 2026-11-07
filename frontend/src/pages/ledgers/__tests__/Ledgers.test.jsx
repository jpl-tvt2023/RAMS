import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ledgers from '../Ledgers';
import { renderWithProviders, ADMIN, ACCOUNTANT, VIEWER } from '../../../test/renderWithProviders';
import * as ledgers from '../../../api/ledgers.api';
import toast from 'react-hot-toast';

vi.mock('../../../api/ledgers.api', () => ({
  getLedgerParties: vi.fn(),
  getLedgerStatement: vi.fn(),
  getLedgerParty: vi.fn(),
  createLedgerEntry: vi.fn(),
  updateLedgerEntry: vi.fn(),
  deleteLedgerEntry: vi.fn(),
  getLedgerSettings: vi.fn(),
  updateLedgerSettings: vi.fn(),
}));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const Z1 = {
  company_id: 2, company: 'MH', guid: 'Z1', name: 'ZEPTO PRIVATE LIMITED ( PUNE ) - Dark Store', vendor: 'Zepto', suggested: false,
  state: 'Maharashtra', tally_state: 'Maharashtra', gst_state: 'Maharashtra', state_differs: false, gstin: '27AAICK4821A1ZV',
};
const Z2 = {
  ...Z1, guid: 'Z2', name: 'ZEPTO PRIVATE LIMITED ( BANGALORE) - Dark Store', suggested: true, state: 'Karnataka', gst_state: 'Karnataka', state_differs: true, gstin: '29AAICK4821A1ZR',
};
const M1 = {
  ...Z1, guid: 'M1', name: 'Flipkart India Private Limited - Gurgaon', vendor: 'Minutes', state: 'Haryana', tally_state: 'Haryana', gst_state: 'Haryana',
};
const PARTIES = {
  today: '2026-11-07',
  sync_from: '2026-06-08',
  month_start: '2026-11-01',
  companies: [{ id: 1, code: 'HR', name: 'Roymax HR' }, { id: 2, code: 'MH', name: 'Roymax MH' }],
  marketplaces: [
    { vendor: 'Minutes', parties: 1, bill_to_bill: true },
    { vendor: 'Zepto', parties: 2, bill_to_bill: true },
    { vendor: 'Blinkit', parties: 14, bill_to_bill: false },
  ],
  parties: [Z1, Z2, M1],
  attention: [{
    party: Z2, counts: { missing: 1, not_entered: 0, amount_differs: 0, booked_twice: 0 }, since: '2026-09-03', state_differs: true,
  }],
  attention_total: 1,
};
const blank = {
  missing: 0, not_entered: 0, amount_differs: 0, booked_twice: 0, by_amount: 0, waiting: 0,
};
const COLUMNS = {
  invoice: 100000, dn: -20000, cn: -30000, tds: -1000, journal: 20000, receipt: -50000,
};
const STATEMENT = {
  from: '2026-11-01',
  to: '2026-11-07',
  today: '2026-11-07',
  as_of: '2026-11-07 10:00:00',
  rows: [{
    party: Z1, start: { source: 'tally', paise: 900000 }, opening_paise: 1000000, columns: COLUMNS, closing_paise: 1019000,
    checks: { dn: { ...blank, amount_differs: 1 }, cn: blank }, narration_missing: 3,
  }],
  totals: {
    opening_paise: 1000000, columns: COLUMNS, closing_paise: 1019000, placeholders: 0, narration_missing: 3,
  },
  settings: { grace_days: 2, match_window_days: 60, amount_tolerance_paise: 100 },
};
const DAY = {
  ...STATEMENT.rows[0],
  from: '2026-11-01',
  to: '2026-11-07',
  today: '2026-11-07',
  sync_from: '2026-06-08',
  as_of: '2026-11-07 10:00:00',
  started_on: '2026-07-20',
  settings: STATEMENT.settings,
  entries: [
    {
      id: 1, date: '2026-11-02', kind: 'debit_note', number: 'FKIDN51803946', reference: null, amount_paise: 20000, effect_paise: -20000, note: null,
      status: 'in_tally', by: 'number', tally: {
        guid: 'v2', number: '901', date: '2026-11-03', voucher_type: 'Credit Note', amount_paise: 20000,
      },
    },
    {
      id: 2, date: '2026-11-04', kind: 'debit_note', number: 'RTDN00019933', reference: null, amount_paise: 10000, effect_paise: -10000, note: null,
      status: 'amount_differs', by: 'number', tally: {
        guid: 'v3', number: '904', date: '2026-11-05', voucher_type: 'Credit Note', amount_paise: 12000,
      },
    },
  ],
  vouchers: [
    {
      guid: 'v1', date: '2026-11-01', voucher_type: 'Sales', base_type: 'Sales', column: 'invoice', number: '201/RM/26-27',
      narration: null, narration_missing: true, amount_paise: 100000, effect_paise: 100000, balance_paise: 1100000, note: null,
    },
    {
      guid: 'v2', date: '2026-11-03', voucher_type: 'Credit Note', base_type: 'Credit Note', column: 'dn', number: '901',
      narration: 'FKIDN51803946 dT 20/7/2026', narration_missing: false, amount_paise: 20000, effect_paise: -20000, balance_paise: 1080000,
      note: {
        status: 'entered', also_on: null, named: ['FKIDN51803946'], entries: [{ id: 1, kind: 'debit_note', number: 'FKIDN51803946', date: '2026-11-02', amount_paise: 20000 }],
      },
    },
  ],
};

// The companies arrive with the parties, after the Company box is drawn.
async function chooseCompany(user, code) {
  await screen.findByRole('option', { name: code });
  await user.selectOptions(screen.getByLabelText('Company'), code);
}

// Company → marketplace → all states → one party.
async function chooseZeptoPune(user) {
  await chooseCompany(user, 'MH');
  await user.selectOptions(screen.getByLabelText('Marketplace'), 'Zepto');
  await user.click(screen.getByRole('button', { name: 'State' }));
  await user.click(screen.getByRole('checkbox', { name: 'All states' }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await user.click(screen.getByRole('button', { name: 'Party' }));
  await user.click(screen.getByRole('checkbox', { name: /PUNE/ }));
  await user.click(screen.getByRole('button', { name: 'Done' }));
}

describe('Ledgers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    ledgers.getLedgerParties.mockResolvedValue(PARTIES);
    ledgers.getLedgerStatement.mockResolvedValue(STATEMENT);
    ledgers.getLedgerParty.mockResolvedValue(DAY);
  });

  test('nothing is chosen at first, each filter waits for the one before, and Needs attention shows meanwhile', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const attention = (await screen.findByText(Z2.name)).closest('tr');
    expect(within(attention).getByText('1 not in Tally')).toBeInTheDocument();
    expect(within(attention).getByText(/State differs: Tally says Maharashtra/)).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toHaveValue('');
    expect(screen.getByLabelText('Marketplace')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'State' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Party' })).toBeDisabled();
    expect(ledgers.getLedgerStatement).not.toHaveBeenCalled();
  });

  test('a marketplace that doesn’t pay bill to bill is coming soon', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const user = userEvent.setup();
    await chooseCompany(user, 'MH');
    const vendor = screen.getByLabelText('Marketplace');
    expect(within(vendor).getByRole('option', { name: 'All (Minutes, Zepto)' })).toBeInTheDocument();
    await user.selectOptions(vendor, 'Blinkit');
    expect(screen.getByRole('status')).toHaveTextContent('Ledgers for Blinkit is coming soon.');
    expect(screen.getByRole('button', { name: 'State' })).toBeDisabled();
  });

  test('states list both readings; the statement row is Tally’s, with the check in its cells', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const user = userEvent.setup();
    await chooseCompany(user, 'MH');
    await user.selectOptions(screen.getByLabelText('Marketplace'), 'Zepto');
    await user.click(screen.getByRole('button', { name: 'State' }));
    const states = screen.getByRole('group', { name: 'State' });
    // Z2 is Maharashtra in Tally and Karnataka by its GSTIN: under both.
    expect(within(states).getByRole('checkbox', { name: /Karnataka/ }).closest('label')).toHaveTextContent('Karnataka1');
    expect(within(states).getByRole('checkbox', { name: /Maharashtra/ }).closest('label')).toHaveTextContent('Maharashtra2');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await chooseZeptoPune(user);

    await waitFor(() => expect(ledgers.getLedgerStatement).toHaveBeenCalledWith({
      company_id: '2', vendor: 'Zepto', states: 'all', parties: ['2:Z1'],
    }));
    const row = (await screen.findByRole('button', { name: Z1.name })).closest('tr');
    expect(within(row).getByText('₹10,000.00 Dr')).toBeInTheDocument();
    expect(within(row).getByText('+₹1,000.00')).toBeInTheDocument();
    expect(within(row).getByText('−₹10.00')).toBeInTheDocument();
    expect(within(row).getByText('₹10,190.00 Dr')).toBeInTheDocument();
    expect(within(row).getByText('3 without narration')).toBeInTheDocument();
    expect(within(row).getByTitle('1 amount differs')).toHaveClass('bg-purple-50');
    expect(screen.getAllByRole('note', { name: 'What the colours mean' }).length).toBeGreaterThan(0);
  });

  test('one party opens by itself: the notes typed here against Tally, and Tally’s vouchers with their narrations', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    await chooseZeptoPune(userEvent.setup());
    await waitFor(() => expect(ledgers.getLedgerParty).toHaveBeenCalledWith({ company_id: '2', ledger_guid: 'Z1' }));
    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    const dn = within(detail).getByText('FKIDN51803946', { selector: 'span' }).closest('tr');
    expect(within(dn).getByText('In Tally')).toBeInTheDocument();
    expect(within(within(detail).getByText('RTDN00019933').closest('tr')).getByText('Amount differs')).toBeInTheDocument();
    expect(within(within(detail).getByText('201/RM/26-27').closest('tr')).getByText('No narration')).toBeInTheDocument();
    expect(within(within(detail).getByText('901').closest('tr')).getByText('Entered here')).toBeInTheDocument();
    expect(within(detail).getByText('FKIDN51803946 dT 20/7/2026')).toBeInTheDocument();
    // A Viewer only looks.
    expect(within(detail).queryByRole('button', { name: /Add a DN or CN/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /Change/ })).not.toBeInTheDocument();
  });

  test('an Accountant adds a marketplace DN; a short DN number is refused first', async () => {
    ledgers.createLedgerEntry.mockResolvedValue({ id: 9 });
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    const user = userEvent.setup();
    await chooseZeptoPune(user);
    await user.click(await screen.findByRole('button', { name: /Add a DN or CN/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add a DN or CN' });
    expect(within(dialog).getByRole('button', { name: 'Marketplace DN' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).queryByRole('button', { name: 'Invoice' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByPlaceholderText('e.g. FKIDN51463346'), 'DN12');
    await user.type(within(dialog).getByPlaceholderText('e.g. 1180.50'), '150');
    expect(within(dialog).getByText('₹150.00')).toBeInTheDocument(); // "Takes ₹150.00 off what this party owes."
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/at least 6 letters and digits/));
    expect(ledgers.createLedgerEntry).not.toHaveBeenCalled();

    const number = within(dialog).getByPlaceholderText('e.g. FKIDN51463346');
    await user.clear(number);
    await user.type(number, 'FKIDN52103453');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(ledgers.createLedgerEntry).toHaveBeenCalledWith({
      kind: 'debit_note', number: 'FKIDN52103453', reference: '', amount_paise: 15000, date: '2026-11-07', note: '', company_id: 2, ledger_guid: 'Z1',
    });
    await waitFor(() => expect(ledgers.getLedgerStatement).toHaveBeenCalledTimes(2)); // reloaded
  });

  test('Needs attention opens the party, from its oldest problem', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: Z2.name }));
    await waitFor(() => expect(ledgers.getLedgerStatement).toHaveBeenCalledWith({
      company_id: '2', vendor: 'Zepto', states: 'all', parties: ['2:Z2'], from: '2026-09-03',
    }));
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-03');
    expect(screen.getByLabelText('To')).toHaveValue('2026-11-07');
  });

  test('a company with no bill-to-bill party says where to map them', async () => {
    renderWithProviders(<Ledgers />, { user: ADMIN });
    const user = userEvent.setup();
    await chooseCompany(user, 'HR');
    expect(screen.getByText(/No party ledger here is mapped/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matching → Party ledgers' })).toHaveAttribute('href', '/matching/parties');
  });

  test('Admin opens the settings: the marketplaces and how long Tally may take', async () => {
    ledgers.getLedgerSettings.mockResolvedValue({
      grace_days: 2, match_window_days: 60, amount_tolerance_paise: 100, default_opening_paise: 1000000,
      marketplaces: ['Minutes', 'Now', 'Zepto'], known_marketplaces: ['Blinkit', 'Minutes', 'Now', 'Zepto'], updated_at: null, updated_by_name: null,
    });
    ledgers.updateLedgerSettings.mockResolvedValue({});
    renderWithProviders(<Ledgers />, { user: ADMIN });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Ledger settings/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ledger settings' });
    expect(await within(dialog).findByLabelText('Days Tally may take')).toHaveValue('60');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Blinkit' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(ledgers.updateLedgerSettings).toHaveBeenCalledWith({
      marketplaces: ['Minutes', 'Now', 'Zepto', 'Blinkit'], match_window_days: 60, grace_days: 2, amount_tolerance_paise: 100, default_opening_paise: 1000000,
    });
  });

  test('a Viewer has no settings button', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    await screen.findByText(Z2.name);
    expect(screen.queryByRole('button', { name: /Ledger settings/ })).not.toBeInTheDocument();
  });
});
