const request = require('supertest');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const {
  newAgent, agentPost, tallyCompany, voucher, enabledCompanies, startRun,
} = require('./helpers/agent');
const { loadInputs, todayIst } = require('../src/matching/load');
const { fyOf } = require('../src/matching/engine');

// Tally Reports -> Attachments end to end: a Connector pushes a company's
// invoices, payments, debit and credit notes for 2026-27 (from 1 April, before
// matching starts on 8 June), and the page lists them by month like Tally's
// registers, with what each needs -- a file and a narration -- its e-invoice,
// city and the last change made in RAMS.

let admin; let accountant; let viewer; let company; let agent;
const ZEPTO = 'ATT ZEPTO PRIVATE LIMITED ( PUNE )';
const SUPPLIER = 'ATT Tirupati Textiles';
const IRN = '9f2c4e7a1b3d5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8';
const PDF = Buffer.from(`%PDF-1.4\n${'1 0 obj << /Type /Page >> endobj\n'.repeat(50)}%%EOF\n`);
const NO_EINVOICE = { irn: '', ackNo: '', ackDate: '', cancelled: false };

const get = (token, path) => bearer(request(app).get(`/api/attachments${path}`), token);
const months = (token, extra = '') => get(token, `/months?company_id=${company.id}&fy=2026${extra}`);
const vouchersOf = (token, tab, month, extra = '') => get(token, `/vouchers?company_id=${company.id}&fy=2026&tab=${tab}&month=${month}${extra}`);
const tabOf = (body, key) => body.tabs.find((t) => t.key === key);
const monthOf = (tab, month) => tab.months.find((m) => m.month === month);
const line = (ledger, amount, extra = {}) => ({
  ledger, amount, isParty: false, debit: amount < 0, bills: [], ...extra,
});
const sale = (guid, date, total, extra = {}) => voucher(guid, 10, {
  number: `${guid}/RM/26-27`, date, party: ZEPTO, total, orders: [], inventoryLines: [], einvoice: NO_EINVOICE,
  ledgerLines: [line(ZEPTO, -total, { isParty: true }), line('ATT Sales', total)], ...extra,
});

let narrationBefore;
beforeAll(async () => {
  [admin, accountant, viewer] = await Promise.all([signIn('admin'), signIn('accountant'), signIn('viewer')]);
  [{ rows: [narrationBefore] }] = [await db.execute('SELECT types, required_from FROM narration_settings WHERE id = 1')];
  await db.execute("UPDATE narration_settings SET types = NULL, required_from = '2026-06-08' WHERE id = 1");

  agent = await newAgent('Attachments suite PC');
  [company] = await enabledCompanies(agent, admin, [tallyCompany({ state: 'Maharashtra' })]);
  const run = await startRun(agent, company.id, 'backfill');
  await agentPost(agent.token, `/runs/${run}/masters`, {
    ledgerReading: 3,
    groups: [],
    ledgers: [
      { guid: 'ATTL1', name: ZEPTO, parent: 'Sundry Debtors', gstins: [], state: 'Maharashtra', billWise: true, alterId: 1, city: '', pincode: '411001' },
      { guid: 'ATTL2', name: SUPPLIER, parent: 'Sundry Creditors', gstins: [], state: 'Gujarat', billWise: true, alterId: 1, city: 'Surat', pincode: '395002' },
      { guid: 'ATTL3', name: 'ATT HDFC Bank', parent: 'Bank Accounts', gstins: [], state: 'Maharashtra', billWise: false, alterId: 1 },
    ],
    stockItems: [],
    voucherTypes: [],
  });
  const vouchers = [
    // Sales: April (an e-invoice), May (no narration, but the check starts
    // on 8 June), July x2 (one with no narration, one an older Connector sent)
    sale('as1', '2026-04-10', 1000, {
      narration: 'PO A1',
      einvoice: {
        irn: IRN.toUpperCase(), ackNo: '122633138683008', ackDate: '2026-04-10', cancelled: false,
      },
    }),
    sale('as7', '2026-05-20', 400, { narration: '', einvoice: { irn: 'not-an-irn', ackNo: '12AB', ackDate: '2026-05-20', cancelled: false } }),
    sale('as2', '2026-07-05', 2000, { narration: '' }),
    sale('as3', '2026-07-20', 500, { narration: 'PO A3', einvoice: undefined }),
    // never listed: cancelled, optional, and deleted in Tally (left out of the reconcile)
    sale('as4', '2026-07-21', 999, { cancelled: true }),
    sale('as5', '2026-07-22', 998, { optional: true }),
    sale('as6', '2026-07-23', 997),
    // a payment from the bank: it pays the supplier and its freight
    voucher('ap1', 10, {
      type: 'Payment', baseType: 'Payment', invoice: false, number: '1543', date: '2026-07-10', party: 'ATT HDFC Bank', total: 350, narration: '', orders: [], inventoryLines: [], einvoice: NO_EINVOICE,
      ledgerLines: [line(SUPPLIER, -300), line('ATT Freight', -50), line('ATT HDFC Bank', 350, { isParty: true })],
    }),
    // a debit note to the supplier, and a credit note booking a marketplace DN
    voucher('ad1', 10, {
      type: 'Debit Note', baseType: 'Debit Note', invoice: false, number: '19', date: '2026-08-01', party: SUPPLIER, total: 120, narration: 'BILL NO- 405', orders: [], inventoryLines: [], einvoice: NO_EINVOICE,
      ledgerLines: [line(SUPPLIER, -120, { isParty: true }), line('ATT Purchase', 120)],
    }),
    voucher('ac1', 10, {
      type: 'Credit Note', baseType: 'Credit Note', invoice: false, number: '901', date: '2026-07-15', party: ZEPTO, total: 100, narration: 'FKIDN51803946', orders: [], inventoryLines: [], einvoice: NO_EINVOICE,
      ledgerLines: [line(ZEPTO, 100, { isParty: true }), line('ATT Sales', -100)],
    }),
    // a receipt is on no tab
    voucher('ar1', 10, {
      type: 'Receipt', baseType: 'Receipt', invoice: false, number: '77', date: '2026-07-16', party: ZEPTO, total: 700, orders: [], inventoryLines: [], einvoice: NO_EINVOICE,
      ledgerLines: [line(ZEPTO, 700, { isParty: true }), line('ATT HDFC Bank', -700)],
    }),
  ];
  const sent = await agentPost(agent.token, `/runs/${run}/vouchers`, { vouchers });
  if (sent.status !== 200) throw new Error(`vouchers ${sent.status} ${sent.body.message}`);
  const listed = vouchers.filter((v) => v.guid !== 'as6');
  for (const [from, to] of [['2026-04-01', '2026-04-30'], ['2026-05-01', '2026-05-31'], ['2026-07-01', '2026-07-31'], ['2026-08-01', '2026-08-31']]) {
    await agentPost(agent.token, `/runs/${run}/reconcile`, {
      from, to, vouchers: listed.filter((v) => v.date >= from && v.date <= to).map((v) => ({ guid: v.guid, alterId: v.alterId })),
    });
  }
  await agentPost(agent.token, `/runs/${run}/finish`, { ok: true, backfillDone: true });

  // as2 is linked to a ROMS PO in Pune.
  await db.execute("INSERT OR REPLACE INTO roms_pos (po_id, vendor, vendor_po_id, po_date, city) VALUES ('ATT-PO-1', 'Zepto', 'ZPO-1', '2026-07-01', 'Pune')");
  await db.execute({
    sql: "INSERT INTO doc_links (target_kind, target_id, role, company_id, voucher_guid, method, status) VALUES ('po', 'ATT-PO-1', 'invoice', ?, 'as2', 'test', 'auto')",
    args: [company.id],
  });
  await db.execute({
    sql: "INSERT OR REPLACE INTO match_results (target_kind, target_id, po_id, outcome, company_id, voucher_guid) VALUES ('po', 'ATT-PO-1', 'ATT-PO-1', 'linked', ?, 'as2')",
    args: [company.id],
  });
});

afterAll(async () => {
  await db.execute({ sql: 'UPDATE narration_settings SET types = ?, required_from = ? WHERE id = 1', args: [narrationBefore.types, narrationBefore.required_from] });
  await db.execute("DELETE FROM match_results WHERE target_id = 'ATT-PO-1'");
  await db.execute("DELETE FROM doc_links WHERE target_id = 'ATT-PO-1'");
  await db.execute("DELETE FROM roms_pos WHERE po_id = 'ATT-PO-1'");
});

describe('The months', () => {
  test('each tab, month by month, as Tally’s register: count, and Debit or Credit', async () => {
    const { status, body } = await months(viewer.token);
    expect(status).toBe(200);
    expect(body).toMatchObject({ company_id: company.id, fy: 2026, fy_label: '2026-27', sync_from: '2026-04-01' });
    expect(body.tabs.map((t) => [t.key, t.label, t.base_type, t.side])).toEqual([
      ['invoice', 'Invoice', 'Sales', 'credit'], ['payment', 'Payments', 'Payment', 'debit'],
      ['dn', 'Debit Note', 'Debit Note', 'credit'], ['cn', 'Credit Note', 'Credit Note', 'debit'],
    ]);
    const sales = tabOf(body, 'invoice');
    expect(sales.months.map((m) => m.month)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
    ]);
    // Sales are on the register's Credit side.
    expect(monthOf(sales, '2026-04')).toMatchObject({
      label: 'April 2026', in_copy: true, from: null, vouchers: 1, credit_paise: 100000, debit_paise: 0,
    });
    expect(monthOf(sales, '2026-05')).toMatchObject({ vouchers: 1, credit_paise: 40000 });
    expect(monthOf(sales, '2026-06')).toMatchObject({ vouchers: 0, credit_paise: 0 });
    // Cancelled, optional and deleted vouchers aren't counted.
    expect(monthOf(sales, '2026-07')).toMatchObject({ vouchers: 2, credit_paise: 250000 });
    expect(sales.totals).toMatchObject({ vouchers: 4, credit_paise: 390000, debit_paise: 0 });
    // No running Closing balance: the page doesn't show one.
    expect(monthOf(sales, '2026-07')).not.toHaveProperty('closing_paise');
    expect(sales.totals).not.toHaveProperty('closing_paise');

    // Payments and credit notes debit; debit notes credit. A receipt is on no tab.
    expect(monthOf(tabOf(body, 'payment'), '2026-07')).toMatchObject({ vouchers: 1, debit_paise: 35000 });
    expect(monthOf(tabOf(body, 'dn'), '2026-08')).toMatchObject({ vouchers: 1, credit_paise: 12000 });
    expect(monthOf(tabOf(body, 'cn'), '2026-07')).toMatchObject({ vouchers: 1, debit_paise: 10000 });
    expect(body.tabs.reduce((a, t) => a + t.totals.vouchers, 0)).toBe(7);
  });

  test('needs attention: no narration where the check asks for one, or no file', async () => {
    const sales = tabOf((await months(viewer.token)).body, 'invoice');
    // April has a narration but no file. May has neither, but the narration
    // check starts on 8 June. July: one with no narration, one with no file.
    expect(monthOf(sales, '2026-04')).toMatchObject({ no_narration: 0, no_file: 1, needs_attention: 1 });
    expect(monthOf(sales, '2026-05')).toMatchObject({ no_narration: 0, no_file: 1, needs_attention: 1 });
    expect(monthOf(sales, '2026-07')).toMatchObject({ no_narration: 1, no_file: 2, needs_attention: 2 });

    // Only Payments need a narration: the July invoice without one no longer counts it.
    await db.execute('UPDATE narration_settings SET types = \'["Payment"]\' WHERE id = 1');
    try {
      const body = (await months(viewer.token)).body;
      expect(monthOf(tabOf(body, 'invoice'), '2026-07').no_narration).toBe(0);
      expect(monthOf(tabOf(body, 'payment'), '2026-07').no_narration).toBe(1);
    } finally {
      await db.execute('UPDATE narration_settings SET types = NULL WHERE id = 1');
    }
  });

  test('the starred company and the current financial year by default; other years and companies refused', async () => {
    const { rows: before } = await db.execute('SELECT id FROM tally_companies WHERE is_default = 1');
    await db.execute({ sql: 'UPDATE tally_companies SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END', args: [company.id] });
    try {
      const { body } = await get(viewer.token, '/months');
      expect(body).toMatchObject({ company_id: company.id, fy: fyOf(todayIst()) });
      expect(body.years.at(-1)).toEqual({ fy: 2026, label: '2026-27' });
      expect(body.companies.find((c) => c.id === company.id)).toMatchObject({ is_default: true });
    } finally {
      await db.execute('UPDATE tally_companies SET is_default = 0');
      for (const r of before) await db.execute({ sql: 'UPDATE tally_companies SET is_default = 1 WHERE id = ?', args: [r.id] });
    }
    expect((await get(viewer.token, `/months?company_id=${company.id}&fy=2019`)).status).toBe(400);
    expect((await get(viewer.token, '/months?company_id=999999&fy=2026')).status).toBe(404);
  });

  test('seeing it is attachments.view', async () => {
    await db.execute("DELETE FROM role_permissions WHERE role = 'Viewer' AND permission = 'attachments.view'");
    try {
      expect((await months(viewer.token)).status).toBe(403);
      expect((await vouchersOf(viewer.token, 'invoice', '2026-07')).status).toBe(403);
    } finally {
      await db.execute("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES ('Viewer', 'attachments.view')");
    }
    expect((await months(accountant.token)).status).toBe(200);
  });
});

describe('A month’s vouchers', () => {
  test('in Tally’s order, with amount, narration, e-invoice and what needs attention', async () => {
    const { status, body } = await vouchersOf(viewer.token, 'invoice', '2026-07');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      tab: 'invoice', month: '2026-07', label: 'July 2026', counts: { all: 2, needs_attention: 2 }, totals: { vouchers: 2, amount_paise: 250000 }, einvoice_unread: 1,
    });
    expect(body.rows.map((r) => r.number)).toEqual(['as2/RM/26-27', 'as3/RM/26-27']);
    const [a2, a3] = body.rows;
    expect(a2).toMatchObject({
      date: '2026-07-05', amount_paise: 200000, ledger: ZEPTO, narration: null, narration_missing: true, has_file: false, needs_attention: true, files: [], last_change: null,
    });
    expect(a2.einvoice).toEqual({
      read: true, irn: null, ack_no: null, ack_date: null, cancelled: false,
    });
    // An older Connector sent as3: its e-invoice isn't read yet.
    expect(a3).toMatchObject({ narration: 'PO A3', narration_missing: false, needs_attention: true });
    expect(a3.einvoice.read).toBe(false);

    const april = (await vouchersOf(viewer.token, 'invoice', '2026-04')).body;
    expect(april.rows[0].einvoice).toEqual({
      read: true, irn: IRN, ack_no: '122633138683008', ack_date: '2026-04-10', cancelled: false,
    });
    // What isn't an IRN or an Ack No is not kept.
    const may = (await vouchersOf(viewer.token, 'invoice', '2026-05')).body;
    expect(may.rows[0].einvoice).toEqual({
      read: true, irn: null, ack_no: null, ack_date: '2026-05-20', cancelled: false,
    });
    expect(may.rows[0]).toMatchObject({ narration_missing: false, needs_attention: true }); // before the narration check starts
  });

  test('a payment shows the ledgers it pays, not the bank it was paid from', async () => {
    const { body } = await vouchersOf(viewer.token, 'payment', '2026-07');
    expect(body.einvoice_unread).toBe(0);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      number: '1543', party: 'ATT HDFC Bank', ledger: SUPPLIER, ledgers: [SUPPLIER, 'ATT Freight'], amount_paise: 35000,
    });
  });

  test('city: the ledger’s in Tally, else the invoice’s ROMS PO, else the party’s latest PO', async () => {
    const july = (await vouchersOf(viewer.token, 'invoice', '2026-07')).body.rows;
    expect(july.find((r) => r.guid === 'as2')).toMatchObject({ city: 'Pune', city_from: 'po', pincode: '411001' });
    expect(july.find((r) => r.guid === 'as3')).toMatchObject({ city: 'Pune', city_from: 'party_po' });
    expect((await vouchersOf(viewer.token, 'cn', '2026-07')).body.rows[0]).toMatchObject({ ledger: ZEPTO, city: 'Pune', city_from: 'party_po' });
    expect((await vouchersOf(viewer.token, 'dn', '2026-08')).body.rows[0]).toMatchObject({ ledger: SUPPLIER, city: 'Surat', city_from: 'tally', pincode: '395002' });
    expect((await vouchersOf(viewer.token, 'payment', '2026-07')).body.rows[0]).toMatchObject({ city: 'Surat', city_from: 'tally' });
  });

  test('a ledger’s city is read only from a Connector that reads it (0.8.0), never blanked by an older one', async () => {
    const run = await startRun(agent, company.id, 'heavy', 100, 51);
    const res = await agentPost(agent.token, `/runs/${run}/masters`, {
      ledgerReading: 2,
      ledgers: [
        { guid: 'ATTL1', name: ZEPTO, parent: 'Sundry Debtors', gstins: [], state: 'Maharashtra', billWise: true, alterId: 1 },
        { guid: 'ATTL2', name: SUPPLIER, parent: 'Sundry Creditors', gstins: [], state: 'Karnataka', billWise: true, alterId: 2 },
        { guid: 'ATTL3', name: 'ATT HDFC Bank', parent: 'Bank Accounts', gstins: [], state: 'Maharashtra', billWise: false, alterId: 1 },
      ],
    });
    expect(res.status).toBe(200);
    await agentPost(agent.token, `/runs/${run}/finish`, { ok: true });
    const { rows: [l] } = await db.execute({ sql: 'SELECT state, city, pincode FROM tally_ledgers WHERE company_id = ? AND guid = ?', args: [company.id, 'ATTL2'] });
    expect(l).toMatchObject({ state: 'Karnataka', city: 'Surat', pincode: '395002' }); // state still updates
  });

  test('a file added shows on its row, clears its “no file”, and its last change says who and when', async () => {
    const add = await bearer(request(app).post(`/api/files?${new URLSearchParams({ company_id: company.id, voucher_guid: 'as3', name: 'invoice as3.pdf' })}`), accountant.token)
      .set('Content-Type', 'application/octet-stream').send(PDF);
    expect(add.status).toBe(201);
    const { body } = await vouchersOf(viewer.token, 'invoice', '2026-07');
    const a3 = body.rows.find((r) => r.guid === 'as3');
    expect(a3).toMatchObject({ has_file: true, needs_attention: false });
    expect(a3.files.map((f) => f.name)).toEqual(['invoice as3.pdf']);
    expect(a3.last_change).toMatchObject({ user_name: expect.any(String), at: expect.any(String), action_type: 'FILE_ADD' });
    expect(a3.last_change.description).toMatch(/invoice as3\.pdf/);
    expect(body.counts).toEqual({ all: 2, needs_attention: 1 });

    // The month agrees with its list.
    const sales = tabOf((await months(viewer.token)).body, 'invoice');
    expect(monthOf(sales, '2026-07')).toMatchObject({ no_file: 1, needs_attention: 1 });
    const flagged = await vouchersOf(viewer.token, 'invoice', '2026-07', '&only=attention');
    expect(flagged.body.rows.map((r) => r.guid)).toEqual(['as2']);
    expect(flagged.body.total).toBe(monthOf(sales, '2026-07').needs_attention);

    // The voucher's history, as the Audit Log column opens it.
    const history = await bearer(request(app).get(`/api/audit-logs/entity?entity_type=tally_vouchers&entity_id=${a3.id}`), viewer.token);
    expect(history.status).toBe(200);
    expect(history.body[0]).toMatchObject({ action_type: 'FILE_ADD' });
  });

  test('search by number, ledger or Ack No, and pages', async () => {
    const found = await vouchersOf(viewer.token, 'invoice', '2026-04', '&q=122633138683008');
    expect(found.body.rows.map((r) => r.guid)).toEqual(['as1']);
    expect((await vouchersOf(viewer.token, 'payment', '2026-07', '&q=freight')).body.total).toBe(1);
    const second = await vouchersOf(viewer.token, 'invoice', '2026-07', '&page=2&page_size=1');
    expect(second.body).toMatchObject({ total: 2, page: 2, page_size: 1 });
    expect(second.body.rows.map((r) => r.guid)).toEqual(['as3']);
  });

  test('an unknown tab or a month outside the year is refused', async () => {
    expect((await vouchersOf(viewer.token, 'receipt', '2026-07')).status).toBe(400);
    expect((await vouchersOf(viewer.token, 'invoice', '2027-05')).status).toBe(400);
    expect((await vouchersOf(viewer.token, 'invoice', 'July')).status).toBe(400);
  });
});

describe('The copy starts on 1 April, matching on 8 June (ROMS go-live)', () => {
  test('matching never looks at an invoice before 8 June, and Bills Receivable never calls it “no PO”', async () => {
    const inputs = await loadInputs(db);
    const ours = inputs.vouchers.filter((v) => v.company_id === company.id).map((v) => v.guid);
    expect(ours).toEqual(expect.arrayContaining(['as2', 'as3']));
    expect(ours).not.toEqual(expect.arrayContaining(['as1']));
    expect(ours).not.toEqual(expect.arrayContaining(['as7']));

    const search = await bearer(request(app).get('/api/matching/vouchers?kind=po&q=RM/26-27'), viewer.token);
    const found = search.body.rows.filter((r) => r.company_id === company.id).map((r) => r.guid);
    expect(found).toEqual(expect.arrayContaining(['as2', 'as3']));
    expect(found).not.toContain('as1');

    const all = await bearer(request(app).get(`/api/reports/bills-receivable?company_id=${company.id}&page_size=100`), viewer.token);
    expect(all.body).toMatchObject({ sync_from: '2026-04-01', match_from: '2026-06-08' });
    expect(all.body.rows.find((r) => r.guid === 'as1')).toMatchObject({ before_matching: true, pos: [] });
    expect(all.body.rows.find((r) => r.guid === 'as2')).toMatchObject({ before_matching: false, pos: ['ATT-PO-1'] });
    const noPo = await bearer(request(app).get(`/api/reports/bills-receivable?company_id=${company.id}&status=no_po&page_size=100`), viewer.token);
    expect(noPo.body.rows.map((r) => r.guid).sort()).toEqual(['as3']);
  });

  test('a decision can’t pick an invoice from before matching starts', async () => {
    const pick = await bearer(request(app).post('/api/matching/results/po/ATT-PO-1/pick'), admin.token).send({ company_id: company.id, voucher_guid: 'as1' });
    expect(pick.status).toBe(400);
    expect(pick.body.message).toMatch(/before matching starts on 2026-06-08/);
  });
});
