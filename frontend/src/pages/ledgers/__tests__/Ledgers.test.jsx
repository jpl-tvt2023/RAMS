import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ledgers from '../Ledgers';
import { renderWithProviders, ADMIN, ACCOUNTANT, VIEWER } from '../../../test/renderWithProviders';
import * as ledgers from '../../../api/ledgers.api';
import { paiseFrom, balance } from '../../../utils/ledgerText';

vi.mock('../../../api/ledgers.api', () => ({
  getLedgerParties: vi.fn(), getLedgerDay: vi.fn(), createLedgerEntry: vi.fn(), updateLedgerEntry: vi.fn(), deleteLedgerEntry: vi.fn(),
  getLedgerSettings: vi.fn(), updateLedgerSettings: vi.fn(),
}));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const PARTY = 'BLINK COMMERCE PVT LTD(MUMBAI M12)';
const PARTIES = {
  companies: [{ id: 2, code: 'MH', name: 'Roymax MH', is_default: true }],
  company_id: 2,
  today: '2026-10-18',
  sync_from: '2026-06-08',
  vendors: [
    {
      vendor: 'Blinkit',
      flagged_days: 1,
      parties: [
        { guid: 'L12', name: PARTY, suggested: false, entries: 3, last_entry: '2026-10-17', flagged_days: 1, waiting_days: 0 },
        { guid: 'L13', name: 'BLINK COMMERCE PVT LTD(NAGPUR N1)', suggested: true, entries: 0, last_entry: null, flagged_days: 0, waiting_days: 0 },
      ],
    },
    { vendor: 'Zepto', flagged_days: 0, parties: [{ guid: 'Z1', name: 'ZEPTO (THANE)', suggested: false, entries: 0, flagged_days: 0 }] },
  ],
  attention: [{
    ledger_guid: 'L12', party: PARTY, vendor: 'Blinkit', date: '2026-10-14', difference_paise: 95000, counts: { missing: 1, amount_differs: 0, other_date: 0, only_in_tally: 1 },
  }],
  attention_total: 1,
};
const DAY = {
  party: { company_id: 2, company: 'MH', guid: 'L12', name: PARTY, vendor: 'Blinkit', suggested: false },
  date: '2026-10-18',
  today: '2026-10-18',
  sync_from: '2026-06-08',
  as_of: '2026-10-18 06:30:00',
  start: { paise: 1000000, source: 'placeholder', loaded_at: null },
  opening_paise: 1500000,
  started_on: '2026-10-10',
  settings: { grace_days: 2, amount_tolerance_paise: 100 },
  entries: [
    { id: 1, date: '2026-10-18', kind: 'invoice', number: '607', reference: null, amount_paise: 118000, effect_paise: 118000, note: null, status: 'in_tally', tally: { number: '607/RM/26-27', voucher_type: 'Sales', date: '2026-10-18', amount_paise: 118000 } },
    { id: 2, date: '2026-10-18', kind: 'invoice', number: '608', reference: null, amount_paise: 210000, effect_paise: 210000, note: null, status: 'amount_differs', tally: { number: '608/RM/26-27', voucher_type: 'Sales', date: '2026-10-18', amount_paise: 200000 } },
    { id: 3, date: '2026-10-18', kind: 'receipt', number: null, reference: 'HDFC0000123456', amount_paise: 400000, effect_paise: -400000, note: 'NEFT', status: 'waiting', tally: null },
  ],
  tally_only: [{ guid: 'j1', date: '2026-10-18', voucher_type: 'Journal', number: 'J1', amount_paise: 5000, effect_paise: -5000, status: 'waiting', entered_on: null }],
  rams_moves_paise: -72000,
  tally_moves_paise: 313000,
  rams_closing_paise: 1428000,
  tally_closing_paise: 1813000,
  difference_paise: -385000,
  status: 'differs',
  companies: [{ id: 2, code: 'MH' }],
  company_id: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  ledgers.getLedgerParties.mockResolvedValue(PARTIES);
  ledgers.getLedgerDay.mockResolvedValue(DAY);
  ledgers.createLedgerEntry.mockResolvedValue({ id: 9 });
});

async function openParty(user) {
  await user.selectOptions(await screen.findByLabelText('Marketplace'), 'Blinkit');
  await user.selectOptions(screen.getByLabelText('Party'), 'L12');
  return screen.findByRole('status');
}

describe('Ledgers', () => {
  test('first the marketplace, then its party; until then, the days that need attention', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: VIEWER });
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: PARTY }).closest('tr');
    expect(within(row).getByText('1 not in Tally · 1 only in Tally')).toBeInTheDocument();
    expect(screen.getByLabelText('Party')).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Marketplace'), 'Blinkit');
    const options = within(screen.getByLabelText('Party')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Choose a party', `${PARTY} — 1 day to check`, 'BLINK COMMERCE PVT LTD(NAGPUR N1) (suggested)']);
    expect(ledgers.getLedgerDay).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Party'), 'L12');
    await waitFor(() => expect(ledgers.getLedgerDay).toHaveBeenCalledWith({ company_id: 'default', ledger_guid: 'L12' }));
  });

  test('the day: the check, the opening and where it came from, each entry against Tally', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const banner = await openParty(user);
    expect(banner).toHaveTextContent('Differs from Tally by ₹3,850.00');
    expect(banner).toHaveTextContent('RAMS’s closing is lower than Tally’s.');
    expect(screen.getByText('₹15,000.00 Dr')).toBeInTheDocument();
    expect(screen.getByText('Placeholder, not from Tally')).toBeInTheDocument();
    expect(screen.getByText(/₹10,000 on 08 Jun 2026, carried forward/)).toBeInTheDocument();

    const rowOf = (text) => screen.getByText(text).closest('tr');
    expect(within(rowOf('607')).getByText('In Tally')).toBeInTheDocument();
    expect(within(rowOf('608')).getByText('Tally has ₹2,000.00 on 608/RM/26-27')).toBeInTheDocument();
    expect(within(rowOf('HDFC0000123456')).getByText('Not in Tally yet')).toBeInTheDocument();
    expect(within(rowOf('HDFC0000123456')).getByText('−₹4,000.00')).toBeInTheDocument();
    expect(within(rowOf('J1')).getByText('Not entered here yet')).toBeInTheDocument();
  });

  test('a Viewer sees the day but can’t add, change or remove', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: VIEWER });
    await openParty(user);
    expect(screen.queryByRole('button', { name: /Add an entry/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change 607' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ledger settings/ })).toBeNull();
  });

  test('an Accountant adds a receipt: the form says which way it moves the balance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    await openParty(user);
    expect(screen.queryByRole('button', { name: /Ledger settings/ })).toBeNull(); // not granted by default
    await user.click(screen.getByRole('button', { name: /Add an entry/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add an entry' });
    await user.click(within(dialog).getByRole('button', { name: 'Receipt' }));
    await user.type(within(dialog).getByLabelText(/Reference \/ UTR/), 'UTR123456');
    await user.type(within(dialog).getByLabelText(/Amount/), '4,000.50');
    expect(dialog).toHaveTextContent('Takes ₹4,000.50 off what this party owes.');
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }));
    await waitFor(() => expect(ledgers.createLedgerEntry).toHaveBeenCalledWith({
      kind: 'receipt', number: '', reference: 'UTR123456', amount_paise: 400050, date: '2026-10-18', note: '', company_id: 2, ledger_guid: 'L12',
    }));
    await waitFor(() => expect(ledgers.getLedgerDay).toHaveBeenCalledTimes(2)); // reloaded
  });

  test('an invoice needs its number before it is sent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    await openParty(user);
    await user.click(screen.getByRole('button', { name: /Add an entry/ }));
    const dialog = screen.getByRole('dialog', { name: 'Add an entry' });
    await user.type(within(dialog).getByLabelText(/Amount/), '100');
    expect(dialog).toHaveTextContent('Adds ₹100.00 to what this party owes.');
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }));
    expect(ledgers.createLedgerEntry).not.toHaveBeenCalled();
  });

  test('Admin sees the settings; a row under Needs attention opens that party and day', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Ledgers />, { user: ADMIN });
    await user.click(await screen.findByRole('button', { name: PARTY }));
    await waitFor(() => expect(ledgers.getLedgerDay).toHaveBeenCalledWith({ company_id: 'default', ledger_guid: 'L12', date: '2026-10-14' }));
    expect(await screen.findByRole('button', { name: /Ledger settings/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Marketplace')).toHaveValue('Blinkit');
  });

  test('no mapped party: says where to map them', async () => {
    ledgers.getLedgerParties.mockResolvedValue({ ...PARTIES, vendors: [], attention: [] });
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    expect(await screen.findByText(/No party ledger in this company is mapped/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matching → Party ledgers' })).toHaveAttribute('href', '/matching/parties');
  });
});

describe('ledger text', () => {
  test('rupees typed in any usual way become paise; anything else is refused', () => {
    expect(paiseFrom('1,180.50')).toBe(118050);
    expect(paiseFrom('₹ 100')).toBe(10000);
    expect(paiseFrom('0.1')).toBe(10);
    expect(paiseFrom('1.234')).toBeNull();
    expect(paiseFrom('-5')).toBeNull();
    expect(paiseFrom('abc')).toBeNull();
  });

  test('a balance reads Dr when the party owes us, Cr when we owe it', () => {
    expect(balance(1500000)).toBe('₹15,000.00 Dr');
    expect(balance(-2500)).toBe('₹25.00 Cr');
    expect(balance(0)).toBe('₹0.00');
  });
});
