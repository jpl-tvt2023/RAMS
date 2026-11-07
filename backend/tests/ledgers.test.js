const request = require('supertest');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const {
  newAgent, agentPost, tallyCompany, voucher, enabledCompanies, startRun,
} = require('./helpers/agent');
const {
  sameNumber, findsNumber, dnNumbersIn, columnOf, pairNotes,
} = require('../src/ledgers/ledger');

// Ledgers v2 end to end: a Zepto party's Tally vouchers pushed by a Connector,
// the debit and credit notes typed in RAMS, and the bill-to-bill statement RAMS
// works out from both. Every request names this suite's company, so other
// suites' data never mixes in. Its August is your example row (opening 100,
// invoice 10, DN 2, CN 3, TDS 0.1, journal 2, receipt 5, closing 101.9) in
// hundreds of rupees.
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
const entry = (token, body) => api('post', token, '/entries').send({ company_id: company.id, ledger_guid: 'LGZ1', ...body });
const ids = {};

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
    // Later notes, for the check.
    simple('cn3', 'Credit Note', '903', '2026-10-17', -15000, { narration: 'FKIDN52103453' }),
    simple('cn4', 'Credit Note', '904', '2026-09-30', -12000, { narration: 'RTDN00019933 10/09/2026' }),
    simple('cn5', 'Credit Note', '905', '2026-09-29', -7000, { narration: 'RTDN00019763' }),
    simple('cn6', 'Credit Note', '906', '2026-09-15', -4000),
    simple('cn7', 'Credit Note', '907', '2026-10-01', -5000, { narration: 'D499900DN2631041' }),
    simple('cn8', 'Credit Note', '908', '2026-10-03', -5000, { narration: 'D499900DN2631041 again' }),
    simple('cn9', 'Credit Note', '909', '2026-09-20', -2500, { narration: 'shortage' }),
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
  await db.execute('UPDATE ledger_settings SET grace_days = 2, match_window_days = 60, amount_tolerance_paise = 100, default_opening_paise = 1000000 WHERE id = 1');
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
    expect(body.totals).toMatchObject({ opening_paise: 1000000, closing_paise: 1019000, placeholders: 1 });
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

describe('Debit and credit notes typed here', () => {
  test('an Accountant adds them; each is audited', async () => {
    const add = async (key, body) => {
      const res = await entry(accountant.token, body);
      expect(res.status).toBe(201);
      ids[key] = res.body.id;
    };
    await add('e1', { kind: 'debit_note', number: 'FKIDN51803946', date: '2026-07-20', amount_paise: 20000 }); // booked 31 days later
    await add('e2', { kind: 'credit_note', number: '902', date: '2026-08-21', amount_paise: 30000 });
    await add('e3', { kind: 'debit_note', number: 'fkidn 52103453', date: '2026-09-01', amount_paise: 15000 }); // booked 46 days later
    await add('e4', { kind: 'debit_note', number: 'RTDN00019933', date: '2026-09-02', amount_paise: 10000 }); // Tally has ₹120
    await add('e5', { kind: 'debit_note', number: 'RTDN0001976', date: '2026-09-03', amount_paise: 7000 }); // a typo
    await add('e6', { kind: 'debit_note', number: 'ZPDN123456', date: '2026-09-10', amount_paise: 4000, reference: '201/LG/26-27' }); // by amount only
    await add('e7', { kind: 'debit_note', number: 'D28838DN26001385', date: '2026-04-27', amount_paise: 9000 }); // older than RAMS's copy
    const { rows } = await db.execute({ sql: "SELECT COUNT(*) AS n FROM audit_logs WHERE action_type = 'LEDGER_ENTRY_CREATE' AND entity_ref = ?", args: [Z1] });
    expect(Number(rows[0].n)).toBe(7);
  });

  test('what is refused, and why', async () => {
    const bad = async (body, status, message) => {
      const res = await entry(accountant.token, { date: '2026-09-05', ...body });
      expect(res.status).toBe(status);
      expect(res.body.message).toMatch(message);
    };
    await bad({ kind: 'invoice', number: '7', amount_paise: 100 }, 400, /Invoices and receipts come from Tally/);
    await bad({ kind: 'debit_note', number: 'DN123', amount_paise: 100 }, 400, /at least 6 letters and digits/);
    await bad({ kind: 'credit_note', amount_paise: 100 }, 400, /credit note number/);
    await bad({ kind: 'credit_note', number: '7', amount_paise: 0 }, 400, /more than ₹0/);
    await bad({ kind: 'credit_note', number: '7', amount_paise: 100, date: '2025-06-07' }, 400, /before 2025-06-08/);
    await bad({ kind: 'credit_note', number: '7', amount_paise: 100, date: '2099-01-01' }, 400, /future/);
    await bad({ kind: 'debit_note', number: 'DN26001385', amount_paise: 100 }, 409, /D28838DN26001385 is already entered/);
    await bad({ kind: 'credit_note', number: '0902', amount_paise: 100 }, 409, /902 is already entered/);
    await bad({ kind: 'credit_note', number: '7', amount_paise: 100, ledger_guid: 'LGB1' }, 400, /coming soon/);
    await bad({ kind: 'credit_note', number: '7', amount_paise: 100, ledger_guid: 'nope' }, 400, /Choose a party/);
  });

  test('a Viewer can see but not record; the settings need ledgers.settings', async () => {
    expect((await partyOf(viewer.token, 'LGZ1', '2026-08-01', '2026-08-31')).status).toBe(200);
    expect((await entry(viewer.token, { kind: 'credit_note', number: '1', amount_paise: 100, date: '2026-09-05' })).status).toBe(403);
    expect((await api('put', accountant.token, '/settings').send({ grace_days: 5 })).status).toBe(403);
    expect((await api('get', viewer.token, '/settings')).status).toBe(200);
  });
});

describe('The check', () => {
  test('each typed note against Tally’s credit notes, and Tally’s against them', async () => {
    const { status, body } = await partyOf(viewer.token, 'LGZ1', '2026-06-08', '2026-10-31');
    expect(status).toBe(200);
    const byId = Object.fromEntries(body.entries.map((e) => [e.id, e]));
    expect(byId[ids.e1]).toMatchObject({ status: 'in_tally', by: 'number', tally: { number: '901', date: '2026-08-20' } });
    expect(byId[ids.e2]).toMatchObject({ status: 'in_tally', tally: { number: '902' } });
    expect(byId[ids.e3]).toMatchObject({ status: 'in_tally', tally: { number: '903', date: '2026-10-17' } });
    expect(byId[ids.e4]).toMatchObject({ status: 'amount_differs', tally: { number: '904', amount_paise: 12000 } });
    expect(byId[ids.e5].tally).toBeNull(); // RTDN0001976 doesn't find RTDN00019763
    expect(byId[ids.e6]).toMatchObject({ status: 'by_amount', by: 'amount', tally: { number: '906' } });
    expect(body.entries.map((e) => e.id)).not.toContain(ids.e7); // dated before the range

    const note = (number) => body.vouchers.find((v) => v.number === number).note;
    expect(note('901')).toMatchObject({ status: 'entered', entries: [expect.objectContaining({ id: ids.e1, kind: 'debit_note' })] });
    expect(note('904').status).toBe('amount_differs');
    expect(note('906').status).toBe('by_amount');
    expect(note('908')).toMatchObject({ status: 'booked_twice', also_on: { number: '907' } });
    expect(note('909').status).toBe('not_entered');
    const column = (number) => body.vouchers.find((v) => v.number === number).column;
    expect(column('901')).toBe('dn'); // names a DN, and a DN is paired
    expect(column('902')).toBe('cn');
    expect(column('906')).toBe('dn'); // paired with a DN by amount
    expect(column('909')).toBe('cn');
    expect(body.started_on).toBe('2026-07-20');
  });

  test('Tally’s vouchers run from the opening to the closing, each with its narration', async () => {
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-08-01', '2026-08-31');
    expect(body.vouchers.map((v) => v.number)).toEqual(['201/LG/26-27', '901', '902', 'J1', 'J2', 'R1']);
    expect(body.vouchers[body.vouchers.length - 1].balance_paise).toBe(body.closing_paise);
    expect(body.closing_paise).toBe(1019000);
    expect(body.vouchers[0]).toMatchObject({ narration: null, narration_missing: true, column: 'invoice' });
    expect(body.vouchers[1]).toMatchObject({ narration: 'FKIDN51803946 dT 20/7/2026', narration_missing: false });
    expect(body.vouchers.find((v) => v.number === 'J1').column).toBe('tds');
  });

  test('the statement counts each problem once, in the column it belongs to', async () => {
    const { body } = await statementOf(viewer.token, `${pick('LGZ1')}&from=2026-09-01&to=2026-10-31`);
    const { checks } = body.rows[0];
    expect(checks.dn).toMatchObject({ amount_differs: 1, by_amount: 1, booked_twice: 1 });
    expect(checks.dn.missing + checks.dn.waiting).toBe(1); // e5, by today's date
    expect(checks.cn.not_entered).toBe(1); // 909
  });
});

describe('Changing and removing notes', () => {
  test('a corrected amount pairs; the change is audited with its fields', async () => {
    const res = await api('put', accountant.token, `/entries/${ids.e4}`).send({ amount_paise: 12000 });
    expect(res.body).toEqual({ id: ids.e4, changed: true });
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-09-01', '2026-09-30');
    expect(body.entries.find((e) => e.id === ids.e4)).toMatchObject({ status: 'in_tally', updated_by_name: expect.any(String) });
    const { rows: [log] } = await db.execute({ sql: "SELECT changes FROM audit_logs WHERE action_type = 'LEDGER_ENTRY_UPDATE' AND entity_id = ?", args: [ids.e4] });
    expect(JSON.parse(log.changes)).toEqual([{ field: 'amount_paise', old: 10000, new: 12000 }]);
    expect((await api('put', accountant.token, `/entries/${ids.e4}`).send({ amount_paise: 12000 })).body.changed).toBe(false);
    expect((await api('put', accountant.token, `/entries/${ids.e4}`).send({ party: 'x' })).status).toBe(400);
  });

  test('a removed note leaves the check; the row stays for the audit trail', async () => {
    expect((await api('delete', accountant.token, `/entries/${ids.e5}`)).status).toBe(200);
    const { body } = await partyOf(viewer.token, 'LGZ1', '2026-09-01', '2026-09-30');
    expect(body.entries.map((e) => e.id)).not.toContain(ids.e5);
    const { rows: [row] } = await db.execute({ sql: 'SELECT deleted_at FROM ledger_entries WHERE id = ?', args: [ids.e5] });
    expect(row.deleted_at).not.toBeNull();
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
  test('Admin changes them, marketplaces too (audited); out-of-range values are refused', async () => {
    const put = (body) => api('put', admin.token, '/settings').send(body);
    let res = await put({ grace_days: 31, match_window_days: 45 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ grace_days: 31, match_window_days: 45, marketplaces: ['Minutes', 'Now', 'Zepto'] });
    expect(res.body.known_marketplaces).toEqual(expect.arrayContaining(['Blinkit', 'Minutes', 'Zepto']));
    expect((await put({ grace_days: 91 })).status).toBe(400);
    expect((await put({ match_window_days: 0 })).status).toBe(400);
    expect((await put({ marketplaces: ['Nobody'] })).status).toBe(400);

    res = await put({ marketplaces: ['Blinkit', 'Minutes', 'Now', 'Zepto'] });
    expect(res.body.marketplaces).toEqual(['Blinkit', 'Minutes', 'Now', 'Zepto']);
    const parties = await api('get', viewer.token, '/parties');
    expect(parties.body.parties.some((p) => p.guid === 'LGB1' && p.company_id === company.id)).toBe(true);
    const { rows: [log] } = await db.execute("SELECT changes FROM audit_logs WHERE action_type = 'LEDGER_SETTINGS_UPDATE' ORDER BY id DESC LIMIT 1");
    expect(JSON.parse(log.changes)).toEqual([{ field: 'marketplaces', old: 'Minutes, Now, Zepto', new: 'Blinkit, Minutes, Now, Zepto' }]);
    await put({
      grace_days: 2, match_window_days: 60, marketplaces: ['Minutes', 'Now', 'Zepto'],
    });
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

describe('The check itself', () => {
  const settings = {
    grace_days: 2, match_window_days: 60, amount_tolerance_paise: 100, default_opening_paise: 0,
  };
  const today = '2026-11-07';
  const cn = (id, date, effect, extra = {}) => ({
    id, date, number: String(id), reference: null, narration: null, effect_paise: -effect, ...extra,
  });
  const dn = (id, date, number, amount, extra = {}) => ({
    id, date, kind: 'debit_note', number, reference: null, amount_paise: amount, ...extra,
  });

  test('finding a DN number: spacing and case don’t matter, a longer run of digits does', () => {
    expect(findsNumber('fkidn 51803946', 'FKIDN51803946 dT 20/7/2026')).toBe(true);
    expect(findsNumber('RTDN00019933', 'RTDN00019933 10/09/2026')).toBe(true);
    expect(findsNumber('RTDN0001993', 'RTDN00019933 10/09/2026')).toBe(false);
    expect(findsNumber('DN26001385', 'D28838DN26001385 Dt :27/04/2026')).toBe(true);
    expect(findsNumber('2026', 'FOR THE MONTH OF JUNE 2026')).toBe(false); // too short
    expect(dnNumbersIn('RTDN00019933 10/09/2026 and FKIDN51463346')).toEqual(['RTDN00019933', 'FKIDN51463346']);
    expect(dnNumbersIn('CAD-DN734673 Vandana')).toEqual(['DN734673']);
    expect(dnNumbersIn('395/RM/26-27_QD')).toEqual([]);
  });

  test('columns: by base type, TDS journals apart', () => {
    expect(columnOf({ base_type: 'Sales' })).toBe('invoice');
    expect(columnOf({ base_type: 'Receipt' })).toBe('receipt');
    expect(columnOf({ base_type: 'Journal', tds: true })).toBe('tds');
    expect(columnOf({ base_type: 'Journal', tds: false })).toBe('journal');
    expect(columnOf({ base_type: 'Debit Note' })).toBe('journal');
    expect(columnOf({ base_type: 'Payment' })).toBe('journal');
  });

  test('a DN waits for Tally across the booking window, then is missing; a credit note waits days to type it', () => {
    const notes = [cn(1, '2026-11-06', 500), cn(2, '2026-10-01', 500)];
    const entries = [dn(10, '2026-10-01', 'ZZDN111111', 300), dn(11, '2026-08-01', 'ZZDN222222', 300)];
    const p = pairNotes({
      entries, notes, settings, today,
    });
    expect(p.entries.get(10).status).toBe('waiting'); // 37 days
    expect(p.entries.get(11).status).toBe('missing'); // 98 days
    expect(p.notes.get(1).status).toBe('waiting'); // 1 day
    expect(p.notes.get(2).status).toBe('not_entered');
  });

  test('by amount: forward only, within the window, never a credit note naming a DN', () => {
    const notes = [
      cn(1, '2026-09-05', 400), // before the DN
      cn(2, '2026-09-20', 400, { narration: 'RTDN00011111' }), // names a DN
      cn(3, '2026-12-30', 400), // past the window
      cn(4, '2026-10-20', 400),
    ];
    const p = pairNotes({
      entries: [dn(10, '2026-09-10', 'ZZDN333333', 400)], notes, settings, today: '2027-01-30',
    });
    expect(p.entries.get(10)).toMatchObject({ status: 'by_amount', by: 'amount', note: expect.objectContaining({ id: 4 }) });
  });

  test('our CN by Tally’s number, in the same financial year only', () => {
    const notes = [cn(1, '2027-04-05', 300, { number: '709' }), cn(2, '2026-11-01', 300, { number: '709' })];
    const p = pairNotes({
      entries: [{ id: 10, date: '2026-11-01', kind: 'credit_note', number: '709', amount_paise: 300 }], notes, settings, today,
    });
    expect(p.entries.get(10).note.id).toBe(2);
    expect(p.notes.get(1).status).not.toBe('entered');
  });

  test('one credit note for two DNs pairs with both and compares the total; a DN booked twice is flagged', () => {
    const notes = [
      cn(1, '2026-09-20', 700, { narration: 'FKIDN11111111 & FKIDN22222222' }),
      cn(2, '2026-09-21', 300, { narration: 'FKIDN33333333' }),
      cn(3, '2026-09-25', 300, { narration: 'FKIDN33333333 again' }),
    ];
    const entries = [dn(10, '2026-09-01', 'FKIDN11111111', 400), dn(11, '2026-09-01', 'FKIDN22222222', 300), dn(12, '2026-09-02', 'FKIDN33333333', 300)];
    const p = pairNotes({
      entries, notes, settings, today,
    });
    expect(p.entries.get(10).status).toBe('in_tally');
    expect(p.entries.get(11).status).toBe('in_tally');
    expect(p.notes.get(1)).toMatchObject({ status: 'entered', column: 'dn' });
    expect(p.notes.get(3)).toMatchObject({ status: 'booked_twice', also_on: expect.objectContaining({ id: 2 }) });
  });

  test('a party is checked from its first entry; one older than RAMS’s copy doesn’t widen that', () => {
    const notes = [cn(1, '2026-07-01', 500), cn(2, '2026-09-01', 500)];
    const p = pairNotes({
      entries: [dn(10, '2026-04-01', 'ZZDN444444', 100), dn(11, '2026-08-01', 'ZZDN555555', 100)], notes, settings, today,
    });
    expect(p.started_on).toBe('2026-08-01');
    expect(p.notes.get(1).status).toBe('not_checked');
    expect(p.notes.get(2).status).toBe('not_entered');
  });

  test('numbers: the serial, leading zeros, separators', () => {
    expect(sameNumber('607', '607/RM/26-27')).toBe(true);
    expect(sameNumber('0607', '607/RM/26-27')).toBe(true);
    expect(sameNumber('607/RM/26-27', '607/rm/26-27')).toBe(true);
    expect(sameNumber('608', '607/RM/26-27')).toBe(false);
    expect(sameNumber('', '607')).toBe(false);
  });
});
