// Ledgers: the bill-to-bill statement of a party over a date range, worked out
// at read time from the Tally copy and the debit and credit notes people typed
// in RAMS (ledger_entries). Nothing derivable is stored.
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
//                     script (ledger_openings), else the placeholder in
//                     ledger_settings (10,000 rupees)
//   opening on From   starting balance + every voucher dated before From
//   the columns       each voucher dated From-To, by what it is (columnOf, and
//                     pairNotes for the credit notes)
//   closing           opening + the columns, which is Tally's closing on To
//
// The check is on the notes typed here, a marketplace's debit note (FKIDN...,
// which Tally books as a Credit Note with the DN number in its narration) and
// our own credit note -- see pairNotes. Every figure on the statement is
// Tally's. The typed notes only decide which credit notes are DNs and whether
// anything is missing or differs.
const { SYNC_FROM } = require('../config/env');
const { todayIst } = require('../matching/load');
const { normKey, compactKey, serialOf } = require('../matching/docno');
const { daysBetween, addDays, isTdsJournal } = require('../books/book');
const { statesOf } = require('../utils/gstStates');
const { loadNarrationRule, narrationOf } = require('../services/narration');

// What can be typed: the marketplace's debit note and our credit note. Both
// take the balance down.
const KINDS = ['debit_note', 'credit_note'];
const SIGN = { debit_note: -1, credit_note: -1 };
// Orders, memoranda and the like don't post to a ledger in Tally.
const ACCOUNTING_TYPES = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Credit Note', 'Debit Note'];
const COLUMNS = ['invoice', 'dn', 'cn', 'tds', 'journal', 'receipt'];
// A DN number shorter than this would find dates ("2026") in narrations.
const MIN_DN = 6;
// Nothing further apart than this pairs by number.
const PAIR_MAX_DAYS = 365;
// A marketplace DN number as narrations carry it: FKIDN51463346,
// RTDN00015939, D28838DN26001385.
const DN_NAMED = /\b[A-Z0-9]*DN\d{5,}\b/gi;
// The statuses that need a person.
const PROBLEMS = ['missing', 'not_entered', 'amount_differs', 'booked_twice'];
const COUNTED = ['missing', 'not_entered', 'amount_differs', 'booked_twice', 'by_amount', 'waiting'];
const CHUNK = 400;

const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const n = (v) => (v == null ? 0 : Number(v));
const marks = (k) => Array(k).fill('?').join(',');
const chunks = (list, size = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const blankCounts = () => Object.fromEntries(COUNTED.map((s) => [s, 0]));
// April to March.
const fyOf = (iso) => Number(iso.slice(0, 4)) - (Number(iso.slice(5, 7)) < 4 ? 1 : 0);

async function loadSettings(client) {
  const [{ rows: [s] }, { rows: m }] = await Promise.all([
    client.execute('SELECT s.*, u.name AS updated_by_name FROM ledger_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1'),
    client.execute('SELECT vendor FROM ledger_marketplaces ORDER BY vendor'),
  ]);
  return {
    grace_days: n(s.grace_days),
    amount_tolerance_paise: n(s.amount_tolerance_paise),
    default_opening_paise: n(s.default_opening_paise),
    match_window_days: n(s.match_window_days),
    marketplaces: m.map((r) => r.vendor),
    updated_at: s.updated_at ?? null,
    updated_by_name: s.updated_by_name ?? null,
  };
}

// A number typed in RAMS against Tally's: the same at any strength docno
// knows, or just the serial (607 or 0607 for 607/RM/26-27).
function sameNumber(typed, tallyNumber) {
  const t = String(typed ?? '').trim();
  const v = String(tallyNumber ?? '').trim();
  if (!t || !v) return false;
  if (normKey(t) === normKey(v)) return true;
  const c = compactKey(t);
  if (c.length >= 4 && c === compactKey(v)) return true;
  const serial = serialOf(v);
  return Boolean(serial) && /^\d+$/.test(t) && normKey(t) === normKey(serial);
}

// Whether a typed DN number appears in a text, whatever the spacing and case
// ("fkidn 51803946" finds FKIDN51803946 dT 20/7/2026), but never inside a
// longer run of digits (RTDN0001976 doesn't find RTDN00019763).
function findsNumber(typed, text) {
  const t = compactKey(typed);
  const raw = String(text ?? '');
  if (t.length < MIN_DN || !raw) return false;
  const chars = [];
  const at = [];
  for (let i = 0; i < raw.length; i += 1) {
    const c = compactKey(raw[i]);
    if (c) { chars.push(c); at.push(i); }
  }
  const s = chars.join('');
  const digit = (ch) => ch != null && /\d/.test(ch);
  for (let i = s.indexOf(t); i !== -1; i = s.indexOf(t, i + 1)) {
    const start = at[i];
    const end = at[i + t.length - 1];
    const cutsBefore = digit(raw[start]) && digit(raw[start - 1]);
    const cutsAfter = digit(raw[end]) && digit(raw[end + 1]);
    if (!cutsBefore && !cutsAfter) return true;
  }
  return false;
}

// The marketplace DN numbers a narration names.
const dnNumbersIn = (text) => [...new Set((String(text ?? '').match(DN_NAMED) || []).map(compactKey))];

// Which column a voucher's effect goes in. Credit notes are settled by pairNotes.
function columnOf(v) {
  if (v.base_type === 'Sales') return 'invoice';
  if (v.base_type === 'Receipt') return 'receipt';
  if (v.base_type === 'Credit Note') return 'cn';
  if (v.tds) return 'tds';
  return 'journal';
}

/**
 * Pairs the notes typed here with the party's Tally credit notes, over all
 * dates. Pure: no database.
 *
 * entries   the party's live debit_note / credit_note entries
 * notes     the party's Tally credit notes ({ id, date, number, reference,
 *           narration, effect_paise })
 *
 * 1. A debit note by its number, in a credit note's narration or reference.
 *    Of several, the one whose amount agrees, then whose reference is the
 *    invoice typed against, then the nearest. A credit note whose narration
 *    names several DNs pairs with each, and their total is compared.
 * 2. Our credit note by Tally's voucher number, in the same financial year.
 * 3. A debit note still unpaired, by amount: a credit note naming no DN,
 *    booked within match_window_days after the DN, the nearest first.
 * A DN named on a second credit note marks that one booked twice.
 */
function pairNotes({
  entries, notes, settings, today,
}) {
  const tol = settings.amount_tolerance_paise;
  const amountOf = (v) => Math.abs(v.effect_paise);
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;
  const named = new Map(notes.map((v) => [v.id, dnNumbersIn(v.narration)]));
  const pairsOf = new Map(); // note id -> [entry]
  const noteOf = new Map(); // entry id -> { note, by }
  const alsoOn = new Map(); // note id -> the credit note the same DN is booked on
  const claim = (e, v, by) => {
    if (!pairsOf.has(v.id)) pairsOf.set(v.id, []);
    pairsOf.get(v.id).push(e);
    noteOf.set(e.id, { note: v, by });
  };
  const score = (e, v) => [
    Math.abs(amountOf(v) - e.amount_paise) <= tol ? 0 : 1,
    e.reference && sameNumber(e.reference, v.reference) ? 0 : 1,
    Math.abs(daysBetween(e.date, v.date)),
    v.id,
  ];
  const best = (e, list) => list
    .map((v) => [score(e, v), v])
    .sort(([a], [b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])[0]?.[1];
  const near = (e, v) => Math.abs(daysBetween(e.date, v.date)) <= PAIR_MAX_DAYS;

  const dns = entries.filter((e) => e.kind === 'debit_note').sort(byDate);
  const cns = entries.filter((e) => e.kind === 'credit_note').sort(byDate);

  for (const e of dns) {
    const hits = notes.filter((v) => near(e, v) && (findsNumber(e.number, v.narration) || findsNumber(e.number, v.reference)));
    const v = best(e, hits);
    if (!v) continue;
    claim(e, v, 'number');
    for (const other of hits) if (other !== v && !alsoOn.has(other.id)) alsoOn.set(other.id, v);
  }
  for (const e of cns) {
    const hits = notes.filter((v) => !pairsOf.has(v.id) && fyOf(v.date) === fyOf(e.date) && sameNumber(e.number, v.number));
    const v = best(e, hits);
    if (v) claim(e, v, 'number');
  }
  for (const e of dns) {
    if (noteOf.has(e.id)) continue;
    const v = notes
      .filter((x) => !pairsOf.has(x.id) && !named.get(x.id).length && x.date >= e.date
        && daysBetween(e.date, x.date) <= settings.match_window_days && Math.abs(amountOf(x) - e.amount_paise) <= tol)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)[0];
    if (v) claim(e, v, 'amount');
  }

  // A DN number on two credit notes, whether or not anyone typed it.
  const byNumber = new Map();
  for (const v of [...notes].sort(byDate)) {
    for (const t of named.get(v.id)) {
      if (!byNumber.has(t)) byNumber.set(t, []);
      byNumber.get(t).push(v);
    }
  }
  for (const list of byNumber.values()) {
    if (list.length < 2) continue;
    const first = list.find((v) => pairsOf.has(v.id)) || list[0];
    for (const v of list) if (v !== first && !alsoOn.has(v.id)) alsoOn.set(v.id, first);
  }

  // A party is checked from its first entry (one dated before RAMS's copy
  // starts doesn't widen that).
  const startedOn = entries.map((e) => e.date).filter((d) => d >= SYNC_FROM).sort()[0] || null;

  const entryState = new Map();
  for (const e of entries) {
    const p = noteOf.get(e.id);
    let status;
    if (p && p.by === 'amount') status = 'by_amount';
    else if (p) {
      const total = pairsOf.get(p.note.id).reduce((a, x) => a + x.amount_paise, 0);
      status = Math.abs(total - amountOf(p.note)) <= tol ? 'in_tally' : 'amount_differs';
    } else status = daysBetween(e.date, today) <= settings.match_window_days ? 'waiting' : 'missing';
    entryState.set(e.id, { status, note: p?.note || null, by: p?.by || null });
  }

  const noteState = new Map();
  for (const v of notes) {
    const list = pairsOf.get(v.id) || [];
    const statuses = list.map((e) => entryState.get(e.id).status);
    let status;
    if (alsoOn.has(v.id)) status = 'booked_twice';
    else if (statuses.includes('amount_differs')) status = 'amount_differs';
    else if (statuses.includes('by_amount')) status = 'by_amount';
    else if (list.length) status = 'entered';
    else if (!startedOn || v.date < startedOn) status = 'not_checked';
    else status = daysBetween(v.date, today) <= settings.grace_days ? 'waiting' : 'not_entered';
    let column = named.get(v.id).length ? 'dn' : 'cn';
    if (list.length) column = list.some((e) => e.kind === 'debit_note') ? 'dn' : 'cn';
    noteState.set(v.id, {
      status, column, entries: list, also_on: alsoOn.get(v.id) || null, named: named.get(v.id),
    });
  }
  return { entries: entryState, notes: noteState, started_on: startedOn };
}

// ------------------------------------------------------------ loading

const vendorOf = (r) => (r.kind === 'vendor' ? r.vendor : (r.kind == null ? r.suggested_vendor : null));

/**
 * Every party ledger mapped (or suggested) to a marketplace, in companies
 * whose sync is on, with both readings of its state. bill_to_bill says whether
 * Ledgers covers its marketplace.
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
 * One company's vouchers, balances and entries for some of its parties, in a
 * handful of queries: { vouchersOf, entriesOf, balanceOf, openingOf, asOf }.
 * Vouchers are every live accounting voucher on the party from
 * RAMS_SYNC_FROM, whatever the range: the opening and the pairing need them
 * all.
 */
async function loadCompany(client, companyId, parties) {
  const byName = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
  const guids = parties.map((p) => p.guid);
  const vrows = [];
  for (const part of chunks(parties.map((p) => p.name))) {
    vrows.push(...await rowsOf(client, `
      SELECT v.id, v.guid, v.date, v.voucher_type, v.base_type, v.number, v.reference, v.narration, l.ledger, SUM(l.amount_paise) AS amount
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
    });
  }

  const balanceOf = new Map();
  const openingOf = new Map();
  const entriesOf = new Map(guids.map((g) => [g, []]));
  for (const part of chunks(guids)) {
    const [balances, openings, entries] = await Promise.all([
      rowsOf(client, `SELECT ledger_guid, closing_paise, as_of, pulled_at FROM tally_ledger_balances
                       WHERE company_id = ? AND ledger_guid IN (${marks(part.length)})
                         AND run_id = (SELECT MAX(id) FROM tally_sync_runs WHERE company_id = ? AND status = 'ok')`, [companyId, ...part, companyId]),
      rowsOf(client, `SELECT ledger_guid, amount_paise, loaded_at FROM ledger_openings WHERE company_id = ? AND ledger_guid IN (${marks(part.length)})`, [companyId, ...part]),
      rowsOf(client, `SELECT e.*, cu.name AS created_by_name, uu.name AS updated_by_name
                        FROM ledger_entries e LEFT JOIN users cu ON cu.id = e.created_by LEFT JOIN users uu ON uu.id = e.updated_by
                       WHERE e.company_id = ? AND e.ledger_guid IN (${marks(part.length)}) AND e.deleted_at IS NULL
                         AND e.kind IN (${marks(KINDS.length)})
                       ORDER BY e.date, e.id`, [companyId, ...part, ...KINDS]),
    ]);
    for (const b of balances) balanceOf.set(b.ledger_guid, b);
    for (const o of openings) openingOf.set(o.ledger_guid, o);
    for (const e of entries) {
      entriesOf.get(e.ledger_guid).push({
        id: Number(e.id),
        date: e.date,
        kind: e.kind,
        number: e.number ?? null,
        reference: e.reference ?? null,
        amount_paise: n(e.amount_paise),
        note: e.note ?? null,
        created_by_name: e.created_by_name ?? null,
        created_at: e.created_at ?? null,
        updated_by_name: e.updated_by_name ?? null,
        updated_at: e.updated_at ?? null,
      });
    }
  }
  return {
    vouchersOf, entriesOf, balanceOf, openingOf, asOf: await asOfFor(client, companyId),
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
// note) its pairing, plus the pairing itself.
function figuresOf({
  vouchers, entries, start, settings, rule, today,
}) {
  const notes = vouchers.filter((v) => v.base_type === 'Credit Note');
  const pairing = pairNotes({
    entries, notes, settings, today,
  });
  const rows = vouchers.map((v) => {
    const note = pairing.notes.get(v.id) || null;
    return {
      ...v, column: note ? note.column : columnOf(v), note, ...narrationOf(rule, v),
    };
  });
  return { rows, pairing, start };
}

const inRange = (d, from, to) => d >= from && d <= to;

// The opening, the columns and the closing over From-To, and what the check
// found there: DN and CN counts by status, and the records without a
// narration. A problem is counted once -- on the entry when it is in the
// range, else on its credit note.
function rangeOf(figures, entries, { from, to }) {
  const opening = figures.rows.reduce((a, v) => (v.date < from ? a + v.effect_paise : a), figures.start.paise);
  const columns = Object.fromEntries(COLUMNS.map((c) => [c, 0]));
  const checks = { dn: blankCounts(), cn: blankCounts() };
  let narrationMissing = 0;
  for (const v of figures.rows) {
    if (!inRange(v.date, from, to)) continue;
    columns[v.column] += v.effect_paise;
    if (v.narration_missing) narrationMissing += 1;
    if (!v.note) continue;
    const s = v.note.status;
    const entryHere = v.note.entries.some((e) => inRange(e.date, from, to));
    if (['booked_twice', 'not_entered', 'waiting'].includes(s) || (!entryHere && ['amount_differs', 'by_amount'].includes(s))) {
      checks[v.note.column][s] += 1;
    }
  }
  for (const e of entries) {
    if (!inRange(e.date, from, to)) continue;
    const s = figures.pairing.entries.get(e.id).status;
    if (s !== 'in_tally') checks[e.kind === 'debit_note' ? 'dn' : 'cn'][s] += 1;
  }
  const closing = opening + COLUMNS.reduce((a, c) => a + columns[c], 0);
  return {
    opening_paise: opening, columns, closing_paise: closing, checks, narration_missing: narrationMissing,
  };
}

const startOut = (s) => ({
  paise: s.paise, source: s.source, loaded_at: s.loaded_at, as_of: s.as_of ?? null,
});

const noteBrief = (v) => (v ? {
  guid: v.guid, date: v.date, number: v.number, voucher_type: v.voucher_type, amount_paise: Math.abs(v.effect_paise),
} : null);

const entryOut = (e, pairing) => {
  const p = pairing.entries.get(e.id);
  return {
    ...e, effect_paise: SIGN[e.kind] * e.amount_paise, status: p.status, by: p.by, tally: noteBrief(p.note),
  };
};

// Everything for one company's parties at once.
async function figuresFor(client, companyId, parties, { settings, rule, today }) {
  const data = await loadCompany(client, companyId, parties);
  return parties.map((party) => {
    const vouchers = data.vouchersOf.get(party.guid) || [];
    const entries = data.entriesOf.get(party.guid) || [];
    const start = startOf({
      balance: data.balanceOf.get(party.guid), opening: data.openingOf.get(party.guid), settings, vouchers,
    });
    return {
      party, entries, asOf: data.asOf, figures: figuresOf({
        vouchers, entries, start, settings, rule, today,
      }),
    };
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
 * GET /api/ledgers/statement: one row per party over From-To, and the totals.
 * `parties` come from loadParties, already filtered.
 */
async function statementOf(client, {
  parties, from, to, today = todayIst(),
}) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const rows = [];
  const asOfs = [];
  for (const [companyId, list] of byCompany(parties)) {
    const all = await figuresFor(client, companyId, list, { settings, rule, today });
    for (const { party, entries, figures, asOf } of all) {
      asOfs.push(asOf);
      rows.push({
        party, start: startOut(figures.start), started_on: figures.pairing.started_on, ...rangeOf(figures, entries, { from, to }),
      });
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
  };
  const known = asOfs.filter(Boolean).sort();
  return {
    from, to, today, sync_from: SYNC_FROM, as_of: known[0] || null, rows, totals,
    settings: { grace_days: settings.grace_days, match_window_days: settings.match_window_days, amount_tolerance_paise: settings.amount_tolerance_paise },
  };
}

// GET /api/ledgers/party: one party over From-To -- the statement row, the
// notes typed for the range, and Tally's vouchers with a running balance.
async function partyDetailOf(client, {
  party, from, to, today = todayIst(),
}) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const [{ entries, figures, asOf }] = await figuresFor(client, party.company_id, [party], { settings, rule, today });
  const range = rangeOf(figures, entries, { from, to });
  let balance = range.opening_paise;
  const vouchers = figures.rows.filter((v) => inRange(v.date, from, to)).map((v) => {
    balance += v.effect_paise;
    return {
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
        entries: v.note.entries.map((e) => ({
          id: e.id, kind: e.kind, number: e.number, date: e.date, amount_paise: e.amount_paise,
        })),
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
    started_on: figures.pairing.started_on,
    ...range,
    entries: entries.filter((e) => inRange(e.date, from, to)).map((e) => entryOut(e, figures.pairing)),
    vouchers,
    settings: { grace_days: settings.grace_days, match_window_days: settings.match_window_days, amount_tolerance_paise: settings.amount_tolerance_paise },
  };
}

/**
 * Needs attention: each bill-to-bill party with something for a person --
 * a red or purple DN/CN status from its first entry to today, a DN booked
 * twice, or a state that differs -- with what is off and since when.
 */
async function attentionOf(client, { parties, today = todayIst() }) {
  const [settings, rule] = await Promise.all([loadSettings(client), loadNarrationRule(client)]);
  const out = [];
  for (const [companyId, list] of byCompany(parties)) {
    const all = await figuresFor(client, companyId, list, { settings, rule, today });
    for (const { party, entries, figures } of all) {
      const counts = Object.fromEntries(PROBLEMS.map((s) => [s, 0]));
      const dates = [];
      for (const e of entries) {
        const s = figures.pairing.entries.get(e.id).status;
        if (PROBLEMS.includes(s)) { counts[s] += 1; dates.push(e.date); }
      }
      for (const v of figures.rows) {
        if (!v.note || !['not_entered', 'booked_twice'].includes(v.note.status)) continue;
        counts[v.note.status] += 1;
        dates.push(v.date);
      }
      if (!dates.length && !party.state_differs) continue;
      out.push({
        party, counts, since: dates.sort()[0] || null, state_differs: party.state_differs,
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
  KINDS,
  SIGN,
  COLUMNS,
  ACCOUNTING_TYPES,
  MIN_DN,
  PROBLEMS,
  loadSettings,
  sameNumber,
  findsNumber,
  dnNumbersIn,
  columnOf,
  pairNotes,
  loadParties,
  startOf,
  startingBalanceOf,
  statementOf,
  partyDetailOf,
  attentionOf,
  monthStart,
  addDays,
};
