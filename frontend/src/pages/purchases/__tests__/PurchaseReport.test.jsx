import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchaseReport from '../PurchaseReport';
import {
  renderWithProviders, ACCOUNTANT, VIEWER, PURCHASE_HEAD, ACCOUNTANT_HEAD,
} from '../../../test/renderWithProviders';
import * as purchases from '../../../api/purchases.api';
import * as filesApi from '../../../api/files.api';
import toast from 'react-hot-toast';
import { saveBlob } from '../../../utils/saveBlob';
import { currentMonthIst } from '../../../utils/formatters';

vi.mock('../../../api/purchases.api', () => ({
  getPurchaseRecords: vi.fn(), getPurchaseRecord: vi.fn(), refreshPurchases: vi.fn(), saveBillChecks: vi.fn(), approvePurchaseRecords: vi.fn(), sendBackPurchaseRecord: vi.fn(),
  recallPurchaseRecords: vi.fn(),
}));
vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../utils/saveBlob', () => ({ saveBlob: vi.fn() }));
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
  one(3, 'IN-2', {
    status: 'with_purchase_head', check: { name: 'Asha', at: '2026-11-20 05:00:00', note: null }, files: [{ id: 40, name: 'bill-IN-2.pdf', kind: 'pdf', size: 900 }],
  }),
  one(4, 'IN-3', {
    status: 'approved', check: { name: 'Asha', at: '2026-11-20 05:00:00' }, purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' }, accounts_approval: { name: 'Ravi', at: '2026-11-22 05:00:00' },
  }),
  // Sent back by the Purchase Head: in the checker's queue, red.
  one(5, 'IN-4', { status: 'to_check', check: { name: 'Asha', at: '2026-11-20 05:00:00' }, sent_back: { name: 'Pia', at: '2026-11-21 05:00:00', step: 'purchase', reason: 'Rate is 20 on the bill' } }),
];
const BILL = [{ id: 41, name: 'bill.pdf', kind: 'pdf', size: 900 }];
const answer = (rows = ROWS, over = {}) => ({
  rows, total: rows.length, page: 1, page_size: 50,
  counts: { to_check: 3, with_purchase_head: 1, with_accounts_head: 0, approved: 1, removed: 0, all: 5 },
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
    // Five tabs: the four queues, then All.
    expect(within(screen.getByRole('tablist', { name: 'Status' })).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'To check (3)', 'With Purchase Head (1)', 'With Accountant Head (0)', 'Approved (1)', 'All (5)',
    ]);

    // Two ROMS lines, one delivery: its Incoming No spans both rows; each line has its own cells.
    expect(screen.getByText('01/july').closest('td')).toHaveAttribute('rowspan', '2');
    expect(screen.getByText('2 lines')).toBeInTheDocument();
    expect(screen.getByText('Socks - Black').closest('tr')).toBeInTheDocument();
    expect(screen.getByText('57').closest('tr')).not.toBe(rowOf('01/july'));

    expect(rowOf('IN-3').className).toMatch(/bg-green-50/);
    expect(rowOf('IN-4').className).toMatch(/bg-red-50/);
    expect(rowOf('IN-2').className).not.toMatch(/bg-(green|red)-50/);

    // No Files column; the Note column tells each line's story, one note per stage.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Files');
    expect(headers).not.toContain('Status');
    expect(headers).toContain('Note');
    expect(within(rowOf('01/july')).getByText('No bill attached')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByText('Bill attached · 1 file')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByText('Sent for approval by Asha')).toBeInTheDocument();
    const story = within(within(rowOf('IN-3')).getByRole('list', { name: 'Note' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(story).toEqual(['No bill attached', 'Sent for approval by Asha', 'Purchase Head approved (Pia)', 'Accountant Head approved (Ravi)']);
    const back = within(rowOf('IN-4')).getByText('Sent back by Pia (Purchase Head): Rate is 20 on the bill');
    expect(back.closest('li')).toHaveClass('text-red-700');

    // Purchase Head | Accountant Head.
    expect(within(rowOf('IN-2')).getByText('Pending approval')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByText('Not approved')).toBeInTheDocument();
    const approved = within(rowOf('IN-3'));
    expect(approved.getByText('Approved by Pia').closest('span[class*="bg-green-100"]')).toBeInTheDocument();
    expect(approved.getByText('Approved by Ravi')).toBeInTheDocument();
    expect(within(rowOf('01/july')).getAllByText('Not approved')).toHaveLength(2);
    expect(within(screen.getByText('Socks - Black').closest('tr')).getAllByText('Not approved')).toHaveLength(2);
    expect(within(rowOf('IN-4')).getAllByText('Not approved')).toHaveLength(2);

    // A Viewer only looks: View bill on every line, no attach, approval, recall or ticks.
    expect(screen.getAllByRole('button', { name: /^View bill: / })).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /^View\/Attach bill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Recall/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send back/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Read from ROMS/)).toBeInTheDocument();
    // Excel only.
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download CSV/ })).not.toBeInTheDocument();
  });

  test('View bill opens the same popup read-only: the files and who sent it, no ticks, note or Send', async () => {
    purchases.getPurchaseRecord.mockResolvedValue({
      ...ROWS[2],
      check: { name: 'Asha', at: '2026-11-20 05:00:00', note: 'Matches the PO' },
      delivery_lines: [{ id: 3, status: 'with_purchase_head', article: 'Socks', billing: '121', po: '002', qty: 103, uom: 'pcs', rate: 19.75, files: 1 }],
    });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: VIEWER });
    await screen.findByText('IN-2');
    await u.click(within(rowOf('IN-2')).getByRole('button', { name: /^View bill: / }));
    const dialog = screen.getByRole('dialog', { name: 'Bill — Incoming IN-2 (Shree Socks)' });
    expect(await within(dialog).findByText(/^Sent for approval by Asha, .*: “Matches the PO”$/)).toBeInTheDocument();
    expect(within(dialog).getByText('bill-IN-2.pdf')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Note (optional)')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Choose files to add')).not.toBeInTheDocument();
    // The corner X and the footer's Close.
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  });

  test('the checker: one popup to upload the bill and save the check, on the ticked lines of the delivery', async () => {
    const delivery = (files) => [
      { id: 1, status: 'to_check', article: 'Socks', billing: '121', po: '002', qty: 103, uom: 'pcs', rate: 19.75, files },
      { id: 2, status: 'to_check', article: 'Socks - Black', billing: '121', po: '002', qty: 57, uom: 'pcs', rate: 19.75, files },
      { id: 7, status: 'with_purchase_head', article: 'Socks - Grey', billing: '121', po: '002', qty: 9, uom: 'pcs', rate: 19.75, files: 1 },
    ];
    // Before the upload, then after it (the popup reads the record again).
    purchases.getPurchaseRecord
      .mockResolvedValueOnce({ ...ROWS[0], delivery_lines: delivery(0) })
      .mockResolvedValue({ ...ROWS[0], files: [{ id: 30, name: 'bill-121.pdf', kind: 'pdf', size: 17 }], delivery_lines: delivery(1) });
    filesApi.uploadFile.mockImplementation(async ({ name }) => ({ id: 30, name, also: { added: [{ record_id: 2, id: 31 }], skipped: [] } }));
    purchases.saveBillChecks.mockResolvedValue({ checked: 2, skipped: [] });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT });
    await screen.findByText('01/july');
    expect(lastParams()).toMatchObject({ status: 'to_check' });
    // No separate "Add" for files: the bill goes in through View/Attach bill.
    expect(screen.queryByRole('button', { name: /^Add a file/ })).not.toBeInTheDocument();
    expect(within(rowOf('IN-4')).getByRole('button', { name: /^View\/Attach bill: / })).toBeInTheDocument();
    // Sent on: only View bill, and Recall until the Purchase Head acts.
    expect(within(rowOf('IN-2')).getByRole('button', { name: /^View bill: / })).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByRole('button', { name: /^Recall: / })).toBeInTheDocument();
    expect(within(rowOf('IN-3')).queryByRole('button', { name: /^Recall: / })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'View/Attach bill: Incoming 01/july (Shree Socks) — Socks' }));
    const dialog = screen.getByRole('dialog', { name: 'Bill check — Incoming 01/july (Shree Socks)' });
    await within(dialog).findByText('Socks - Grey');
    expect(within(dialog).getByRole('checkbox', { name: 'This line (always included)' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'This line (always included)' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Include Socks - Grey (9 pcs)' })).toBeDisabled(); // with the Purchase Head already
    await u.click(within(dialog).getByRole('checkbox', { name: 'Include Socks - Black (57 pcs)' }));
    // No bill yet: nothing can be sent.
    expect(within(dialog).getByRole('button', { name: 'Send 2 lines for approval' })).toBeDisabled();
    expect(within(dialog).getByText(/2 of the ticked lines have no bill yet/)).toBeInTheDocument();

    const pdf = new File(['%PDF-1.4 the bill'], 'bill-121.pdf', { type: 'application/pdf' });
    await u.upload(within(dialog).getByLabelText('Choose files to add'), pdf);
    await waitFor(() => expect(filesApi.uploadFile).toHaveBeenCalled());
    expect(filesApi.uploadFile.mock.calls[0][0]).toMatchObject({ purchaseRecordId: 1, also: [2], name: 'bill-121.pdf' });

    await u.type(within(dialog).getByLabelText('Note (optional)'), 'Matches the PO');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Send 2 lines for approval' })).toBeEnabled());
    expect(within(dialog).queryByText(/no bill yet/)).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Send 2 lines for approval' }));
    expect(purchases.saveBillChecks).toHaveBeenCalledWith([1, 2], 'Matches the PO');
  });

  test('the checker ticks lines and sends together only those with a bill; a sent line can be recalled', async () => {
    purchases.getPurchaseRecords.mockResolvedValue(answer([{ ...ROWS[0], files: BILL }, ...ROWS.slice(1)]));
    purchases.saveBillChecks.mockResolvedValue({ checked: 1, skipped: [] });
    purchases.recallPurchaseRecords.mockResolvedValue({ recalled: 1, skipped: [] });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT });
    await screen.findByText('01/july');
    // Ticks only on lines the checker can act on: not the approved one.
    expect(within(rowOf('IN-3')).queryByRole('checkbox')).not.toBeInTheDocument();
    await u.click(screen.getByRole('checkbox', { name: 'Select all 2 lines of Incoming 01/july (Shree Socks)' }));
    // The second line has no bill: it is never sent.
    expect(screen.getByText('1 ticked line has no bill, so it can’t be sent. Attach it first.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Send 1 for approval' }));
    const send = screen.getByRole('dialog', { name: 'Send this line for approval?' });
    await u.click(within(send).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(purchases.saveBillChecks).toHaveBeenCalledWith([1], ''));

    await u.click(within(rowOf('IN-2')).getByRole('button', { name: /^Recall: / }));
    const recall = screen.getByRole('dialog', { name: 'Recall this line?' });
    expect(within(recall).getByText(/comes back from the Purchase Head to the bill check/)).toBeInTheDocument();
    await u.click(within(recall).getByRole('button', { name: 'Recall' }));
    await waitFor(() => expect(purchases.recallPurchaseRecords).toHaveBeenCalledWith([{ id: 3, from: 'with_purchase_head' }]));
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
    expect(within(dialog).getByText(/^It goes back to the checker \(Asha\) with your reason/)).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText('Why? (required)'), 'Wrong bill attached');
    await u.click(send);
    expect(purchases.sendBackPurchaseRecord).toHaveBeenCalledWith('purchase', 3, 'Wrong bill attached');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent back to the checker'));
  });

  test('a line the Accountant Head sent back is red with the Purchase Head, who approves it again; the checker can\'t recall it', async () => {
    purchases.getPurchaseRecords.mockResolvedValue(answer([one(3, 'IN-2', {
      status: 'with_purchase_head', files: BILL, check: { name: 'Asha', at: '2026-11-20 05:00:00' },
      sent_back: { name: 'Ravi', at: '2026-11-22 05:00:00', step: 'accounts', reason: 'Paid twice' },
    })]));
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: PURCHASE_HEAD });
    await screen.findByText('IN-2');
    expect(rowOf('IN-2').className).toMatch(/bg-red-50/);
    expect(within(rowOf('IN-2')).getByText('Sent back by Ravi (Accountant Head): Paid twice')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByText('Pending approval')).toBeInTheDocument();
    expect(within(rowOf('IN-2')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  test('a line changed in ROMS is To check with a note; a saved Sent back tab opens on the person\'s own', async () => {
    sessionStorage.setItem(`rams:purchases-warehouse-${ACCOUNTANT.id}:v1`, JSON.stringify({
      company_id: '', fy: '', month: '', status: 'sent_back', q: '',
    }));
    purchases.getPurchaseRecords.mockResolvedValue(answer([one(8, 'IN-8', {
      status: 'to_check', files: BILL, check: { name: 'Asha', at: '2026-11-20 05:00:00' },
      changed: { at: '2026-11-24 05:00:00', changes: [{ field: 'Socks, PO 002: Qty', old: '103', new: '100' }] },
    })]));
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT });
    await screen.findByText('IN-8');
    expect(lastParams()).toMatchObject({ status: 'to_check' });
    expect(screen.getByRole('tab', { name: /^To check/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(rowOf('IN-8')).getByText('Changes were made in ROMS: Socks, PO 002: Qty: 103 → 100')).toBeInTheDocument();
    expect(rowOf('IN-8').className).not.toMatch(/bg-(green|red)-50/);
  });

  test('a head can change their mind: Send back under their green approval, even once the line is approved', async () => {
    purchases.sendBackPurchaseRecord.mockResolvedValue({});
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT_HEAD });
    await screen.findByText('IN-3');
    // Only under their own column's approval: the Accountant Head's, not the Purchase Head's.
    const approved = within(rowOf('IN-3'));
    expect(approved.getAllByRole('button', { name: /^Send back after approving/ })).toHaveLength(1);
    await u.click(approved.getByRole('button', { name: /^Send back after approving/ }));
    const dialog = screen.getByRole('dialog', { name: /^Send back — Incoming IN-3/ });
    expect(within(dialog).getByText('This line is approved. Sending it back clears both approvals and returns it to the Purchase Head.')).toBeInTheDocument();
    await u.type(within(dialog).getByLabelText('Why? (required)'), 'Paid twice');
    await u.click(within(dialog).getByRole('button', { name: 'Send back as Accountant Head' }));
    expect(purchases.sendBackPurchaseRecord).toHaveBeenCalledWith('accounts', 4, 'Paid twice');
  });

  test('ticked lines are approved together, and one tick takes a whole delivery', async () => {
    const d5 = { key: 'inc:warehouse:6:IN-5', at: '2026-09-08 06:00:00', label: 'Incoming IN-5 (Shree Socks)' };
    purchases.getPurchaseRecords.mockResolvedValue(answer([
      one(3, 'IN-2', { status: 'with_purchase_head', files: BILL }),
      rec({ id: 5, status: 'with_purchase_head', files: BILL, incoming: 'IN-5', delivery: d5, label: 'Incoming IN-5 (Shree Socks) — Socks', lines: [line({ key: 'r5', incoming: 'IN-5' })] }),
      rec({ id: 6, status: 'with_purchase_head', files: BILL, incoming: 'IN-5', delivery: d5, label: 'Incoming IN-5 (Shree Socks) — Socks - Black', lines: [line({ key: 'r6', incoming: 'IN-5', article: 'Socks - Black' })] }),
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
      purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' }, files: BILL,
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
