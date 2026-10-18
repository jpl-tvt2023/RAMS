// A party's day as the Ledgers page shows it, worked out at read time from
// what people typed in RAMS (ledger_entries) and the Tally copy -- nothing
// derivable is stored.
//
// Balances are what the party owes (a debit balance is positive). Tally keeps
// amounts the other way round (negative is a debit), so a voucher's effect on
// the party is minus the sum of its lines on the party ledger.
//
//   starting balance  the party's balance at the start of RAMS_SYNC_FROM:
//                     loaded by a script (ledger_openings), else the
//                     placeholder in ledger_settings (10,000 rupees)
//   opening on D      starting balance + every mirrored voucher on the party
//                     dated before D. With a placeholder only the level is a
//                     guess -- each day still rolls on with Tally's real
//                     vouchers, so one day's closing is the next day's opening
//   Tally closing     opening + the party's Tally vouchers dated D
//   RAMS closing      opening + the entries typed for D
//
// The check pairs each entry with a Tally voucher of its kind on the same day:
// invoices and notes by number (607 finds 607/RM/26-27), receipts by the
// reference (UTR) or number when there is one, else by amount. Either side
// has grace_days to catch up before a difference is flagged. A party is
// checked from the first day anyone typed an entry for it.
const { SYNC_FROM } = require('../config/env');
const { todayIst } = require('../matching/load');
const { normKey, compactKey, serialOf } = require('../matching/docno');
const { daysBetween } = require('../books/book');

const KINDS = ['invoice', 'debit_note', 'credit_note', 'receipt'];
// +1 adds to what the party owes, -1 takes it down.
const SIGN = {
  invoice: 1, debit_note: 1, credit_note: -1, receipt: -1,
};
const BASE_TYPE = {
  invoice: 'Sales', debit_note: 'Debit Note', credit_note: 'Credit Note', receipt: 'Receipt',
};
const KIND_OF = Object.fromEntries(Object.entries(BASE_TYPE).map(([k, b]) => [b, k]));
// How far either side looks for an entry made on the wrong day.
const NEARBY_DAYS = 7;
const FLAGS = ['missing', 'amount_differs', 'other_date', 'only_in_tally'];

const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const n = (v) => (v == null ? 0 : Number(v));

async function loadSettings(client) {
  const { rows: [s] } = await client.execute(
    'SELECT s.*, u.name AS updated_by_name FROM ledger_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1',
  );
  return {
    grace_days: n(s.grace_days),
    amount_tolerance_paise: n(s.amount_tolerance_paise),
    default_opening_paise: n(s.default_opening_paise),
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

// A receipt's reference (a UTR, say) anywhere in Tally's number, reference or
// narration. Short ones would find too much.
function sameReference(ref, v) {
  const r = compactKey(ref);
  if (r.length < 4) return false;
  return [v.number, v.reference, v.narration].some((s) => compactKey(s).includes(r));
}

// Whether an entry and a Tally voucher of its kind are the same document,
// leaving the amount aside.
function pairs(e, v) {
  if (e.kind === 'receipt') return Boolean((e.reference && sameReference(e.reference, v)) || (e.number && sameNumber(e.number, v.number)));
  return sameNumber(e.number, v.number);
}

const effectOf = (e) => SIGN[e.kind] * n(e.amount_paise);

const entryOut = (e) => ({
  id: Number(e.id),
  date: e.date,
  kind: e.kind,
  number: e.number ?? null,
  reference: e.reference ?? null,
  amount_paise: n(e.amount_paise),
  effect_paise: effectOf(e),
  note: e.note ?? null,
  created_by_name: e.created_by_name ?? null,
  created_at: e.created_at ?? null,
  updated_by_name: e.updated_by_name ?? null,
  updated_at: e.updated_at ?? null,
});

const voucherOut = (v) => ({
  guid: v.guid,
  date: v.date,
  voucher_type: v.voucher_type,
  base_type: v.base_type,
  number: v.number ?? null,
  amount_paise: Math.abs(v.effect_paise),
  effect_paise: v.effect_paise,
});

/**
 * One day of one party: each entry with what Tally has for it, Tally's
 * vouchers nobody entered, both closings and the day's status.
 *
 * entries    every live entry of the party, any date
 * vouchers   every mirrored voucher on the party, any date ({ effect_paise })
 * startedOn  the party's first entry date (null: nothing entered yet)
 */
function checkDay({
  date, today, opening, entries, vouchers, settings, startedOn,
}) {
  const tol = settings.amount_tolerance_paise;
  const inGrace = daysBetween(date, today) <= settings.grace_days;
  const near = (d) => d !== date && Math.abs(daysBetween(date, d)) <= NEARBY_DAYS;
  const close = (e, v) => Math.abs(effectOf(e) - v.effect_paise) <= tol;
  const dayEntries = entries.filter((e) => e.date === date);
  const dayVouchers = vouchers.filter((v) => v.date === date);
  const started = Boolean(startedOn) && date >= startedOn;

  // By number or reference first, so a receipt paired by amount can't take a
  // voucher another entry names.
  const used = new Set();
  const hitOf = new Map();
  for (const e of dayEntries) {
    const v = dayVouchers.find((x) => x.base_type === BASE_TYPE[e.kind] && !used.has(x.id) && pairs(e, x));
    if (v) { used.add(v.id); hitOf.set(e.id, v); }
  }
  for (const e of dayEntries) {
    if (e.kind !== 'receipt' || hitOf.has(e.id)) continue;
    const v = dayVouchers.find((x) => x.base_type === 'Receipt' && !used.has(x.id) && close(e, x));
    if (v) { used.add(v.id); hitOf.set(e.id, v); }
  }

  const rows = dayEntries.map((e) => {
    const v = hitOf.get(e.id);
    if (v) return { ...entryOut(e), status: close(e, v) ? 'in_tally' : 'amount_differs', tally: voucherOut(v) };
    const elsewhere = vouchers.find((x) => near(x.date) && x.base_type === BASE_TYPE[e.kind] && pairs(e, x));
    if (elsewhere) return { ...entryOut(e), status: 'other_date', tally: voucherOut(elsewhere) };
    return { ...entryOut(e), status: inGrace ? 'waiting' : 'missing', tally: null };
  });

  const tallyOnly = dayVouchers.filter((v) => !used.has(v.id)).map((v) => {
    const kind = KIND_OF[v.base_type];
    const entered = kind ? entries.find((e) => near(e.date) && e.kind === kind && pairs(e, v)) : null;
    let status = inGrace ? 'waiting' : 'only_in_tally';
    if (!started) status = 'not_checked';
    else if (entered) status = 'other_date';
    return {
      ...voucherOut(v), status, entered_on: entered?.date ?? null, entry_id: entered ? Number(entered.id) : null,
    };
  });

  const ramsMoves = rows.reduce((a, r) => a + r.effect_paise, 0);
  const tallyMoves = dayVouchers.reduce((a, v) => a + v.effect_paise, 0);
  const all = [...rows, ...tallyOnly];
  let status = 'matches';
  if (!dayEntries.length && !dayVouchers.length) status = 'empty';
  else if (!started) status = 'not_started';
  else if (all.some((r) => FLAGS.includes(r.status))) status = 'differs';
  else if (all.some((r) => r.status === 'waiting')) status = 'waiting';

  return {
    entries: rows,
    tally_only: tallyOnly,
    tally_count: dayVouchers.length,
    rams_moves_paise: ramsMoves,
    tally_moves_paise: tallyMoves,
    rams_closing_paise: opening + ramsMoves,
    tally_closing_paise: opening + tallyMoves,
    difference_paise: ramsMoves - tallyMoves,
    status,
  };
}

// The party ledger, its company and its marketplace (mapped on Matching ->
// Party ledgers, else RAMS's suggestion). null when the company's sync is off
// or the ledger is gone.
async function partyOf(client, companyId, ledgerGuid) {
  const [r] = await rowsOf(client, `
    SELECT l.guid, l.name, l.parent, c.id AS company_id, c.code, c.name AS company_name, pl.kind, pl.vendor, pl.suggested_vendor
      FROM tally_ledgers l JOIN tally_companies c ON c.id = l.company_id
      LEFT JOIN party_ledgers pl ON pl.company_id = l.company_id AND pl.ledger_guid = l.guid
     WHERE l.company_id = ? AND l.guid = ? AND l.deleted_at IS NULL AND c.sync_enabled = 1`, [companyId, ledgerGuid]);
  if (!r) return null;
  const suggested = r.kind == null && Boolean(r.suggested_vendor);
  return {
    company_id: Number(r.company_id),
    company: r.code || r.company_name,
    guid: r.guid,
    name: r.name,
    parent: r.parent,
    vendor: r.kind === 'vendor' ? r.vendor : (suggested ? r.suggested_vendor : null),
    suggested,
  };
}

// Every live mirrored voucher on the party ledger, oldest first.
async function partyVouchers(client, companyId, ledgerName) {
  const rows = await rowsOf(client, `
    SELECT v.id, v.guid, v.date, v.voucher_type, v.base_type, v.number, v.reference, v.narration, SUM(l.amount_paise) AS amount
      FROM tally_vch_ledger_lines l JOIN tally_vouchers v ON v.id = l.voucher_id
     WHERE l.ledger = ? COLLATE NOCASE AND v.company_id = ? AND v.deleted_at IS NULL AND v.is_cancelled = 0 AND v.is_optional = 0 AND v.date >= ?
     GROUP BY v.id ORDER BY v.date, v.id`, [ledgerName, companyId, SYNC_FROM]);
  return rows.map((r) => ({
    id: Number(r.id),
    guid: r.guid,
    date: r.date,
    voucher_type: r.voucher_type,
    base_type: r.base_type,
    number: r.number,
    reference: r.reference,
    narration: r.narration,
    effect_paise: -n(r.amount),
  }));
}

// Every live entry of the party, oldest first.
async function partyEntries(client, companyId, ledgerGuid) {
  return rowsOf(client, `
    SELECT e.*, cu.name AS created_by_name, uu.name AS updated_by_name
      FROM ledger_entries e LEFT JOIN users cu ON cu.id = e.created_by LEFT JOIN users uu ON uu.id = e.updated_by
     WHERE e.company_id = ? AND e.ledger_guid = ? AND e.deleted_at IS NULL
     ORDER BY e.date, e.id`, [companyId, ledgerGuid]);
}

// The balance at the start of RAMS_SYNC_FROM: loaded, else the placeholder.
async function startingBalance(client, companyId, ledgerGuid, settings) {
  const [r] = await rowsOf(client, 'SELECT amount_paise, loaded_at FROM ledger_openings WHERE company_id = ? AND ledger_guid = ?', [companyId, ledgerGuid]);
  if (r) return { paise: n(r.amount_paise), source: 'loaded', loaded_at: r.loaded_at };
  return { paise: settings.default_opening_paise, source: 'placeholder', loaded_at: null };
}

// When RAMS last knew it held everything the company had in Tally.
async function asOfFor(client, companyId) {
  const [r] = await rowsOf(client, `
    SELECT MAX(t) AS at FROM (
      SELECT MAX(finished_at) AS t FROM tally_sync_runs WHERE company_id = ? AND status = 'ok'
      UNION ALL SELECT last_checked_at FROM tally_sync_state WHERE company_id = ?)`, [companyId, companyId]);
  return r?.at ?? null;
}

const openingOn = (start, vouchers, date) => vouchers.reduce((a, v) => (v.date < date ? a + v.effect_paise : a), start.paise);

// GET /api/ledgers/day: the whole day of one party.
async function dayOf(client, {
  companyId, ledgerGuid, date, today = todayIst(),
}) {
  const party = await partyOf(client, companyId, ledgerGuid);
  if (!party) return null;
  const settings = await loadSettings(client);
  const [vouchers, entries, start, asOf] = await Promise.all([
    partyVouchers(client, companyId, party.name),
    partyEntries(client, companyId, ledgerGuid),
    startingBalance(client, companyId, ledgerGuid, settings),
    asOfFor(client, companyId),
  ]);
  const opening = openingOn(start, vouchers, date);
  const startedOn = entries[0]?.date ?? null;
  return {
    party,
    date,
    today,
    sync_from: SYNC_FROM,
    as_of: asOf,
    start: { paise: start.paise, source: start.source, loaded_at: start.loaded_at },
    opening_paise: opening,
    started_on: startedOn,
    settings: { grace_days: settings.grace_days, amount_tolerance_paise: settings.amount_tolerance_paise },
    ...checkDay({
      date, today, opening, entries, vouchers, settings, startedOn,
    }),
  };
}

// Every day that differs, for each party anyone has entered something for,
// from its first entry to today. { [ledger_guid]: { party, days: [...] } }
async function flagsOf(client, companyId, { today = todayIst() } = {}) {
  const settings = await loadSettings(client);
  const tracked = await rowsOf(client, `
    SELECT DISTINCT ledger_guid FROM ledger_entries WHERE company_id = ? AND deleted_at IS NULL`, [companyId]);
  const out = [];
  for (const { ledger_guid: guid } of tracked) {
    const party = await partyOf(client, companyId, guid);
    if (!party) continue;
    const [vouchers, entries, start] = await Promise.all([
      partyVouchers(client, companyId, party.name),
      partyEntries(client, companyId, guid),
      startingBalance(client, companyId, guid, settings),
    ]);
    const startedOn = entries[0]?.date ?? null;
    const dates = [...new Set([...entries.map((e) => e.date), ...vouchers.map((v) => v.date)])]
      .filter((d) => startedOn && d >= startedOn && d <= today)
      .sort();
    const days = [];
    let waiting = 0;
    for (const date of dates) {
      const day = checkDay({
        date, today, opening: openingOn(start, vouchers, date), entries, vouchers, settings, startedOn,
      });
      if (day.status === 'waiting') waiting += 1;
      if (day.status !== 'differs') continue;
      const all = [...day.entries, ...day.tally_only];
      days.push({
        date,
        difference_paise: day.difference_paise,
        counts: Object.fromEntries(FLAGS.map((f) => [f, all.filter((r) => r.status === f).length])),
      });
    }
    out.push({ party, days: days.reverse(), waiting_days: waiting });
  }
  return out;
}

module.exports = {
  KINDS, SIGN, BASE_TYPE, FLAGS, NEARBY_DAYS, loadSettings, sameNumber, sameReference, checkDay, partyOf, partyVouchers, partyEntries,
  startingBalance, dayOf, flagsOf,
};
