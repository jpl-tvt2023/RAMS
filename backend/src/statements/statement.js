// Party Statements: the bill-to-bill statement of a party over a date range, worked out
// at read time from the Tally copy alone. Nothing derivable is stored, and
// nothing is typed in RAMS: debit and credit notes typed here were dropped on
// 2026-11-17, once a check showed RAMS holds every Tally entry on the
// bill-to-bill parties (the typed-notes table was dropped by migration 020).
//
// Balances are what the party owes (a debit balance is positive). Tally keeps
// amounts the other way round (negative is a debit), so a voucher's effect on
// the party is minus the sum of its lines on the party ledger. Only the
// party's own lines count: one receipt often credits several warehouse ledgers.
//
//   starting balance  the party's balance at the start of RAMS_SYNC_FROM: Tally's
//                     closing balance (read by the Connector at the end of each
//                     sync, as at the end of the sync window) less every
//                     mirrored voucher up to it, else a figure loaded by a
//                     script (statement_openings), else the placeholder in
//                     statement_settings (10,000 rupees)
//   opening on From   starting balance + every voucher dated before From
//   the columns       each voucher dated From-To, by what it is (columnOf, and
//                     notesOf for the credit notes)
//   closing           opening + the columns, which is Tally's closing on To
//
// A marketplace's debit note (FKIDN..., RTDN...) is booked in Tally as a Credit
// Note with the DN number in its narration: such a credit note is in the DN
// column, any other in CN. What RAMS still checks: a DN number on two credit
// notes (booked twice), a record without a narration, and a row without its
// file -- every Tally row from RAMS_SYNC_FROM should carry its document.
const { SYNC_FROM } = require('../config/env');
const { todayIst } = require('../matching/load');
const { compactKey } = require('../matching/docno');
const { isTdsJournal } = require('../books/book');
const { statesOf } = require('../utils/gstStates');
const { loadNarrationRule, narrationOf } = require('../services/narration');

// Orders, memoranda and the like don't post to a ledger in Tally.
const ACCOUNTING_TYPES = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Credit Note', 'Debit Note'];
const COLUMNS = ['invoice', 'dn', 'cn', 'tds', 'journal', 'receipt'];
// A marketplace DN number as narrations carry it: FKIDN51463346,
// RTDN00015939, D28838DN26001385.
const DN_NAMED = /\b[A-Z0-9]*DN\d{5,}\b/gi;
const CHUNK = 400;

const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const n = (v) => (v == null ? 0 : Number(v));
const marks = (k) => Array(k).fill('?').join(',');
const chunks = (list, size = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// Which marketplaces Party Statements covers and the placeholder opening. (The other
// statement_settings columns served the typed notes and are no longer read.)
async function loadSettings(client) {
  const [{ rows: [s] }, { rows: m }] = await Promise.all([
    client.execute('SELECT s.*, u.name AS updated_by_name FROM statement_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1'),
    client.execute('SELECT vendor FROM statement_marketplaces ORDER BY vendor'),
  ]);
  return {
    default_opening_paise: n(s.default_opening_paise),
    marketplaces: m.map((r) => r.vendor),
    updated_at: s.updated_at ?? null,
    updated_by_name: s.updated_by_name ?? null,
  };
}

// The marketplace DN numbers a narration names.
const dnNumbersIn = (text) => [...new Set((String(text ?? '').match(DN_NAMED) || []).map(compactKey))];

// Which column a voucher's effect goes in. Credit notes are settled by notesOf.
function columnOf(v) {
  if (v.base_type === 'Sales') return 'invoice';
  if (v.base_type === 'Receipt') return 'receipt';
  if (v.base_type === 'Credit Note') return 'cn';
  if (v.tds) return 'tds';
  return 'journal';
}

/**
 * The party's Tally credit notes ({ id, date, narration, ... }), each with
 * the marketplace DN numbers its narration names. Pure: no database.
 *
 * A credit note naming a DN is the marketplace's debit note, in the DN
 * column; any other is our credit note, in CN. A DN number on two credit
 * notes marks each later one booked twice, pointing at the first.
 *
 * Returns note id -> { status: 'booked_twice' | null, column, named, also_on }.
 */
function notesOf(notes) {
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
  const named = new Map(notes.map((v) => [v.id, dnNumbersIn(v.narration)]));
  const byNumber = new Map();
  for (const v of [...notes].sort(byDate)) {
    for (const t of named.get(v.id)) {
      if (!byNumber.has(t)) byNumber.set(t, []);
      byNumber.get(t).push(v);
    }
  }
  const alsoOn = new Map(); // note id -> the credit note the same DN is booked on first
  for (const list of byNumber.values()) {
    for (const v of list.slice(1)) if (!alsoOn.has(v.id)) alsoOn.set(v.id, list[0]);
  }
  return new Map(notes.map((v) => [v.id, {
    status: alsoOn.has(v.id) ? 'booked_twice' : null,
    column: named.get(v.id).length ? 'dn' : 'cn',
    named: named.get(v.id),
    also_on: alsoOn.get(v.id) || null,
  }]));
}

// ------------------------------------------------------------ loading

const vendorOf = (r) => (r.kind === 'vendor' ? r.vendor : (r.kind == null ? r.suggested_vendor : null));

/**
 * Every party ledger mapped (or suggested) to a marketplace, in companies
 * whose sync is on, with both readings of its state. bill_to_bill says whether
 * Party Statements covers its marketplace.
 */
async function loadParties(client, settings) {
  const rows = await rowsOf(client, `
    SELECT l.company_id, c.code, c.name AS company_name, l.guid, l.name, l.parent, l.state, l.gstin, pl.kind, pl.vendor, pl.suggested_vendor
      FROM tally_ledgers l JOIN tally_companies c ON c.id = l.company_id AND c.sync_enabled = 1
      JOIN party_ledgers pl ON pl.company_id = l.company_id AND pl.ledger_guid = l.guid
     WHERE l.deleted_at IS NULL
       AND ((pl.kind = 'vendor' AND COALESCE(pl.vendor, '') <> '') OR (pl.kind IS NULL AND pl.suggested_vendor IS NOT NULL))
     ORDER BY c.code, l.name`);
  const billToBill = new Set(settings.marketplaces);
  return rows.map((r) => {
    const vendor = vendorOf(r);
    return {
      company_id: Number(r.company_id),
      company: r.code || r.company_name,
      guid: r.guid,
      name: r.name,
      parent: r.parent,
      vendor,
      suggested: r.kind == null,
      bill_to_bill: billToBill.has(vendor),
      gstin: r.gstin || null,
      ...statesOf({ state: r.state, gstin: r.gstin }),
    };
  });
}

// When RAMS last knew it held everything the company had in Tally.
async function asOfFor(client, companyId) {
  const [r] = await rowsOf(client, `
    SELECT MAX(t) AS at FROM (
      SELECT MAX(finished_at) AS t FROM tally_sync_runs WHERE company_id = ? AND status = 'ok'
      UNION ALL SELECT last_checked_at FROM tally_sync_state WHERE company_id = ?)`, [companyId, companyId]);
  return r?.at ?? null;
}

/**
 * One company's vouchers and balances for some of its parties, in a handful
 * of queries: { vouchersOf, balanceOf, openingOf, asOf }. Vouchers are every
 * live accounting voucher on the party from RAMS_SYNC_FROM, whatever the
 * range: the opening and the booked-twice check need them all. Each says
 * whether a file is on it.
 */
async function loadCompany(client, companyId, parties) {
  const byName = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
  const guids = parties.map((p) => p.guid);
  const vrows = [];
  for (const part of chunks(parties.map((p) => p.name))) {
    vrows.push(...await rowsOf(client, `
      SELECT v.id, v.guid, v.date, v.voucher_type, v.base_type, v.number, v.reference, v.narration, l.ledger, SUM(l.amount_paise) AS amount,
             EXISTS (SELECT 1 FROM voucher_files f WHERE f.company_id = v.company_id AND f.voucher_guid = v.guid) AS has_file
        FROM tally_vch_ledger_lines l JOIN tally_vouchers v ON v.id = l.voucher_id
       WHERE v.company_id = ? AND l.ledger COLLATE NOCASE IN (${marks(part.length)})
         AND v.deleted_at IS NULL AND v.is_cancelled = 0 AND v.is_optional = 0 AND v.date >= ?
         AND v.base_type IN (${marks(ACCOUNTING_TYPES.length)})
       GROUP BY v.id, l.ledger COLLATE NOCASE
       ORDER BY v.date, v.id`, [companyId, ...part, SYNC_FROM, ...ACCOUNTING_TYPES]));
  }
  const journals = [...new Set(vrows.filter((r) => r.base_type === 'Journal').map((r) => Number(r.id)))];
  const ledgersOf = new Map();
  for (const part of chunks(journals)) {
    const lines = await rowsOf(client, `SELECT voucher_id, ledger FROM tally_vch_ledger_lines WHERE voucher_id IN (${marks(part.length)})`, part);
    for (const l of lines) {
      const k = Number(l.voucher_id);
      if (!ledgersOf.has(k)) ledgersOf.set(k, []);
      ledgersOf.get(k).push(l.ledger);
    }
  }
  const vouchersOf = new Map(guids.map((g) => [g, []]));
  for (const r of vrows) {
    const p = byName.get(String(r.ledger).toLowerCase());
    if (!p) continue;
    vouchersOf.get(p.guid).push({
      id: Number(r.id),
      guid: r.guid,
      date: r.date,
      voucher_type: r.voucher_type,
      base_type: r.base_type,
      number: r.number ?? null,
      reference: r.reference ?? null,
      narration: r.narration ?? null,
      effect_paise: -n(r.amount),
      tds: isTdsJournal(r.base_type, ledgersOf.get(Number(r.id)) || []),
      has_file: Boolean(Number(r.has_file)),
    });
  }

  const balanceOf = new Map();
  const openingOf = new Map();
  for (const part of chunks(guids)) {
    const [balances, openings] = await Promise.all([
      rowsOf(client, `SELECT ledger_guid, closing_paise, as_of, pulled_at FROM tally_ledger_balances
                       WHERE company_id = ? AND ledger_guid IN (${marks(part.length)})
                         AND run_id = (SELECT MAX(id) FROM tally_sync_runs WHERE company_id = ? AND status = 'ok')`, [companyId, ...part, companyId]),
      rowsOf(client, `SELECT ledger_guid, amount_paise, loaded_at FROM statement_openings WHERE company_id = ? AND ledger_guid IN (${marks(part.length)})`, [companyId, ...part]),
    ]);
    for (const b of balances) balanceOf.set(b.ledger_guid, b);
    for (const o of openings) openingOf.set(o.ledger_guid, o);
  }
  return {
    vouchersOf, balanceOf, openingOf, asOf: await asOfFor(client, companyId),
  };
}

/**
 * The balance at the start of RAMS_SYNC_FROM. Tally's balance comes only from
 * the company's latest run that ended ok, so it covers exactly the vouchers
 * RAMS holds. A voucher deleted in Tally since the last end-of-day check is
 * the exception -- it moves the level (not the check) until that check marks
 * it.
 */
function startOf({
  balance, opening, settings, vouchers,
}) {
  if (balance) {
    const since = vouchers.reduce((a, v) => (v.date <= balance.as_of ? a + v.effect_paise : a), 0);
    return {
      paise: -n(balance.closing_paise) - since, source: 'tally', loaded_at: balance.pulled_at, as_of: balance.as_of,
    };
  }
  if (opening) return { paise: n(opening.amount_paise), source: 'loaded', loaded_at: opening.loaded_at, as_of: null };
  return {
    paise: settings.default_opening_paise, source: 'placeholder', loaded_at: null, as_of: null,
  };
}

// The party's vouchers, each with its column, narration and (for a credit
// note) what notesOf found.
function figuresOf({ vouchers, start, rule }) {
  const notes = notesOf(vouchers.filter((v) => v.base_type === 'Credit Note'));
  const rows = vouchers.map((v) => {
    const note = notes.get(v.id) || null;
    return {
      ...v, column: note ? note.column : columnOf(v), note, ...narrationOf(rule, v),
    };
  });
  return { rows, start };
}

const inRange = (d, from, to) => d >= from && d <= to;

// The opening, the columns and the closing over From-To, and what RAMS found
// there: DNs booked twice (counted in the column the note is in), the records
// without a narration, and the rows without a file. Every row is from
// RAMS_SYNC_FROM, so every one should carry its document.
function rangeOf(figures, { from, to }) {
  const opening = figures.rows.reduce((a, v) => (v.date < from ? a + v.effect_paise : a), figures.start.paise);
  const columns = Object.fromEntries(COLUMNS.map((c) => [c, 0]));
  const checks = { dn: { booked_twice: 0 }, cn: { booked_twice: 0 } };
  let narrationMissing = 0;
  let withoutFile = 0;
  for (const v of figures.rows) {
    if (!inRange(v.date, from, to)) continue;
    columns[v.column] += v.effect_paise;
    if (v.narration_missing) narrationMissing += 1;
    if (!v.has_file) withoutFile += 1;
    if (v.note?.status === 'booked_twice') checks[v.note.column].booked_twice += 1;
  }
  const closing = opening + COLUMNS.reduce((a, c) => a + columns[c], 0);
  return {
    opening_paise: opening, columns, closing_paise: closing, checks, narration_missing: narrationMissing, rows_without_file: withoutFile,
  };
}

const startOut = (s) => ({
  paise: s.paise, source: s.source, loaded_at: s.loaded_at, as_of: s.as_of ?? null,
});

const noteBrief = (v) => (v ? {
  guid: v.guid, date: v.date, number: v.number, voucher_type: v.voucher_type, amount_paise: Math.abs(v.effect_paise),
} : null);

// Everything for one company's parties at once.
async function figuresFor(client, companyId, parties, { settings, rule }) {
  const data = await loadCompany(client, companyId, parties);
  return parties.map((party) => {
    const vouchers = data.vouchersOf.get(party.guid) || [];
    const start = startOf({
      balance: data.balanceOf.get(party.guid), opening: data.openingOf.get(party.guid), settings, vouchers,
    });
    return { party, asOf: data.asOf, figures: figuresOf({ vouchers, start, rule }) };
  });
}

const byCompany = (parties) => {
  const out = new Map();
  for (const p of parties) {
    if (!out.has(p.company_id)) out.set(p.company_id, []);
    out.get(p.company_id).push(p);
  }
  return out;
};

/**
 * GET /api/statements/statement: one row per party over From-To, and the totals.
 * `parties` come from loadParties, already filtered.
 */
async function statementOf(client, {
  parties, from, to, today = todayIst(),
}) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const rows = [];
  const asOfs = [];
  for (const [companyId, list] of byCompany(parties)) {
    const all = await figuresFor(client, companyId, list, { settings, rule });
    for (const { party, figures, asOf } of all) {
      asOfs.push(asOf);
      rows.push({ party, start: startOut(figures.start), ...rangeOf(figures, { from, to }) });
    }
  }
  rows.sort((a, b) => String(a.party.vendor).localeCompare(String(b.party.vendor))
    || String(a.party.state).localeCompare(String(b.party.state))
    || a.party.name.localeCompare(b.party.name));
  const totals = {
    opening_paise: rows.reduce((a, r) => a + r.opening_paise, 0),
    columns: Object.fromEntries(COLUMNS.map((c) => [c, rows.reduce((a, r) => a + r.columns[c], 0)])),
    closing_paise: rows.reduce((a, r) => a + r.closing_paise, 0),
    placeholders: rows.filter((r) => r.start.source === 'placeholder').length,
    narration_missing: rows.reduce((a, r) => a + r.narration_missing, 0),
    rows_without_file: rows.reduce((a, r) => a + r.rows_without_file, 0),
  };
  const known = asOfs.filter(Boolean).sort();
  return {
    from, to, today, sync_from: SYNC_FROM, as_of: known[0] || null, rows, totals,
  };
}

// GET /api/statements/party: one party over From-To -- the statement row and
// Tally's vouchers with a running balance.
async function partyDetailOf(client, {
  party, from, to, today = todayIst(),
}) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const [{ figures, asOf }] = await figuresFor(client, party.company_id, [party], { settings, rule });
  const range = rangeOf(figures, { from, to });
  let balance = range.opening_paise;
  const vouchers = figures.rows.filter((v) => inRange(v.date, from, to)).map((v) => {
    balance += v.effect_paise;
    return {
      id: v.id,
      guid: v.guid,
      date: v.date,
      voucher_type: v.voucher_type,
      base_type: v.base_type,
      column: v.column,
      number: v.number,
      reference: v.reference,
      narration: v.narration,
      narration_missing: v.narration_missing,
      amount_paise: Math.abs(v.effect_paise),
      effect_paise: v.effect_paise,
      balance_paise: balance,
      note: v.note ? {
        status: v.note.status,
        also_on: noteBrief(v.note.also_on),
        named: v.note.named,
      } : null,
    };
  });
  return {
    party,
    from,
    to,
    today,
    sync_from: SYNC_FROM,
    as_of: asOf,
    start: startOut(figures.start),
    ...range,
    vouchers,
  };
}

/**
 * Needs attention: each bill-to-bill party with something for a person -- a
 * DN booked twice, a Tally row without its file (from RAMS_SYNC_FROM), or a
 * state that differs -- with what is off and since when.
 */
async function attentionOf(client, { parties }) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const out = [];
  for (const [companyId, list] of byCompany(parties)) {
    const all = await figuresFor(client, companyId, list, { settings, rule });
    for (const { party, figures } of all) {
      const counts = { booked_twice: 0, no_file: 0 };
      let since = null;
      const seen = (date) => { if (!since || date < since) since = date; };
      for (const v of figures.rows) {
        if (v.note?.status === 'booked_twice') { counts.booked_twice += 1; seen(v.date); }
        if (!v.has_file) { counts.no_file += 1; seen(v.date); }
      }
      if (!since && !party.state_differs) continue;
      out.push({
        party, counts, since, state_differs: party.state_differs,
      });
    }
  }
  return out.sort((a, b) => String(a.since || '9').localeCompare(String(b.since || '9')) || a.party.name.localeCompare(b.party.name));
}

// One party ledger's starting balance and where it came from (the Connector's
// tests check it after a sync).
async function startingBalanceOf(client, { companyId, ledgerGuid, ledgerName }) {
  const settings = await loadSettings(client);
  const data = await loadCompany(client, companyId, [{ guid: ledgerGuid, name: ledgerName }]);
  return startOf({
    balance: data.balanceOf.get(ledgerGuid), opening: data.openingOf.get(ledgerGuid), settings, vouchers: data.vouchersOf.get(ledgerGuid) || [],
  });
}

// A range's default: the month to date.
const monthStart = (today) => `${today.slice(0, 8)}01`;

module.exports = {
  COLUMNS,
  ACCOUNTING_TYPES,
  loadSettings,
  dnNumbersIn,
  columnOf,
  notesOf,
  loadParties,
  startOf,
  startingBalanceOf,
  statementOf,
  partyDetailOf,
  attentionOf,
  monthStart,
  asOfFor,
};
