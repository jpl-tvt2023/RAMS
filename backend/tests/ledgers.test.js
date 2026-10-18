const request = require('supertest');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const {
  newAgent, agentPost, tallyCompany, voucher, enabledCompanies, startRun,
} = require('./helpers/agent');
const { checkDay, sameNumber, sameReference } = require('../src/ledgers/ledger');

// Ledgers end to end: a party's Tally vouchers pushed by a Connector, entries
// typed in RAMS, and the day RAMS works out from both. Every request names
// this suite's company, so other suites' data never mixes in. The dates are in
// July 2026, long past the grace days, so nothing here is still waiting.
const api = (method, token, path) => bearer(request(app)[method](`/api/ledgers${path}`), token);

let admin; let accountant; let viewer; let company; let q;

const party = 'LG BLINK COMMERCE (MUMBAI M12)';
const partyGuid = 'LGL1';
// One voucher on the party: `owed` (paise) is what it adds to what the party
// owes. The Connector sends rupees, Tally's way round (negative is a debit).
const vch = (key, baseType, number, date, owed, extra = {}) => voucher(`lg-${key}`, 10, {
  type: baseType,
  baseType,
  number,
  date,
  party,
  total: Math.abs(owed) / 100,
  orders: [],
  inventoryLines: [],
  ledgerLines: [
    { ledger: party, amount: -owed / 100, isParty: true, debit: owed > 0, bills: [] },
    { ledger: 'LG OTHER SIDE', amount: owed / 100, isParty: false, debit: owed < 0, bills: [] },
  ],
  ...extra,
});

const D = '2026-07-10';
const entry = (token, body) => api('post', token, '/entries').send({
  company_id: company.id, ledger_guid: partyGuid, date: D, ...body,
});
const dayOf = (token, date = D) => api('get', token, `/day?${q}&ledger_guid=${partyGuid}&date=${date}`);
const ids = {};

beforeAll(async () => {
  [admin, accountant, viewer] = await Promise.all([signIn('admin'), signIn('accountant'), signIn('viewer')]);
  const agent = await newAgent('Ledgers suite PC');
  [company] = await enabledCompanies(agent, admin, [tallyCompany({ state: 'Maharashtra' })]);
  q = `company_id=${company.id}`;
  const run = await startRun(agent, company.id, 'backfill');
  await agentPost(agent.token, `/runs/${run}/masters`, {
    groups: [{ guid: 'LGG1', name: 'Sundry Debtors', parent: '', reserved: 'Sundry Debtors', alterId: 1 }],
    ledgers: [
      { guid: partyGuid, name: party, parent: 'Sundry Debtors', gstins: [], billWise: true, alterId: 1 },
      { guid: 'LGL2', name: 'LG ZEPTO (THANE)', parent: 'Sundry Debtors', gstins: [], billWise: true, alterId: 1 },
      { guid: 'LGL3', name: 'LG OTHER SIDE', parent: 'Sales Accounts', gstins: [], alterId: 1 },
    ],
    stockItems: [],
    voucherTypes: [],
  });
  const vouchers = [
    vch('s1', 'Sales', 'LG/101/26-27', '2026-07-01', 500000),
    vch('s2', 'Sales', '102/LG/26-27', D, 118000),
    vch('s3', 'Sales', '103/LG/26-27', D, 200000),
    vch('cn', 'Credit Note', '1501', D, -30000),
    vch('r1', 'Receipt', 'R9', D, -400000, { narration: 'NEFT UTR HDFC0000123456' }),
    vch('r2', 'Receipt', 'R10', D, -50000),
    vch('j1', 'Journal', 'J1', D, -5000), // TDS, never typed in RAMS
    vch('s4', 'Sales', '104/LG/26-27', '2026-07-12', 70000),
    vch('x1', 'Sales', '105/LG/26-27', D, 999900, { cancelled: true }),
  ];
  await agentPost(agent.token, `/runs/${run}/vouchers`, { vouchers });
  await agentPost(agent.token, `/runs/${run}/reconcile`, { from: '2026-07-01', to: '2026-07-31', vouchers: vouchers.map((v) => ({ guid: v.guid, alterId: v.alterId })) });
  await agentPost(agent.token, `/runs/${run}/finish`, { ok: true, backfillDone: true });

  await db.execute({ sql: "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, vendor, source) VALUES (?, ?, 'vendor', 'Blinkit', 'person')", args: [company.id, partyGuid] });
  await db.execute({ sql: "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, suggested_vendor, suggested_votes) VALUES (?, 'LGL2', NULL, 'Zepto', 3)", args: [company.id] });
});

afterAll(async () => {
  await db.execute('UPDATE ledger_settings SET grace_days = 2, amount_tolerance_paise = 100, default_opening_paise = 1000000 WHERE id = 1');
});

describe('Recording entries', () => {
  test('an Accountant adds the day’s entries; each is audited', async () => {
    const add = async (key, body) => {
      const res = await entry(accountant.token, body);
      expect(res.status).toBe(201);
      ids[key] = res.body.id;
    };
    await add('s2', { kind: 'invoice', number: '102', amount_paise: 118000 }); // the serial only
    await add('s3', { kind: 'invoice', number: '103/LG/26-27', amount_paise: 210000 }); // ₹100 more than Tally
    await add('cn', { kind: 'credit_note', number: '1501', amount_paise: 30000 });
    await add('r1', { kind: 'receipt', reference: 'HDFC0000123456', amount_paise: 400000 });
    await add('r2', { kind: 'receipt', amount_paise: 50000 }); // no reference: paired by amount
    await add('s4', { kind: 'invoice', number: '104', amount_paise: 70000 }); // Tally has it on the 12th
    await add('lost', { kind: 'invoice', number: '999', amount_paise: 10000 }); // not in Tally at all

    const { rows } = await db.execute({ sql: "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'ledger_entries' AND action_type = 'LEDGER_ENTRY_CREATE' AND entity_ref = ?", args: [party] });
    expect(Number(rows[0].n)).toBe(7);
  });

  test('what is refused, and why', async () => {
    const bad = async (body, status, message) => {
      const res = await entry(accountant.token, body);
      expect(res.status).toBe(status);
      expect(res.body.message).toMatch(message);
    };
    await bad({ kind: 'invoice', amount_paise: 100 }, 400, /invoice number/);
    await bad({ kind: 'invoice', number: '7', amount_paise: 0 }, 400, /more than ₹0/);
    await bad({ kind: 'invoice', number: '7', amount_paise: 12.5 }, 400, /more than ₹0/);
    await bad({ kind: 'journal', number: '7', amount_paise: 100 }, 400, /invoice, debit note/);
    await bad({ kind: 'invoice', number: '7', amount_paise: 100, date: '2026-06-01' }, 400, /before 2026-06-08/);
    await bad({ kind: 'invoice', number: '7', amount_paise: 100, date: '2099-01-01' }, 400, /future/);
    await bad({ kind: 'invoice', number: '0102', amount_paise: 100 }, 409, /already entered .* on 2026-07-10/);
    await bad({ kind: 'invoice', number: '7', amount_paise: 100, ledger_guid: 'nope' }, 400, /Choose a party/);
  });

  test('a Viewer can see but not record; settings need ledgers.settings', async () => {
    expect((await dayOf(viewer.token)).status).toBe(200);
    expect((await entry(viewer.token, { kind: 'receipt', amount_paise: 100 })).status).toBe(403);
    expect((await api('put', accountant.token, '/settings').send({ grace_days: 3 })).status).toBe(403);
  });
});

describe('The day', () => {
  test('opens on the placeholder rolled on by Tally’s vouchers before the day', async () => {
    const res = await dayOf(viewer.token);
    expect(res.status).toBe(200);
    expect(res.body.party).toMatchObject({ name: party, vendor: 'Blinkit', suggested: false });
    expect(res.body.start).toMatchObject({ paise: 1000000, source: 'placeholder' });
    expect(res.body.opening_paise).toBe(1500000); // ₹10,000 + the ₹5,000 invoice of 1 Jul
    expect(res.body.started_on).toBe(D);
  });

  test('pairs each entry with Tally, lists what only Tally has, and flags the day', async () => {
    const { body } = await dayOf(viewer.token);
    const by = Object.fromEntries(body.entries.map((e) => [e.id, e]));
    expect(by[ids.s2]).toMatchObject({ status: 'in_tally', tally: expect.objectContaining({ number: '102/LG/26-27' }) });
    expect(by[ids.s3]).toMatchObject({ status: 'amount_differs', tally: expect.objectContaining({ amount_paise: 200000 }) });
    expect(by[ids.cn]).toMatchObject({ status: 'in_tally', effect_paise: -30000 });
    expect(by[ids.r1]).toMatchObject({ status: 'in_tally', tally: expect.objectContaining({ number: 'R9' }) });
    expect(by[ids.r2]).toMatchObject({ status: 'in_tally', tally: expect.objectContaining({ number: 'R10' }) });
    expect(by[ids.s4]).toMatchObject({ status: 'other_date', tally: expect.objectContaining({ date: '2026-07-12' }) });
    expect(by[ids.lost]).toMatchObject({ status: 'missing', tally: null });
    // The TDS journal; the cancelled invoice isn't there at all.
    expect(body.tally_only).toEqual([expect.objectContaining({ number: 'J1', voucher_type: 'Journal', status: 'only_in_tally' })]);
    expect(body).toMatchObject({
      tally_moves_paise: -167000,
      rams_moves_paise: -72000,
      tally_closing_paise: 1333000,
      rams_closing_paise: 1428000,
      difference_paise: 95000,
      status: 'differs',
    });
  });

  test('the next day opens on Tally’s closing, and shows where its invoice was entered', async () => {
    const { body } = await dayOf(viewer.token, '2026-07-12');
    expect(body.opening_paise).toBe(1333000);
    expect(body.tally_only).toEqual([expect.objectContaining({ number: '104/LG/26-27', status: 'other_date', entered_on: D, entry_id: ids.s4 })]);
    expect(body.status).toBe('differs');
  });

  test('a day before the party’s first entry isn’t checked', async () => {
    const { body } = await dayOf(viewer.token, '2026-07-01');
    expect(body).toMatchObject({ status: 'not_started', opening_paise: 1000000 });
    expect(body.tally_only[0].status).toBe('not_checked');
  });

  test('a loaded opening wins over the placeholder; the placeholder is a setting', async () => {
    await db.execute({ sql: 'INSERT INTO ledger_openings (company_id, ledger_guid, amount_paise) VALUES (?, ?, 2000000)', args: [company.id, partyGuid] });
    let { body } = await dayOf(viewer.token);
    expect(body.start).toMatchObject({ paise: 2000000, source: 'loaded' });
    expect(body.opening_paise).toBe(2500000);
    await db.execute({ sql: 'DELETE FROM ledger_openings WHERE company_id = ? AND ledger_guid = ?', args: [company.id, partyGuid] });

    const res = await api('put', admin.token, '/settings').send({ default_opening_paise: 0 });
    expect(res.status).toBe(200);
    ({ body } = await dayOf(viewer.token));
    expect(body.start).toMatchObject({ paise: 0, source: 'placeholder' });
    expect(body.opening_paise).toBe(500000);
    await api('put', admin.token, '/settings').send({ default_opening_paise: 1000000 });
  });

  test('dates outside the copy and unknown parties are refused', async () => {
    expect((await dayOf(viewer.token, '2026-05-31')).status).toBe(400);
    expect((await dayOf(viewer.token, '2099-01-01')).status).toBe(400);
    expect((await api('get', viewer.token, `/day?${q}&ledger_guid=nope&date=${D}`)).status).toBe(404);
    expect((await api('get', viewer.token, `/day?${q}`)).status).toBe(400);
  });
});

describe('Changing and removing entries', () => {
  test('a corrected amount pairs; each change is audited with the fields', async () => {
    const res = await api('put', accountant.token, `/entries/${ids.s3}`).send({ amount_paise: 200000 });
    expect(res.body).toEqual({ id: ids.s3, changed: true });
    const { body } = await dayOf(viewer.token);
    expect(body.entries.find((e) => e.id === ids.s3)).toMatchObject({ status: 'in_tally', updated_by_name: expect.any(String) });
    const { rows: [log] } = await db.execute({ sql: "SELECT changes FROM audit_logs WHERE action_type = 'LEDGER_ENTRY_UPDATE' AND entity_id = ?", args: [ids.s3] });
    expect(JSON.parse(log.changes)).toEqual([{ field: 'amount_paise', old: 210000, new: 200000 }]);
    // Sending the same again changes nothing.
    expect((await api('put', accountant.token, `/entries/${ids.s3}`).send({ amount_paise: 200000 })).body.changed).toBe(false);
    expect((await api('put', accountant.token, `/entries/${ids.s3}`).send({ party: 'x' })).status).toBe(400);
  });

  test('a removed entry leaves the day; the row stays for the audit trail', async () => {
    const res = await api('delete', accountant.token, `/entries/${ids.lost}`);
    expect(res.status).toBe(200);
    const { body } = await dayOf(viewer.token);
    expect(body.entries.map((e) => e.id)).not.toContain(ids.lost);
    const { rows: [row] } = await db.execute({ sql: 'SELECT deleted_at, deleted_by FROM ledger_entries WHERE id = ?', args: [ids.lost] });
    expect(row.deleted_at).toBeTruthy();
    expect((await api('delete', accountant.token, `/entries/${ids.lost}`)).status).toBe(404);
    expect((await api('put', accountant.token, `/entries/${ids.lost}`).send({ amount_paise: 1 })).status).toBe(404);
  });
});

describe('Choosing a party', () => {
  test('marketplaces with their parties, flags first, and the days that need attention', async () => {
    const res = await api('get', viewer.token, `/parties?${q}`);
    expect(res.status).toBe(200);
    expect(res.body.company_id).toBe(company.id);
    const blinkit = res.body.vendors.find((v) => v.vendor === 'Blinkit');
    expect(blinkit.parties).toEqual([expect.objectContaining({
      guid: partyGuid, name: party, entries: 6, last_entry: D, flagged_days: 2,
    })]);
    expect(res.body.vendors.find((v) => v.vendor === 'Zepto').parties).toEqual([expect.objectContaining({ guid: 'LGL2', suggested: true, flagged_days: 0 })]);
    expect(res.body.attention.map((a) => a.date)).toEqual(['2026-07-12', D]);
    expect(res.body.attention[1]).toMatchObject({
      party, vendor: 'Blinkit', counts: { missing: 0, amount_differs: 0, other_date: 1, only_in_tally: 1 },
    });
  });
});

describe('Settings', () => {
  test('Admin changes them (audited); out-of-range values are refused', async () => {
    let res = await api('put', admin.token, '/settings').send({ grace_days: 5, amount_tolerance_paise: 0 });
    expect(res.body).toMatchObject({ grace_days: 5, amount_tolerance_paise: 0, default_opening_paise: 1000000, updated_by_name: expect.any(String) });
    expect((await api('put', admin.token, '/settings').send({ grace_days: 31 })).status).toBe(400);
    expect((await api('put', admin.token, '/settings').send({ nonsense: 1 })).status).toBe(400);
    res = await api('get', viewer.token, '/settings');
    expect(res.body.grace_days).toBe(5);
    const { rows } = await db.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE action_type = 'LEDGER_SETTINGS_UPDATE'");
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1);
  });
});

describe('The check itself', () => {
  const settings = { grace_days: 2, amount_tolerance_paise: 100 };
  const v = (id, date, base, number, effect) => ({
    id, guid: `g${id}`, date, voucher_type: base, base_type: base, number, reference: '', narration: '', effect_paise: effect,
  });
  const e = (id, date, kind, number, amount) => ({
    id, date, kind, number, reference: null, amount_paise: amount,
  });

  test('inside the grace days, a missing side is waiting, not a difference', () => {
    const day = checkDay({
      date: '2026-10-17',
      today: '2026-10-18',
      opening: 0,
      entries: [e(1, '2026-10-17', 'invoice', '700', 1000)],
      vouchers: [v(9, '2026-10-17', 'Receipt', 'R1', -500)],
      settings,
      startedOn: '2026-10-17',
    });
    expect(day.entries[0].status).toBe('waiting');
    expect(day.tally_only[0].status).toBe('waiting');
    expect(day.status).toBe('waiting');
    expect(day.difference_paise).toBe(1500);
  });

  test('within the tolerance an amount is the same; one paisa past it differs', () => {
    const run = (amount) => checkDay({
      date: '2026-07-01', today: '2026-10-18', opening: 0, entries: [e(1, '2026-07-01', 'invoice', '700', amount)], vouchers: [v(9, '2026-07-01', 'Sales', '700/RM/26-27', 100000)], settings, startedOn: '2026-07-01',
    });
    expect(run(100100).status).toBe('matches');
    expect(run(100101).entries[0].status).toBe('amount_differs');
  });

  test('a receipt named by its reference isn’t taken by one paired on amount', () => {
    const vouchers = [v(8, '2026-07-01', 'Receipt', 'R1', -1000), { ...v(9, '2026-07-01', 'Receipt', 'R2', -1000), narration: 'UTR AXIS998877' }];
    const day = checkDay({
      date: '2026-07-01',
      today: '2026-10-18',
      opening: 0,
      entries: [e(1, '2026-07-01', 'receipt', null, 1000), { ...e(2, '2026-07-01', 'receipt', null, 1000), reference: 'axis998877' }],
      vouchers,
      settings,
      startedOn: '2026-07-01',
    });
    expect(day.entries.map((x) => x.tally.number)).toEqual(['R1', 'R2']);
    expect(day.status).toBe('matches');
  });

  test('numbers: the serial, leading zeros, separators', () => {
    expect(sameNumber('607', '607/RM/26-27')).toBe(true);
    expect(sameNumber('0607', '607/RM/26-27')).toBe(true);
    expect(sameNumber('rm-26-27-6', 'RM/26-27/006')).toBe(true);
    expect(sameNumber('608', '607/RM/26-27')).toBe(false);
    expect(sameNumber('', '607/RM/26-27')).toBe(false);
    expect(sameReference('12', { number: '12', reference: '', narration: '' })).toBe(false); // too short
  });
});
