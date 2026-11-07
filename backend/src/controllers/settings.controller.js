const db = require('../config/db');
const { logAction, diffFields } = require('../services/auditLog.service');
const { loadSettings, shape, validate } = require('../services/syncSettings');
const { loadNarrationRule } = require('../services/narration');
const { isValidDateString } = require('../utils/dateValidation');
const { SYNC_FROM } = require('../config/env');

// The sync schedule: when the Connector syncs (office hours, the light sync
// interval, the end-of-day check). Set here (sync.schedule permission) rather than
// in a file on the office PC; the Connector picks it up from its next
// heartbeat, within a minute.

// GET /api/settings/sync -- all roles.
async function getSync(req, res, next) {
  try {
    res.json(shape(await loadSettings(db)));
  } catch (err) { next(err); }
}

// PUT /api/settings/sync -- the sync.schedule permission. Any subset of the fields.
async function updateSync(req, res, next) {
  try {
    const current = await loadSettings(db);
    const { values, error } = validate(req.body || {}, current);
    if (error) return res.status(400).json({ message: error });
    const changes = diffFields(current, values, Object.keys(values));
    if (changes.length) {
      const tx = await db.transaction('write');
      try {
        await tx.execute({
          sql: `UPDATE sync_settings SET ${Object.keys(values).map((k) => `${k} = ?`).join(', ')},
                  updated_at = datetime('now'), updated_by = ? WHERE id = 1`,
          args: [...Object.values(values), req.user.id],
        });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'SYNC_SETTINGS_UPDATE',
          description: 'Sync schedule changed', entityType: 'sync_settings', entityId: 1, changes,
        });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
    res.json(shape(await loadSettings(db)));
  } catch (err) { next(err); }
}

// ------------------------------------------------------------ narration check

// The Tally base types a rule may name: the accounting ones, and any other
// RAMS has seen.
const ACCOUNTING_TYPES = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Contra', 'Journal', 'Credit Note', 'Debit Note'];

// The rule, with how many records of each base type have no narration -- all
// of them, and those the rule's date counts.
async function narrationData() {
  const rule = await loadNarrationRule(db);
  const { rows } = await db.execute({
    sql: `SELECT v.base_type, COUNT(*) AS total,
                 SUM(CASE WHEN v.narration IS NULL OR TRIM(v.narration) = '' THEN 1 ELSE 0 END) AS without,
                 SUM(CASE WHEN (v.narration IS NULL OR TRIM(v.narration) = '') AND v.date >= ? THEN 1 ELSE 0 END) AS without_from
            FROM tally_vouchers v JOIN tally_companies c ON c.id = v.company_id
           WHERE c.sync_enabled = 1 AND v.deleted_at IS NULL AND v.is_cancelled = 0 AND v.date >= ?
           GROUP BY v.base_type`,
    args: [rule.required_from || SYNC_FROM, SYNC_FROM],
  });
  const seen = new Map(rows.map((r) => [r.base_type, r]));
  const types = [...new Set([...ACCOUNTING_TYPES, ...seen.keys()])];
  return {
    types: rule.types,
    required_from: rule.required_from,
    sync_from: SYNC_FROM,
    base_types: types.map((t) => ({
      base_type: t,
      total: Number(seen.get(t)?.total || 0),
      without: Number(seen.get(t)?.without || 0),
      without_from: Number(seen.get(t)?.without_from || 0),
      required: !rule.types || rule.types.includes(t),
    })),
    updated_at: rule.updated_at,
    updated_by_name: rule.updated_by_name,
  };
}

// GET /api/settings/narration -- all roles.
async function getNarration(req, res, next) {
  try { res.json(await narrationData()); } catch (err) { next(err); }
}

// PUT /api/settings/narration { types: null | [base types], required_from } --
// the narration.settings permission. types null (or every type) means all.
async function updateNarration(req, res, next) {
  try {
    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !['types', 'required_from'].includes(k));
    if (unknown.length) return res.status(400).json({ message: `Unknown setting: ${unknown.join(', ')}` });
    const current = await narrationData();
    const known = current.base_types.map((t) => t.base_type);
    let types = 'types' in body ? body.types : current.types;
    if (types !== null) {
      if (!Array.isArray(types) || types.some((t) => !known.includes(t))) {
        return res.status(400).json({ message: 'Choose voucher types from the list' });
      }
      if (!types.length) return res.status(400).json({ message: 'Choose at least one voucher type' });
      types = known.filter((t) => types.includes(t));
      if (types.length === known.length) types = null;
    }
    const from = 'required_from' in body ? body.required_from : current.required_from;
    if (!isValidDateString(from)) return res.status(400).json({ message: 'The date must be YYYY-MM-DD' });
    const before = { types: current.types ? current.types.join(', ') : 'every type', required_from: current.required_from };
    const after = { types: types ? types.join(', ') : 'every type', required_from: from };
    const changes = diffFields(before, after, ['types', 'required_from']);
    if (changes.length) {
      const tx = await db.transaction('write');
      try {
        await tx.execute({
          sql: "UPDATE narration_settings SET types = ?, required_from = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1",
          args: [types ? JSON.stringify(types) : null, from, req.user.id],
        });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'NARRATION_SETTINGS_UPDATE',
          description: 'Narration check changed', entityType: 'narration_settings', entityId: 1, changes,
        });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
    res.json(await narrationData());
  } catch (err) { next(err); }
}

module.exports = {
  getSync, updateSync, getNarration, updateNarration,
};
