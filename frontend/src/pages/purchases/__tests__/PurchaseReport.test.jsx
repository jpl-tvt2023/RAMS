import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchaseReport from '../PurchaseReport';
import {
  renderWithProviders, ACCOUNTANT, VIEWER, PURCHASE_HEAD, ACCOUNTANT_HEAD,
} from '../../../test/renderWithProviders';
import * as purchases from '../../../api/purchases.api';
import * as filesApi from '../../../api/files.api';
import { saveBlob } from '../../../utils/csv';
import { currentMonthIst } from '../../../utils/formatters';

vi.mock('../../../api/purchases.api', () => ({
  getPurchaseRecords: vi.fn(), getPurchaseRecord: vi.fn(), refreshPurchases: vi.fn(), saveBillChecks: vi.fn(), approvePurchaseRecords: vi.fn(), sendBackPurchaseRecord: vi.fn(),
}));
vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../utils/csv', async (original) => ({ ...(await original()), saveBlob: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const line = (over) => ({
  key: 'r1', incoming: '01/july', date: '2026-09-08 06:00:00', billing: '121', po: '002', article: 'Socks', rate: 19.75, qty: 103, uom: 'pcs', ...over,
});
// One line's record, as the list sends it.
const rec = (over) => {
  const r = {
    id: 1, kind: 'receipts', status: 'to_check', label: 'Incoming 01/july (Shree Socks) — Socks', date: '2026-09-08 06:00:00', incoming: '01/july',
    delivery: { key: 'inc:warehouse:6:01/july', at: '2026-09-08 06:00:00', label: 'Incoming 01/july (Shree Socks)' },
    no_incoming: false, billing: ['121'], vendor: 'Shree Socks', party: null, companies: ['Roymax'], lines: [line()],
    files: [], check: null, purchase_approval: null, accounts_approval: null, sent_back: null, changed: null, last_change: null, ...over,
  };
  return r;
};
const one = (id, incoming, over = {}) => rec({
  id, incoming, label: `Incoming ${incoming} (Shree Socks) — Socks`, delivery: { key: `inc:warehouse:6:${incoming}`, at: '2026-09-08 06:00:00', label: `Incoming ${incoming} (Shree Socks)` }, lines: [line({ key: `r${id}`, incoming })], ...over,
});
const ROWS = [
  rec(),
  rec({ id: 2, lines: [line({ key: 'r2', qty: 57, article: 'Socks - Black' })], label: 'Incoming 01/july (Shree Socks) — Socks - Black' }),
  one(3, 'IN-2', { status: 'with_purchase_head', check: { name: 'Asha', at: '2026-11-20 05:00:00', note: null } }),
  one(4, 'IN-3', {
    status: 'approved', check: { name: 'Asha', at: '2026-11-20 05:00:00' }, purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' }, accounts_approval: { name: 'Ravi', at: '2026-11-22 05:00:00' },
  }),
  one(5, 'IN-4', { status: 'sent_back', check: { name: 'Asha', at: '2026-11-20 05:00:00' }, sent_back: { name: 'Pia', at: '2026-11-21 05:00:00', step: 'purchase', reason: 'Rate is 20 on the bill' } }),
];
const answer = (rows = ROWS, over = {}) => ({
  rows, total: rows.length, page: 1, page_size: 50,
  counts: { to_check: 2, with_purchase_head: 1, with_accounts_head: 0, sent_back: 1, changed: 0, approved: 1, removed: 0, all: 5 },
  companies: [{ id: 2, name: 'Roymax' }], fy: 2026, fy_label: '2026-27', years: [{ fy: 2026, label: '2026-27' }, { fy: 2025, label: '2025-26' }],
  months: ['2026-11', '2026-10', '2026-09'], today: '2026-11-28', roms: { connected: true, read_at: '2026-11-28 05:00:00', error: null }, ...over,
});
const rowOf = (text) => screen.getAllByText(text)[0].closest('tr');
const lastParams = () => purchases.getPurchaseRecords.mock.calls.at(-1)[1];

describe('Purchase Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    purchases.getPurchaseRecords.mockResolvedValue(answer());
  });

  test('a row per line, a delivery\'s lines under one Incoming cell; each head in a column; green and red only for approved and sent back', async () => {
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: VIEWER });
    expect(await screen.findByText('01/july')).toBeInTheDocument();
    // It opens on this financial year (no year asked for) and this month.
    expect(lastParams()).toMatchObject({ status: 'all', month: currentMonthIst() });
    expect(lastParams().fy).toBeUndefined();
    expect(screen.getByRole('combobox', { name: 'Financial year' })).toHaveValue('2026');
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue(currentMonthIst());

    // Two ROMS lines, one delivery: its Incoming No spans both rows; each line has its own cells.
    expect(screen.getByText('01/july').closest('td')).toHaveAttribute('rowspan', '2');
    expect(screen.getByText('2 lines')).toBeInTheDocument();
    expect(screen.getByText('Socks - Black').closest('tr')).toBeInTheDocument();
    expect(screen.getByText('57').closest('tr')).not.toBe(rowOf('01/july'));

    expect(rowOf('IN-3').className).toMatch(/bg-green-50/);
    expect(rowOf('IN-4').className).toMatch(/bg-red-50/);
    expect(rowOf('IN-2').className).not.toMatch(/bg-(green|red)-50/);
    expect(within(rowOf('IN-4')).getByText(/Rate is 20 on the bill/)).toBeInTheDocument();

    // Purchase Head | Accountant Head.
    expect(within(rowOf('IN-2')).getByText('Pending approval')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByText('Not approved')).toBeInTheDocument();
    const approved = within(rowOf('IN-3'));
    expect(approved.getByText('Approved by Pia').closest('span[class*="bg-green-100"]')).toBeInTheDocument();
    expect(approved.getByText('Approved by Ravi')).toBeInTheDocument();
    expect(within(rowOf('01/july')).getAllByText('Not approved')).toHaveLength(2);
    expect(within(screen.getByText('Socks - Black').closest('tr')).getAllByText('Not approved')).toHaveLength(2);
    expect(within(rowOf('IN-4')).getAllByText('Not approved')).toHaveLength(2);

    // A Viewer only looks: no bill check, no approval, no tick column.
    expect(screen.queryByRole('button', { name: /^Upload bill & check/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Read from ROMS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeInTheDocument();
  });

  test('the checker: one popup to upload the bill and save the check, on the ticked lines of the delivery', async () => {
    purchases.getPurchaseRecord.mockResolvedValue({
      ...ROWS[0],
      delivery_lines: [
        { id: 1, status: 'to_check', article: 'Socks', billing: '121', po: '002', qty: 103, uom: 'pcs', rate: 19.75, files: 0 },
        { id: 2, status: 'to_check', article: 'Socks - Black', billing: '121', po: '002', qty: 57, uom: 'pcs', rate: 19.75, files: 0 },
        { id: 7, status: 'with_purchase_head', article: 'Socks - Grey', billing: '121', po: '002', qty: 9, uom: 'pcs', rate: 19.75, files: 1 },
      ],
    });
    filesApi.uploadFile.mockImplementation(async ({ name }) => ({ id: 30, name, also: { added: [{ record_id: 2, id: 31 }], skipped: [] } }));
    purchases.saveBillChecks.mockResolvedValue({ checked: 2, skipped: [] });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT });
    await screen.findByText('01/july');
    expect(lastParams()).toMatchObject({ status: 'to_check' });
    // No separate "Add" for files: the bill goes in through the bill check.
    expect(screen.queryByRole('button', { name: /^Add a file/ })).not.toBeInTheDocument();
    expect(within(rowOf('IN-4')).getByRole('button', { name: /^Check again/ })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Upload bill & check: Incoming 01/july (Shree Socks) — Socks' }));
    const dialog = screen.getByRole('dialog', { name: 'Bill check — Incoming 01/july (Shree Socks)' });
    await within(dialog).findByText('Socks - Grey');
    expect(within(dialog).getByRole('checkbox', { name: 'This line (always included)' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'This line (always included)' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Include Socks - Grey (9 pcs)' })).toBeDisabled(); // with the Purchase Head already
    await u.click(within(dialog).getByRole('checkbox', { name: 'Include Socks - Black (57 pcs)' }));

    const pdf = new File(['%PDF-1.4 the bill'], 'bill-121.pdf', { type: 'application/pdf' });
    await u.upload(within(dialog).getByLabelText('Choose files to add'), pdf);
    await waitFor(() => expect(filesApi.uploadFile).toHaveBeenCalled());
    expect(filesApi.uploadFile.mock.calls[0][0]).toMatchObject({ purchaseRecordId: 1, also: [2], name: 'bill-121.pdf' });

    await u.type(within(dialog).getByLabelText('Note (optional)'), 'Matches the PO');
    await u.click(within(dialog).getByRole('button', { name: 'Save bill check on 2 lines' }));
    expect(purchases.saveBillChecks).toHaveBeenCalledWith([1, 2], 'Matches the PO');
  });

  test('the Purchase Head opens on their step, approves a line, or sends it back with a reason', async () => {
    purchases.approvePurchaseRecords.mockResolvedValue({ approved: 1, skipped: [] });
    purchases.sendBackPurchaseRecord.mockResolvedValue({});
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: PURCHASE_HEAD });
    await screen.findByText('IN-2');
    expect(lastParams()).toMatchObject({ status: 'with_purchase_head' });
    const row = within(rowOf('IN-2'));
    expect(within(rowOf('IN-3')).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    await u.click(row.getByRole('button', { name: 'Approve' }));
    await u.click(within(screen.getByRole('dialog', { name: 'Approve this line?' })).getByRole('button', { name: 'Approve' }));
    expect(purchases.approvePurchaseRecords).toHaveBeenCalledWith('purchase', [3]);

    await u.click(row.getByRole('button', { name: 'Send back' }));
    const dialog = screen.getByRole('dialog', { name: /^Send back — Incoming IN-2/ });
    const send = within(dialog).getByRole('button', { name: 'Send back as Purchase Head' });
    expect(send).toBeDisabled();
    await u.type(within(dialog).getByLabelText('Why? (required)'), 'Wrong bill attached');
    await u.click(send);
    expect(purchases.sendBackPurchaseRecord).toHaveBeenCalledWith('purchase', 3, 'Wrong bill attached');
  });

  test('ticked lines are approved together, and one tick takes a whole delivery', async () => {
    const d5 = { key: 'inc:warehouse:6:IN-5', at: '2026-09-08 06:00:00', label: 'Incoming IN-5 (Shree Socks)' };
    purchases.getPurchaseRecords.mockResolvedValue(answer([
      one(3, 'IN-2', { status: 'with_purchase_head' }),
      rec({ id: 5, status: 'with_purchase_head', incoming: 'IN-5', delivery: d5, label: 'Incoming IN-5 (Shree Socks) — Socks', lines: [line({ key: 'r5', incoming: 'IN-5' })] }),
      rec({ id: 6, status: 'with_purchase_head', incoming: 'IN-5', delivery: d5, label: 'Incoming IN-5 (Shree Socks) — Socks - Black', lines: [line({ key: 'r6', incoming: 'IN-5', article: 'Socks - Black' })] }),
    ]));
    purchases.approvePurchaseRecords.mockResolvedValue({ approved: 2, skipped: [] });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: PURCHASE_HEAD });
    await screen.findByText('IN-5');
    await u.click(screen.getByRole('checkbox', { name: 'Select all 2 lines of Incoming IN-5 (Shree Socks)' }));
    expect(screen.getByRole('checkbox', { name: 'Select Incoming IN-5 (Shree Socks) — Socks - Black' })).toBeChecked();
    await u.click(screen.getByRole('button', { name: 'Approve selected (2)' }));
    await u.click(within(screen.getByRole('dialog', { name: 'Approve 2 lines?' })).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(purchases.approvePurchaseRecords).toHaveBeenCalledWith('purchase', [5, 6]));
  });

  test('the Accountant Head opens on their step; a challan shows its stages and the Purchase Head\'s approval', async () => {
    purchases.getPurchaseRecords.mockResolvedValue(answer([rec({
      id: 9, kind: 'challan', status: 'with_accounts_head', incoming: 'PCL151', party: 'Mahakali creation', label: 'Challan 003 from Mahakali creation — Handkerchief',
      delivery: { key: 'chal:9', at: '2026-09-30 06:00:00', label: 'Challan 003 from Mahakali creation' },
      lines: [line({ key: 'c1', billing: '003', from_stage: 'Stitching', to_stage: 'Warehouse', qty: 1700, uom: 'dz', rate: 11 })],
      purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' },
    })]));
    renderWithProviders(<PurchaseReport page="stitching" />, { user: ACCOUNTANT_HEAD });
    expect(await screen.findByText('Stitching → Warehouse')).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ status: 'with_accounts_head' });
    expect(screen.getByText('Mahakali creation')).toBeInTheDocument();
    expect(within(rowOf('PCL151')).getByText('Approved by Pia')).toBeInTheDocument();
    expect(within(rowOf('PCL151')).getByText('Pending approval')).toBeInTheDocument();
    expect(within(rowOf('PCL151')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test('another year opens on All months; Excel downloads the lines with the period in the name', async () => {
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: VIEWER });
    await screen.findByText('01/july');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Financial year' }), '2025');
    await waitFor(() => expect(lastParams()).toMatchObject({ fy: '2025' }));
    expect(lastParams().month).toBeUndefined(); // All months

    await u.click(screen.getByRole('button', { name: /Download Excel/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(lastParams()).toMatchObject({ page: 1, page_size: 10000 });
    const [name, blob] = saveBlob.mock.calls[0];
    expect(name).toBe('rams-purchases-warehouse-FY2026-27.xlsx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
