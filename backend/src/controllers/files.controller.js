const db = require('../config/db');
const { SYNC_FROM } = require('../config/env');
const { logAction } = require('../services/auditLog.service');
const files = require('../services/files');

// Files on Tally vouchers (services/files.js), added on Party Statements and Attachments.
// Adding and removing is statements.files; viewing and downloading is
// statements.view or reports.view; the storage figures are Admin and Owner only.
// Every add and remove is audited on the voucher.

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

// The name as picked, without any folder, quotes or control characters, and
// at most 200 characters (keeping the end, so the extension stays).
function cleanName(value) {
  const s = String(value || '').split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f"]/g, '') // eslint-disable-line no-control-regex
    .trim()
    .slice(-200);
  if (!s) throw fail(400, 'Give the file a name');
  return s;
}

// The size of the file as the person picked it, before a photo was shrunk.
function pickedSize(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 1024 * 1048576 ? n : null;
}

// The row a file goes on: a Tally voucher of the company.
// { where, args, label, entityType, entityId, ref }.
async function targetOf(client, { companyId, voucherGuid }) {
  const [v] = await rowsOf(client, `SELECT id, voucher_type, number, party FROM tally_vouchers
                                     WHERE company_id = ? AND guid = ? AND deleted_at IS NULL`, [companyId, voucherGuid]);
  if (!v) throw fail(404, 'That Tally voucher isn’t in RAMS’s copy of Tally');
  return {
    where: 'company_id = ? AND voucher_guid = ?',
    args: [companyId, voucherGuid],
    label: `${v.voucher_type} ${v.number || ''}`.trim(),
    entityType: 'tally_vouchers',
    entityId: Number(v.id),
    ref: v.party || null,
  };
}

// POST /api/files?company_id&voucher_guid&name&gzip=1&original_size
// The body is the file itself (application/octet-stream), gzip when gzip=1.
async function upload(req, res, next) {
  try {
    const q = req.query;
    const name = cleanName(q.name);
    const companyId = Number(q.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) throw fail(400, 'Choose the company');
    const voucherGuid = q.voucher_guid ? String(q.voucher_guid) : null;
    if (!voucherGuid) throw fail(400, 'Files go on a Tally row: name the voucher the file is for');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail(400, 'Send the file itself as the request body');
    const target = await targetOf(db, { companyId, voucherGuid });

    const out = await inTx(async (tx) => {
      const [{ n }] = await rowsOf(tx, `SELECT COUNT(*) AS n FROM voucher_files WHERE ${target.where}`, target.args);
      if (Number(n) >= files.MAX_PER_ROW) throw fail(409, `A row can have at most ${files.MAX_PER_ROW} files. Remove one first.`);
      const blob = await files.storeBlob(tx, { bytes: req.body, gzip: q.gzip === '1' }, name);
      const [dup] = await rowsOf(tx, `SELECT file_name FROM voucher_files WHERE blob_id = ? AND ${target.where}`, [blob.blobId, ...target.args]);
      if (dup) throw fail(409, `This file is already on ${target.label}${dup.file_name !== name ? `, as “${dup.file_name}”` : ''}`);
      const r = await tx.execute({
        sql: `INSERT INTO voucher_files (blob_id, company_id, voucher_guid, file_name, kind, original_size, uploaded_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [blob.blobId, companyId, voucherGuid, name, blob.kind, pickedSize(q.original_size), req.user.id],
      });
      const id = Number(r.lastInsertRowid);
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'FILE_ADD',
        description: `File added — ${name} on ${target.label}${target.ref ? ` (${target.ref})` : ''}`,
        entityType: target.entityType,
        entityId: target.entityId,
        entityRef: target.ref,
      });
      const [row] = await rowsOf(tx, 'SELECT uploaded_at FROM voucher_files WHERE id = ?', [id]);
      return {
        id, name, kind: blob.kind, size: blob.size, uploaded_by_name: req.user.name || req.user.username, uploaded_at: row.uploaded_at, stored_once: blob.reused,
      };
    });
    res.status(201).json(out);
  } catch (err) { sendError(res, next, err); }
}

// "attachment; filename=..." that every browser reads, the real name in UTF-8.
function disposition(name) {
  const plain = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// GET /api/files/:id -- the exact bytes that were stored. A PDF or email kept
// as gzip goes out with Content-Encoding: gzip, so the browser unpacks it to
// the original and the response stays small.
async function download(req, res, next) {
  try {
    const f = await files.readFile(db, req.params.id);
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

// DELETE /api/files/:id
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id) || 0;
    const [f] = await rowsOf(db, 'SELECT id, company_id, voucher_guid, file_name FROM voucher_files WHERE id = ?', [id]);
    if (!f) throw fail(404, 'That file isn’t there any more');
    let target;
    try {
      target = await targetOf(db, { companyId: Number(f.company_id), voucherGuid: f.voucher_guid });
    } catch {
      target = {
        label: 'a row no longer in RAMS', entityType: 'tally_vouchers', entityId: null, ref: null,
      };
    }
    await inTx(async (tx) => {
      await files.unlink(tx, id);
      await logAction({
        client: tx,
        userId: req.user.id,
        actionType: 'FILE_REMOVE',
        description: `File removed — ${f.file_name} from ${target.label}${target.ref ? ` (${target.ref})` : ''}`,
        entityType: target.entityType,
        entityId: target.entityId,
        entityRef: target.ref,
      });
    });
    res.json({ id, removed: true });
  } catch (err) { sendError(res, next, err); }
}

// GET /api/files/usage -- Admin -> File storage.
async function usage(req, res, next) {
  try {
    res.json({ ...(await files.usage(db)), max_upload_bytes: files.MAX_UPLOAD_BYTES, sync_from: SYNC_FROM });
  } catch (err) { sendError(res, next, err); }
}

module.exports = {
  upload, download, remove, usage, cleanName, disposition,
};
