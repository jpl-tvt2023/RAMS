const db = require('../config/db');
const { SYNC_FROM } = require('../config/env');
const { logAction, diffFields } = require('../services/auditLog.service');
const { isValidDateString } = require('../utils/dateValidation');
const { todayIst } = require('../matching/load');
const { normKey, compactKey } = require('../matching/docno');
const { keyOf } = require('../utils/gstStates');
const {
  KINDS, MIN_DN, loadSettings, loadParties, findsNumber, statementOf, partyDetailOf, attentionOf, monthStart, addDays,
} = require('../ledgers/ledger');

// Ledgers: the bill-to-bill statement per party, checked against the notes
// typed in RAMS (src/ledgers/ledger.js). Seeing it is ledgers.view, recording
// notes is ledgers.entry, the settings are ledgers.settings. Every change is
// audited. Nothing here writes to Tally.

const MAX_PAISE = 100000000000; // 100 crore rupees
const KIND_LABEL = { debit_note: 'marketplace debit note', credit_note: 'credit note' };
const ATTENTION_LIMIT = 200;
// A marketplace debit note may be older than RAMS's copy of Tally: June's
// credit notes name DNs from April and May.
const EARLIEST_ENTRY = addDays(SYNC_FROM, -365);

const fail = (status, message) => Object.assign(new Error(message), { status });
const sendError = (res, next, err) => (err.status && err.status < 500 ? res.status(err.status).json({ message: err.message }) : next(err));
const rowsOf = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const rupees = (p) => `₹${(Number(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (v, max, what) => {
  const s = v == null ? '' : String(v).trim();
  if (s.length > max) throw fail(400, `${what} can be at most ${max} characters`);
  return s || null;
};
// 'all', a list, or null when nothing was chosen.
const listOf = (v) => {
  if (v == null || String(v).trim() === '') return null;
  if (String(v) === 'all') return 'all';
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
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

const loadCompanies = async () => (await rowsOf('SELECT id, code, name, is_default FROM tally_companies WHERE sync_enabled = 1 ORDER BY code, id'))
  .map((c) => ({
    id: Number(c.id), code: c.code, name: c.name, is_default: Boolean(c.is_default),
  }));

// A day the statement may show: from the sync start to today.
function dayIn(value, today, what = 'The date') {
  if (!isValidDateString(value)) throw fail(400, `${what} must be a date (YYYY-MM-DD)`);
  if (value < SYNC_FROM) throw fail(400, `${what} can't be before ${SYNC_FROM}, when RAMS's copy of Tally starts`);
  if (value > today) throw fail(400, `${what} can't be in the future`);
  return value;
}

// The default From: the 1st of this month, or the sync start if later.
const defaultFrom = (today) => (monthStart(today) < SYNC_FROM ? SYNC_FROM : monthStart(today));

// From and To, the month to date when left out.
function rangeIn(q, today) {
  const from = dayIn(q.from || defaultFrom(today), today, 'From');
  const to = dayIn(q.to || today, today, 'To');
  if (from > to) throw fail(400, 'From must be on or before To');
  return { from, to };
}

// The bill-to-bill party a request names, or a 400.
async function billToBillParty(companyId, ledgerGuid) {
  const settings = await loadSettings(db);
  const party = (await loadParties(db, settings)).find((p) => p.company_id === Number(companyId) && p.guid === String(ledgerGuid || ''));
  if (!party) throw fail(400, 'Choose a party ledger of a synced company');
  if (!party.bill_to_bill) throw fail(400, `Ledgers for ${party.vendor} is coming soon. For now Ledgers covers ${settings.marketplaces.join(', ') || 'no marketplace'}`);
  return party;
}

// ------------------------------------------------------------ parties

// GET /api/ledgers/parties -- the companies, every marketplace (those Ledgers
// covers first, the rest "coming soon"), the bill-to-bill parties with both
// readings of their state, and what needs attention.
async function parties(req, res, next) {
  try {
    const today = todayIst();
    const settings = await loadSettings(db);
    const [companies, all] = await Promise.all([loadCompanies(), loadParties(db, settings)]);
    const counts = new Map(settings.marketplaces.map((v) => [v, 0]));
    for (const p of all) counts.set(p.vendor, (counts.get(p.vendor) || 0) + 1);
    const marketplaces = [...counts]
      .map(([vendor, count]) => ({ vendor, parties: count, bill_to_bill: settings.marketplaces.includes(vendor) }))
      .sort((a, b) => (b.bill_to_bill - a.bill_to_bill) || a.vendor.localeCompare(b.vendor));
    const list = all.filter((p) => p.bill_to_bill);
    const attention = await attentionOf(db, { parties: list, today });
    res.json({
      today,
      sync_from: SYNC_FROM,
      month_start: defaultFrom(today),
      companies,
      marketplaces,
      parties: list,
      attention: attention.slice(0, ATTENTION_LIMIT),
      attention_total: attention.length,
    });
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ statement

// GET /api/ledgers/statement?company_id&vendor&states&parties&from&to --
// company_id 'all' or an id, vendor 'all' or a marketplace, states 'all' or a
// comma list, parties 'all' or a comma list of companyId:guid. Each is
// required: nothing is shown until everything is chosen.
async function statement(req, res, next) {
  try {
    const q = req.query;
    const today = todayIst();
    const company = q.company_id ? String(q.company_id) : null;
    const vendor = q.vendor ? String(q.vendor) : null;
    const states = listOf(q.states);
    const picked = listOf(q.parties);
    if (!company || !vendor || !states || !picked) throw fail(400, 'Choose a company, a marketplace, states and parties');
    const { from, to } = rangeIn(q, today);
    const settings = await loadSettings(db);
    if (vendor !== 'all' && !settings.marketplaces.includes(vendor)) throw fail(400, `Ledgers for ${vendor} is coming soon`);
    const stateKeys = states === 'all' ? null : new Set(states.map(keyOf));
    const partyKeys = picked === 'all' ? null : new Set(picked);
    const list = (await loadParties(db, settings)).filter((p) => p.bill_to_bill
      && (company === 'all' || p.company_id === Number(company))
      && (vendor === 'all' || p.vendor === vendor)
      && (!stateKeys || [p.tally_state, p.gst_state].some((s) => s && stateKeys.has(keyOf(s))))
      && (!partyKeys || partyKeys.has(`${p.company_id}:${p.guid}`)));
    res.json(await statementOf(db, {
      parties: list, from, to, today,
    }));
  } catch (err) { sendError(res, next, err); }
}

// GET /api/ledgers/party?company_id&ledger_guid&from&to -- one party's range.
async function party(req, res, next) {
  try {
    const q = req.query;
    const today = todayIst();
    if (!q.company_id || !q.ledger_guid) throw fail(400, 'Choose a party');
    const p = await billToBillParty(q.company_id, q.ledger_guid);
    const { from, to } = rangeIn(q, today);
    res.json(await partyDetailOf(db, {
      party: p, from, to, today,
    }));
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ entries

function entryDay(value, today) {
  if (!isValidDateString(value)) throw fail(400, 'The date must be a date (YYYY-MM-DD)');
  if (value < EARLIEST_ENTRY) throw fail(400, `The date can't be before ${EARLIEST_ENTRY}`);
  if (value > today) throw fail(400, 'The date can\'t be in the future');
  return value;
}

// The fields of an entry from a body, checked. `base` is the entry being
// changed, so a PUT may send only what changes.
function entryFields(body, today, base = {}) {
  const b = { ...base, ...(body || {}) };
  if (!KINDS.includes(b.kind)) throw fail(400, 'Choose what it is: a marketplace debit note or our credit note. Invoices and receipts come from Tally');
  const date = entryDay(b.date, today);
  const amount = b.amount_paise;
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PAISE) throw fail(400, 'The amount must be more than ₹0');
  const number = text(b.number, 60, 'The number');
  const reference = text(b.reference, 80, 'The invoice it is against');
  const note = text(b.note, 500, 'The note');
  if (!number) throw fail(400, `Type the ${KIND_LABEL[b.kind]} number`);
  if (b.kind === 'debit_note' && compactKey(number).length < MIN_DN) {
    throw fail(400, `A marketplace debit note number has at least ${MIN_DN} letters and digits, for example FKIDN51463346`);
  }
  return {
    date, kind: b.kind, number, reference, amount_paise: amount, note,
  };
}

// A note already entered for the party. A debit note that is a shorter form
// of another (DN26001385 and D28838DN26001385) counts as the same.
async function duplicateOf(companyId, ledgerGuid, f, exceptId = null) {
  const rows = await rowsOf(`SELECT id, date, number FROM ledger_entries
                              WHERE company_id = ? AND ledger_guid = ? AND kind = ? AND deleted_at IS NULL AND id <> ?`,
  [companyId, ledgerGuid, f.kind, exceptId ?? 0]);
  if (f.kind === 'debit_note') return rows.find((r) => findsNumber(f.number, r.number) || findsNumber(r.number, f.number)) || null;
  return rows.find((r) => normKey(r.number) === normKey(f.number)) || null;
}

const describe = (p, f) => `${p.name}: ${KIND_LABEL[f.kind] || f.kind}${f.number ? ` ${f.number}` : ''} for ${rupees(f.amount_paise)} on ${f.date}`;
const FIELDS = ['date', 'kind', 'number', 'reference', 'amount_paise', 'note'];
const already = (f, dup) => `${KIND_LABEL[f.kind][0].toUpperCase()}${KIND_LABEL[f.kind].slice(1)} ${dup.number} is already entered for this party, dated ${dup.date}`;

// POST /api/ledgers/entries { company_id, ledger_guid, date, kind, number, reference, amount_paise, note }
async function createEntry(req, res, next) {
  try {
    const body = req.body || {};
    const today = todayIst();
    const p = await billToBillParty(body.company_id, body.ledger_guid);
    const f = entryFields(body, today);
    const dup = await duplicateOf(p.company_id, p.guid, f);
    if (dup) throw fail(409, already(f, dup));
    const id = await inTx(async (tx) => {
      const r = await tx.execute({
        sql: `INSERT INTO ledger_entries (company_id, ledger_guid, date, kind, number, reference, amount_paise, note, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.company_id, p.guid, f.date, f.kind, f.number, f.reference, f.amount_paise, f.note, req.user.id],
      });
      const newId = Number(r.lastInsertRowid);
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'LEDGER_ENTRY_CREATE',
        description: `Entry added — ${describe(p, f)}`,
        entityType: 'ledger_entries',
        entityId: newId,
        entityRef: p.name,
        changes: diffFields({}, f, FIELDS),
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
    const p = await billToBillParty(e.company_id, e.ledger_guid);
    const unknown = Object.keys(req.body || {}).filter((k) => !FIELDS.includes(k));
    if (unknown.length) throw fail(400, `Unknown field: ${unknown.join(', ')}`);
    const before = {
      date: e.date, kind: e.kind, number: e.number, reference: e.reference, amount_paise: Number(e.amount_paise), note: e.note,
    };
    const f = entryFields(req.body, today, before);
    const dup = await duplicateOf(p.company_id, p.guid, f, Number(e.id));
    if (dup) throw fail(409, already(f, dup));
    const changes = diffFields(before, f, FIELDS);
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
          description: `Entry changed — ${describe(p, f)}`,
          entityType: 'ledger_entries',
          entityId: Number(e.id),
          entityRef: p.name,
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
    const [l] = await rowsOf('SELECT name FROM tally_ledgers WHERE company_id = ? AND guid = ?', [e.company_id, e.ledger_guid]);
    const name = l?.name || e.ledger_guid;
    await inTx(async (tx) => {
      await tx.execute({
        sql: "UPDATE ledger_entries SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?",
        args: [req.user.id, e.id],
      });
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'LEDGER_ENTRY_DELETE',
        description: `Entry removed — ${describe({ name }, { ...e, amount_paise: Number(e.amount_paise) })}`,
        entityType: 'ledger_entries',
        entityId: Number(e.id),
        entityRef: name,
      });
    });
    res.json({ id: Number(e.id), deleted: true });
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ settings

const SETTING_RULES = {
  grace_days: [0, 90, 'Days to type a note must be 0-90'],
  match_window_days: [1, 365, 'Days Tally may take to book a note must be 1-365'],
  amount_tolerance_paise: [0, 100000, 'The amount tolerance must be ₹0-₹1,000'],
  default_opening_paise: [-MAX_PAISE, MAX_PAISE, 'The placeholder opening is too large'],
};

// The marketplaces a party ledger is mapped (or suggested) to, and any
// already on the list.
async function knownMarketplaces(settings) {
  const rows = await rowsOf(`SELECT DISTINCT CASE WHEN kind = 'vendor' THEN vendor ELSE suggested_vendor END AS vendor
                               FROM party_ledgers WHERE (kind = 'vendor' AND COALESCE(vendor, '') <> '') OR (kind IS NULL AND suggested_vendor IS NOT NULL)`);
  return [...new Set([...rows.map((r) => r.vendor), ...settings.marketplaces])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// GET /api/ledgers/settings
async function getSettings(req, res, next) {
  try {
    const settings = await loadSettings(db);
    res.json({ ...settings, known_marketplaces: await knownMarketplaces(settings) });
  } catch (err) { next(err); }
}

// PUT /api/ledgers/settings { grace_days?, match_window_days?, amount_tolerance_paise?, default_opening_paise?, marketplaces? }
async function updateSettings(req, res, next) {
  try {
    const body = req.body || {};
    const keys = Object.keys(SETTING_RULES);
    const unknown = Object.keys(body).filter((k) => ![...keys, 'marketplaces'].includes(k));
    if (unknown.length) throw fail(400, `Unknown setting: ${unknown.join(', ')}`);
    const current = await loadSettings(db);
    const merged = { ...Object.fromEntries(keys.map((k) => [k, current[k]])), ...body };
    for (const [k, [min, max, message]] of Object.entries(SETTING_RULES)) {
      if (!Number.isInteger(merged[k]) || merged[k] < min || merged[k] > max) throw fail(400, message);
    }
    let marketplaces = current.marketplaces;
    if ('marketplaces' in body) {
      const known = await knownMarketplaces(current);
      if (!Array.isArray(body.marketplaces) || body.marketplaces.some((v) => !known.includes(v))) throw fail(400, 'Choose marketplaces from the list');
      marketplaces = [...new Set(body.marketplaces)].sort((a, b) => a.localeCompare(b));
    }
    const before = { ...current, marketplaces: current.marketplaces.join(', ') || 'none' };
    const after = { ...merged, marketplaces: marketplaces.join(', ') || 'none' };
    const changes = diffFields(before, after, [...keys, 'marketplaces']);
    if (changes.length) {
      await inTx(async (tx) => {
        await tx.execute({
          sql: `UPDATE ledger_settings SET grace_days = ?, match_window_days = ?, amount_tolerance_paise = ?, default_opening_paise = ?,
                       updated_at = datetime('now'), updated_by = ? WHERE id = 1`,
          args: [merged.grace_days, merged.match_window_days, merged.amount_tolerance_paise, merged.default_opening_paise, req.user.id],
        });
        const gone = current.marketplaces.filter((v) => !marketplaces.includes(v));
        const added = marketplaces.filter((v) => !current.marketplaces.includes(v));
        for (const v of gone) await tx.execute({ sql: 'DELETE FROM ledger_marketplaces WHERE vendor = ?', args: [v] });
        for (const v of added) await tx.execute({ sql: 'INSERT INTO ledger_marketplaces (vendor, added_by) VALUES (?, ?)', args: [v, req.user.id] });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'LEDGER_SETTINGS_UPDATE', description: 'Ledger settings changed', entityType: 'ledger_settings', entityId: 1, changes,
        });
      });
    }
    const settings = await loadSettings(db);
    res.json({ ...settings, known_marketplaces: await knownMarketplaces(settings) });
  } catch (err) { sendError(res, next, err); }
}

module.exports = {
  parties, statement, party, createEntry, updateEntry, deleteEntry, getSettings, updateSettings,
};
