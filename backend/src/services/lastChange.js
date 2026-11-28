// "Last updated by": the last change a PERSON made in RAMS to each record,
// read from the audit trail (audit_logs). Rows no signed-in user wrote (the
// Connector, the first-Admin bootstrap, a reset) and sign-ins are left out, so
// it is always who changed the record and when.
//
//   lastChanges(client, entityType, keys, { by })
//     by 'id'  -- keys are audit_logs.entity_id (numeric record ids)
//     by 'ref' -- keys are audit_logs.entity_ref (text keys: a vendor, a PO id)
//   -> Map(String(key) -> { user_name, at, action_type, description })
//
// It reads the entity's (entity_type, entity_id|entity_ref) index and takes the
// newest row per key.

const CHUNK = 400;
const NOT_CHANGES = ['LOGIN', 'LOGIN_FAILED'];

const marks = (n) => Array(n).fill('?').join(',');
const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

async function lastChanges(client, entityType, keys, { by = 'id' } = {}) {
  const out = new Map();
  const column = by === 'ref' ? 'entity_ref' : 'entity_id';
  const list = [...new Set((keys || []).filter((k) => k != null && k !== '').map((k) => (by === 'ref' ? String(k) : Number(k))))];
  for (const part of chunks(list)) {
    const { rows } = await client.execute({
      sql: `
      SELECT a.${column} AS k, a.timestamp, a.action_type, a.description, u.name AS user_name, u.username
        FROM audit_logs a
        JOIN (SELECT ${column} AS k, MAX(id) AS id FROM audit_logs
               WHERE entity_type = ? AND user_id IS NOT NULL AND action_type NOT IN (${marks(NOT_CHANGES.length)})
                 AND ${column} IN (${marks(part.length)})
               GROUP BY ${column}) m ON m.id = a.id
        LEFT JOIN users u ON u.id = a.user_id`,
      args: [entityType, ...NOT_CHANGES, ...part],
    });
    for (const r of rows) {
      out.set(String(r.k), {
        user_name: r.user_name || r.username || null, at: r.timestamp, action_type: r.action_type, description: r.description,
      });
    }
  }
  return out;
}

module.exports = { lastChanges };
