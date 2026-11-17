const request = require('supertest');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const {
  newAgent, agentPost, tallyCompany, voucher, enabledCompanies, startRun,
} = require('./helpers/agent');
const { dnNumbersIn, columnOf, notesOf } = require('../src/ledgers/ledger');

// Ledgers end to end: a Zepto party's Tally vouchers pushed by a Connector,
// and the bill-to-bill statement RAMS works out from them alone -- nothing is
// typed in RAMS. Every request names this suite's company, so other suites'
// data never mixes in. Its August is your example row (opening 100, invoice
// 10, DN 2, CN 3, TDS 0.1, journal 2, receipt 5, closing 101.9) in hundreds
// of rupees.
const api = (method, token, path) => bearer(request(app)[method](`/api/ledgers${path}`), token);

let admin; let accountant; let viewer; let agent; let company;

const Z1 = 'LG ZEPTO PRIVATE LIMITED ( PUNE ) - Dark Store';
const Z2 = 'LG ZEPTO PRIVATE LIMITED ( BANGALORE) - Dark Store';
const M1 = 'LG Flipkart India Private Limited - Gurgaon';
const B1 = 'LG BLINK COMMERCE (MUMBAI M12)';
const TDS = 'LG TDS Receivable (FY 2026-27)';

// One voucher: `lines` are [ledger, rupees] in Tally's sign (negative is a
// debit). The first line is the party's.
const vch = (key, baseType, number, date, lines, extra = {}) => voucher(`lg-${key}`, 10, {
  type: baseType,
  baseType,
  number,
  date,
  party: lines[0][0],
  total: Math.abs(lines[0][1]),
  reference: '',
  narration: '',
  orders: [],
  inventoryLines: [],
  ledgerLines: lines.map(([ledger, amount], i) => ({
    ledger, amount, isParty: i === 0, debit: amount < 0, bills: [],
  })),
  ...extra,
});
// `owed` paise on the party, the other side on `other`.
const simple = (key, baseType, number, date, owed, { ledger = Z1, other = 'LG SALES', ...extra } = {}) => vch(key, baseType, number, date, [[ledger, -owed / 100], [other, owed / 100]], extra);

// The company's ledgers, as each masters push sends them: the whole list.
const ledger = (guid, name, state, gstin) => ({
  guid, name, parent: 'Sundry Debtors', gstins: gstin ? [gstin] : [], state, billWise: true, alterId: 1,
});
const LEDGERS = (z2State = 'Maharashtra') => [
  ledger('LGZ1', Z1, 'Maharashtra', '27AAICK4821A1ZV'),
  ledger('LGZ2', Z2, z2State, '29AAICK4821A1ZR'), // the GSTIN says Karnataka
  ledger('LGM1', M1, 'Haryana', '06AABCF8078M1Z5'),
  ledger('LGB1', B1, 'Maharashtra', '27AAFCG9846E1Z9'),
  ledger('LGX1', 'LG SALES', '', null),
  ledger('LGX2', 'LG BANK', '', null),
  ledger('LGX3', TDS, '', null),
  ledger('LGX4', 'LG Discount Given', '', null),
];

const pick = (p) => `company_id=${company.id}&vendor=Zepto&states=all&parties=${company.id}:${p}`;
const statementOf = (token, query) => api('get', token, `/statement?${query}`);
const partyOf = (token, guid, from, to) => api('get', token, `/party?company_id=${company.id}&ledger_guid=${guid}&from=${from}&to=${to}`);
const attentionOf = async (guid) => (await api('get', viewer.token, '/parties')).body.attention
  .find((a) => a.party.guid === guid && a.party.company_id === company.id);

beforeAll(async () => {
  [admin, accountant, viewer] = await Promise.all([signIn('admin'), signIn('accountant'), signIn('viewer')]);
  agent = await newAgent('Ledgers suite PC');
  [company] = await enabledCompanies(agent, admin, [tallyCompany({ state: 'Maharashtra' })]);
  const run = await startRun(agent, company.id, 'backfill');
  await agentPost(agent.token, `/runs/${run}/masters`, {
    groups: [{ guid: 'LGG1', name: 'Sundry Debtors', parent: '', reserved: 'Sundry Debtors', alterId: 1 }],
    ledgers: LEDGERS(),
    stockItems: [],
    voucherTypes: [],
  });
  const vouchers = [
    // August: your example.
    simple('s1', 'Sales', '201/LG/26-27', '2026-08-03', 100000),
    simple('cn1', 'Credit Note', '901', '2026-08-20', -20000, { narration: 'FKIDN51803946 dT 20/7/2026', reference: '201/LG/26-27' }),
    simple('cn2', 'Credit Note', '902', '2026-08-21', -30000, { narration: 'FOR THE MONTH OF JULY 2026' }),
    vch('j1', 'Journal', 'J1', '2026-08-25', [[Z1, 10], [TDS, -10]]),
    vch('j2', 'Journal', 'J2', '2026-08-26', [[Z1, -200], ['LG Discount Given', 200]]),
    // One receipt for two warehouses: each counts its own line.
    vch('r1', 'Receipt', 'R1', '2026-08-28', [[Z1, 500], [M1, 300], ['LG BANK', -800]]),
    // Neither counts: an order doesn't post, and a cancelled voucher is gone.
    simple('so', 'Sales Order', 'SO1', '2026-08-05', 999900),
    simple('x1', 'Sales', '299/LG/26-27', '2026-08-06', 999900, { cancelled: true }),
    // Later credit notes: DNs by their narration, our CNs, a DN booked twice.
    simple('cn3', 'Credit Note', '903', '2026-10-17', -15000, { narration: 'FKIDN52103453' }),
    simple('cn4', 'Credit Note', '904', '2026-09-30', -12000, { narration: 'RTDN00019933 10/09/2026' }),
    simple('cn5', 'Credit Note', '905', '2026-09-29', -7000, { narration: 'RTDN00019763' }),
    simple('cn6', 'Credit Note', '906', '2026-09-15', -4000),
    simple('cn7', 'Credit Note', '907', '2026-10-01', -5000, { narration: 'D499900DN2631041' }),
    simple('cn8', 'Credit Note', '908', '2026-10-03', -5000, { narration: 'D499900DN2631041 again' }),
    simple('cn9', 'Credit Note', '909', '2026-09-20', -2500, { narration: 'RETURN BILL NO- 201/LG/26-27' }),
    simple('b1', 'Sales', '301/LG/26-27', '2026-08-04', 50000, { ledger: B1 }),
  ];
  await agentPost(agent.token, `/runs/${run}/vouchers`, { vouchers });
  await agentPost(agent.token, `/runs/${run}/reconcile`, { from: '2026-08-01', to: '2026-10-31', vouchers: vouchers.map((v) => ({ guid: v.guid, alterId: v.alterId })) });
  await agentPost(agent.token, `/runs/${run}/finish`, { ok: true, backfillDone: true });

  const map = (guid, sql) => db.execute({ sql, args: [company.id, guid] });
  await map('LGZ1', "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, vendor, source) VALUES (?, ?, 'vendor', 'Zepto', 'person')");
  await map('LGZ2', "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, suggested_vendor, suggested_votes) VALUES (?, ?, NULL, 'Zepto', 3)");
  await map('LGM1', "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, vendor, source) VALUES (?, ?, 'vendor', 'Minutes', 'person')");
  await map('LGB1', "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, vendor, source) VALUES (?, ?, 'vendor', 'Blinkit', 'person')");
});

afterAll(async () => {
  await db.execute('UPDATE ledger_settings SET default_opening_paise = 1000000 WHERE id = 1');
  await db.execute('DELETE FROM ledger_marketplaces');
  await db.execute("INSERT INTO ledger_marketplaces (vendor) VALUES ('Minutes'), ('Now'), ('Zepto')");
  await db.execute("UPDATE narration_settings SET types = NULL, required_from = '2026-06-08' WHERE id = 1");
});

describe('Choosing parties', () => {
  test('bill-to-bill marketplaces first, the rest coming soon; both states of each party', async () => {
    const { status, body } = await api('get', viewer.token, '/parties');
    expect(status).toBe(200);
    const byVendor = Object.fromEntries(body.marketplaces.map((m) => [m.vendor, m]));
    expect(byVendor.Zepto.bill_to_bill).toBe(true);
    expect(byVendor.Minutes.bill_to_bill).toBe(true);
    expect(byVendor.Blinkit.bill_to_bill).toBe(false);
    expect(body.marketplaces.findIndex((m) => m.vendor === 'Blinkit')).toBeGreaterThan(body.marketplaces.findIndex((m) => m.vendor === 'Zepto'));
    const mine = body.parties.filter((p) => p.company_id === company.id);
    expect(mine.map((p) => p.guid).sort()).toEqual(['LGM1', 'LGZ1', 'LGZ2']); // no Blinkit party
    expect(mine.find((p) => p.guid === 'LGZ2')).toMatchObject({
      tally_state: 'Maharashtra', gst_state: 'Karnataka', state: 'Karnataka', state_differs: true, suggested: true,
    });
    expect(mine.find((p) => p.guid === 'LGZ1')).toMatchObject({ state: 'Maharashtra', state_differs: false });
    expect(body.attention.find((a) => a.party.guid === 'LGZ2' && a.party.company_id === company.id)).toMatchObject({ state_differs: true });
    expect(body).toMatchObject({ sync_from: '2026-06-08', today: expect.any(String), month_start: expect.any(String) });
  });
});

describe('The statement', () => {
  test('your example: opening 100, then +10 −2 −3 −0.1 +2 −5 makes 101.9', async () => {
    const { status, body } = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`);
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    const [row] = body.rows;
    expect(row.start).toMatchObject({ source: 'placeholder', paise: 1000000 });
    expect(row.opening_paise).toBe(1000000);
    expect(row.columns).toEqual({
      invoice: 100000, dn: -20000, cn: -30000, tds: -1000, journal: 20000, receipt: -50000,
    });
    expect(row.closing_paise).toBe(1019000);
    expect(row.narration_missing).toBe(4); // the invoice, both journals, the receipt
    expect(row.checks).toEqual({ dn: { booked_twice: 0 }, cn: { booked_twice: 0 } });
    // Every Tally row should carry its document, and none has a file yet.
    expect(row.rows_without_file).toBe(6);
    expect(body.totals).toMatchObject({
      opening_paise: 1000000, closing_paise: 1019000, placeholders: 1, rows_without_file: 6,
    });
    expect(body.settings).toBeUndefined();
  });

  test('each range closes on the next one’s opening', async () => {
    const aug = (await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`)).body.rows[0];
    const sep = (await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-09-01&to=2026-09-30`)).body.rows[0];
    expect(sep.opening_paise).toBe(aug.closing_paise);
  });

  test('the filters: a state matches either reading; coming soon and half-chosen filters are refused', async () => {
    const statesOf = async (states) => (await statementOf(viewer.token, `company_id=${company.id}&vendor=Zepto&states=${states}&parties=all&from=2026-08-01&to=2026-08-31`))
      .body.rows.map((r) => r.party.guid).sort();
    expect(await statesOf('Karnataka')).toEqual(['LGZ2']);
    expect(await statesOf('Maharashtra')).toEqual(['LGZ1', 'LGZ2']);
    expect(await statesOf('all')).toEqual(['LGZ1', 'LGZ2']);
    const all = await statementOf(viewer.token, 'company_id=all&vendor=all&states=all&parties=all&from=2026-08-01&to=2026-08-31');
    expect(all.body.rows.filter((r) => r.party.company_id === company.id).map((r) => r.party.guid).sort()).toEqual(['LGM1', 'LGZ1', 'LGZ2']);
    expect(all.body.rows.find((r) => r.party.guid === 'LGM1' && r.party.company_id === company.id).columns.receipt).toBe(-30000);

    const refused = async (query, message) => {
      const res = await statementOf(viewer.token, query);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
    };
    await refused(`company_id=${company.id}&vendor=Blinkit&states=all&parties=all`, /coming soon/);
    await refused(`company_id=${company.id}&vendor=Zepto&states=all`, /Choose a company, a marketplace, states and parties/);
    await refused(`${pick('LGZ1')}&from=2026-09-01&to=2026-08-01`, /on or before To/);
    await refused(`${pick('LGZ1')}&from=2026-05-01&to=2026-08-01`, /before 2026-06-08/);
    await refused(`${pick('LGZ1')}&from=2026-08-01&to=2099-01-01`, /future/);
  });
});

describe('Debit and credit notes come from Tally', () => {
  test('a credit note naming a marketplace DN is in the DN column, any other in CN', async () => {
    const { status, body } = await partyOf(viewer.token, 'LGZ1', '2026-06-08', '2026-10-31');
    expect(status).toBe(200);
    const row = (number) => body.vouchers.find((v) => v.number === number);
    expect(row('901')).toMatchObject({ column: 'dn', note: { status: null, named: ['FKIDN51803946'], also_on: null } });
    expect(row('904')).toMatchObject({ column: 'dn', note: { named: ['RTDN00019933'] } });
    expect(row('902')).toMatchObject({ column: 'cn', note: { named: [] } }); // a monthly discount
    expect(row('906').column).toBe('cn'); // no narration
    expect(row('909').column).toBe('cn'); // a return
    expect(row('201/LG/26-27')).toMatchObject({ column: 'invoice', note: null, files: [] });
    // Nothing typed here any more.
    expect(body.entries).toBeUndefined();
    expect(body.started_on).toBeUndefined();
  });

  test('a DN on two credit notes marks the later one booked twice, counted in its column', async () => {
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-06-08', '2026-10-31');
    const note = (number) => body.vouchers.find((v) => v.number === number).note;
    expect(note('908')).toMatchObject({ status: 'booked_twice', also_on: { number: '907', date: '2026-10-01' } });
    expect(note('907').status).toBeNull();
    const sepOct = (await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-09-01&to=2026-10-31`)).body.rows[0];
    expect(sepOct.checks).toEqual({ dn: { booked_twice: 1 }, cn: { booked_twice: 0 } });
  });

  test('Tally’s vouchers run from the opening to the closing, each with its narration', async () => {
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-08-01', '2026-08-31');
    expect(body.vouchers.map((v) => v.number)).toEqual(['201/LG/26-27', '901', '902', 'J1', 'J2', 'R1']);
    expect(body.vouchers[body.vouchers.length - 1].balance_paise).toBe(body.closing_paise);
    expect(body.closing_paise).toBe(1019000);
    expect(body.vouchers[0]).toMatchObject({ narration: null, narration_missing: true, column: 'invoice' });
    expect(body.vouchers[1]).toMatchObject({ narration: 'FKIDN51803946 dT 20/7/2026', narration_missing: false });
    expect(body.vouchers.find((v) => v.number === 'J1').column).toBe('tds');
    expect(body.rows_without_file).toBe(6);
  });

  test('typing a debit or credit note is gone', async () => {
    const body = {
      company_id: company.id, ledger_guid: 'LGZ1', kind: 'debit_note', number: 'FKIDN51803946', date: '2026-08-10', amount_paise: 100,
    };
    expect((await api('post', accountant.token, '/entries').send(body)).status).toBe(404);
    expect((await api('put', accountant.token, '/entries/1').send({ amount_paise: 200 })).status).toBe(404);
    expect((await api('delete', accountant.token, '/entries/1')).status).toBe(404);
  });
});

describe('Needs attention', () => {
  test('every Tally row since the copy starts without its file, and DNs booked twice, since the oldest', async () => {
    const z1 = await attentionOf('LGZ1');
    // 13 rows on the party (the order and the cancelled invoice don't count).
    expect(z1).toMatchObject({ counts: { booked_twice: 1, no_file: 13 }, since: '2026-08-03', state_differs: false });
    expect(await attentionOf('LGM1')).toMatchObject({ counts: { booked_twice: 0, no_file: 1 }, since: '2026-08-28' });
  });

  test('a file on a row takes it off the counts', async () => {
    const pdf = Buffer.from(`%PDF-1.4\n${'1 0 obj << /Type /Page >> endobj\n'.repeat(20)}%%EOF\n`);
    const added = await bearer(request(app).post(`/api/files?company_id=${company.id}&voucher_guid=lg-s1&name=invoice.pdf`), accountant.token)
      .set('Content-Type', 'application/octet-stream').send(pdf);
    expect(added.status).toBe(201);
    const row = (await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`)).body.rows[0];
    expect(row.rows_without_file).toBe(5);
    const z1 = await attentionOf('LGZ1');
    expect(z1).toMatchObject({ counts: { booked_twice: 1, no_file: 12 }, since: '2026-08-20' });
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-08-01', '2026-08-31');
    expect(body.vouchers[0].files).toEqual([expect.objectContaining({ name: 'invoice.pdf', kind: 'pdf' })]);
  });
});

describe('The narration check', () => {
  test('which records need a narration is a setting; changing it is audited', async () => {
    const get = await bearer(request(app).get('/api/settings/narration'), viewer.token);
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({ types: null, required_from: '2026-06-08' });
    expect(get.body.base_types.find((t) => t.base_type === 'Sales')).toMatchObject({ required: true });

    const put = (token, body) => bearer(request(app).put('/api/settings/narration'), token).send(body);
    expect((await put(accountant.token, { types: ['Receipt'] })).status).toBe(403);
    expect((await put(admin.token, { types: ['Nonsense'] })).status).toBe(400);
    expect((await put(admin.token, { types: [] })).status).toBe(400);
    const res = await put(admin.token, { types: ['Receipt'] });
    expect(res.status).toBe(200);
    expect(res.body.types).toEqual(['Receipt']);
    const { rows: [log] } = await db.execute("SELECT changes FROM audit_logs WHERE action_type = 'NARRATION_SETTINGS_UPDATE' ORDER BY id DESC LIMIT 1");
    expect(JSON.parse(log.changes)).toEqual([{ field: 'types', old: 'every type', new: 'Receipt' }]);

    let { body } = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`);
    expect(body.rows[0].narration_missing).toBe(1); // only the receipt now
    await put(admin.token, { types: null, required_from: '2026-08-27' });
    ({ body } = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`));
    expect(body.rows[0].narration_missing).toBe(1); // only the receipt is on or after 27 Aug
    await put(admin.token, { types: null, required_from: '2026-06-08' });
  });
});

describe('Settings', () => {
  test('who may: anyone who sees Ledgers reads them, ledgers.settings changes them', async () => {
    expect((await api('get', viewer.token, '/settings')).status).toBe(200);
    expect((await api('put', accountant.token, '/settings').send({ default_opening_paise: 500000 })).status).toBe(403);
  });

  test('Admin changes the marketplaces and the placeholder opening (audited); the typed notes’ settings are gone', async () => {
    const put = (body) => api('put', admin.token, '/settings').send(body);
    let res = await put({ default_opening_paise: 500000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ default_opening_paise: 500000, marketplaces: ['Minutes', 'Now', 'Zepto'] });
    expect(res.body).not.toHaveProperty('grace_days');
    expect(res.body).not.toHaveProperty('match_window_days');
    expect(res.body).not.toHaveProperty('amount_tolerance_paise');
    expect(res.body.known_marketplaces).toEqual(expect.arrayContaining(['Blinkit', 'Minutes', 'Zepto']));
    for (const gone of [{ grace_days: 5 }, { match_window_days: 30 }, { amount_tolerance_paise: 100 }]) {
      const refused = await put(gone);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toMatch(/Unknown setting/);
    }
    expect((await put({ default_opening_paise: 1.5 })).status).toBe(400);
    expect((await put({ marketplaces: ['Nobody'] })).status).toBe(400);

    res = await put({ marketplaces: ['Blinkit', 'Minutes', 'Now', 'Zepto'] });
    expect(res.body.marketplaces).toEqual(['Blinkit', 'Minutes', 'Now', 'Zepto']);
    const parties = await api('get', viewer.token, '/parties');
    expect(parties.body.parties.some((p) => p.guid === 'LGB1' && p.company_id === company.id)).toBe(true);
    const { rows: [log] } = await db.execute("SELECT changes FROM audit_logs WHERE action_type = 'LEDGER_SETTINGS_UPDATE' ORDER BY id DESC LIMIT 1");
    expect(JSON.parse(log.changes)).toEqual([{ field: 'marketplaces', old: 'Minutes, Now, Zepto', new: 'Blinkit, Minutes, Now, Zepto' }]);
    await put({ default_opening_paise: 1000000, marketplaces: ['Minutes', 'Now', 'Zepto'] });
  });
});

describe('Openings and Tally’s readings', () => {
  test('Tally’s balance from the latest good sync wins over the placeholder', async () => {
    const run = await startRun(agent, company.id, 'light');
    // ₹9,000 owed at 31 Mar (a debit, so negative in Tally). The start is that
    // less every voucher RAMS holds for the party.
    await agentPost(agent.token, `/runs/${run}/balances`, { asOf: '2027-03-31', ledgers: [{ guid: 'LGZ1', closing: -9000 }] });
    await agentPost(agent.token, `/runs/${run}/finish`, { ok: true });
    const { body } = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-08-01&to=2026-08-31`);
    const [row] = body.rows;
    expect(row.start).toMatchObject({ source: 'tally', as_of: '2027-03-31' });
    // Everything the party owes by 31 Mar is ₹9,000, whatever the start.
    const all = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-06-08&to=2026-10-31`);
    expect(all.body.rows[0].closing_paise).toBe(900000);
    expect(row.columns.invoice).toBe(100000); // the movement is still Tally's
  });

  test('a better reading of a ledger’s state is stored though Tally’s AlterID hasn’t moved', async () => {
    const run = await startRun(agent, company.id, 'light');
    const push = (body) => agentPost(agent.token, `/runs/${run}/masters`, { ledgers: LEDGERS('Karnataka'), ...body });
    const stateOf = async () => (await db.execute({ sql: "SELECT state FROM tally_ledgers WHERE company_id = ? AND guid = 'LGZ2'", args: [company.id] })).rows[0].state;
    // An older Connector's reading is ignored...
    expect((await push({})).body).toMatchObject({ unchanged: 8, upserted: 0, deleted: 0 });
    expect(await stateOf()).toBe('Maharashtra');
    // ...0.7.0's corrects it.
    expect((await push({ ledgerReading: 2 })).body).toMatchObject({ upserted: 1, unchanged: 7 });
    expect(await stateOf()).toBe('Karnataka');
    expect((await push({ ledgerReading: 2 })).body).toMatchObject({ unchanged: 8 });
    await agentPost(agent.token, `/runs/${run}/finish`, { ok: true });
    const parties = await api('get', viewer.token, '/parties');
    expect(parties.body.parties.find((p) => p.guid === 'LGZ2' && p.company_id === company.id).state_differs).toBe(false);
  });
});

describe('DN numbers and columns', () => {
  const cn = (id, date, narration = null) => ({
    id, date, number: String(id), reference: null, narration, effect_paise: -100,
  });

  test('a marketplace DN number in a narration, whatever else is there', () => {
    expect(dnNumbersIn('RTDN00019933 10/09/2026 and FKIDN51463346')).toEqual(['RTDN00019933', 'FKIDN51463346']);
    expect(dnNumbersIn('CAD-DN734673 Vandana')).toEqual(['DN734673']);
    expect(dnNumbersIn('D28838DN26001385 Dt :27/04/2026')).toEqual(['D28838DN26001385']);
    expect(dnNumbersIn('395/RM/26-27_QD')).toEqual([]);
    expect(dnNumbersIn('FOR THE MONTH OF JUNE 2026')).toEqual([]);
    expect(dnNumbersIn(null)).toEqual([]);
  });

  test('columns: by base type, TDS journals apart', () => {
    expect(columnOf({ base_type: 'Sales' })).toBe('invoice');
    expect(columnOf({ base_type: 'Receipt' })).toBe('receipt');
    expect(columnOf({ base_type: 'Journal', tds: true })).toBe('tds');
    expect(columnOf({ base_type: 'Journal', tds: false })).toBe('journal');
    expect(columnOf({ base_type: 'Debit Note' })).toBe('journal');
    expect(columnOf({ base_type: 'Payment' })).toBe('journal');
  });

  test('a credit note naming a DN is a DN; one naming it again, later, is booked twice', () => {
    const notes = [
      cn(1, '2026-09-20', 'FKIDN11111111 & FKIDN22222222'),
      cn(2, '2026-09-25', 'FKIDN33333333 again'),
      cn(3, '2026-09-21', 'FKIDN33333333'),
      cn(4, '2026-09-26', 'RETURN BILL NO- 935/RM/26-27'),
      cn(5, '2026-09-27'),
    ];
    const p = notesOf(notes);
    expect(p.get(1)).toEqual({
      status: null, column: 'dn', named: ['FKIDN11111111', 'FKIDN22222222'], also_on: null,
    });
    // The earlier of the two is the first booking, whatever the ids.
    expect(p.get(3)).toMatchObject({ status: null, column: 'dn' });
    expect(p.get(2)).toMatchObject({ status: 'booked_twice', column: 'dn', also_on: expect.objectContaining({ id: 3 }) });
    expect(p.get(4)).toEqual({
      status: null, column: 'cn', named: [], also_on: null,
    });
    expect(p.get(5).column).toBe('cn');
  });
});
