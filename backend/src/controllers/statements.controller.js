const db = require('../config/db');
const { SYNC_FROM } = require('../config/env');
const { logAction, diffFields } = require('../services/auditLog.service');
const { isValidDateString } = require('../utils/dateValidation');
const { todayIst } = require('../matching/load');
const { keyOf } = require('../utils/gstStates');
const { filesFor } = require('../services/files');
const { lastChanges } = require('../services/lastChange');
const {
  loadSettings, loadParties, statementOf, partyDetailOf, attentionOf, monthStart,
} = require('../statements/statement');

// Party Statements: the bill-to-bill statement per party, every row Tally's
// (src/statements/statement.js). Seeing it is statements.view, the settings are
// statements.settings, and files on its rows are /api/files. Every change is
// audited. Nothing here writes to Tally, and nothing is typed here.

const MAX_PAISE = 100000000000; // 100 crore rupees
const ATTENTION_LIMIT = 200;

const fail = (status, message) => Object.assign(new Error(message), { status });
const sendError = (res, next, err) => (err.status && err.status < 500 ? res.status(err.status).json({ message: err.message }) : next(err));
const rowsOf = async (sql, args = []) => (await db.execute({ sql, args })).rows;
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
  if (!party.bill_to_bill) throw fail(400, `Party Statements for ${party.vendor} is coming soon. For now Party Statements covers ${settings.marketplaces.join(', ') || 'no marketplace'}`);
  return party;
}

// ------------------------------------------------------------ parties

// GET /api/statements/parties -- the companies, every marketplace (those Party Statements
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
    const attention = await attentionOf(db, { parties: list });
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

// GET /api/statements?company_id&vendor&states&parties&from&to --
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
    if (vendor !== 'all' && !settings.marketplaces.includes(vendor)) throw fail(400, `Party Statements for ${vendor} is coming soon`);
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

// GET /api/statements/party?company_id&ledger_guid&from&to -- one party's range,
// with the files on each Tally voucher.
async function party(req, res, next) {
  try {
    const q = req.query;
    const today = todayIst();
    if (!q.company_id || !q.ledger_guid) throw fail(400, 'Choose a party');
    const p = await billToBillParty(q.company_id, q.ledger_guid);
    const { from, to } = rangeIn(q, today);
    const detail = await partyDetailOf(db, {
      party: p, from, to, today,
    });
    const [found, changes] = await Promise.all([
      filesFor(db, { vouchers: detail.vouchers.map((v) => [p.company_id, v.guid]) }),
      lastChanges(db, 'tally_vouchers', detail.vouchers.map((v) => v.id)),
    ]);
    // last_change: the last file a person added to or removed from the voucher.
    detail.vouchers = detail.vouchers.map((v) => ({
      ...v, files: found.voucher(p.company_id, v.guid), last_change: changes.get(String(v.id)) || null,
    }));
    res.json(detail);
  } catch (err) { sendError(res, next, err); }
}

// ------------------------------------------------------------ settings

// Which marketplaces Party Statements covers (marketplaces) and the placeholder opening.
const SETTING_RULES = {
  default_opening_paise: [-MAX_PAISE, MAX_PAISE, 'The placeholder opening is too large'],
};

// The marketplaces a party ledger is mapped (or suggested) to, and any
// already on the list.
async function knownMarketplaces(settings) {
  const rows = await rowsOf(`SELECT DISTINCT CASE WHEN kind = 'vendor' THEN vendor ELSE suggested_vendor END AS vendor
                               FROM party_ledgers WHERE (kind = 'vendor' AND COALESCE(vendor, '') <> '') OR (kind IS NULL AND suggested_vendor IS NOT NULL)`);
  return [...new Set([...rows.map((r) => r.vendor), ...settings.marketplaces])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// GET /api/statements/settings
async function getSettings(req, res, next) {
  try {
    const settings = await loadSettings(db);
    res.json({ ...settings, known_marketplaces: await knownMarketplaces(settings) });
  } catch (err) { next(err); }
}

// PUT /api/statements/settings { default_opening_paise?, marketplaces? }
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
          sql: "UPDATE statement_settings SET default_opening_paise = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1",
          args: [merged.default_opening_paise, req.user.id],
        });
        const gone = current.marketplaces.filter((v) => !marketplaces.includes(v));
        const added = marketplaces.filter((v) => !current.marketplaces.includes(v));
        for (const v of gone) await tx.execute({ sql: 'DELETE FROM statement_marketplaces WHERE vendor = ?', args: [v] });
        for (const v of added) await tx.execute({ sql: 'INSERT INTO statement_marketplaces (vendor, added_by) VALUES (?, ?)', args: [v, req.user.id] });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'STATEMENT_SETTINGS_UPDATE', description: 'Statement settings changed', entityType: 'statement_settings', entityId: 1, changes,
        });
      });
    }
    const settings = await loadSettings(db);
    res.json({ ...settings, known_marketplaces: await knownMarketplaces(settings) });
  } catch (err) { sendError(res, next, err); }
}

module.exports = {
  parties, statement, party, getSettings, updateSettings,
};
