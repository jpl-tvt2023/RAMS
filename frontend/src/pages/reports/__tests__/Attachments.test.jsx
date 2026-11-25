import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import Attachments from '../Attachments';
import { renderWithProviders, ACCOUNTANT, VIEWER } from '../../../test/renderWithProviders';
import * as attachments from '../../../api/attachments.api';
import * as audit from '../../../api/audit.api';
import { NO_FILE } from '../../../utils/highlights';

vi.mock('../../../api/attachments.api', () => ({ getAttachmentMonths: vi.fn(), getAttachmentVouchers: vi.fn() }));
vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const IRN = '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8';
const MONTHS_OF_FY = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const NAMES = { '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September', 10: 'October', 11: 'November', 12: 'December', '01': 'January', '02': 'February', '03': 'March' };
const empty = (month) => ({
  month, label: `${NAMES[month.slice(5)]} ${month.slice(0, 4)}`, in_copy: true, from: null, vouchers: 0, needs_attention: 0, no_narration: 0, no_file: 0, debit_paise: 0, credit_paise: 0, closing_paise: month <= '2026-11' ? 0 : null,
});
// One tab: `filled` gives the months that have vouchers.
const tabOf = (key, label, base_type, side, filled) => {
  let closing = 0;
  const months = MONTHS_OF_FY.map((m) => {
    const f = filled[m] || {};
    closing += side === 'debit' ? (f.amount || 0) : -(f.amount || 0);
    return {
      ...empty(m), ...f, debit_paise: side === 'debit' ? (f.amount || 0) : 0, credit_paise: side === 'credit' ? (f.amount || 0) : 0, closing_paise: m <= '2026-11' ? closing : null,
    };
  });
  const sum = (k) => months.reduce((a, m) => a + (m[k] || 0), 0);
  return {
    key, label, base_type, side, einvoice: key !== 'payment', number_label: { invoice: 'Invoice no', payment: 'Voucher no', dn: 'DN no', cn: 'CN no' }[key], months,
    totals: {
      vouchers: sum('vouchers'), needs_attention: sum('needs_attention'), no_narration: sum('no_narration'), no_file: sum('no_file'), debit_paise: sum('debit_paise'), credit_paise: sum('credit_paise'), closing_paise: closing,
    },
  };
};
const MONTHS = {
  company_id: 2,
  companies: [{ id: 1, code: 'HR', name: 'Roymax HR', is_default: false }, { id: 2, code: 'MH', name: 'Roymax MH', is_default: true }],
  fy: 2026,
  fy_label: '2026-27',
  years: [{ fy: 2026, label: '2026-27' }],
  today: '2026-11-25',
  sync_from: '2026-04-01',
  as_of: '2026-11-25 09:00:00',
  narration: { types: null, required_from: '2026-06-08' },
  tabs: [
    tabOf('invoice', 'Invoice', 'Sales', 'credit', {
      '2026-04': { vouchers: 1, amount: 100000, needs_attention: 1, no_file: 1 },
      '2026-07': {
        vouchers: 2, amount: 2418907330, needs_attention: 1, no_file: 1, no_narration: 1,
      },
    }),
    tabOf('payment', 'Payments', 'Payment', 'debit', { '2026-07': { vouchers: 1, amount: 35000, needs_attention: 1, no_file: 1 } }),
    tabOf('dn', 'DN', 'Debit Note', 'credit', {}),
    tabOf('cn', 'CN', 'Credit Note', 'debit', {}),
  ],
};
const row = (over) => ({
  voucher_type: 'Sales', ledgers: [over.ledger], city: null, city_from: null, pincode: null,
  einvoice: {
    read: true, irn: null, ack_no: null, ack_date: null, cancelled: false,
  },
  narration: null, narration_missing: false, has_file: false, files: [], needs_attention: false, last_change: null, ...over,
});
const JULY = {
  company_id: 2, company: 'MH', fy: 2026, tab: 'invoice', month: '2026-07', label: 'July 2026', from: null,
  counts: { all: 2, needs_attention: 1 }, totals: { vouchers: 2, amount_paise: 2418907330 }, einvoice_unread: 1, total: 2, page: 1, page_size: 10000,
  rows: [
    row({
      id: 11, guid: 'g1', number: '607/RM/26-27', date: '2026-07-05', amount_paise: 118050, party: 'ZEPTO (PUNE)', ledger: 'ZEPTO (PUNE)', city: 'Pune', city_from: 'po', pincode: '411001',
      einvoice: {
        read: true, irn: IRN, ack_no: '122633138683008', ack_date: '2026-07-05', cancelled: false,
      },
      narration_missing: true, needs_attention: true,
    }),
    row({
      id: 12, guid: 'g2', number: '608/RM/26-27', date: '2026-07-20', amount_paise: 2418789280, party: 'BLINK (MUMBAI)', ledger: 'BLINK (MUMBAI)',
      einvoice: {
        read: false, irn: null, ack_no: null, ack_date: null, cancelled: false,
      },
      narration: 'PO P1', has_file: true,
      files: [{
        id: 5, name: '608.pdf', kind: 'pdf', size: 1000, uploaded_by_name: 'Asha', uploaded_at: '2026-11-20 10:00:00',
      }],
      last_change: {
        user_name: 'Asha', at: '2026-11-20 10:00:00', action_type: 'FILE_ADD', description: 'File added — 608.pdf on Sales 608/RM/26-27',
      },
    }),
  ],
};
const PAYMENTS = {
  ...JULY, tab: 'payment', counts: { all: 1, needs_attention: 1 }, totals: { vouchers: 1, amount_paise: 35000 }, einvoice_unread: 0, total: 1,
  rows: [row({
    id: 21, guid: 'p1', number: '1543', date: '2026-07-10', voucher_type: 'Payment', amount_paise: 35000, party: 'HDFC BANK - 8412', ledger: 'Tirupati Textiles', ledgers: ['Tirupati Textiles', 'Freight Outward'], city: 'Surat', city_from: 'tally', narration_missing: true, needs_attention: true,
  })],
};

const monthRow = (name) => screen.getByRole('button', { name }).closest('tr');
async function openJuly(user) {
  await user.click(await screen.findByRole('button', { name: 'July 2026' }));
  return screen.findByRole('region', { name: /July 2026/ });
}

describe('Attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    attachments.getAttachmentMonths.mockResolvedValue(MONTHS);
    attachments.getAttachmentVouchers.mockImplementation(async (p) => (p.tab === 'payment' ? PAYMENTS : JULY));
    audit.getEntityHistory.mockResolvedValue([]);
  });

  test('it opens on the starred company and this year, a month per row as Tally’s Sales Register', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    await waitFor(() => expect(attachments.getAttachmentMonths).toHaveBeenCalledWith({ company_id: 'default' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Attachments');
    await screen.findByRole('button', { name: 'July 2026' });
    expect(screen.getByLabelText('Company')).toHaveValue('2');
    expect(within(screen.getByLabelText('Company')).queryByRole('option', { name: /All companies/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Financial year')).toHaveValue('2026');
    expect(screen.getByRole('tab', { name: /Invoice/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Invoice/ })).toHaveTextContent('(3)');

    const july = monthRow('July 2026');
    expect(within(july).getByText('₹2,41,89,073.30')).toBeInTheDocument(); // the Credit column
    expect(within(july).getByText('₹2,41,90,073.30 Cr')).toBeInTheDocument(); // Closing, running from April
    expect(within(july).getByRole('button', { name: '1 in July 2026 need attention' })).toHaveTextContent('1 no file · 1 no narration');
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'June 2026' })).not.toBeInTheDocument(); // nothing to open
  });

  test('a tab shows its own register without asking again; payments are on the Debit side', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'July 2026' });
    await user.click(screen.getByRole('tab', { name: /Payments/ }));
    expect(within(monthRow('July 2026')).getByText('₹350.00 Dr')).toBeInTheDocument();
    expect(attachments.getAttachmentMonths).toHaveBeenCalledTimes(1);
  });

  test('a month lists its vouchers: number, ledger, city, amount, e-invoice, files, narration and the last change', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    const list = await openJuly(user);
    expect(attachments.getAttachmentVouchers).toHaveBeenCalledWith({
      company_id: 2, fy: 2026, tab: 'invoice', month: '2026-07', page_size: 10000,
    });
    expect(within(list).getByRole('heading', { name: 'Invoice · July 2026' })).toBeInTheDocument();
    const heads = within(list).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Invoice no', 'Ledger', 'City', 'Amount', 'E-Invoice (Ack No)', 'Invoice PDF', 'Narration', 'Audit Log']);

    const [r1, r2] = within(list).getAllByRole('row').slice(1);
    expect(r1).toHaveClass(NO_FILE.row); // no file: orange
    expect(r2).not.toHaveClass(NO_FILE.row);
    expect(within(r1).getByText('122633138683008')).toHaveAttribute('title', `IRN ${IRN}`);
    expect(within(r1).getByText('from ROMS')).toBeInTheDocument();
    expect(within(r1).getByText('No narration')).toBeInTheDocument(); // the yellow highlight
    expect(within(r1).getByText('No file')).toBeInTheDocument();
    expect(within(r1).queryByRole('button', { name: /Add a file/ })).not.toBeInTheDocument(); // a Viewer can't add
    expect(within(r2).getByText('Not read yet')).toBeInTheDocument();
    expect(within(r2).getByText('Yes')).toHaveAttribute('title', 'PO P1');
    expect(within(list).getByText(/e-invoice of 1 voucher here hasn’t been read yet/)).toBeInTheDocument();

    // The last change opens the voucher's history.
    await user.click(within(r2).getByRole('button', { name: 'History of Invoice 608/RM/26-27' }));
    await waitFor(() => expect(audit.getEntityHistory).toHaveBeenCalledWith('tally_vouchers', 12));
  });

  test('the IRN copies with one click', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    const list = await openJuly(user);
    await user.click(within(list).getByRole('button', { name: 'Copy the IRN of Invoice 607/RM/26-27' }));
    expect(await navigator.clipboard.readText()).toBe(IRN);
    expect(toast.success).toHaveBeenCalledWith('IRN copied');
  });

  test('Payments show who was paid, with no e-invoice column', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'July 2026' });
    await user.click(screen.getByRole('tab', { name: /Payments/ }));
    const list = await openJuly(user);
    expect(within(list).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Voucher no', 'Ledger', 'City', 'Amount', 'Files', 'Narration', 'Audit Log']);
    expect(within(list).getByText('Tirupati Textiles')).toBeInTheDocument();
    expect(within(list).getByText('+1 more')).toHaveAttribute('title', 'Tirupati Textiles\nFreight Outward');
    expect(within(list).queryByText('HDFC BANK - 8412')).not.toBeInTheDocument();
  });

  test('an Accountant adds the file on an orange row', async () => {
    renderWithProviders(<Attachments />, { user: ACCOUNTANT });
    const user = userEvent.setup();
    const list = await openJuly(user);
    await user.click(within(list).getByRole('button', { name: 'Add a file to Invoice 607/RM/26-27' }));
    const dialog = await screen.findByRole('dialog', { name: 'Files — Invoice 607/RM/26-27' });
    expect(within(dialog).getByText(/ZEPTO \(PUNE\) · MH/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Choose files/ })).toBeInTheDocument();
  });

  test('“Needs attention only” narrows the month; All months goes back', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    const list = await openJuly(user);
    expect(within(list).getAllByRole('row')).toHaveLength(3);
    await user.click(within(list).getByRole('checkbox', { name: 'Needs attention only' }));
    expect(within(list).getAllByRole('row')).toHaveLength(2);
    expect(within(list).getByText('607/RM/26-27')).toBeInTheDocument();
    expect(attachments.getAttachmentVouchers).toHaveBeenCalledTimes(1); // filtered here, not asked again
    await user.click(within(list).getByRole('button', { name: /All months/ }));
    expect(await screen.findByText('Grand Total')).toBeInTheDocument();
  });

  test('a month’s “needs attention” opens just those', async () => {
    renderWithProviders(<Attachments />, { user: VIEWER });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '1 in July 2026 need attention' }));
    const list = await screen.findByRole('region', { name: /July 2026/ });
    expect(within(list).getByRole('checkbox', { name: 'Needs attention only' })).toBeChecked();
    await waitFor(() => expect(within(list).getAllByRole('row')).toHaveLength(2));
  });
});
