// Purchase Reports: read ROMS's receipts and challans into RAMS's copy
// (migration 022), then bring the purchase records in line with it.
//
// Every ROMS line is its own record (the user, 2026-11-28 evening), listed
// with the rest of its delivery (lines.js groupLines). After the copy is
// written:
//   - a record from before that, one per delivery, stays with one of its
//     lines and keeps its files and history. If anyone had worked on it, each
//     of its other lines gets a record of its own carrying the same work
//     (status, bill check, approvals, files), with a line in its history
//   - a line with no record gets one, and each record follows its line's page,
//     date and delivery (an Incoming No corrected in ROMS moves the line to
//     its new delivery and keeps its record)
//   - a record waiting on a head, or approved, whose line ROMS changed since
//     the bill check becomes "Changed in ROMS": its approvals are cleared, the
//     change is audited, and it goes back to the bill check (the user's rule)
//   - a record whose line is gone is "Removed in ROMS" if anyone worked on it
//     (a bill check or a file), else it is dropped
//   - a removed record whose line comes back returns to the bill check
//
// It reads ROMS when a page is opened and the copy is older than FRESH_MINUTES,
// when someone presses Refresh, and after each matching run. A short lease
// keeps two from reading at once. It never throws for ROMS's sake: the result
// and roms_refresh say how it went, and the pages carry on with the copy.
const { createRomsClient, romsSettings } = require('../services/romsClient');
const { storeResource } = require('../services/romsRefs');
const {
  groupLines, linesOf, diffSnapshot, recordLabel, deliveryLabel,
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

// The columns a record's work is kept in, copied to each line's own record
// when a record from before per-line records is split.
const WORK_COLS = ['status', 'checked_by', 'checked_at', 'check_note', 'purchase_approved_by', 'purchase_approved_at',
  'accounts_approved_by', 'accounts_approved_at', 'sent_back_by', 'sent_back_at', 'sent_back_step', 'sent_back_reason',
  'changed_at', 'changes'];

// The one line a group holds, and its key in a bill check's snapshot (r12 / c7).
const lineOf = (g) => g.receipts[0] || g.challans[0];
const snapKeyOf = (g) => linesOf(g)[0].key;

// The part of a bill check's snapshot that is this one line.
function snapshotFor(snapshot, snapKey) {
  const s = parse(snapshot);
  return s ? JSON.stringify({ lines: (s.lines || []).filter((l) => l.key === snapKey) }) : null;
}

// A system audit row on the record that holds this key (its id isn't known
// yet, in the batch that creates it).
const auditByKey = ({ actionType, description, key }) => ({
  sql: `INSERT INTO audit_logs (user_id, action_type, description, entity_type, entity_id, entity_ref, changes)
        SELECT NULL, ?, ?, 'purchase_records', id, NULL, NULL FROM purchase_records WHERE group_key = ?`,
  args: [actionType, description, key],
});

// Bring purchase_records in line with the copy. Returns what it did.
async function regroup(client) {
  const [receipts, challans, records, fileCounts, histories] = await Promise.all([
    rowsOf(client, 'SELECT * FROM roms_purchase_receipts'),
    rowsOf(client, 'SELECT * FROM roms_purchase_challans'),
    rowsOf(client, 'SELECT * FROM purchase_records'),
    rowsOf(client, 'SELECT record_id, COUNT(*) AS n FROM purchase_files GROUP BY record_id'),
    rowsOf(client, "SELECT DISTINCT entity_id FROM audit_logs WHERE entity_type = 'purchase_records'"),
  ]);
  const groups = groupLines(receipts, challans);
  const files = new Map(fileCounts.map((r) => [Number(r.record_id), Number(r.n)]));
  const withHistory = new Set(histories.map((r) => Number(r.entity_id)));
  const byKey = new Map(records.map((r) => [r.group_key, r]));
  const byId = new Map(records.map((r) => [Number(r.id), r]));
  // Anyone did anything on it: a recalled line is back To check with no
  // stamps, but it has a history, so it is marked Removed, never dropped.
  const worked = (rec) => rec.status !== 'to_check' || Boolean(rec.checked_at) || Boolean(rec.check_note)
    || Boolean(files.get(Number(rec.id))) || withHistory.has(Number(rec.id));
  const out = {
    created: 0, split: 0, changed: 0, removed: 0, dropped: 0, back: 0,
  };
  const stmts = [];

  // 1. A record from when a record was a whole delivery: it stays with the
  //    line whose key it already has, else its first line, keeping its id,
  //    files and history. If anyone worked on it, each of its other lines
  //    gets a record carrying the same work. Untouched lines get theirs in 2.
  const heldBy = new Map(); // record id -> [group]
  for (const g of groups.values()) {
    const owner = lineOf(g).record_id;
    if (owner == null || !byId.has(Number(owner))) continue;
    if (!heldBy.has(Number(owner))) heldBy.set(Number(owner), []);
    heldBy.get(Number(owner)).push(g);
  }
  const copied = new Set();
  for (const [id, gs] of heldBy) {
    const rec = byId.get(id);
    if (gs.length === 1 && gs[0].key === rec.group_key) continue;
    gs.sort((a, b) => Number(lineOf(a).id) - Number(lineOf(b).id) || a.kind.localeCompare(b.kind));
    const keeper = gs.find((g) => g.key === rec.group_key) || gs.find((g) => !byKey.has(g.key));
    if (!keeper) continue; // each of its lines already has a record
    const wasWorked = worked(rec);
    const oldLabel = deliveryLabel(rec.kind, gs.flatMap((g) => linesOf(g)));
    const oldSnapshot = rec.snapshot;
    byKey.delete(rec.group_key);
    rec.group_key = keeper.key;
    byKey.set(keeper.key, rec);
    rec.snapshot = wasWorked ? snapshotFor(oldSnapshot, snapKeyOf(keeper)) : rec.snapshot;
    stmts.push({
      sql: "UPDATE purchase_records SET group_key = ?, snapshot = ?, updated_at = datetime('now') WHERE id = ?",
      args: [rec.group_key, rec.snapshot ?? null, id],
    });
    out.split += 1;
    if (!wasWorked) continue;
    const others = gs.filter((g) => g !== keeper && !byKey.has(g.key));
    for (const g of others) {
      const cols = ['page', 'kind', 'group_key', 'first_at', 'delivery_key', 'delivery_at', 'snapshot', ...WORK_COLS];
      stmts.push({
        sql: `INSERT INTO purchase_records (${cols.join(', ')}) VALUES (${marks(cols.length)})`,
        args: [g.page, g.kind, g.key, g.first_at, g.delivery_key, g.delivery_at, snapshotFor(oldSnapshot, snapKeyOf(g)), ...WORK_COLS.map((c) => rec[c] ?? null)],
      });
      stmts.push({
        sql: `INSERT INTO purchase_files (blob_id, record_id, file_name, kind, original_size, uploaded_by, uploaded_at)
              SELECT f.blob_id, r.id, f.file_name, f.kind, f.original_size, f.uploaded_by, f.uploaded_at
                FROM purchase_files f JOIN purchase_records r ON r.group_key = ?
               WHERE f.record_id = ? ORDER BY f.id`,
        args: [g.key, id],
      });
      stmts.push(auditByKey({
        actionType: 'PURCHASE_SPLIT',
        description: `Split from ${oldLabel}: each line now has its own record. This line kept that record's files, bill check and approvals`,
        key: g.key,
      }));
      copied.add(g.key);
    }
    stmts.push(auditStmt({
      actionType: 'PURCHASE_SPLIT',
      description: `Split from ${oldLabel}: each line now has its own record, and this one is ${recordLabel(keeper.kind, linesOf(keeper))}`,
      entityId: id,
    }));
  }
  await writeBatches(client, stmts.splice(0));

  // 2. A record for every line that has none.
  const missing = [...groups.values()].filter((g) => !byKey.has(g.key));
  const fresh = missing.filter((g) => !copied.has(g.key));
  await writeBatches(client, fresh.map((g) => ({
    sql: 'INSERT OR IGNORE INTO purchase_records (page, kind, group_key, first_at, delivery_key, delivery_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [g.page, g.kind, g.key, g.first_at, g.delivery_key, g.delivery_at],
  })));
  out.created = fresh.length;
  for (let i = 0; i < missing.length; i += BATCH) {
    const part = missing.slice(i, i + BATCH).map((g) => g.key);
    const rows = await rowsOf(client, `SELECT * FROM purchase_records WHERE group_key IN (${marks(part.length)})`, part);
    for (const r of rows) { byKey.set(r.group_key, r); byId.set(Number(r.id), r); }
  }

  // 3. Each line points at its record, and each record follows its line's
  //    page, kind, date and delivery.
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
    if (rec.page !== g.page || rec.kind !== g.kind || rec.first_at !== g.first_at
        || rec.delivery_key !== g.delivery_key || rec.delivery_at !== g.delivery_at) {
      stmts.push({
        sql: 'UPDATE purchase_records SET page = ?, kind = ?, first_at = ?, delivery_key = ?, delivery_at = ? WHERE id = ?',
        args: [g.page, g.kind, g.first_at, g.delivery_key, g.delivery_at, id],
      });
    }

    const lines = linesOf(g);
    const label = recordLabel(g.kind, lines);
    // Back in ROMS after being removed: to the bill check again.
    if (rec.status === 'removed') {
      const to = rec.checked_at ? 'changed' : 'to_check';
      stmts.push({
        sql: `UPDATE purchase_records SET status = ?, changed_at = datetime('now'), changes = ?, updated_at = datetime('now')
               WHERE id = ? AND status = 'removed'`,
        args: [to, JSON.stringify([{ field: 'Line', old: 'removed in ROMS', new: 'back in ROMS' }]), id],
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

  // 4. Records whose line is gone.
  for (const rec of byId.values()) {
    const id = Number(rec.id);
    if (held.has(id) || rec.status === 'removed') continue;
    if (worked(rec)) {
      stmts.push({
        sql: `UPDATE purchase_records SET status = 'removed', changed_at = datetime('now'), changes = ?, updated_at = datetime('now')
               WHERE id = ? AND status = ?`,
        args: [JSON.stringify([{ field: 'Line', old: 'in ROMS', new: 'removed in ROMS' }]), id, rec.status],
      });
      stmts.push(auditStmt({ actionType: 'PURCHASE_ROMS_REMOVED', description: 'Removed in ROMS — this line was deleted there', entityId: id }));
      out.removed += 1;
    } else {
      stmts.push({
        sql: `DELETE FROM purchase_records WHERE id = ? AND status = 'to_check' AND checked_at IS NULL AND check_note IS NULL
                AND NOT EXISTS (SELECT 1 FROM purchase_files f WHERE f.record_id = purchase_records.id)
                AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_type = 'purchase_records' AND a.entity_id = purchase_records.id)`,
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
