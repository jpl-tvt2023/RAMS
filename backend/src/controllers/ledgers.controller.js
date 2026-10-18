const db = require('../config/db');
const { SYNC_FROM } = require('../config/env');
const { logAction, diffFields } = require('../services/auditLog.service');
const { isValidDateString } = require('../utils/dateValidation');
const { todayIst } = require('../matching/load');
const { normKey } = require('../matching/docno');
const {
  KINDS, loadSettings, partyOf, dayOf, flagsOf,
} = require('../ledgers/ledger');

// Ledgers: a party's day, typed in RAMS and checked against Tally
// (src/ledgers/ledger.js). Seeing it is ledgers.view, recording entries is
// ledgers.entry, the settings are ledgers.settings. Every change is audited.
// Nothing here writes to Tally.

const MAX_PAISE = 100000000000; // 100 crore rupees
const KIND_LABEL = {
  invoice: 'invoice', debit_note: 'debit note', credit_note: 'credit note', receipt: 'receipt',
};
const ATTENTION_LIMIT = 200;

const fail = (status, message) => Object.assign(new Error(message), { status });
const sendError = (res, next, err) => (err.status && err.status < 500 ? res.status(err.status).json({ message: err.message }) : next(err));
const rowsOf = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const rupees = (p) => `₹${(Number(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (v, max, what) => {
  const s = v == null ? '' : String(v).trim();
  if (s.length > max) throw fail(400, `${what} can be at most ${max} characters`);
  return s || null;
};

async function inTx(work) {
  const tx = await db.transaction('write');
  try {
    const out = await work(tx);
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// The companies with sync on, and the one asked for: an id, or 'default' (the
// star on Admin -> Tally companies, else the first). Ledgers are per company,
// so there is no consolidated view.
async function companiesAnd(q) {
  const companies = (await rowsOf('SELECT id, code, name, is_default FROM tally_companies WHERE sync_enabled = 1 ORDER BY code, id'))
    .map((c) => ({
      id: Number(c.id), code: c.code, name: c.name, is_default: Boolean(c.is_default),
    }));
  let companyId = null;
  if (!q || q === 'default') companyId = (companies.find((c) => c.is_default) || companies[0])?.id ?? null;
  else companyId = companies.find((c) => c.id === Number(q))?.id ?? null;
  return { companies, companyId };
}

// A day the page may show or an entry may carry: from the sync start to today.
function dayIn(value, today, what = 'The date') {
  if (!isValidDateString(value)) throw fail(400, `${what} must be a date (YYYY-MM-DD)`);
  if (value < SYNC_FROM) throw fail(400, `${what} can't be before ${SYNC_FROM}, when RAMS's copy of Tally starts`);
  if (value > today) throw fail(400, `${what} can't be in the future`);
  return value;
}

// ------------------------------------------------------------ parties

// GET /api/ledgers/parties?company_id -- the marketplaces with their party
// ledgers (mapped on Matching -> Party ledgers, else suggested), each with
// how many of its days differ from Tally, and every such day ("attention").
async function parties(req, res, next) {
  try {
    const { companies, companyId } = await companiesAnd(req.query.company_id);
    const dates = { today: todayIst(), sync_from: SYNC_FROM };
    if (!companyId) return res.json({ companies, company_id: null, vendors: [], attention: [], attention_total: 0, ...dates });
    const [ledgers, counts, flags] = await Promise.all([
      rowsOf(`SELECT l.guid, l.name, l.parent, pl.kind, pl.vendor, pl.suggested_vendor
                FROM tally_ledgers l LEFT JOIN party_ledgers pl ON pl.company_id = l.company_id AND pl.ledger_guid = l.guid
               WHERE l.company_id = ? AND l.deleted_at IS NULL
                 AND ((pl.kind = 'vendor' AND COALESCE(pl.vendor, '') <> '') OR (pl.kind IS NULL AND pl.suggested_vendor IS NOT NULL)
                      OR l.guid IN (SELECT ledger_guid FROM ledger_entries WHERE company_id = ? AND deleted_at IS NULL))`, [companyId, companyId]),
      rowsOf(`SELECT ledger_guid, COUNT(*) AS n, MAX(date) AS last FROM ledger_entries
               WHERE company_id = ? AND deleted_at IS NULL GROUP BY ledger_guid`, [companyId]),
      flagsOf(db, companyId),
    ]);
    const countOf = new Map(counts.map((c) => [c.ledger_guid, c]));
    const flagOf = new Map(flags.map((f) => [f.party.guid, f]));
    const byVendor = new Map();
    for (const l of ledgers) {
      const suggested = l.kind == null && Boolean(l.suggested_vendor);
      const vendor = l.kind === 'vendor' ? l.vendor : (suggested ? l.suggested_vendor : null);
      if (!byVendor.has(vendor)) byVendor.set(vendor, []);
      byVendor.get(vendor).push({
        guid: l.guid,
        name: l.name,
        parent: l.parent,
        suggested,
        entries: Number(countOf.get(l.guid)?.n || 0),
        last_entry: countOf.get(l.guid)?.last || null,
        flagged_days: flagOf.get(l.guid)?.days.length || 0,
        waiting_days: flagOf.get(l.guid)?.waiting_days || 0,
      });
    }
    // Marketplaces A-Z, "not mapped" last. Parties with flags first, then A-Z.
    const vendors = [...byVendor]
      .sort(([a], [b]) => (a == null) - (b == null) || String(a).localeCompare(String(b)))
      .map(([vendor, list]) => ({
        vendor,
        flagged_days: list.reduce((a, p) => a + p.flagged_days, 0),
        parties: list.sort((a, b) => b.flagged_days - a.flagged_days || a.name.localeCompare(b.name)),
      }));
    const attention = flags
      .flatMap((f) => f.days.map((d) => ({
        ledger_guid: f.party.guid, party: f.party.name, vendor: f.party.vendor, ...d,
      })))
      .sort((a, b) => b.date.localeCompare(a.date) || a.party.localeCompare(b.party));
    return res.json({
      companies, company_id: companyId, vendors, attention: attention.slice(0, ATTENTION_LIMIT), attention_total: attention.length, ...dates,
    });
  } catch (err) { return sendError(res, next, err); }
}

// ------------------------------------------------------------ day

// GET /api/ledgers/day?company_id&ledger_guid&date -- one party's day.
async function day(req, res, next) {
  try {
    const q = req.query;
    const today = todayIst();
    const { companies, companyId } = await companiesAnd(q.company_id);
    if (!companyId) throw fail(404, 'No Tally company is synced yet');
    if (!q.ledger_guid) throw fail(400, 'Choose a party');
    const date = dayIn(q.date || today, today);
    const out = await dayOf(db, {
      companyId, ledgerGuid: String(q.ledger_guid), date, today,
    });
    if (!out) throw fail(404, 'That party ledger isn’t in this company any more');
    res.json({ ...out, companies, company_id: companyId });
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ entries

// The fields of an entry from a body, checked. `base` is the entry being
// changed, so a PUT may send only what changes.
function entryFields(body, today, base = {}) {
  const b = { ...base, ...(body || {}) };
  if (!KINDS.includes(b.kind)) throw fail(400, 'Choose what it is: invoice, debit note, credit note or receipt');
  const date = dayIn(b.date, today, 'The date');
  const amount = b.amount_paise;
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PAISE) throw fail(400, 'The amount must be more than ₹0');
  const number = text(b.number, 60, 'The number');
  const reference = text(b.reference, 80, 'The reference');
  const note = text(b.note, 500, 'The note');
  if (b.kind !== 'receipt' && !number) throw fail(400, `Type the ${KIND_LABEL[b.kind]} number`);
  return {
    date, kind: b.kind, number, reference: b.kind === 'receipt' ? reference : null, amount_paise: amount, note,
  };
}

// An invoice or note number already entered for the party (receipts have no
// number to clash on).
async function duplicateOf(companyId, ledgerGuid, f, exceptId = null) {
  if (f.kind === 'receipt' || !f.number) return null;
  const rows = await rowsOf(`SELECT id, date, number FROM ledger_entries
                              WHERE company_id = ? AND ledger_guid = ? AND kind = ? AND deleted_at IS NULL AND id <> ?`,
  [companyId, ledgerGuid, f.kind, exceptId ?? 0]);
  return rows.find((r) => normKey(r.number) === normKey(f.number)) || null;
}

const describe = (party, f) => `${party.name}: ${KIND_LABEL[f.kind]}${f.number ? ` ${f.number}` : ''} for ${rupees(f.amount_paise)} on ${f.date}`;

// POST /api/ledgers/entries { company_id, ledger_guid, date, kind, number, reference, amount_paise, note }
async function createEntry(req, res, next) {
  try {
    const body = req.body || {};
    const today = todayIst();
    const companyId = Number(body.company_id);
    const ledgerGuid = String(body.ledger_guid || '');
    const party = companyId && ledgerGuid ? await partyOf(db, companyId, ledgerGuid) : null;
    if (!party) throw fail(400, 'Choose a party ledger of a synced company');
    const f = entryFields(body, today);
    const dup = await duplicateOf(companyId, ledgerGuid, f);
    if (dup) throw fail(409, `${KIND_LABEL[f.kind][0].toUpperCase()}${KIND_LABEL[f.kind].slice(1)} ${dup.number} is already entered for this party, on ${dup.date}`);
    const id = await inTx(async (tx) => {
      const r = await tx.execute({
        sql: `INSERT INTO ledger_entries (company_id, ledger_guid, date, kind, number, reference, amount_paise, note, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [companyId, ledgerGuid, f.date, f.kind, f.number, f.reference, f.amount_paise, f.note, req.user.id],
      });
      const newId = Number(r.lastInsertRowid);
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'LEDGER_ENTRY_CREATE',
        description: `Entry added — ${describe(party, f)}`,
        entityType: 'ledger_entries',
        entityId: newId,
        entityRef: party.name,
        changes: diffFields({}, f, ['date', 'kind', 'number', 'reference', 'amount_paise', 'note']),
      });
      return newId;
    });
    res.status(201).json({ id });
  } catch (err) { sendError(res, next, err); }
}

async function liveEntry(id) {
  const [e] = await rowsOf('SELECT * FROM ledger_entries WHERE id = ? AND deleted_at IS NULL', [Number(id) || 0]);
  if (!e) throw fail(404, 'That entry isn’t there any more');
  return e;
}

// PUT /api/ledgers/entries/:id { date?, kind?, number?, reference?, amount_paise?, note? }
async function updateEntry(req, res, next) {
  try {
    const today = todayIst();
    const e = await liveEntry(req.params.id);
    const companyId = Number(e.company_id);
    const party = await partyOf(db, companyId, e.ledger_guid);
    if (!party) throw fail(400, 'That party ledger isn’t in a synced company any more');
    const unknown = Object.keys(req.body || {}).filter((k) => !['date', 'kind', 'number', 'reference', 'amount_paise', 'note'].includes(k));
    if (unknown.length) throw fail(400, `Unknown field: ${unknown.join(', ')}`);
    const before = {
      date: e.date, kind: e.kind, number: e.number, reference: e.reference, amount_paise: Number(e.amount_paise), note: e.note,
    };
    const f = entryFields(req.body, today, before);
    const dup = await duplicateOf(companyId, e.ledger_guid, f, Number(e.id));
    if (dup) throw fail(409, `${dup.number} is already entered for this party, on ${dup.date}`);
    const changes = diffFields(before, f, ['date', 'kind', 'number', 'reference', 'amount_paise', 'note']);
    if (changes.length) {
      await inTx(async (tx) => {
        await tx.execute({
          sql: `UPDATE ledger_entries SET date = ?, kind = ?, number = ?, reference = ?, amount_paise = ?, note = ?,
                       updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          args: [f.date, f.kind, f.number, f.reference, f.amount_paise, f.note, req.user.id, e.id],
        });
        await logAction({
          client: tx,
          userId: req.user.id,
          actionType: 'LEDGER_ENTRY_UPDATE',
          description: `Entry changed — ${describe(party, f)}`,
          entityType: 'ledger_entries',
          entityId: Number(e.id),
          entityRef: party.name,
          changes,
        });
      });
    }
    res.json({ id: Number(e.id), changed: changes.length > 0 });
  } catch (err) { sendError(res, next, err); }
}

// DELETE /api/ledgers/entries/:id -- the row stays, marked removed.
async function deleteEntry(req, res, next) {
  try {
    const e = await liveEntry(req.params.id);
    const party = await partyOf(db, Number(e.company_id), e.ledger_guid);
    await inTx(async (tx) => {
      await tx.execute({
        sql: "UPDATE ledger_entries SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?",
        args: [req.user.id, e.id],
      });
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'LEDGER_ENTRY_DELETE',
        description: `Entry removed — ${describe(party || { name: e.ledger_guid }, { ...e, amount_paise: Number(e.amount_paise) })}`,
        entityType: 'ledger_entries',
        entityId: Number(e.id),
        entityRef: party?.name || e.ledger_guid,
      });
    });
    res.json({ id: Number(e.id), deleted: true });
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ settings

const SETTING_RULES = {
  grace_days: [0, 30, 'Days to wait must be 0-30'],
  amount_tolerance_paise: [0, 100000, 'The amount tolerance must be ₹0-₹1,000'],
  default_opening_paise: [-MAX_PAISE, MAX_PAISE, 'The placeholder opening is too large'],
};

// GET /api/ledgers/settings
async function getSettings(req, res, next) {
  try { res.json(await loadSettings(db)); } catch (err) { next(err); }
}

// PUT /api/ledgers/settings { grace_days?, amount_tolerance_paise?, default_opening_paise? }
async function updateSettings(req, res, next) {
  try {
    const body = req.body || {};
    const keys = Object.keys(SETTING_RULES);
    const unknown = Object.keys(body).filter((k) => !keys.includes(k));
    if (unknown.length) throw fail(400, `Unknown setting: ${unknown.join(', ')}`);
    const current = await loadSettings(db);
    const merged = { ...Object.fromEntries(keys.map((k) => [k, current[k]])), ...body };
    for (const [k, [min, max, message]] of Object.entries(SETTING_RULES)) {
      if (!Number.isInteger(merged[k]) || merged[k] < min || merged[k] > max) throw fail(400, message);
    }
    const changes = diffFields(current, merged, keys);
    if (changes.length) {
      await inTx(async (tx) => {
        await tx.execute({
          sql: `UPDATE ledger_settings SET grace_days = ?, amount_tolerance_paise = ?, default_opening_paise = ?,
                       updated_at = datetime('now'), updated_by = ? WHERE id = 1`,
          args: [merged.grace_days, merged.amount_tolerance_paise, merged.default_opening_paise, req.user.id],
        });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'LEDGER_SETTINGS_UPDATE', description: 'Ledger settings changed', entityType: 'ledger_settings', entityId: 1, changes,
        });
      });
    }
    res.json(await loadSettings(db));
  } catch (err) { sendError(res, next, err); }
}

module.exports = {
  parties, day, createEntry, updateEntry, deleteEntry, getSettings, updateSettings,
};
