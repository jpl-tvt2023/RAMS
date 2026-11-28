const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const { TEST_PASSWORD } = require('./helpers/users');
const { startFakeRoms, emptyRefs } = require('./helpers/roms');
const { createRomsClient } = require('../src/services/romsClient');
const { refreshPurchases, NOT_SERVED } = require('../src/purchases/refresh');
const { groupLines, diffSnapshot, snapshotOf, linesOf } = require('../src/purchases/lines');

// Purchase Reports (migrations 022, 023): ROMS's receipts and challans in
// RAMS, one record per ROMS line -- listed by delivery (an Incoming No from one
// vendor, or a challan) -- with files, a bill check, and the Purchase Head ->
// Accountant Head approval the user agreed on 2026-11-28.

const quick = (roms) => createRomsClient({ ...roms.settings, retries: 0, sleep: async () => {} });
const PDF = Buffer.from(`%PDF-1.4\n${'1 0 obj << /Type /Page >> endobj\n'.repeat(50)}%%EOF\n`);
const PDF2 = Buffer.from(`%PDF-1.4\n${'2 0 obj << /Type /Page >> endobj\n'.repeat(50)}%%EOF\n`);
const FY = 2026; // every date below is in FY 2026-27; asked for, so the tests don't age

let receiptSeq = 0;
let challanSeq = 0;
// ROMS rows with ROMS's columns (integration.controller.js purchase-receipts / -challans).
const receipt = (o = {}) => {
  receiptSeq += 1;
  return {
    id: receiptSeq, line_id: 1, po_id: 2, company_id: 2, company_name: 'Roymax', vendor_id: 6, vendor_name: 'Shree Socks',
    category: 'Raw Material', item_name: 'Socks', variant: null, po_rate: 19.75, unit_metric: 'pcs', received_qty: 10,
    received_rate: 19.75, bill_no: '121', incoming_prefix: null, incoming_no: '01/july', stage: null, warehouse_name: 'Panchal',
    goes_to_stitching: 0, created_at: '2026-09-08 06:00:00', updated_at: '2026-09-08 06:00:00', ...o,
  };
};
const challan = (o = {}) => {
  challanSeq += 1;
  return {
    id: challanSeq, challan_no: `CH${challanSeq}`, challan_line_no: 1, party_name: 'Mahakali creation', from_stage: 'Stitching',
    to_stage: 'Warehouse', parent_src: 'entry', parent_id: 9, incoming_prefix: 'PCL', incoming_no: '151 (MKC-12)', origin_receipt_id: 50,
    po_id: 7, company_id: 2, company_name: 'Roymax', vendor_id: 3, vendor_name: 'Fabric House', category: 'Raw Material',
    item_name: 'Handkerchief - Bundle Fabric', variant: null, sent_qty: null, sent_dozens: 1700, received_qty: null, received_dozens: 1700,
    process_rate: 11, rate_unit: 'dozen', warehouse_name: 'Panchal', created_at: '2026-09-30 06:00:00', updated_at: '2026-09-30 06:00:00', ...o,
  };
};

const get = (token, path, query = {}) => bearer(request(app).get(`/api/purchases/${path}`), token).query(query);
const post = (token, path, body = {}) => bearer(request(app).post(`/api/purchases/${path}`), token).send(body);
const upload = (token, id, bytes, name = 'bill.pdf', also = []) => bearer(request(app)
  .post(`/api/purchases/records/${id}/files?name=${encodeURIComponent(name)}${also.length ? `&also=${also.join(',')}` : ''}`), token)
  .set('Content-Type', 'application/octet-stream').send(bytes);
const remove = (token, fileId, also = []) => bearer(request(app).delete(`/api/purchases/files/${fileId}${also.length ? `?also=${also.join(',')}` : ''}`), token);
const history = (token, id) => bearer(request(app).get('/api/audit-logs/entity'), token).query({ entity_type: 'purchase_records', entity_id: id });

let roms;
let accountant;
let viewer;
let purchaseHead;
let accountsHead;
let admin;

async function addUser(username, name, roles) {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  const { rows } = await db.execute({
    sql: 'INSERT INTO users (name, username, password_hash, is_first_login) VALUES (?, ?, ?, 0) RETURNING id', args: [name, username, hash],
  });
  for (const role of roles) await db.execute({ sql: 'INSERT INTO user_roles (user_id, role) VALUES (?, ?)', args: [rows[0].id, role] });
  return signIn(username);
}

const emptyPurchases = async () => {
  for (const t of ['purchase_files', 'roms_purchase_receipts', 'roms_purchase_challans', 'purchase_records']) await db.execute(`DELETE FROM ${t}`);
  // Files left by a test whose lines were just cleared, as freeBlob would on a real removal.
  await db.execute('DELETE FROM file_blobs WHERE id NOT IN (SELECT blob_id FROM voucher_files UNION SELECT blob_id FROM purchase_files)');
  await db.execute('UPDATE roms_refresh SET purchases_ok_at = NULL, purchases_error = NULL, purchases_lease_until = NULL, purchases_attempt_at = NULL WHERE id = 1');
};

// Serve these rows from the fake ROMS and read them into RAMS.
async function load(receipts, challans = []) {
  roms.state.data['purchase-receipts'] = receipts;
  roms.state.data['purchase-challans'] = challans;
  const res = await refreshPurchases(db, { roms: quick(roms) });
  expect(res).toMatchObject({ ok: true });
  return res;
}

const rowsOf = async (token, page = 'warehouse', query = {}) => {
  const res = await get(token, `${page}/records`, { page_size: 1000, fy: FY, ...query });
  expect(res.status).toBe(200);
  return res.body;
};
const findBy = (body, pred) => body.rows.find(pred);
const byIncoming = (body, inc) => body.rows.filter((r) => r.incoming === inc);
// A bill on these lines, put straight into the database (no history row), for
// the tests about the flow: a line never goes on without a file.
let billSeq = 0;
async function billOn(...ids) {
  billSeq += 1;
  const { rows } = await db.execute({
    sql: "INSERT INTO file_blobs (sha256, mime, size, stored_size) VALUES (?, 'application/pdf', 10, 10) RETURNING id",
    args: [`test-bill-${billSeq}-${Date.now()}`],
  });
  for (const id of ids) {
    await db.execute({ sql: "INSERT INTO purchase_files (blob_id, record_id, file_name, kind) VALUES (?, ?, 'bill.pdf', 'pdf')", args: [rows[0].id, id] });
  }
}
// A line's record, by its ROMS receipt row.
const recordOfReceipt = async (romsId) => Number((await db.execute({ sql: 'SELECT record_id FROM roms_purchase_receipts WHERE id = ?', args: [romsId] })).rows[0].record_id);

beforeAll(async () => {
  admin = await signIn('admin');
  accountant = await signIn('accountant');
  viewer = await signIn('viewer');
  purchaseHead = await addUser('purchasehead', 'Pia Purchase', ['Purchase Head']);
  accountsHead = await addUser('accountshead', 'Asha Accounts', ['Accountant', 'Accountant Head']);
  roms = await startFakeRoms({ ...emptyRefs(), 'purchase-receipts': [], 'purchase-challans': [] });
  await emptyPurchases();
});
beforeEach(emptyPurchases);
afterAll(async () => {
  await emptyPurchases();
  await db.execute("DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username IN ('purchasehead', 'accountshead'))");
  await db.execute("DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE username IN ('purchasehead', 'accountshead'))");
  await db.execute("DELETE FROM users WHERE username IN ('purchasehead', 'accountshead')");
  await roms.close();
});

describe('one record per ROMS line, listed by delivery', () => {
  test('lines sharing an Incoming No from one vendor are one delivery; another vendor\'s same number is another', async () => {
    await load([
      receipt({ incoming_no: '01/july', received_qty: 103 }),
      receipt({ incoming_no: '01/July ', received_qty: 57 }), // same number, typed with a capital and a space
      receipt({ incoming_no: '112', vendor_id: 11, vendor_name: 'Other Vendor', bill_no: '359' }),
      receipt({ incoming_no: '112', bill_no: '416' }),
      receipt({ incoming_no: null, bill_no: '777' }),
      receipt({ incoming_no: null, bill_no: '888', stage: 'Third Party', goes_to_stitching: 1 }),
    ]);
    const body = await rowsOf(accountant.token);
    const july = body.rows.filter((r) => r.incoming && r.incoming.toLowerCase() === '01/july');
    expect(july.map((r) => r.lines[0].qty)).toEqual([103, 57]);
    expect(new Set(july.map((r) => r.delivery.key)).size).toBe(1);
    expect(july[0]).toMatchObject({
      status: 'to_check', billing: ['121'], vendor: 'Shree Socks', no_incoming: false, label: 'Incoming 01/july (Shree Socks) — Socks',
      delivery: { label: 'Incoming 01/july (Shree Socks)' },
    });
    expect(july[0].lines).toHaveLength(1);
    expect(july[0].lines[0]).toMatchObject({ po: '002', article: 'Socks', rate: 19.75, uom: 'pcs' });
    const twelve = byIncoming(body, '112');
    expect(twelve).toHaveLength(2);
    expect(new Set(twelve.map((r) => r.delivery.key)).size).toBe(2);
    const lone = findBy(body, (r) => r.billing[0] === '777');
    expect(lone).toMatchObject({ incoming: null, no_incoming: true });
    expect(body.counts).toMatchObject({ to_check: 5, all: 5 });

    // Third Party (sold straight on) is a stitching article: on Stitching, and ROMS never gives it an Incoming No.
    const stitching = await rowsOf(accountant.token, 'stitching');
    expect(findBy(stitching, (r) => r.billing[0] === '888')).toMatchObject({ no_incoming: false });
  });

  test('each challan line is a record, the challan its delivery; rate and qty in one unit', async () => {
    await load([], [
      challan({ challan_no: '003', created_at: '2026-09-30 06:00:00' }),
      challan({ challan_no: '001', created_at: '2026-10-07 06:00:00', sent_dozens: 1200 }),
      challan({
        challan_no: 'P-9', parent_id: 20, challan_line_no: 1, from_stage: 'Processing', to_stage: 'Stitching', rate_unit: 'metre', sent_qty: 60, sent_dozens: null, received_dozens: 58, process_rate: 7, created_at: '2026-10-01 06:00:00',
      }),
      challan({
        challan_no: 'P-9', parent_id: 20, challan_line_no: 2, from_stage: 'Processing', to_stage: 'Stitching', rate_unit: 'metre', sent_qty: 40, sent_dozens: null, received_dozens: 39, process_rate: 7, created_at: '2026-10-01 06:00:00',
      }),
    ]);
    const body = await rowsOf(accountant.token, 'stitching');
    expect(byIncoming(body, 'PCL151 (MKC-12)')).toHaveLength(4);
    const p9 = body.rows.filter((r) => r.billing[0] === 'P-9');
    expect(p9.map((r) => [r.lines[0].qty, r.lines[0].uom, r.lines[0].rate])).toEqual([[60, 'm', 7], [40, 'm', 7]]);
    expect(p9[0]).toMatchObject({
      kind: 'challan', party: 'Mahakali creation', label: 'Challan P-9 from Mahakali creation — Handkerchief - Bundle Fabric', delivery: { label: 'Challan P-9 from Mahakali creation' },
    });
    expect(p9[0].delivery.key).toBe(p9[1].delivery.key);
    expect(findBy(body, (r) => r.billing[0] === '001').lines[0]).toMatchObject({ qty: 1200, uom: 'dz', from_stage: 'Stitching', to_stage: 'Warehouse' });
    // Newest delivery first.
    expect(body.rows.map((r) => r.billing[0])).toEqual(['001', 'P-9', 'P-9', '003']);
  });

  test('a delivery\'s lines stay together, sorted by its earliest line, even across days', async () => {
    await load([
      receipt({ incoming_no: 'X', created_at: '2026-09-01 06:00:00', received_qty: 1 }),
      receipt({ incoming_no: 'Y', created_at: '2026-09-05 06:00:00', received_qty: 2 }),
      receipt({ incoming_no: 'X', created_at: '2026-09-10 06:00:00', received_qty: 3 }),
    ]);
    const body = await rowsOf(viewer.token);
    expect(body.rows.map((r) => [r.incoming, r.lines[0].qty])).toEqual([['Y', 2], ['X', 1], ['X', 3]]);
    expect(body.rows[1].delivery.at).toBe('2026-09-01 06:00:00');
    expect(body.rows[2].delivery.at).toBe('2026-09-01 06:00:00');
  });

  test('groupLines and the snapshot diff, without a database', () => {
    const a = receipt({ id: 900, received_qty: 5, created_at: '2026-09-08 07:00:00' });
    const b = receipt({ id: 901, received_qty: 6, created_at: '2026-09-08 06:30:00' });
    const groups = groupLines([a, b], []);
    expect([...groups.keys()]).toEqual(['rcpt:900', 'rcpt:901']);
    expect([...groups.values()].map((g) => [g.delivery_key, g.delivery_at])).toEqual([
      ['inc:warehouse:6:01/july', '2026-09-08 06:30:00'], ['inc:warehouse:6:01/july', '2026-09-08 06:30:00'],
    ]);
    const snap = snapshotOf(linesOf(groups.get('rcpt:900')));
    const changed = linesOf(groupLines([{ ...a, received_qty: 4 }], []).get('rcpt:900'));
    expect(diffSnapshot(snap, changed)).toEqual([{ field: 'Socks, PO 002: Qty', old: '5', new: '4' }]);
    expect(diffSnapshot(snap, [])).toEqual([{ field: 'Socks, PO 002', old: '121 5 pcs @ 19.75', new: 'removed in ROMS' }]);
  });

  test('an older ROMS that doesn\'t send purchases is reported, not an error', async () => {
    const old = await startFakeRoms(emptyRefs());
    const res = await refreshPurchases(db, { roms: quick(old) });
    await old.close();
    expect(res).toMatchObject({ ok: false, error: NOT_SERVED });
    const body = await rowsOf(viewer.token);
    expect(body.roms.error).toBe(NOT_SERVED);
  });
});

describe('records from when a record was a whole delivery (before migration 023)', () => {
  // Puts both lines on the first line's record under an old delivery key, as
  // the code before per-line records left them.
  async function asOldRecord(lines) {
    const first = await recordOfReceipt(lines[0].id);
    for (const l of lines.slice(1)) await db.execute({ sql: 'DELETE FROM purchase_records WHERE id = ?', args: [await recordOfReceipt(l.id)] });
    await db.execute({ sql: 'UPDATE roms_purchase_receipts SET record_id = ? WHERE id IN (?, ?)', args: [first, lines[0].id, lines[1].id] });
    await db.execute({ sql: "UPDATE purchase_records SET group_key = 'inc:warehouse:6:old', delivery_key = NULL, delivery_at = NULL WHERE id = ?", args: [first] });
    return first;
  }

  test('a worked one is split: each line gets a record carrying its files, bill check and approvals', async () => {
    const lines = [receipt({ incoming_no: 'OLD', received_qty: 100 }), receipt({ incoming_no: 'OLD', received_qty: 50 })];
    await load(lines);
    const old = await asOldRecord(lines);
    expect((await upload(accountant.token, old, PDF)).status).toBe(201);
    expect((await post(accountant.token, `records/${old}/check`, { note: 'Both lines on bill 121' })).status).toBe(200);
    expect((await post(purchaseHead.token, 'purchase-head/approve', { ids: [old] })).body.approved).toBe(1);

    const res = await load(lines);
    expect(res.counts.records).toMatchObject({ split: 1, created: 0, removed: 0, dropped: 0 });
    const body = await rowsOf(accountant.token);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((r) => r.id)).toContain(old);
    for (const r of body.rows) {
      expect(r).toMatchObject({
        status: 'with_accounts_head', check: { name: 'Test Accountant', note: 'Both lines on bill 121' }, purchase_approval: { name: 'Pia Purchase' }, delivery: { label: 'Incoming OLD (Shree Socks)' },
      });
      expect(r.files.map((f) => f.name)).toEqual(['bill.pdf']);
    }
    const copy = body.rows.find((r) => r.id !== old);
    expect((await history(accountant.token, copy.id)).body.map((e) => e.action_type)).toEqual(['PURCHASE_SPLIT']);
    expect((await history(accountant.token, old)).body.map((e) => e.action_type)).toEqual(['PURCHASE_SPLIT', 'PURCHASE_APPROVE', 'PURCHASE_CHECK', 'FILE_ADD']);

    // Each kept the part of the bill check that is its own line: ROMS changing
    // the second line sends only that one back.
    const again = await load([lines[0], { ...lines[1], received_qty: 45 }]);
    expect(again.counts.records).toMatchObject({ changed: 1, split: 0 });
    const now = await rowsOf(accountant.token);
    expect(findBy(now, (r) => r.lines[0].qty === 45)).toMatchObject({ status: 'to_check', purchase_approval: null, changed: { changes: [{ field: 'Socks, PO 002: Qty', old: '50', new: '45' }] } });
    expect(findBy(now, (r) => r.lines[0].qty === 100)).toMatchObject({ status: 'with_accounts_head' });
  });

  test('an untouched one just stays with its first line; the others get fresh records, no history', async () => {
    const lines = [receipt({ incoming_no: 'OLD2' }), receipt({ incoming_no: 'OLD2' })];
    await load(lines);
    const old = await asOldRecord(lines);
    const res = await load(lines);
    expect(res.counts.records).toMatchObject({ split: 1, created: 1, dropped: 0 });
    expect(await recordOfReceipt(lines[0].id)).toBe(old);
    expect(await recordOfReceipt(lines[1].id)).not.toBe(old);
    expect((await history(accountant.token, old)).body).toEqual([]);
  });
});

describe('the bill check and the two approvals', () => {
  test('checker -> Purchase Head -> Accountant Head, each in the history, and only the right person at each step', async () => {
    await load([receipt({ incoming_no: 'IN-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;

    expect((await post(viewer.token, `records/${rec.id}/check`)).status).toBe(403);
    // Never without a file.
    const bare = await post(accountant.token, `records/${rec.id}/check`, { note: 'Bill matches the PO' });
    expect(bare.status).toBe(409);
    expect(bare.body.message).toBe('Attach the bill before sending it for approval');
    await billOn(rec.id);
    const checked = await post(accountant.token, `records/${rec.id}/check`, { note: 'Bill matches the PO' });
    expect(checked.status).toBe(200);
    expect(checked.body).toMatchObject({ status: 'with_purchase_head', check: { name: 'Test Accountant', note: 'Bill matches the PO' } });

    expect((await post(accountant.token, 'purchase-head/approve', { ids: [rec.id] })).status).toBe(403);
    expect((await post(accountsHead.token, 'accounts-head/approve', { ids: [rec.id] })).status).toBe(409);
    const first = await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });
    expect(first.body).toEqual({ approved: 1, skipped: [] });

    expect((await post(purchaseHead.token, 'accounts-head/approve', { ids: [rec.id] })).status).toBe(403);
    expect((await post(accountsHead.token, 'accounts-head/approve', { ids: [rec.id] })).body.approved).toBe(1);

    const done = findBy(await rowsOf(purchaseHead.token), (r) => r.id === rec.id);
    expect(done).toMatchObject({
      status: 'approved',
      purchase_approval: { name: 'Pia Purchase' },
      accounts_approval: { name: 'Asha Accounts' },
      last_change: { user_name: 'Asha Accounts', action_type: 'PURCHASE_APPROVE' },
    });
    const h = await history(accountant.token, rec.id);
    expect(h.body.map((e) => e.action_type)).toEqual(['PURCHASE_APPROVE', 'PURCHASE_APPROVE', 'PURCHASE_CHECK']);
    expect(h.body[0].description).toBe('Approved as Accountant Head — Incoming IN-1 (Shree Socks) — Socks');

    // Approved is final: no second check.
    const again = await post(accountant.token, `records/${rec.id}/check`);
    expect(again.status).toBe(409);
  });

  test('one bill check on several lines of a delivery, each in its own history; what can\'t be checked is skipped', async () => {
    await load([receipt({ incoming_no: 'D', received_qty: 1 }), receipt({ incoming_no: 'D', received_qty: 2 }), receipt({ incoming_no: 'D', received_qty: 3 })]);
    const [a, b, c] = (await rowsOf(accountant.token)).rows;
    await billOn(a.id, b.id, c.id);
    await post(accountant.token, `records/${c.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [c.id] });

    expect((await post(viewer.token, 'check', { ids: [a.id] })).status).toBe(403);
    expect((await post(accountant.token, 'check', { ids: [] })).status).toBe(400);
    const res = await post(accountant.token, 'check', { ids: [a.id, b.id, c.id], note: 'One bill for the delivery' });
    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(2);
    expect(res.body.skipped).toEqual([{ id: c.id, reason: 'This record is with accountant head — it can be changed again once a head sends it back' }]);
    for (const id of [a.id, b.id]) {
      const h = (await history(accountant.token, id)).body;
      expect(h.map((e) => e.action_type)).toEqual(['PURCHASE_CHECK']);
      expect(h[0].description).toMatch(/Note: One bill for the delivery$/);
    }
    // One line that can't be checked is an error, as on a single check.
    expect((await post(accountant.token, 'check', { ids: [c.id] })).status).toBe(409);

    // The record with its delivery's lines, for the popup's ticks.
    const one = await get(accountant.token, `records/${a.id}`);
    expect(one.body.delivery_lines.map((l) => [l.id, l.status, l.qty])).toEqual([
      [a.id, 'with_purchase_head', 1], [b.id, 'with_purchase_head', 2], [c.id, 'with_accounts_head', 3],
    ]);
  });

  test('approving before the bill check, and a bulk approve that skips what isn\'t waiting', async () => {
    await load([receipt({ incoming_no: 'A' }), receipt({ incoming_no: 'B' }), receipt({ incoming_no: 'C' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const [a, b, c] = ['A', 'B', 'C'].map((inc) => rows.find((r) => r.incoming === inc));
    const early = await post(purchaseHead.token, 'purchase-head/approve', { ids: [a.id] });
    expect(early.status).toBe(409);
    expect(early.body.message).toBe('This record needs its bill check saved first');

    await billOn(a.id, b.id);
    await post(accountant.token, `records/${a.id}/check`);
    await post(accountant.token, `records/${b.id}/check`);
    const bulk = await post(purchaseHead.token, 'purchase-head/approve', { ids: [a.id, b.id, c.id] });
    expect(bulk.body.approved).toBe(2);
    expect(bulk.body.skipped).toEqual([{ id: c.id, reason: 'This record needs its bill check saved first' }]);
    const body = await rowsOf(accountant.token, 'warehouse', { status: 'with_accounts_head' });
    expect(body.rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(body.counts).toMatchObject({ with_accounts_head: 2, to_check: 1, all: 3 });
  });

  test('a send back goes to the queue before the head: the Accountant Head\'s to the Purchase Head, the Purchase Head\'s to the checker', async () => {
    await load([receipt({ incoming_no: 'SB' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    await billOn(rec.id);
    await post(accountant.token, `records/${rec.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });

    expect((await post(accountsHead.token, `records/${rec.id}/accounts-head/send-back`, { reason: ' ' })).status).toBe(400);
    const back = await post(accountsHead.token, `records/${rec.id}/accounts-head/send-back`, { reason: 'Rate on the bill is 20, not 19.75' });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({
      status: 'with_purchase_head', purchase_approval: null, check: { name: 'Test Accountant' },
      sent_back: { step: 'accounts', name: 'Asha Accounts', reason: 'Rate on the bill is 20, not 19.75' },
    });
    // With the Purchase Head now: the checker can't recall it from them.
    const recall = await post(accountant.token, 'recall', { items: [{ id: rec.id, from: 'with_purchase_head' }] });
    expect(recall.status).toBe(409);
    expect(recall.body.message).toBe('The Accountant Head sent it back to the Purchase Head. Ask the Purchase Head to send it back to you');

    // The Purchase Head sends it on to the checker, who fixes and sends it again.
    const toChecker = await post(purchaseHead.token, `records/${rec.id}/purchase-head/send-back`, { reason: 'Get the corrected bill' });
    expect(toChecker.body).toMatchObject({ status: 'to_check', sent_back: { step: 'purchase', name: 'Pia Purchase', reason: 'Get the corrected bill' } });
    expect((await rowsOf(accountant.token, 'warehouse', { status: 'to_check' })).rows.map((r) => r.id)).toEqual([rec.id]);
    const rechecked = await post(accountant.token, `records/${rec.id}/check`, { note: 'Vendor sent a corrected bill' });
    expect(rechecked.body).toMatchObject({ status: 'with_purchase_head', sent_back: null, purchase_approval: null });
    const h = await history(accountant.token, rec.id);
    expect(h.body.map((e) => e.action_type)).toEqual(['PURCHASE_CHECK', 'PURCHASE_SEND_BACK', 'PURCHASE_SEND_BACK', 'PURCHASE_APPROVE', 'PURCHASE_CHECK']);
    expect(h.body[2].description).toMatch(/^Sent back by the Accountant Head to the Purchase Head — .*Reason: Rate on the bill is 20, not 19.75$/);
    expect(h.body[1].description).toMatch(/^Sent back by the Purchase Head to the checker — /);
  });

  test('a Purchase Head\'s approval after a send back clears the red note; approving needs a file too', async () => {
    await load([receipt({ incoming_no: 'RE' }), receipt({ incoming_no: 'NOFILE' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const rec = rows.find((r) => r.incoming === 'RE');
    const bare = rows.find((r) => r.incoming === 'NOFILE');
    await billOn(rec.id);
    await post(accountant.token, `records/${rec.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });
    await post(accountsHead.token, `records/${rec.id}/accounts-head/send-back`, { reason: 'Check the rate' });
    expect((await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] })).body.approved).toBe(1);
    expect((await get(accountant.token, `records/${rec.id}`)).body).toMatchObject({ status: 'with_accounts_head', sent_back: null });

    // A line that reached a head with no file (from before the rule) is not approved.
    await db.execute({ sql: "UPDATE purchase_records SET status = 'with_purchase_head', checked_at = datetime('now') WHERE id = ?", args: [bare.id] });
    const res = await post(purchaseHead.token, 'purchase-head/approve', { ids: [bare.id] });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('No bill attached — send it back to the checker to attach one');
  });

  test('migration 024 moves the old statuses into the queues, and sends back lines with a head that have no file', async () => {
    await load([receipt({ incoming_no: 'Q1' }), receipt({ incoming_no: 'Q2' }), receipt({ incoming_no: 'Q3' }), receipt({ incoming_no: 'Q4' }), receipt({ incoming_no: 'Q5' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const id = (inc) => rows.find((r) => r.incoming === inc).id;
    const set = (inc, sql) => db.execute({ sql: `UPDATE purchase_records SET ${sql} WHERE id = ?`, args: [id(inc)] });
    await billOn(id('Q1'), id('Q2'), id('Q3'), id('Q4'));
    await set('Q1', "status = 'sent_back', checked_at = datetime('now'), sent_back_step = 'accounts', sent_back_at = datetime('now'), sent_back_reason = 'Rate'");
    await set('Q2', "status = 'sent_back', checked_at = datetime('now'), sent_back_step = 'purchase', sent_back_at = datetime('now'), sent_back_reason = 'Vendor'");
    await set('Q3', "status = 'changed', checked_at = datetime('now'), changed_at = datetime('now'), changes = '[]'");
    await set('Q4', "status = 'approved', checked_at = datetime('now'), purchase_approved_at = datetime('now'), accounts_approved_at = datetime('now')");
    await set('Q5', "status = 'approved', checked_at = datetime('now'), purchase_approved_at = datetime('now'), accounts_approved_at = datetime('now')");

    const sql = fs.readFileSync(path.join(__dirname, '../src/migrations/024_purchase_queues.sql'), 'utf8');
    for (let run = 0; run < 2; run += 1) { // it can run again
      for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);
    }
    const now = (await rowsOf(accountant.token)).rows;
    const of = (inc) => now.find((r) => r.incoming === inc);
    expect(of('Q1')).toMatchObject({ status: 'with_purchase_head', sent_back: { step: 'accounts', reason: 'Rate' } });
    expect(of('Q2')).toMatchObject({ status: 'to_check', sent_back: { step: 'purchase', reason: 'Vendor' } });
    expect(of('Q3')).toMatchObject({ status: 'to_check', changed: { changes: [] } });
    expect(of('Q4')).toMatchObject({ status: 'approved' });
    expect(of('Q5')).toMatchObject({
      status: 'to_check', purchase_approval: null, accounts_approval: null, sent_back: { step: null, name: null, reason: 'No bill attached — attach the bill and send it again' },
    });
    const h = (await history(accountant.token, of('Q5').id)).body;
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ action_type: 'PURCHASE_SEND_BACK', user_id: null });
  });
});

describe('taking a step back: recall, and a head changing their mind', () => {
  const recall = (token, items) => post(token, 'recall', { items });
  const one = async (id) => (await get(accountant.token, `records/${id}`)).body;
  const changesOf = (e) => (typeof e.changes === 'string' ? JSON.parse(e.changes) : e.changes);

  test('the checker recalls a sent line: back to the check, files unlocked, the note kept; not once the Purchase Head approved', async () => {
    await load([receipt({ incoming_no: 'RC' }), receipt({ incoming_no: 'RC' })]);
    const [a, b] = (await rowsOf(accountant.token)).rows;
    expect((await upload(accountant.token, a.id, PDF)).status).toBe(201);
    await billOn(b.id);
    expect((await post(accountant.token, 'check', { ids: [a.id, b.id], note: 'Matches the PO' })).body.checked).toBe(2);
    expect((await upload(accountant.token, a.id, PDF2)).status).toBe(409);

    expect((await recall(viewer.token, [{ id: a.id, from: 'with_purchase_head' }])).status).toBe(403);
    const back = await recall(accountant.token, [{ id: a.id, from: 'with_purchase_head' }]);
    expect(back.status).toBe(200);
    expect(back.body).toEqual({ recalled: 1, skipped: [] });
    expect(await one(a.id)).toMatchObject({
      status: 'to_check', check: null, draft_note: 'Matches the PO', purchase_approval: null,
    });
    expect((await one(a.id)).files).toHaveLength(1);
    expect((await upload(accountant.token, a.id, PDF2)).status).toBe(201);
    const h = await history(accountant.token, a.id);
    const r = h.body.find((e) => e.action_type === 'PURCHASE_RECALL');
    expect(r).toMatchObject({ user_id: expect.any(Number) });
    expect(r.description).toMatch(/^Recalled from the Purchase Head, back to the bill check — /);
    expect(changesOf(r)).toEqual([{ field: 'Status', old: 'With Purchase Head', new: 'To check' }]);

    // The Purchase Head acted first: the line moved on, so it isn't recalled.
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [b.id] });
    const late = await recall(accountant.token, [{ id: b.id, from: 'with_purchase_head' }]);
    expect(late.status).toBe(409);
    expect(late.body.message).toMatch(/^Pia Purchase \(\d+ \w+, \d\d:\d\d\) approved it already, so it can’t be recalled/);
    expect((await one(b.id)).status).toBe('with_accounts_head');

    // Sending again starts over, with the kept note unless a new one is typed.
    expect((await post(accountant.token, 'check', { ids: [a.id], note: 'Matches the PO' })).body.checked).toBe(1);
    expect(await one(a.id)).toMatchObject({ status: 'with_purchase_head', draft_note: null, check: { note: 'Matches the PO' } });
  });

  test('the Purchase Head takes back an approval before the Accountant Head acts; an approved line is not recalled', async () => {
    await load([receipt({ incoming_no: 'PH' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    await billOn(rec.id);
    await post(accountant.token, `records/${rec.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });

    const notMine = await recall(accountant.token, [{ id: rec.id, from: 'with_accounts_head' }]);
    expect(notMine.status).toBe(409);
    expect(notMine.body.message).toBe('Only the Purchase Head can take back their approval');
    expect((await recall(purchaseHead.token, [{ id: rec.id, from: 'with_accounts_head' }])).body.recalled).toBe(1);
    expect(await one(rec.id)).toMatchObject({ status: 'with_purchase_head', purchase_approval: null, check: { name: 'Test Accountant' } });

    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });
    await post(accountsHead.token, 'accounts-head/approve', { ids: [rec.id] });
    const final = await recall(admin.token, [{ id: rec.id, from: 'with_accounts_head' }]);
    expect(final.status).toBe(409);
    expect(final.body.message).toMatch(/^Asha Accounts \(.+\) approved it already/);
    const noFrom = await recall(admin.token, [rec.id]);
    expect(noFrom.body.message).toBe('An approved line can’t be recalled. A head can send it back instead');

    // Bulk: each line on its own, with the reason for those skipped.
    const bulk = await recall(admin.token, [{ id: rec.id }, { id: 999999 }, { id: 'x' }]);
    expect(bulk.status).toBe(200);
    expect(bulk.body.recalled).toBe(0);
    expect(bulk.body.skipped.map((s) => s.id)).toEqual([rec.id, 999999]);
    expect((await recall(admin.token, [])).status).toBe(400);
  });

  test('a head can send back a line they approved, even after the final approval; not one that hasn\'t reached them', async () => {
    await load([receipt({ incoming_no: 'MIND' }), receipt({ incoming_no: 'MIND' }), receipt({ incoming_no: 'MIND' })]);
    const [a, b, c] = (await rowsOf(accountant.token)).rows;
    await billOn(a.id, b.id, c.id);
    await post(accountant.token, 'check', { ids: [a.id, b.id, c.id] });
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [a.id, b.id] });
    await post(accountsHead.token, 'accounts-head/approve', { ids: [b.id] });

    // The Purchase Head, after approving (with the Accountant Head): to the checker.
    const pa = await post(purchaseHead.token, `records/${a.id}/purchase-head/send-back`, { reason: 'Wrong vendor on the bill' });
    expect(pa.body).toMatchObject({ status: 'to_check', sent_back: { step: 'purchase', reason: 'Wrong vendor on the bill' } });

    // The Accountant Head, after the final approval: to the Purchase Head.
    const ab = await post(accountsHead.token, `records/${b.id}/accounts-head/send-back`, { reason: 'Paid twice' });
    expect(ab.body).toMatchObject({
      status: 'with_purchase_head', purchase_approval: null, accounts_approval: null, sent_back: { step: 'accounts', name: 'Asha Accounts' },
    });
    const h = await history(accountant.token, b.id);
    expect(h.body[0].description).toMatch(/^Sent back by the Accountant Head after approving it to the Purchase Head — .*Reason: Paid twice$/);
    expect(changesOf(h.body[0])).toEqual([{ field: 'Status', old: 'Approved', new: 'With Purchase Head' }]);

    // c is still with the Purchase Head: the Accountant Head can't send it back.
    const early = await post(accountsHead.token, `records/${c.id}/accounts-head/send-back`, { reason: 'x' });
    expect(early.status).toBe(409);
    expect(early.body.message).toBe('This record is with purchase head, not yet with the Accountant Head');
    // Nor anyone a line that is with the checker.
    const checker = await post(purchaseHead.token, `records/${a.id}/purchase-head/send-back`, { reason: 'x' });
    expect(checker.body.message).toBe('This record is with the checker already');

    // The Purchase Head may also send back a fully approved line: to the checker.
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [c.id] });
    await post(accountsHead.token, 'accounts-head/approve', { ids: [c.id] });
    expect((await post(purchaseHead.token, `records/${c.id}/purchase-head/send-back`, { reason: 'Bill is for another PO' })).body.status).toBe('to_check');
  });

  test('a recalled line deleted in ROMS is marked removed, not dropped: it has a history', async () => {
    await load([receipt({ incoming_no: 'GONE' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    await billOn(rec.id);
    await post(accountant.token, `records/${rec.id}/check`);
    await recall(accountant.token, [{ id: rec.id, from: 'with_purchase_head' }]);
    expect(await one(rec.id)).toMatchObject({ status: 'to_check', check: null });

    const res = await load([receipt({ incoming_no: 'OTHER' })]);
    expect(res.counts.records).toMatchObject({ removed: 1, dropped: 0 });
    expect(await one(rec.id)).toMatchObject({ status: 'removed' });
  });
});

describe('when ROMS changes a line after its bill check', () => {
  test('an approved line goes back to the check, its approvals cleared, the change in its history; its delivery\'s other line stays', async () => {
    const lines = [receipt({ incoming_no: 'CH-1', received_qty: 103 }), receipt({ incoming_no: 'CH-1', received_qty: 57 })];
    await load(lines);
    const ids = (await rowsOf(accountant.token)).rows.map((r) => r.id);
    await billOn(...ids);
    await post(accountant.token, 'check', { ids });
    await post(purchaseHead.token, 'purchase-head/approve', { ids });
    await post(accountsHead.token, 'accounts-head/approve', { ids });

    const res = await load([{ ...lines[0], received_qty: 100 }, lines[1]]);
    expect(res.counts.records.changed).toBe(1);
    const body = await rowsOf(accountant.token);
    const now = findBy(body, (r) => r.lines[0].qty === 100);
    // Back at the start, the checker's queue, with the note of what changed.
    expect(now).toMatchObject({ status: 'to_check', purchase_approval: null, accounts_approval: null });
    expect(body.counts).toMatchObject({ to_check: 1, approved: 1 });
    expect(now.changed.changes).toEqual([{ field: 'Socks, PO 002: Qty', old: '103', new: '100' }]);
    expect(findBy(body, (r) => r.lines[0].qty === 57)).toMatchObject({ status: 'approved' });
    // A system change: "Last updated by" still names the person.
    expect(now.last_change.user_name).toBe('Asha Accounts');
    const h = await history(accountant.token, now.id);
    expect(h.body[0]).toMatchObject({ action_type: 'PURCHASE_ROMS_CHANGED', user_id: null });

    // Reading ROMS again with nothing new changes nothing more.
    expect((await load([{ ...lines[0], received_qty: 100 }, lines[1]])).counts.records.changed).toBe(0);
    // Changed again while To check: the note keeps up.
    await load([{ ...lines[0], received_qty: 98 }, lines[1]]);
    expect((await get(accountant.token, `records/${now.id}`)).body.changed.changes).toEqual([{ field: 'Socks, PO 002: Qty', old: '103', new: '98' }]);
    const sent = (await post(accountant.token, `records/${now.id}/check`)).body;
    expect(sent).toMatchObject({ status: 'with_purchase_head', changed: null });
  });

  test('an Incoming No corrected in ROMS keeps each line\'s record, files and history, and moves it to its new delivery', async () => {
    const lines = [receipt({ incoming_no: '0l/aug' }), receipt({ incoming_no: '0l/aug' })];
    await load(lines);
    const before = (await rowsOf(accountant.token)).rows;
    expect((await upload(accountant.token, before[0].id, PDF)).status).toBe(201);

    const res = await load(lines.map((l) => ({ ...l, incoming_no: '01/aug' })));
    expect(res.counts.records).toMatchObject({ created: 0, split: 0, dropped: 0 });
    const body = await rowsOf(accountant.token);
    expect(body.rows.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect(body.rows.map((r) => [r.incoming, r.status, r.delivery.label])).toEqual([
      ['01/aug', 'to_check', 'Incoming 01/aug (Shree Socks)'], ['01/aug', 'to_check', 'Incoming 01/aug (Shree Socks)'],
    ]);
    expect(findBy(body, (r) => r.id === before[0].id).files).toHaveLength(1);
  });

  test('a line deleted in ROMS: removed if someone worked on it, else dropped', async () => {
    await load([receipt({ incoming_no: 'KEEP' }), receipt({ incoming_no: 'DROP' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const keep = rows.find((r) => r.incoming === 'KEEP');
    await billOn(keep.id);
    await post(accountant.token, `records/${keep.id}/check`);

    const res = await load([receipt({ incoming_no: 'OTHER' })]);
    expect(res.counts.records).toMatchObject({ removed: 1, dropped: 1, created: 1 });
    const body = await rowsOf(accountant.token);
    const removed = findBy(body, (r) => r.id === keep.id);
    expect(removed).toMatchObject({ status: 'removed', incoming: 'KEEP' });
    expect(removed.lines[0]).toMatchObject({ removed: true, article: 'Socks' });
    expect(findBy(body, (r) => r.incoming === 'DROP')).toBeUndefined();
    const blocked = await post(purchaseHead.token, 'purchase-head/approve', { ids: [keep.id] });
    expect(blocked.body.message).toMatch(/removed in ROMS/);
  });
});

describe('files on a purchase line', () => {
  test('added while the checker has it, locked once the check is saved, viewable by anyone who sees the page', async () => {
    await load([receipt({ incoming_no: 'F-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    expect((await upload(viewer.token, rec.id, PDF)).status).toBe(403);
    const added = await upload(accountant.token, rec.id, PDF);
    expect(added.status).toBe(201);
    expect(added.body.also).toEqual({ added: [], skipped: [] });
    expect((await upload(accountant.token, rec.id, PDF)).status).toBe(409); // the same file twice

    await post(accountant.token, `records/${rec.id}/check`);
    const locked = await upload(accountant.token, rec.id, PDF2);
    expect(locked.status).toBe(409);
    expect(locked.body.message).toMatch(/locked once the line is sent for approval/);
    expect((await remove(accountant.token, added.body.id)).status).toBe(409);

    const down = await bearer(request(app).get(`/api/purchases/files/${added.body.id}`), viewer.token).buffer(true).parse((res, cb) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => cb(null, Buffer.concat(parts)));
    });
    expect(down.status).toBe(200);
    expect(Buffer.compare(down.body, PDF)).toBe(0);
    const h = await history(accountant.token, rec.id);
    expect(h.body.map((e) => e.action_type)).toEqual(['PURCHASE_CHECK', 'FILE_ADD']);
  });

  test('one upload goes on the ticked lines of a delivery (stored once); a line it can\'t go on is skipped; removing takes it off them too', async () => {
    await load([receipt({ incoming_no: 'T' }), receipt({ incoming_no: 'T' }), receipt({ incoming_no: 'T' })]);
    const [a, b, c] = (await rowsOf(accountant.token)).rows;
    // c is with the Purchase Head: its files are locked.
    await db.execute({ sql: "UPDATE purchase_records SET status = 'with_purchase_head', checked_at = datetime('now') WHERE id = ?", args: [c.id] });

    const res = await upload(accountant.token, a.id, PDF, 'bill-121.pdf', [b.id, c.id]);
    expect(res.status).toBe(201);
    expect(res.body.also.added.map((x) => x.record_id)).toEqual([b.id]);
    expect(res.body.also.skipped).toEqual([{ id: c.id, reason: 'The files are locked once the line is sent for approval. Recall it, or ask the Purchase Head to send it back, to change them' }]);
    const [{ n: blobs }] = (await db.execute('SELECT COUNT(DISTINCT blob_id) AS n FROM purchase_files')).rows;
    expect(Number(blobs)).toBe(1);
    expect((await history(accountant.token, b.id)).body.map((e) => e.description)).toEqual([`File added — bill-121.pdf on ${b.label}`]);
    // The same file again on b alone is refused, as before.
    expect((await upload(accountant.token, b.id, PDF)).status).toBe(409);

    const gone = await remove(accountant.token, res.body.id, [b.id, c.id]);
    expect(gone.status).toBe(200);
    expect(gone.body.also.removed.map((x) => x.record_id)).toEqual([b.id]);
    const left = (await rowsOf(accountant.token)).rows;
    expect(left.every((r) => r.files.length === 0)).toBe(true);
    expect(Number((await db.execute('SELECT COUNT(*) AS n FROM file_blobs WHERE id NOT IN (SELECT blob_id FROM voucher_files UNION SELECT blob_id FROM purchase_files)')).rows[0].n)).toBe(0);
  });

  test('one bill on two lines is stored once, and removing it from one keeps it on the other', async () => {
    await load([receipt({ incoming_no: 'S-1' }), receipt({ incoming_no: 'S-2' })]);
    const [one, two] = (await rowsOf(accountant.token)).rows;
    const a = await upload(accountant.token, one.id, PDF);
    const b = await upload(accountant.token, two.id, PDF);
    expect(b.body.stored_once).toBe(true);
    expect((await remove(accountant.token, a.body.id)).status).toBe(200);
    expect((await bearer(request(app).get(`/api/purchases/files/${b.body.id}`), viewer.token)).status).toBe(200);
  });

  test('File storage counts them, and lists them with the line they are on and its year', async () => {
    await load([receipt({ incoming_no: 'U-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    const before = (await bearer(request(app).get('/api/files/usage'), admin.token)).body.files;
    const added = await upload(accountant.token, rec.id, PDF2, 'big-bill.pdf');
    const usage = (await bearer(request(app).get('/api/files/usage'), admin.token)).body;
    expect(usage.files).toBe(before + 1);
    expect(usage.biggest.find((f) => f.store === 'purchase' && f.id === added.body.id)).toMatchObject({
      name: 'big-bill.pdf',
      on: {
        type: 'purchase', page: 'warehouse', record_id: rec.id, label: 'Incoming U-1 (Shree Socks) — Socks', search: 'U-1', fy: 2026,
      },
    });
  });
});

describe('the page', () => {
  test('filters by financial year, month, company and search; a Purchase Head alone sees it, others need purchases.view', async () => {
    await load([
      receipt({ incoming_no: 'M-9', created_at: '2026-09-10 06:00:00' }),
      receipt({ incoming_no: 'M-10', created_at: '2026-10-02 06:00:00', company_id: 1, company_name: 'Royal Mart', bill_no: 'RM-55' }),
      // 31 Mar 2026 21:00 UTC is 1 Apr in IST: the year's first day.
      receipt({ incoming_no: 'M-4', created_at: '2026-03-31 21:00:00' }),
    ]);
    const all = await rowsOf(purchaseHead.token);
    expect(all).toMatchObject({ fy: 2026, fy_label: '2026-27' });
    expect(all.years.map((y) => y.label)).toContain('2026-27');
    expect(all.months).toEqual(expect.arrayContaining(['2026-10', '2026-09', '2026-04']));
    expect(all.months.at(-1)).toBe('2026-04');
    expect(all.companies).toEqual([{ id: 1, name: 'Royal Mart' }, { id: 2, name: 'Roymax' }]);
    expect(all.rows.map((r) => r.incoming)).toEqual(['M-10', 'M-9', 'M-4']);
    expect((await rowsOf(viewer.token, 'warehouse', { company_id: 1 })).rows.map((r) => r.incoming)).toEqual(['M-10']);
    expect((await rowsOf(viewer.token, 'warehouse', { month: '2026-09' })).rows.map((r) => r.incoming)).toEqual(['M-9']);
    expect((await rowsOf(viewer.token, 'warehouse', { month: '2026-04' })).rows.map((r) => r.incoming)).toEqual(['M-4']);
    expect((await rowsOf(viewer.token, 'warehouse', { q: 'rm-55' })).rows.map((r) => r.incoming)).toEqual(['M-10']);
    expect((await get(viewer.token, 'warehouse/records', { fy: FY, month: '2027-05' })).status).toBe(400);
    // A month without a year is in its own year (a page left open over 1 April).
    const septOnly = await get(viewer.token, 'warehouse/records', { month: '2026-09' });
    expect(septOnly.status).toBe(200);
    expect(septOnly.body).toMatchObject({ fy: 2026 });
    expect(septOnly.body.rows.map((r) => r.incoming)).toEqual(['M-9']);
    expect((await get(viewer.token, 'warehouse/records', { fy: 2019 })).status).toBe(400);
    expect((await get(viewer.token, 'elsewhere/records')).status).toBe(404);
    expect((await get(viewer.token, 'warehouse/records', { status: 'nope' })).status).toBe(400);
    // A filter saved before the five queues reads as To check.
    expect((await get(viewer.token, 'warehouse/records', { fy: FY, status: 'sent_back' })).status).toBe(200);

    // Admin can act at any step, like every permission.
    const rec = all.rows[0];
    await billOn(rec.id);
    await post(admin.token, `records/${rec.id}/check`);
    expect((await post(admin.token, 'purchase-head/approve', { ids: [rec.id] })).body.approved).toBe(1);
  });
});
