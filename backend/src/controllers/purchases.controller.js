const db = require('../config/db');
const { logAction } = require('../services/auditLog.service');
const files = require('../services/files');
const { cleanName, disposition, pickedSize } = require('./files.controller');
const { listRecords, readRecord, currentLines } = require('../purchases/records');
const { ensureFresh, refreshPurchases, purchasesState } = require('../purchases/refresh');
const {
  saveCheck, saveChecks, approve, sendBack, recall, WITH_CHECKER,
} = require('../purchases/approval');
const { hasPermission } = require('../services/permissions');
const { recordLabel } = require('../purchases/lines');

// Purchase Reports -> Warehouse and Stitching (src/purchases/*). Seeing the
// pages and their files is purchases.view; the bill check and the files are
// purchases.check; each head's step is its own permission (routes).

const fail = (status, message) => Object.assign(new Error(message), { status });
const sendError = (res, next, err) => (err.status && err.status < 500 ? res.status(err.status).json({ message: err.message }) : next(err));
const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;

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

// GET /api/purchases/:page/records?company_id&fy&month&status&q&page&page_size
// Reads ROMS first when the copy is more than a few minutes old.
async function list(req, res, next) {
  try {
    await ensureFresh(db);
    const out = await listRecords(db, req.params.page, req.query);
    res.json({ ...out, roms: await purchasesState(db) });
  } catch (err) { sendError(res, next, err); }
}

// GET /api/purchases/records/:id -- with its delivery's lines (delivery_lines).
async function one(req, res, next) {
  try {
    const r = await readRecord(db, req.params.id, { delivery: true });
    if (!r) throw fail(404, 'That purchase record isn’t in RAMS');
    res.json(r);
  } catch (err) { sendError(res, next, err); }
}

// POST /api/purchases/refresh -- read ROMS now.
async function refresh(req, res, next) {
  try {
    const out = await refreshPurchases(db);
    res.json({ ...out, roms: await purchasesState(db) });
  } catch (err) { sendError(res, next, err); }
}

// POST /api/purchases/records/:id/check { note? }
async function check(req, res, next) {
  try {
    const out = await saveCheck(db, req.params.id, req.user, req.body || {});
    res.json(await readRecord(db, out.id));
  } catch (err) { sendError(res, next, err); }
}

// POST /api/purchases/check { ids: [...], note? } -- one bill check on several
// lines of a delivery. A single line that can't be checked is a 409.
async function checkMany(req, res, next) {
  try {
    const { ids, note } = req.body || {};
    const out = await saveChecks(db, ids, req.user, { note });
    if (!out.checked && Array.isArray(ids) && ids.length === 1 && out.skipped.length) {
      return res.status(409).json({ message: out.skipped[0].reason, ...out });
    }
    return res.json(out);
  } catch (err) { return sendError(res, next, err); }
}

// POST /api/purchases/{purchase,accounts}-head/approve { ids: [...] }
const approveAt = (step) => async (req, res, next) => {
  try {
    const ids = (req.body || {}).ids;
    const out = await approve(db, ids, step, req.user);
    if (!out.approved && Array.isArray(ids) && ids.length === 1 && out.skipped.length) {
      return res.status(409).json({ message: out.skipped[0].reason, ...out });
    }
    return res.json(out);
  } catch (err) { return sendError(res, next, err); }
};

// POST /api/purchases/recall { items: [{ id, from }] } -- take lines back one
// step before the next person acts: from the Purchase Head (purchases.check)
// or the Purchase Head's approval from the Accountant Head
// (purchases.approve_purchase). A single line that can't be recalled is a 409.
async function recallMany(req, res, next) {
  try {
    const { items } = req.body || {};
    const [check, purchase] = await Promise.all([
      hasPermission(db, req.user?.roles, 'purchases.check'),
      hasPermission(db, req.user?.roles, 'purchases.approve_purchase'),
    ]);
    const out = await recall(db, items, req.user, { check, purchase });
    if (!out.recalled && Array.isArray(items) && items.length === 1 && out.skipped.length) {
      return res.status(409).json({ message: out.skipped[0].reason, ...out });
    }
    return res.json(out);
  } catch (err) { return sendError(res, next, err); }
}

// POST /api/purchases/records/:id/{purchase,accounts}-head/send-back { reason }
// -- also on a line that head (or the next) already approved.
const sendBackAt = (step) => async (req, res, next) => {
  try {
    const out = await sendBack(db, req.params.id, step, req.user, req.body || {});
    res.json(await readRecord(db, out.id));
  } catch (err) { sendError(res, next, err); }
};

// ---------------------------------------------------------------- files

// The record a file goes on, while the checker has it. Files are locked once
// the bill check is saved, so the heads approve exactly what they saw.
async function recordForFiles(client, id) {
  const [r] = await rowsOf(client, 'SELECT id, kind, status FROM purchase_records WHERE id = ?', [Number(id) || 0]);
  if (!r) throw fail(404, 'That purchase record isn’t in RAMS');
  if (!WITH_CHECKER.includes(r.status)) {
    throw fail(409, r.status === 'removed'
      ? 'This record was removed in ROMS, so its files can no longer change'
      : 'The files are locked once the line is sent for approval. Recall it, or ask the Purchase Head to send it back, to change them');
  }
  const label = recordLabel(r.kind, await currentLines(client, r.id));
  return { id: Number(r.id), label };
}

// The other records an upload or a removal also applies to (?also=12,13: the
// lines of the delivery the checker ticked), without the record itself.
const ALSO_MAX = 50;
function alsoOf(value, selfId) {
  if (value == null || value === '') return [];
  const ids = [...new Set(String(value).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0))]
    .filter((n) => n !== Number(selfId));
  if (ids.length > ALSO_MAX) throw fail(400, `Choose at most ${ALSO_MAX} lines at a time`);
  return ids;
}

// Puts a stored blob on one record, with its audit row. Returns the new file's
// id, or throws (409) why it can't go on.
async function attachBlob(tx, rec, blob, name, req) {
  const [{ n }] = await rowsOf(tx, 'SELECT COUNT(*) AS n FROM purchase_files WHERE record_id = ?', [rec.id]);
  if (Number(n) >= files.MAX_PER_ROW) throw fail(409, `A line can have at most ${files.MAX_PER_ROW} files. Remove one first.`);
  const [dup] = await rowsOf(tx, 'SELECT file_name FROM purchase_files WHERE blob_id = ? AND record_id = ?', [blob.blobId, rec.id]);
  if (dup) throw fail(409, `This file is already on ${rec.label}${dup.file_name !== name ? `, as “${dup.file_name}”` : ''}`);
  const r = await tx.execute({
    sql: `INSERT INTO purchase_files (blob_id, record_id, file_name, kind, original_size, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [blob.blobId, rec.id, name, blob.kind, pickedSize(req.query.original_size), req.user.id],
  });
  await logAction({
    client: tx,
    userId: req.user.id,
    actionType: 'FILE_ADD',
    description: `File added — ${name} on ${rec.label}`,
    entityType: 'purchase_records',
    entityId: rec.id,
  });
  return Number(r.lastInsertRowid);
}

// POST /api/purchases/records/:id/files?name&gzip=1&original_size&also=12,13 --
// the body is the file. Stored once, it goes on the record and on each `also`
// line the checker still has; a line it can't go on is skipped with the reason.
async function uploadFile(req, res, next) {
  try {
    const q = req.query;
    const name = cleanName(q.name);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'Send the file itself as the request body');
    const also = alsoOf(q.also, req.params.id);
    const out = await inTx(async (tx) => {
      const rec = await recordForFiles(tx, req.params.id);
      const blob = await files.storeBlob(tx, { bytes: req.body, gzip: q.gzip === '1' }, name);
      const id = await attachBlob(tx, rec, blob, name, req);
      const added = [];
      const skipped = [];
      for (const otherId of also) {
        try {
          added.push({ record_id: otherId, id: await attachBlob(tx, await recordForFiles(tx, otherId), blob, name, req) });
        } catch (err) {
          if (!err.status || err.status >= 500) throw err;
          skipped.push({ id: otherId, reason: err.message });
        }
      }
      const [row] = await rowsOf(tx, 'SELECT uploaded_at FROM purchase_files WHERE id = ?', [id]);
      return {
        id,
        name,
        kind: blob.kind,
        size: blob.size,
        uploaded_by_name: req.user.name || req.user.username,
        uploaded_at: row.uploaded_at,
        stored_once: blob.reused,
        store: 'purchase',
        also: { added, skipped },
      };
    });
    res.status(201).json(out);
  } catch (err) { sendError(res, next, err); }
}

// GET /api/purchases/files/:id -- the stored bytes, as /api/files/:id sends them.
async function downloadFile(req, res, next) {
  try {
    const f = await files.readFile(db, req.params.id, { table: 'purchase_files' });
    if (!f) throw fail(404, 'That file isn’t there any more');
    res.set({
      'Content-Type': f.mime,
      'Content-Length': String(f.body.length),
      'Content-Disposition': disposition(f.name),
      'Cache-Control': 'private, no-store',
    });
    if (f.encoding === 'gzip') res.set('Content-Encoding', 'gzip');
    res.end(f.body);
  } catch (err) { sendError(res, next, err); }
}

// DELETE /api/purchases/files/:id?also=12,13 -- takes the file off its record,
// and the same file off each `also` line that has it and that the checker
// still has (a line it can't come off is skipped with the reason).
async function removeFile(req, res, next) {
  try {
    const id = Number(req.params.id) || 0;
    const [f] = await rowsOf(db, 'SELECT id, record_id, blob_id, file_name FROM purchase_files WHERE id = ?', [id]);
    if (!f) throw fail(404, 'That file isn’t there any more');
    const also = alsoOf(req.query.also, f.record_id);
    const out = await inTx(async (tx) => {
      const takeOff = async (fileId, fileName, recordId) => {
        const rec = await recordForFiles(tx, recordId);
        await files.unlink(tx, fileId, { table: 'purchase_files' });
        await logAction({
          client: tx,
          userId: req.user.id,
          actionType: 'FILE_REMOVE',
          description: `File removed — ${fileName} from ${rec.label}`,
          entityType: 'purchase_records',
          entityId: rec.id,
        });
      };
      await takeOff(id, f.file_name, f.record_id);
      const removed = [];
      const skipped = [];
      for (const otherId of also) {
        const [same] = await rowsOf(tx, 'SELECT id, file_name FROM purchase_files WHERE record_id = ? AND blob_id = ?', [otherId, f.blob_id]);
        if (!same) continue;
        try {
          await takeOff(Number(same.id), same.file_name, otherId);
          removed.push({ record_id: otherId, id: Number(same.id) });
        } catch (err) {
          if (!err.status || err.status >= 500) throw err;
          skipped.push({ id: otherId, reason: err.message });
        }
      }
      return { removed, skipped };
    });
    res.json({ id, removed: true, also: out });
  } catch (err) { sendError(res, next, err); }
}

module.exports = {
  list,
  one,
  refresh,
  check,
  checkMany,
  recallMany,
  approvePurchase: approveAt('purchase'),
  approveAccounts: approveAt('accounts'),
  sendBackPurchase: sendBackAt('purchase'),
  sendBackAccounts: sendBackAt('accounts'),
  uploadFile,
  downloadFile,
  removeFile,
};
