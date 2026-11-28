// Purchase Reports: read ROMS's receipts and challans into RAMS's copy
// (migration 022), then bring the purchase records in line with it.
//
// After the copy is written, every line is put in its record (lines.js
// groupLines). Then:
//   - a record whose lines all moved to a new key together (an Incoming No
//     corrected in ROMS) is moved to that key, keeping its files and history
//   - a record waiting on a head, or approved, whose lines ROMS changed since
//     the bill check becomes "Changed in ROMS": its approvals are cleared, the
//     change is audited, and it goes back to the bill check (the user's rule)
//   - a record left with no lines is "Removed in ROMS" if anyone worked on it
//     (a bill check or a file), else it is dropped
//   - a removed record whose lines come back returns to the bill check
//
// It reads ROMS when a page is opened and the copy is older than FRESH_MINUTES,
// when someone presses Refresh, and after each matching run. A short lease
// keeps two from reading at once. It never throws for ROMS's sake: the result
// and roms_refresh say how it went, and the pages carry on with the copy.
const { createRomsClient, romsSettings } = require('../services/romsClient');
const { storeResource } = require('../services/romsRefs');
const {
  groupLines, linesOf, snapshotOf, diffSnapshot, recordLabel,
} = require('./lines');

const FRESH_MINUTES = 5;
const LEASE_MINUTES = 2;
const BATCH = 400;

const RECEIPT_COLS = ['id', 'line_id', 'po_id', 'company_id', 'company_name', 'vendor_id', 'vendor_name', 'category', 'item_name',
  'variant', 'po_rate', 'unit_metric', 'received_qty', 'received_rate', 'bill_no', 'incoming_prefix', 'incoming_no', 'stage',
  'warehouse_name', 'goes_to_stitching', 'created_at', 'updated_at'];
const CHALLAN_COLS = ['id', 'challan_no', 'challan_line_no', 'party_name', 'from_stage', 'to_stage', 'parent_src', 'parent_id',
  'incoming_prefix', 'incoming_no', 'origin_receipt_id', 'po_id', 'company_id', 'company_name', 'vendor_id', 'vendor_name',
  'category', 'item_name', 'variant', 'sent_qty', 'sent_dozens', 'received_qty', 'received_dozens', 'process_rate', 'rate_unit',
  'warehouse_name', 'created_at', 'updated_at'];
const SPECS = {
  'purchase-receipts': { table: 'roms_purchase_receipts', key: ['id'], cols: RECEIPT_COLS },
  'purchase-challans': { table: 'roms_purchase_challans', key: ['id'], cols: CHALLAN_COLS },
};

// The statuses in which a ROMS change sends the record back to the bill check.
const WATCHED = ['with_purchase_head', 'with_accounts_head', 'approved'];
const NOT_CONNECTED = 'ROMS isn\'t connected — set ROMS_API_URL and ROMS_INTEGRATION_TOKEN';
const NOT_SERVED = 'ROMS doesn\'t send purchases yet — it needs the ROMS update that adds Purchase Reports';

const marks = (n) => Array(n).fill('?').join(',');
const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;

async function writeBatches(client, stmts) {
  for (let i = 0; i < stmts.length; i += BATCH) await client.batch(stmts.slice(i, i + BATCH), 'write');
}

// The audit row, as a statement for a batch (auditLog.service's logAction shape).
// A system change: no user, so "Last updated by" keeps naming the person.
const auditStmt = ({ actionType, description, entityId, changes }) => ({
  sql: `INSERT INTO audit_logs (user_id, action_type, description, entity_type, entity_id, entity_ref, changes)
        VALUES (NULL, ?, ?, 'purchase_records', ?, NULL, ?)`,
  args: [actionType, description, entityId, changes && changes.length ? JSON.stringify(changes) : null],
});

const parse = (s) => {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
};

// Bring purchase_records in line with the copy. Returns what it did.
async function regroup(client) {
  const [receipts, challans, records, fileCounts] = await Promise.all([
    rowsOf(client, 'SELECT * FROM roms_purchase_receipts'),
    rowsOf(client, 'SELECT * FROM roms_purchase_challans'),
    rowsOf(client, 'SELECT id, group_key, page, kind, status, checked_at, snapshot, first_at FROM purchase_records'),
    rowsOf(client, 'SELECT record_id, COUNT(*) AS n FROM purchase_files GROUP BY record_id'),
  ]);
  const groups = groupLines(receipts, challans);
  const files = new Map(fileCounts.map((r) => [Number(r.record_id), Number(r.n)]));
  const byKey = new Map(records.map((r) => [r.group_key, r]));
  const byId = new Map(records.map((r) => [Number(r.id), r]));
  const out = {
    created: 0, moved: 0, changed: 0, removed: 0, dropped: 0, back: 0,
  };
  const stmts = [];

  // 1. Lines that all moved together to a key nobody holds: move their record.
  for (const [key, g] of groups) {
    if (byKey.has(key)) continue;
    const owners = new Set([...g.receipts, ...g.challans].map((l) => (l.record_id == null ? null : Number(l.record_id))));
    if (owners.size !== 1) continue;
    const [ownerId] = owners;
    const owner = ownerId != null ? byId.get(ownerId) : null;
    if (!owner || groups.has(owner.group_key) || owner.moved) continue;
    owner.moved = true;
    byKey.delete(owner.group_key);
    owner.group_key = key;
    byKey.set(key, owner);
    stmts.push({
      sql: "UPDATE purchase_records SET group_key = ?, page = ?, kind = ?, updated_at = datetime('now') WHERE id = ?",
      args: [key, g.page, g.kind, owner.id],
    });
    out.moved += 1;
  }
  await writeBatches(client, stmts.splice(0));

  // 2. A record for every group that has none.
  const missing = [...groups.values()].filter((g) => !byKey.has(g.key));
  await writeBatches(client, missing.map((g) => ({
    sql: 'INSERT OR IGNORE INTO purchase_records (page, kind, group_key, first_at) VALUES (?, ?, ?, ?)',
    args: [g.page, g.kind, g.key, g.first_at],
  })));
  out.created = missing.length;
  if (missing.length) {
    for (let i = 0; i < missing.length; i += BATCH) {
      const part = missing.slice(i, i + BATCH).map((g) => g.key);
      const rows = await rowsOf(client, `SELECT id, group_key, page, kind, status, checked_at, snapshot, first_at
                                           FROM purchase_records WHERE group_key IN (${marks(part.length)})`, part);
      for (const r of rows) { byKey.set(r.group_key, r); byId.set(Number(r.id), r); }
    }
  }

  // 3. Each line points at its record, and each record's page, kind and date follow its lines.
  const held = new Set();
  for (const [key, g] of groups) {
    const rec = byKey.get(key);
    if (!rec) continue;
    const id = Number(rec.id);
    held.add(id);
    for (const [rows, table] of [[g.receipts, 'roms_purchase_receipts'], [g.challans, 'roms_purchase_challans']]) {
      const stale = rows.filter((l) => Number(l.record_id) !== id).map((l) => Number(l.id));
      for (let i = 0; i < stale.length; i += BATCH) {
        const part = stale.slice(i, i + BATCH);
        stmts.push({ sql: `UPDATE ${table} SET record_id = ? WHERE id IN (${marks(part.length)})`, args: [id, ...part] });
      }
    }
    if (rec.page !== g.page || rec.kind !== g.kind || rec.first_at !== g.first_at) {
      stmts.push({ sql: 'UPDATE purchase_records SET page = ?, kind = ?, first_at = ? WHERE id = ?', args: [g.page, g.kind, g.first_at, id] });
    }

    const lines = linesOf(g);
    const label = recordLabel(g.kind, lines);
    // Back in ROMS after being removed: to the bill check again.
    if (rec.status === 'removed') {
      const to = rec.checked_at ? 'changed' : 'to_check';
      stmts.push({
        sql: `UPDATE purchase_records SET status = ?, changed_at = datetime('now'), changes = ?, updated_at = datetime('now')
               WHERE id = ? AND status = 'removed'`,
        args: [to, JSON.stringify([{ field: 'Lines', old: 'removed in ROMS', new: 'back in ROMS' }]), id],
      });
      stmts.push(auditStmt({ actionType: 'PURCHASE_ROMS_CHANGED', description: `Back in ROMS — ${label}`, entityId: id }));
      out.back += 1;
      continue;
    }
    // Changed in ROMS after its bill check: approvals cleared, back to the check.
    if (WATCHED.includes(rec.status) && parse(rec.snapshot)) {
      const changes = diffSnapshot(parse(rec.snapshot), lines);
      if (changes.length) {
        stmts.push({
          sql: `UPDATE purchase_records SET status = 'changed', changed_at = datetime('now'), changes = ?,
                       purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL,
                       updated_at = datetime('now')
                 WHERE id = ? AND status = ?`,
          args: [JSON.stringify(changes), id, rec.status],
        });
        stmts.push(auditStmt({
          actionType: 'PURCHASE_ROMS_CHANGED',
          description: `Changed in ROMS after its bill check — ${label}. Its approvals were cleared, so it needs a bill check again`,
          entityId: id,
          changes,
        }));
        out.changed += 1;
      }
    } else if (rec.status === 'changed') {
      // Still waiting for the check: keep "what changed" current against the snapshot.
      const changes = diffSnapshot(parse(rec.snapshot), lines);
      stmts.push({ sql: "UPDATE purchase_records SET changes = ? WHERE id = ? AND status = 'changed'", args: [JSON.stringify(changes), id] });
    }
  }

  // 4. Records left with no lines.
  for (const rec of byId.values()) {
    const id = Number(rec.id);
    if (held.has(id) || rec.status === 'removed') continue;
    const worked = rec.status !== 'to_check' || rec.checked_at || files.get(id);
    if (worked) {
      const before = parse(rec.snapshot);
      stmts.push({
        sql: `UPDATE purchase_records SET status = 'removed', changed_at = datetime('now'), changes = ?, updated_at = datetime('now')
               WHERE id = ? AND status = ?`,
        args: [JSON.stringify([{ field: 'Lines', old: before ? `${before.lines.length} line(s)` : null, new: 'removed in ROMS' }]), id, rec.status],
      });
      stmts.push(auditStmt({ actionType: 'PURCHASE_ROMS_REMOVED', description: 'Removed in ROMS — every line of this record was deleted there', entityId: id }));
      out.removed += 1;
    } else {
      stmts.push({
        sql: `DELETE FROM purchase_records WHERE id = ? AND status = 'to_check' AND checked_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM purchase_files f WHERE f.record_id = purchase_records.id)`,
        args: [id],
      });
      out.dropped += 1;
    }
  }
  await writeBatches(client, stmts);
  return out;
}

// Reads ROMS's purchases and refreshes the copy and the records.
async function refreshPurchases(client, { roms, settings = romsSettings() } = {}) {
  if (!roms && !settings.configured) return { ok: false, connected: false, error: NOT_CONNECTED };
  const reader = roms || createRomsClient(settings);
  if (typeof reader.refs !== 'function') return { ok: false, connected: true, error: NOT_SERVED };
  await client.execute('INSERT OR IGNORE INTO roms_refresh (id) VALUES (1)');
  const lease = await rowsOf(client, `UPDATE roms_refresh SET purchases_lease_until = datetime('now', '+${LEASE_MINUTES} minutes'),
                                              purchases_attempt_at = datetime('now')
                                       WHERE id = 1 AND (purchases_lease_until IS NULL OR purchases_lease_until < datetime('now'))
                                       RETURNING id`);
  if (!lease.length) return { ok: false, connected: true, busy: true, error: 'ROMS is being read already' };
  try {
    let receipts;
    let challans;
    try {
      receipts = await reader.refs('purchase-receipts');
      challans = await reader.refs('purchase-challans');
    } catch (e) {
      throw e.status === 404 ? new Error(NOT_SERVED) : e;
    }
    const counts = {
      receipts: await storeResource(client, 'purchase-receipts', receipts, SPECS['purchase-receipts']),
      challans: await storeResource(client, 'purchase-challans', challans, SPECS['purchase-challans']),
    };
    counts.records = await regroup(client);
    await client.execute({
      sql: `UPDATE roms_refresh SET purchases_ok_at = datetime('now'), purchases_error = NULL, purchases_counts = ?,
                   purchases_lease_until = NULL WHERE id = 1`,
      args: [JSON.stringify(counts)],
    });
    return { ok: true, connected: true, counts };
  } catch (e) {
    await client.execute({
      sql: 'UPDATE roms_refresh SET purchases_error = ?, purchases_lease_until = NULL WHERE id = 1',
      args: [String(e.message).slice(0, 500)],
    });
    return { ok: false, connected: true, error: e.message };
  }
}

// When ROMS was last read, for the pages' "Read from ROMS at ..." line.
async function purchasesState(client) {
  const [r] = await rowsOf(client, 'SELECT purchases_ok_at, purchases_error, purchases_counts FROM roms_refresh WHERE id = 1');
  return {
    connected: romsSettings().configured,
    read_at: r?.purchases_ok_at ?? null,
    error: r?.purchases_error ?? null,
  };
}

// Read ROMS first when a page opens, if the copy is older than FRESH_MINUTES
// and ROMS wasn't tried in the last RETRY_MINUTES (so a ROMS that is down is
// not asked again on every page load). Quick: one try, PAGE_TIMEOUT_MS -- the
// page shows the copy and the error if ROMS is slow.
const RETRY_MINUTES = 1;
const PAGE_TIMEOUT_MS = 10000;
async function ensureFresh(client, { settings = romsSettings(), roms } = {}) {
  if (!roms && !settings.configured) return null;
  const [r] = await rowsOf(client, `SELECT COALESCE(purchases_ok_at >= datetime('now', '-${FRESH_MINUTES} minutes'), 0)
                                           OR COALESCE(purchases_attempt_at >= datetime('now', '-${RETRY_MINUTES} minutes'), 0) AS skip
                                      FROM roms_refresh WHERE id = 1`);
  if (r && Number(r.skip) === 1) return null;
  return refreshPurchases(client, { roms: roms || createRomsClient({ ...settings, timeoutMs: PAGE_TIMEOUT_MS, retries: 0 }) });
}

module.exports = {
  refreshPurchases, regroup, purchasesState, ensureFresh, SPECS, FRESH_MINUTES, NOT_SERVED,
};
