import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PurchaseReport from '../PurchaseReport';
import {
  renderWithProviders, ACCOUNTANT, VIEWER, PURCHASE_HEAD, ACCOUNTANT_HEAD,
} from '../../../test/renderWithProviders';
import * as purchases from '../../../api/purchases.api';

vi.mock('../../../api/purchases.api', () => ({
  getPurchaseRecords: vi.fn(), refreshPurchases: vi.fn(), saveBillCheck: vi.fn(), approvePurchaseRecords: vi.fn(), sendBackPurchaseRecord: vi.fn(),
}));
vi.mock('../../../api/files.api', () => ({ uploadFile: vi.fn(), fetchFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('../../../api/audit.api', () => ({ getEntityHistory: vi.fn().mockResolvedValue([]) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const line = (over) => ({
  key: 'r1', incoming: '01/july', date: '2026-09-08 06:00:00', billing: '121', po: '002', article: 'Socks', rate: 19.75, qty: 103, uom: 'pcs', ...over,
});
const rec = (over) => ({
  id: 1, kind: 'receipts', status: 'to_check', label: 'Incoming 01/july (Shree Socks)', date: '2026-09-08 06:00:00', incoming: '01/july',
  no_incoming: false, billing: ['121'], vendor: 'Shree Socks', party: null, companies: ['Roymax'], lines: [line(), line({ key: 'r2', qty: 57 })],
  files: [], check: null, purchase_approval: null, accounts_approval: null, sent_back: null, changed: null, last_change: null, ...over,
});
const ROWS = [
  rec(),
  rec({
    id: 2, status: 'with_purchase_head', incoming: 'IN-2', label: 'Incoming IN-2 (Shree Socks)', lines: [line({ key: 'r3', incoming: 'IN-2' })],
    check: { name: 'Asha', at: '2026-11-20 05:00:00', note: null },
  }),
  rec({
    id: 3, status: 'approved', incoming: 'IN-3', label: 'Incoming IN-3 (Shree Socks)', lines: [line({ key: 'r4' })],
    check: { name: 'Asha', at: '2026-11-20 05:00:00' }, purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' }, accounts_approval: { name: 'Ravi', at: '2026-11-22 05:00:00' },
  }),
  rec({
    id: 4, status: 'sent_back', incoming: 'IN-4', label: 'Incoming IN-4 (Shree Socks)', lines: [line({ key: 'r5' })],
    check: { name: 'Asha', at: '2026-11-20 05:00:00' }, sent_back: { name: 'Pia', at: '2026-11-21 05:00:00', step: 'purchase', reason: 'Rate is 20 on the bill' },
  }),
];
const answer = (rows = ROWS) => ({
  rows, total: rows.length, page: 1, page_size: 50,
  counts: { to_check: 1, with_purchase_head: 1, with_accounts_head: 0, sent_back: 1, changed: 0, approved: 1, removed: 0, all: 4 },
  companies: [{ id: 2, name: 'Roymax' }], months: ['2026-09'], roms: { connected: true, read_at: '2026-11-28 05:00:00', error: null },
});
const rowOf = (text) => screen.getByText(text).closest('tr');

describe('Purchase Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    purchases.getPurchaseRecords.mockResolvedValue(answer());
  });

  test('a record\'s lines sit under one Incoming No; only approved (green) and sent back (red) are highlighted', async () => {
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: VIEWER });
    expect(await screen.findByText('01/july')).toBeInTheDocument();
    expect(purchases.getPurchaseRecords).toHaveBeenCalledWith('warehouse', expect.objectContaining({ status: 'all' }));
    // Two ROMS lines, one record: its Incoming No spans both.
    expect(screen.getByText('01/july').closest('td')).toHaveAttribute('rowspan', '2');
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(rowOf('01/july').className).not.toMatch(/bg-(green|red)-50/);
    expect(rowOf('IN-3').className).toMatch(/bg-green-50/);
    expect(rowOf('IN-4').className).toMatch(/bg-red-50/);
    expect(rowOf('IN-2').className).not.toMatch(/bg-(green|red)-50/);
    expect(within(rowOf('IN-4')).getByText(/Rate is 20 on the bill/)).toBeInTheDocument();
    // A Viewer only looks.
    expect(screen.queryByRole('button', { name: 'Bill check' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read from ROMS/)).toBeInTheDocument();
  });

  test('the checker opens on To check, and saves a bill check with a note', async () => {
    purchases.saveBillCheck.mockResolvedValue({});
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: ACCOUNTANT });
    await screen.findByText('01/july');
    expect(purchases.getPurchaseRecords).toHaveBeenCalledWith('warehouse', expect.objectContaining({ status: 'to_check' }));
    await u.click(within(rowOf('01/july')).getByRole('button', { name: 'Bill check' }));
    const dialog = screen.getByRole('dialog', { name: /^Bill check — Incoming 01\/july/ });
    await u.type(within(dialog).getByLabelText('Note (optional)'), 'Matches the PO');
    await u.click(within(dialog).getByRole('button', { name: 'Save bill check' }));
    expect(purchases.saveBillCheck).toHaveBeenCalledWith(1, 'Matches the PO');
    // A sent-back record is checked again.
    expect(within(rowOf('IN-4')).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  test('the Purchase Head opens on their step, approves, or sends back with a reason', async () => {
    purchases.approvePurchaseRecords.mockResolvedValue({ approved: 1, skipped: [] });
    purchases.sendBackPurchaseRecord.mockResolvedValue({});
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: PURCHASE_HEAD });
    await screen.findByText('IN-2');
    expect(purchases.getPurchaseRecords).toHaveBeenCalledWith('warehouse', expect.objectContaining({ status: 'with_purchase_head' }));
    const row = within(rowOf('IN-2'));
    expect(within(rowOf('01/july')).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    await u.click(row.getByRole('button', { name: 'Approve' }));
    await u.click(within(screen.getByRole('dialog', { name: 'Approve this record?' })).getByRole('button', { name: 'Approve' }));
    expect(purchases.approvePurchaseRecords).toHaveBeenCalledWith('purchase', [2]);

    await u.click(row.getByRole('button', { name: 'Send back' }));
    const dialog = screen.getByRole('dialog', { name: /^Send back — Incoming IN-2/ });
    const send = within(dialog).getByRole('button', { name: 'Send back as Purchase Head' });
    expect(send).toBeDisabled();
    await u.type(within(dialog).getByLabelText('Why? (required)'), 'Wrong bill attached');
    await u.click(send);
    expect(purchases.sendBackPurchaseRecord).toHaveBeenCalledWith('purchase', 2, 'Wrong bill attached');
  });

  test('ticked records are approved together', async () => {
    purchases.getPurchaseRecords.mockResolvedValue(answer([
      ROWS[1],
      rec({ id: 5, status: 'with_purchase_head', incoming: 'IN-5', label: 'Incoming IN-5 (Shree Socks)', lines: [line({ key: 'r6' })] }),
    ]));
    purchases.approvePurchaseRecords.mockResolvedValue({ approved: 2, skipped: [] });
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReport page="warehouse" />, { user: PURCHASE_HEAD });
    await screen.findByText('IN-5');
    await u.click(screen.getByRole('checkbox', { name: 'Select Incoming IN-2 (Shree Socks)' }));
    await u.click(screen.getByRole('checkbox', { name: 'Select Incoming IN-5 (Shree Socks)' }));
    await u.click(screen.getByRole('button', { name: 'Approve selected (2)' }));
    await u.click(within(screen.getByRole('dialog', { name: 'Approve 2 records?' })).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(purchases.approvePurchaseRecords).toHaveBeenCalledWith('purchase', [2, 5]));
  });

  test('the Accountant Head opens on their step; a challan shows its stages', async () => {
    purchases.getPurchaseRecords.mockResolvedValue(answer([rec({
      id: 9, kind: 'challan', status: 'with_accounts_head', incoming: 'PCL151', party: 'Mahakali creation', label: 'Challan 003 from Mahakali creation',
      lines: [line({ key: 'c1', billing: '003', from_stage: 'Stitching', to_stage: 'Warehouse', qty: 1700, uom: 'dz', rate: 11 })],
      purchase_approval: { name: 'Pia', at: '2026-11-21 05:00:00' },
    })]));
    renderWithProviders(<PurchaseReport page="stitching" />, { user: ACCOUNTANT_HEAD });
    expect(await screen.findByText('Stitching → Warehouse')).toBeInTheDocument();
    expect(purchases.getPurchaseRecords).toHaveBeenCalledWith('stitching', expect.objectContaining({ status: 'with_accounts_head' }));
    expect(screen.getByText('Mahakali creation')).toBeInTheDocument();
    expect(screen.getByText('Purchase Head: Pia')).toBeInTheDocument();
    expect(within(rowOf('PCL151')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
});
