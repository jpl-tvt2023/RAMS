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

// Purchase Reports (migration 022): ROMS's receipts and challans in RAMS,
// grouped into records -- one per Incoming No (+ vendor) on receipts, one per
// challan -- with files, a bill check, and the Purchase Head -> Accountant Head
// approval the user agreed on 2026-11-28.

const quick = (roms) => createRomsClient({ ...roms.settings, retries: 0, sleep: async () => {} });
const PDF = Buffer.from(`%PDF-1.4\n${'1 0 obj << /Type /Page >> endobj\n'.repeat(50)}%%EOF\n`);
const PDF2 = Buffer.from(`%PDF-1.4\n${'2 0 obj << /Type /Page >> endobj\n'.repeat(50)}%%EOF\n`);

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
const upload = (token, id, bytes, name = 'bill.pdf') => bearer(request(app).post(`/api/purchases/records/${id}/files?name=${encodeURIComponent(name)}`), token)
  .set('Content-Type', 'application/octet-stream').send(bytes);
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
  const res = await get(token, `${page}/records`, { page_size: 1000, ...query });
  expect(res.status).toBe(200);
  return res.body;
};
const findBy = (body, pred) => body.rows.find(pred);
const byIncoming = (body, inc) => body.rows.filter((r) => r.incoming === inc);

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

describe('grouping ROMS lines into records', () => {
  test('receipts sharing an Incoming No from one vendor are one record; another vendor\'s same number is another', async () => {
    await load([
      receipt({ incoming_no: '01/july', received_qty: 103 }),
      receipt({ incoming_no: '01/July ', received_qty: 57 }), // same number, typed with a capital and a space
      receipt({ incoming_no: '112', vendor_id: 11, vendor_name: 'Other Vendor', bill_no: '359' }),
      receipt({ incoming_no: '112', bill_no: '416' }),
      receipt({ incoming_no: null, bill_no: '777' }),
      receipt({ incoming_no: null, bill_no: '888', stage: 'Third Party', goes_to_stitching: 1 }),
    ]);
    const body = await rowsOf(accountant.token);
    const july = findBy(body, (r) => r.incoming && r.incoming.toLowerCase() === '01/july');
    expect(july.lines.map((l) => l.qty)).toEqual([103, 57]);
    expect(july).toMatchObject({ status: 'to_check', billing: ['121'], vendor: 'Shree Socks', no_incoming: false });
    expect(july.lines[0]).toMatchObject({ po: '002', article: 'Socks', rate: 19.75, uom: 'pcs' });
    expect(byIncoming(body, '112')).toHaveLength(2);
    const lone = findBy(body, (r) => r.billing[0] === '777');
    expect(lone).toMatchObject({ incoming: null, no_incoming: true });
    expect(body.counts).toMatchObject({ to_check: 4, all: 4 });

    // Third Party (sold straight on) is a stitching article: on Stitching, and ROMS never gives it an Incoming No.
    const stitching = await rowsOf(accountant.token, 'stitching');
    expect(findBy(stitching, (r) => r.billing[0] === '888')).toMatchObject({ no_incoming: false });
  });

  test('each challan is its own record, its lines together; rate and qty in one unit', async () => {
    await load([], [
      challan({ challan_no: '003', created_at: '2026-09-30 06:00:00' }),
      challan({ challan_no: '001', created_at: '2026-10-07 06:00:00', sent_dozens: 1200 }),
      challan({ challan_no: 'P-9', parent_id: 20, challan_line_no: 1, from_stage: 'Processing', to_stage: 'Stitching', rate_unit: 'metre', sent_qty: 60, sent_dozens: null, received_dozens: 58, process_rate: 7 }),
      challan({ challan_no: 'P-9', parent_id: 20, challan_line_no: 2, from_stage: 'Processing', to_stage: 'Stitching', rate_unit: 'metre', sent_qty: 40, sent_dozens: null, received_dozens: 39, process_rate: 7 }),
    ]);
    const body = await rowsOf(accountant.token, 'stitching');
    expect(byIncoming(body, 'PCL151 (MKC-12)')).toHaveLength(3);
    const p9 = findBy(body, (r) => r.billing[0] === 'P-9');
    expect(p9.lines.map((l) => [l.qty, l.uom, l.rate])).toEqual([[60, 'm', 7], [40, 'm', 7]]);
    expect(p9).toMatchObject({ kind: 'challan', party: 'Mahakali creation', label: 'Challan P-9 from Mahakali creation' });
    expect(findBy(body, (r) => r.billing[0] === '001').lines[0]).toMatchObject({ qty: 1200, uom: 'dz', from_stage: 'Stitching', to_stage: 'Warehouse' });
    // Newest first.
    expect(body.rows[body.rows.length - 1].billing).toEqual(['003']);
  });

  test('groupLines and the snapshot diff, without a database', () => {
    const a = receipt({ id: 900, received_qty: 5 });
    const b = receipt({ id: 901, received_qty: 6 });
    const groups = groupLines([a, b], []);
    expect(groups.size).toBe(1);
    const [g] = groups.values();
    const snap = snapshotOf(linesOf(g));
    const changed = linesOf(groupLines([{ ...a, received_qty: 4 }], []).values().next().value);
    expect(diffSnapshot(snap, changed)).toEqual([
      { field: 'Socks, PO 002: Qty', old: '5', new: '4' },
      { field: 'Socks, PO 002', old: '121 6 pcs @ 19.75', new: 'removed in ROMS' },
    ]);
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

describe('the bill check and the two approvals', () => {
  test('checker -> Purchase Head -> Accountant Head, each in the history, and only the right person at each step', async () => {
    await load([receipt({ incoming_no: 'IN-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;

    expect((await post(viewer.token, `records/${rec.id}/check`)).status).toBe(403);
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
    expect(h.body[0].description).toMatch(/^Approved as Accountant Head — Incoming IN-1 \(Shree Socks\)/);

    // Approved is final: no second check.
    const again = await post(accountant.token, `records/${rec.id}/check`);
    expect(again.status).toBe(409);
  });

  test('approving before the bill check, and a bulk approve that skips what isn\'t waiting', async () => {
    await load([receipt({ incoming_no: 'A' }), receipt({ incoming_no: 'B' }), receipt({ incoming_no: 'C' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const [a, b, c] = ['A', 'B', 'C'].map((inc) => rows.find((r) => r.incoming === inc));
    const early = await post(purchaseHead.token, 'purchase-head/approve', { ids: [a.id] });
    expect(early.status).toBe(409);
    expect(early.body.message).toBe('This record needs its bill check saved first');

    await post(accountant.token, `records/${a.id}/check`);
    await post(accountant.token, `records/${b.id}/check`);
    const bulk = await post(purchaseHead.token, 'purchase-head/approve', { ids: [a.id, b.id, c.id] });
    expect(bulk.body.approved).toBe(2);
    expect(bulk.body.skipped).toEqual([{ id: c.id, reason: 'This record needs its bill check saved first' }]);
    const body = await rowsOf(accountant.token, 'warehouse', { status: 'with_accounts_head' });
    expect(body.rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(body.counts).toMatchObject({ with_accounts_head: 2, to_check: 1, all: 3 });
  });

  test('a head sends it back with a reason; once checked again it starts over at the Purchase Head', async () => {
    await load([receipt({ incoming_no: 'SB' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    await post(accountant.token, `records/${rec.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });

    expect((await post(accountsHead.token, `records/${rec.id}/accounts-head/send-back`, { reason: ' ' })).status).toBe(400);
    expect((await post(purchaseHead.token, `records/${rec.id}/purchase-head/send-back`, { reason: 'x' })).status).toBe(409);
    const back = await post(accountsHead.token, `records/${rec.id}/accounts-head/send-back`, { reason: 'Rate on the bill is 20, not 19.75' });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({
      status: 'sent_back', purchase_approval: null, sent_back: { step: 'accounts', name: 'Asha Accounts', reason: 'Rate on the bill is 20, not 19.75' },
    });

    const rechecked = await post(accountant.token, `records/${rec.id}/check`, { note: 'Vendor sent a corrected bill' });
    expect(rechecked.body).toMatchObject({ status: 'with_purchase_head', sent_back: null, purchase_approval: null });
    const h = await history(accountant.token, rec.id);
    expect(h.body.map((e) => e.action_type)).toEqual(['PURCHASE_CHECK', 'PURCHASE_SEND_BACK', 'PURCHASE_APPROVE', 'PURCHASE_CHECK']);
    expect(h.body[1].description).toMatch(/Reason: Rate on the bill is 20, not 19.75$/);
  });
});

describe('when ROMS changes a record after its bill check', () => {
  test('an approved record goes back to the check, its approvals cleared, the change in its history', async () => {
    const lines = [receipt({ incoming_no: 'CH-1', received_qty: 103 }), receipt({ incoming_no: 'CH-1', received_qty: 57 })];
    await load(lines);
    const [rec] = (await rowsOf(accountant.token)).rows;
    await post(accountant.token, `records/${rec.id}/check`);
    await post(purchaseHead.token, 'purchase-head/approve', { ids: [rec.id] });
    await post(accountsHead.token, 'accounts-head/approve', { ids: [rec.id] });

    const res = await load([{ ...lines[0], received_qty: 100 }, lines[1]]);
    expect(res.counts.records.changed).toBe(1);
    const now = findBy(await rowsOf(accountant.token), (r) => r.id === rec.id);
    expect(now).toMatchObject({ status: 'changed', purchase_approval: null, accounts_approval: null });
    expect(now.changed.changes).toEqual([{ field: 'Socks, PO 002: Qty', old: '103', new: '100' }]);
    // A system change: "Last updated by" still names the person.
    expect(now.last_change.user_name).toBe('Asha Accounts');
    const h = await history(accountant.token, rec.id);
    expect(h.body[0]).toMatchObject({ action_type: 'PURCHASE_ROMS_CHANGED', user_id: null });

    // Reading ROMS again with nothing new changes nothing more.
    expect((await load([{ ...lines[0], received_qty: 100 }, lines[1]])).counts.records.changed).toBe(0);
    expect((await post(accountant.token, `records/${rec.id}/check`)).body.status).toBe('with_purchase_head');
  });

  test('an Incoming No corrected in ROMS keeps the record, its files and its history', async () => {
    const lines = [receipt({ incoming_no: '0l/aug' }), receipt({ incoming_no: '0l/aug' })];
    await load(lines);
    const [rec] = (await rowsOf(accountant.token)).rows;
    expect((await upload(accountant.token, rec.id, PDF)).status).toBe(201);

    const res = await load(lines.map((l) => ({ ...l, incoming_no: '01/aug' })));
    expect(res.counts.records).toMatchObject({ moved: 1, created: 0 });
    const body = await rowsOf(accountant.token);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ id: rec.id, incoming: '01/aug', status: 'to_check' });
    expect(body.rows[0].files).toHaveLength(1);
  });

  test('every line deleted in ROMS: removed if someone worked on it, else dropped', async () => {
    await load([receipt({ incoming_no: 'KEEP' }), receipt({ incoming_no: 'DROP' })]);
    const rows = (await rowsOf(accountant.token)).rows;
    const keep = rows.find((r) => r.incoming === 'KEEP');
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

describe('files on a purchase record', () => {
  test('added while the checker has it, locked once the check is saved, viewable by anyone who sees the page', async () => {
    await load([receipt({ incoming_no: 'F-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    expect((await upload(viewer.token, rec.id, PDF)).status).toBe(403);
    const added = await upload(accountant.token, rec.id, PDF);
    expect(added.status).toBe(201);
    expect((await upload(accountant.token, rec.id, PDF)).status).toBe(409); // the same file twice

    await post(accountant.token, `records/${rec.id}/check`);
    const locked = await upload(accountant.token, rec.id, PDF2);
    expect(locked.status).toBe(409);
    expect(locked.body.message).toMatch(/locked once the bill check is saved/);
    expect((await bearer(request(app).delete(`/api/purchases/files/${added.body.id}`), accountant.token)).status).toBe(409);

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

  test('one bill on two records is stored once, and removing it from one keeps it on the other', async () => {
    await load([receipt({ incoming_no: 'S-1' }), receipt({ incoming_no: 'S-2' })]);
    const [one, two] = (await rowsOf(accountant.token)).rows;
    const a = await upload(accountant.token, one.id, PDF);
    const b = await upload(accountant.token, two.id, PDF);
    expect(b.body.stored_once).toBe(true);
    expect((await bearer(request(app).delete(`/api/purchases/files/${a.body.id}`), accountant.token)).status).toBe(200);
    expect((await bearer(request(app).get(`/api/purchases/files/${b.body.id}`), viewer.token)).status).toBe(200);
  });

  test('File storage counts them, and lists them with the record they are on', async () => {
    await load([receipt({ incoming_no: 'U-1' })]);
    const [rec] = (await rowsOf(accountant.token)).rows;
    const before = (await bearer(request(app).get('/api/files/usage'), admin.token)).body.files;
    const added = await upload(accountant.token, rec.id, PDF2, 'big-bill.pdf');
    const usage = (await bearer(request(app).get('/api/files/usage'), admin.token)).body;
    expect(usage.files).toBe(before + 1);
    expect(usage.biggest.find((f) => f.store === 'purchase' && f.id === added.body.id)).toMatchObject({
      name: 'big-bill.pdf', on: { type: 'purchase', page: 'warehouse', record_id: rec.id, label: 'Incoming U-1 (Shree Socks)', search: 'U-1' },
    });
  });
});

describe('the page', () => {
  test('filters by company, month and search; a Purchase Head alone sees it, others need purchases.view', async () => {
    await load([
      receipt({ incoming_no: 'M-9', created_at: '2026-09-10 06:00:00' }),
      receipt({ incoming_no: 'M-10', created_at: '2026-10-02 06:00:00', company_id: 1, company_name: 'Royal Mart', bill_no: 'RM-55' }),
    ]);
    const all = await rowsOf(purchaseHead.token);
    expect(all.companies).toEqual([{ id: 1, name: 'Royal Mart' }, { id: 2, name: 'Roymax' }]);
    expect(all.months).toEqual(['2026-10', '2026-09']);
    expect((await rowsOf(viewer.token, 'warehouse', { company_id: 1 })).rows.map((r) => r.incoming)).toEqual(['M-10']);
    expect((await rowsOf(viewer.token, 'warehouse', { month: '2026-09' })).rows.map((r) => r.incoming)).toEqual(['M-9']);
    expect((await rowsOf(viewer.token, 'warehouse', { q: 'rm-55' })).rows.map((r) => r.incoming)).toEqual(['M-10']);
    expect((await get(viewer.token, 'elsewhere/records')).status).toBe(404);
    expect((await get(viewer.token, 'warehouse/records', { status: 'nope' })).status).toBe(400);

    // Admin can act at any step, like every permission.
    const rec = all.rows[0];
    await post(admin.token, `records/${rec.id}/check`);
    expect((await post(admin.token, 'purchase-head/approve', { ids: [rec.id] })).body.approved).toBe(1);
  });
});
