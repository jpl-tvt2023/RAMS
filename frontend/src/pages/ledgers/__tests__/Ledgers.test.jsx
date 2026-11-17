import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Ledgers from '../Ledgers';
import { renderWithProviders, ADMIN, ACCOUNTANT, VIEWER } from '../../../test/renderWithProviders';
import * as ledgers from '../../../api/ledgers.api';
import { NO_FILE } from '../../../utils/highlights';

vi.mock('../../../api/ledgers.api', () => ({
  getLedgerParties: vi.fn(),
  getLedgerStatement: vi.fn(),
  getLedgerParty: vi.fn(),
  getLedgerSettings: vi.fn(),
  updateLedgerSettings: vi.fn(),
}));
vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
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
    party: Z2, counts: { booked_twice: 1, no_file: 0 }, since: '2026-09-03', state_differs: true,
  }],
  attention_total: 1,
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
    checks: { dn: { booked_twice: 1 }, cn: { booked_twice: 0 } }, narration_missing: 3, rows_without_file: 4,
  }],
  totals: {
    opening_paise: 1000000, columns: COLUMNS, closing_paise: 1019000, placeholders: 0, narration_missing: 3, rows_without_file: 4,
  },
};
// Every row is Tally's: an invoice, a DN by its narration, the same DN booked
// again, and our own CN.
const DAY = {
  ...STATEMENT.rows[0],
  from: '2026-11-01',
  to: '2026-11-07',
  today: '2026-11-07',
  sync_from: '2026-06-08',
  as_of: '2026-11-07 10:00:00',
  vouchers: [
    {
      guid: 'v1', date: '2026-11-01', voucher_type: 'Sales', base_type: 'Sales', column: 'invoice', number: '201/RM/26-27',
      narration: null, narration_missing: true, amount_paise: 100000, effect_paise: 100000, balance_paise: 1100000, note: null, files: [],
    },
    {
      guid: 'v2', date: '2026-11-03', voucher_type: 'Credit Note', base_type: 'Credit Note', column: 'dn', number: '901',
      narration: 'FKIDN51803946 dT 20/7/2026', narration_missing: false, amount_paise: 20000, effect_paise: -20000, balance_paise: 1080000,
      note: { status: null, also_on: null, named: ['FKIDN51803946'] }, files: [],
    },
    {
      guid: 'v3', date: '2026-11-04', voucher_type: 'Credit Note', base_type: 'Credit Note', column: 'dn', number: '908',
      narration: 'D499900DN2631041 again', narration_missing: false, amount_paise: 5000, effect_paise: -5000, balance_paise: 1075000,
      note: {
        status: 'booked_twice', named: ['D499900DN2631041'], also_on: {
          guid: 'v0', number: '907', date: '2026-11-02', voucher_type: 'Credit Note', amount_paise: 5000,
        },
      },
      files: [],
    },
    {
      guid: 'v4', date: '2026-11-05', voucher_type: 'Credit Note', base_type: 'Credit Note', column: 'cn', number: '902',
      narration: 'FOR THE MONTH OF OCT 2026', narration_missing: false, amount_paise: 30000, effect_paise: -30000, balance_paise: 1045000,
      note: { status: null, also_on: null, named: [] }, files: [],
    },
  ],
};
const rowOf = (detail, number) => within(detail).getByText(number).closest('tr');

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
    expect(within(attention).getByText('1 DN booked twice')).toBeInTheDocument();
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

  test('states list both readings; the statement row is Tally’s, with what RAMS found in its cells', async () => {
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
    expect(within(row).getByText('4 without a file')).toBeInTheDocument();
    expect(within(row).getByTitle('1 DN booked twice')).toHaveClass('bg-purple-50');
    expect(screen.getAllByRole('note', { name: 'What the colours mean' }).length).toBeGreaterThan(0);
  });

  test('one party opens by itself: every row is Tally’s, a DN read from its narration, a DN booked twice', async () => {
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    await chooseZeptoPune(userEvent.setup());
    await waitFor(() => expect(ledgers.getLedgerParty).toHaveBeenCalledWith({ company_id: '2', ledger_guid: 'Z1' }));
    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    expect(within(detail).getByRole('heading', { name: 'In Tally' })).toBeInTheDocument();
    expect(within(rowOf(detail, '901')).getByText('DN FKIDN51803946')).toBeInTheDocument();
    expect(within(rowOf(detail, '901')).getByText('DN')).toBeInTheDocument(); // the column
    const twice = rowOf(detail, '908');
    expect(within(twice).getByText('DN booked twice')).toBeInTheDocument();
    expect(within(twice).getByText('Also on CN 907 of 02 Nov 2026')).toBeInTheDocument();
    expect(within(rowOf(detail, '902')).getByText('CN')).toBeInTheDocument();
    expect(within(rowOf(detail, '902')).queryByText(/^DN /)).not.toBeInTheDocument(); // our own CN names no DN
    expect(within(rowOf(detail, '201/RM/26-27')).getByText('No narration')).toBeInTheDocument();
    expect(within(detail).getByText('FKIDN51803946 dT 20/7/2026')).toBeInTheDocument();
    // Nothing is typed here, even by an Accountant.
    expect(within(detail).queryByText(/entered here/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a DN or CN/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /^(Change|Remove) / })).not.toBeInTheDocument();
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

  test('Admin opens the settings: the marketplaces and the placeholder opening, nothing about typed notes', async () => {
    ledgers.getLedgerSettings.mockResolvedValue({
      default_opening_paise: 1000000, marketplaces: ['Minutes', 'Now', 'Zepto'], known_marketplaces: ['Blinkit', 'Minutes', 'Now', 'Zepto'], updated_at: null, updated_by_name: null,
    });
    ledgers.updateLedgerSettings.mockResolvedValue({});
    renderWithProviders(<Ledgers />, { user: ADMIN });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Ledger settings/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ledger settings' });
    expect(await within(dialog).findByLabelText('Placeholder opening')).toHaveValue('10000.00');
    expect(within(dialog).queryByLabelText('Days Tally may take')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Amount tolerance')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Blinkit' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(ledgers.updateLedgerSettings).toHaveBeenCalledWith({
      marketplaces: ['Minutes', 'Now', 'Zepto', 'Blinkit'], default_opening_paise: 1000000,
    });
  });

  test('a Viewer has no settings button', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    await screen.findByText(Z2.name);
    expect(screen.queryByRole('button', { name: /Ledger settings/ })).not.toBeInTheDocument();
  });
});

describe('Ledgers files', () => {
  const PDF = {
    id: 31, name: 'FKIDN51803946.pdf', kind: 'pdf', size: 120000, uploaded_by_name: 'Asha', uploaded_at: '2026-11-02 09:00:00',
  };
  const INVOICE_SCAN = { ...PDF, id: 32, name: 'invoice 201.jpg', kind: 'image' };
  // The invoice and the DN 901 have their files; 908 and 902 have none.
  const withFiles = {
    ...DAY,
    rows_without_file: 2,
    vouchers: [
      { ...DAY.vouchers[0], files: [INVOICE_SCAN] },
      { ...DAY.vouchers[1], files: [PDF] },
      DAY.vouchers[2],
      DAY.vouchers[3],
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    ledgers.getLedgerParties.mockResolvedValue({
      ...PARTIES,
      attention: [...PARTIES.attention, {
        party: Z1, counts: { booked_twice: 0, no_file: 2 }, since: '2026-10-02', state_differs: false,
      }],
      attention_total: 2,
    });
    ledgers.getLedgerStatement.mockResolvedValue({ ...STATEMENT, rows: [{ ...STATEMENT.rows[0], rows_without_file: 2 }] });
    ledgers.getLedgerParty.mockResolvedValue(withFiles);
  });

  test('any Tally row with no file is orange and says so; a row with its file is not', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    await chooseZeptoPune(userEvent.setup());
    const statementRow = (await screen.findByRole('button', { name: Z1.name })).closest('tr');
    expect(within(statementRow).getByText('2 without a file')).toBeInTheDocument();

    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    for (const number of ['902', '908']) {
      const bare = rowOf(detail, number);
      expect(bare).toHaveClass(NO_FILE.row);
      expect(within(bare).getByText('No file')).toBeInTheDocument();
    }
    const filed = rowOf(detail, '901');
    expect(filed).not.toHaveClass(NO_FILE.row);
    expect(within(filed).getByRole('button', { name: 'Files on Credit Note 901' })).toHaveTextContent('1 file');
    const invoice = rowOf(detail, '201/RM/26-27');
    expect(invoice).not.toHaveClass(NO_FILE.row);
    expect(within(invoice).getByRole('button', { name: 'Files on Sales 201/RM/26-27' })).toBeInTheDocument();
    // A Viewer can open files but not add them.
    expect(within(detail).queryByRole('button', { name: /^Add a file/ })).not.toBeInTheDocument();
    expect(within(detail).getByRole('note', { name: 'What the colours mean' })).toHaveTextContent('No file');
  });

  test('“Without a file” shows just those rows', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const user = userEvent.setup();
    await chooseZeptoPune(user);
    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    const toggle = within(detail).getByRole('button', { name: 'Without a file (2)' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail).queryByText('901')).not.toBeInTheDocument();
    expect(within(detail).queryByText('201/RM/26-27')).not.toBeInTheDocument();
    expect(within(detail).getByText('902')).toBeInTheDocument();
    expect(within(detail).getByText('908')).toBeInTheDocument();
  });

  test('Needs attention counts the rows without a file, and opens just those', async () => {
    renderWithProviders(<Ledgers />, { user: VIEWER });
    const user = userEvent.setup();
    const row = (await screen.findByRole('button', { name: Z1.name })).closest('tr');
    expect(within(row).getByText('2 without a file')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: Z1.name }));
    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    expect(within(detail).getByRole('button', { name: 'Without a file (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(ledgers.getLedgerStatement).toHaveBeenCalledWith(expect.objectContaining({ parties: ['2:Z1'], from: '2026-10-02' }));
  });

  test('an Accountant adds a file from the Files column', async () => {
    renderWithProviders(<Ledgers />, { user: ACCOUNTANT });
    const user = userEvent.setup();
    await chooseZeptoPune(user);
    const detail = await screen.findByRole('region', { name: `Ledger of ${Z1.name}` });
    await user.click(within(detail).getByRole('button', { name: 'Add a file to Credit Note 902' }));
    const dialog = screen.getByRole('dialog', { name: 'Files — Credit Note 902' });
    expect(within(dialog).getByText('No file yet.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Choose files/ })).toBeInTheDocument();
  });
});
