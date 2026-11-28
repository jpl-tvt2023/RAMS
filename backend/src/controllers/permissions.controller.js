const db = require('../config/db');
const { logAction } = require('../services/auditLog.service');
const {
  CATALOG, GRANTABLE_ROLES, loadMatrix, validateMatrix,
} = require('../services/permissions');

// Admin -> Roles & permissions: what Accountants and Viewers may do. Admin and
// Owner always hold every permission and are shown that way, not stored.

async function lastChange(client) {
  const { rows } = await client.execute(
    `SELECT p.updated_at, u.name AS updated_by_name FROM role_permissions p
       LEFT JOIN users u ON u.id = p.updated_by
      WHERE p.updated_by IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1`,
  );
  return rows[0] || { updated_at: null, updated_by_name: null };
}

// Each permission's last change by a person, for either role, from the audit
// trail: { key: { user_name, at } }. A removal leaves no role_permissions row,
// so the stamp columns can't say this. Each change names its key (from now
// on); older rows are matched by "Role: label".
async function lastChangesByKey(client) {
  const { rows } = await client.execute(
    `SELECT a.changes, a.timestamp, u.name AS user_name, u.username FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.action_type = 'ROLE_PERMISSIONS_UPDATE' AND a.user_id IS NOT NULL AND a.changes IS NOT NULL
      ORDER BY a.id DESC`,
  );
  const byField = new Map();
  for (const role of GRANTABLE_ROLES) for (const p of CATALOG) byField.set(`${role}: ${p.label}`, p.key);
  const out = {};
  for (const r of rows) {
    let changes = [];
    try { changes = JSON.parse(r.changes) || []; } catch { changes = []; }
    for (const c of changes) {
      const key = c.key || byField.get(c.field);
      if (key && !out[key]) out[key] = { user_name: r.user_name || r.username || null, at: r.timestamp };
    }
  }
  return out;
}

async function view(client) {
  const [stamp, matrix, lastChanges] = await Promise.all([
    lastChange(client), loadMatrix(client), lastChangesByKey(client),
  ]);
  // The whole grid's last change: the newest audited one (a removal leaves no
  // row to stamp), else the stamp.
  const newest = Object.values(lastChanges).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  const updated_at = newest ? newest.at : stamp.updated_at;
  const updated_by_name = newest ? newest.user_name : stamp.updated_by_name;
  return {
    catalog: CATALOG,
    roles: GRANTABLE_ROLES,
    matrix,
    updated_at: updated_at ?? null,
    updated_by_name: updated_by_name ?? null,
    last_changes: lastChanges,
  };
}

// GET /api/settings/permissions -- Admin/Owner.
async function get(req, res, next) {
  try {
    res.json(await view(db));
  } catch (err) { next(err); }
}

// PUT /api/settings/permissions { roles: { Accountant: [...], Viewer: [...] } }
// -- Admin/Owner. Each role listed gets exactly the keys given.
async function update(req, res, next) {
  try {
    const current = await loadMatrix(db);
    const { matrix, error } = validateMatrix(req.body, current);
    if (error) return res.status(400).json({ message: error });

    const changes = [];
    for (const role of GRANTABLE_ROLES) {
      const before = new Set(current[role]);
      const after = new Set(matrix[role]);
      for (const p of CATALOG) {
        if (before.has(p.key) !== after.has(p.key)) {
          changes.push({
            field: `${role}: ${p.label}`, key: p.key, old: before.has(p.key) ? 'allowed' : 'not allowed', new: after.has(p.key) ? 'allowed' : 'not allowed',
          });
        }
      }
    }
    if (changes.length) {
      const tx = await db.transaction('write');
      try {
        for (const role of GRANTABLE_ROLES) {
          const before = new Set(current[role]);
          const after = new Set(matrix[role]);
          for (const key of before) {
            if (!after.has(key)) await tx.execute({ sql: 'DELETE FROM role_permissions WHERE role = ? AND permission = ?', args: [role, key] });
          }
          for (const key of after) {
            if (!before.has(key)) {
              await tx.execute({
                sql: `INSERT INTO role_permissions (role, permission, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)`,
                args: [role, key, req.user.id],
              });
            }
          }
        }
        // A removal leaves no row behind, so the last change is stamped on
        // every row of the roles that changed.
        const touched = GRANTABLE_ROLES.filter((r) => changes.some((c) => c.field.startsWith(`${r}:`)));
        await tx.execute({
          sql: `UPDATE role_permissions SET updated_at = datetime('now'), updated_by = ?
                 WHERE role IN (${touched.map(() => '?').join(',')})`,
          args: [req.user.id, ...touched],
        });
        await logAction({
          client: tx, userId: req.user.id, actionType: 'ROLE_PERMISSIONS_UPDATE',
          description: `Permissions changed for ${touched.join(' and ')}`,
          entityType: 'role_permissions', entityId: 1, changes,
        });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    }
    res.json(await view(db));
  } catch (err) { next(err); }
}

module.exports = { get, update };
