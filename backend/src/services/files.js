// Files on Party Statements rows (migrations 019 and 020): PDFs, photos and emails attached to a
// Tally voucher in a party's section -- an invoice, a DN or CN, a receipt, a
// TDS or other journal. Bills Receivable shows an invoice's files too.
//
// Kept small three ways:
//   - the browser shrinks photos before they are sent (frontend utils/files.js)
//   - PDFs and emails are kept as gzip when that saves at least a tenth. A
//     download unpacks them to the exact bytes that were picked
//   - each distinct file is stored once (file_blobs, keyed by SHA-256), however
//     many rows it is on, and deleted when the last of them goes
//
// The stored bytes are split into 512 KB pieces (file_chunks), so no single
// request to the database carries a whole file.
const crypto = require('crypto');
const zlib = require('zlib');

const CHUNK_BYTES = 512 * 1024;
// What one upload may carry, after the browser's compression. Vercel refuses
// a request over 4.5 MB before it reaches RAMS.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// What a gzip upload may unpack to -- anything larger is refused, so a small
// "zip bomb" can't fill the server's memory.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PER_ROW = 10;
const LIST_CHUNK = 400;

const ALLOWED = 'PDFs, photos (JPG, PNG or WebP) and emails (.eml or .msg)';
const MB = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
const TOO_BIG = `A file can be at most ${MB(MAX_UPLOAD_BYTES)} after RAMS compresses it. Save a PDF smaller (for example "Reduce file size" or print it to PDF again), or save an email without its attachments and add those PDFs separately.`;

const fail = (status, message) => Object.assign(new Error(message), { status });
const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const marks = (n) => Array(n).fill('?').join(',');
const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += LIST_CHUNK) out.push(list.slice(i, i + LIST_CHUNK));
  return out;
};

// ------------------------------------------------------------ what a file is

const startsWith = (buf, bytes, at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);
const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
// Header lines an email file starts with. Only text before the first blank
// line is looked at.
const MAIL_HEADER = /^(from|to|cc|subject|date|received|return-path|mime-version|message-id|delivered-to|reply-to|content-type|dkim-signature|authentication-results|thread-topic|thread-index|x-[a-z0-9-]+|arc-[a-z-]+):/im;

/**
 * What a file is, from its first bytes -- never from the name or the type the
 * browser claims, except that an Outlook .msg and an .eml must also be named
 * so (an .msg shares its signature with old Word and Excel files).
 * { kind: 'pdf'|'image'|'email', mime } or null.
 */
function sniff(buf, name) {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mime: 'image/png' };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { kind: 'image', mime: 'image/webp' };
  // A PDF may have a few bytes before its header.
  if (buf.subarray(0, 1024).includes('%PDF-')) return { kind: 'pdf', mime: 'application/pdf' };
  const ext = extOf(name);
  if (ext === 'msg' && startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { kind: 'email', mime: 'application/vnd.ms-outlook' };
  if (ext === 'eml') {
    const head = buf.subarray(0, 8192);
    if (!head.includes(0) && MAIL_HEADER.test(head.toString('latin1'))) return { kind: 'email', mime: 'message/rfc822' };
  }
  return null;
}

function unpack(bytes) {
  try {
    return zlib.gunzipSync(bytes, { maxOutputLength: MAX_FILE_BYTES });
  } catch (err) {
    if (err.code === 'ERR_BUFFER_TOO_LARGE' || err instanceof RangeError) {
      throw fail(413, `That file unpacks to more than ${MB(MAX_FILE_BYTES)}, which RAMS doesn't take.`);
    }
    throw fail(400, 'The file arrived damaged. Try adding it again.');
  }
}

// Photos are already compressed. A PDF or an email is kept as gzip when that
// saves at least a tenth.
function storedForm(original, sent, sentGzip, kind) {
  if (kind === 'image') return { data: original, encoding: 'none' };
  const packed = sentGzip ? sent : zlib.gzipSync(original, { level: 9 });
  return packed.length <= original.length * 0.9 ? { data: packed, encoding: 'gzip' } : { data: original, encoding: 'none' };
}

// A copy with its own memory, so the database client never sees the rest of a
// shared buffer.
const own = (view) => {
  const out = new Uint8Array(view.length);
  out.set(view);
  return out;
};

/**
 * Stores what was sent (gzip when `gzip`), once per distinct file. Run inside
 * a write transaction. Returns { blobId, kind, mime, size, stored_size, reused }.
 */
async function storeBlob(tx, { bytes, gzip = false }, name) {
  if (!bytes || !bytes.length) throw fail(400, 'The file is empty');
  if (bytes.length > MAX_UPLOAD_BYTES) throw fail(413, TOO_BIG);
  const original = gzip ? unpack(bytes) : bytes;
  if (!original.length) throw fail(400, 'The file is empty');
  const type = sniff(original, name);
  if (!type) throw fail(415, `RAMS takes ${ALLOWED}. "${name}" isn't one of them.`);
  const sha256 = crypto.createHash('sha256').update(original).digest('hex');

  const [have] = await rowsOf(tx, 'SELECT id, size, stored_size FROM file_blobs WHERE sha256 = ?', [sha256]);
  if (have) {
    return {
      blobId: Number(have.id), ...type, size: Number(have.size), stored_size: Number(have.stored_size), reused: true,
    };
  }
  const { data, encoding } = storedForm(original, bytes, gzip, type.kind);
  const r = await tx.execute({
    sql: 'INSERT INTO file_blobs (sha256, mime, size, stored_size, encoding) VALUES (?, ?, ?, ?, ?)',
    args: [sha256, type.mime, original.length, data.length, encoding],
  });
  const blobId = Number(r.lastInsertRowid);
  for (let at = 0, seq = 0; at < data.length; at += CHUNK_BYTES, seq += 1) {
    await tx.execute({
      sql: 'INSERT INTO file_chunks (blob_id, seq, data) VALUES (?, ?, ?)',
      args: [blobId, seq, own(data.subarray(at, at + CHUNK_BYTES))],
    });
  }
  return {
    blobId, ...type, size: original.length, stored_size: data.length, reused: false,
  };
}

// ------------------------------------------------------------ reading

/**
 * One file, ready to send: { id, name, kind, mime, size, encoding, body } --
 * body is the stored bytes (gzip when encoding is 'gzip'). null if it's gone.
 */
async function readFile(client, id) {
  const [f] = await rowsOf(client, `SELECT f.id, f.file_name, f.kind, f.blob_id, b.mime, b.size, b.stored_size, b.encoding
                                      FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id WHERE f.id = ?`, [Number(id) || 0]);
  if (!f) return null;
  const pieces = [];
  const count = Math.ceil(Number(f.stored_size) / CHUNK_BYTES);
  for (let seq = 0; seq < count; seq += 1) {
    const [c] = await rowsOf(client, 'SELECT data FROM file_chunks WHERE blob_id = ? AND seq = ?', [f.blob_id, seq]);
    if (!c) throw new Error(`File ${f.id}: piece ${seq} of blob ${f.blob_id} is missing`);
    pieces.push(Buffer.from(c.data));
  }
  return {
    id: Number(f.id), name: f.file_name, kind: f.kind, mime: f.mime, size: Number(f.size), encoding: f.encoding, body: Buffer.concat(pieces),
  };
}

const fileOut = (r) => ({
  id: Number(r.id),
  name: r.file_name,
  kind: r.kind,
  size: Number(r.size),
  uploaded_by_name: r.uploaded_by_name ?? null,
  uploaded_at: r.uploaded_at,
});
const SELECT_FILES = `SELECT f.id, f.company_id, f.voucher_guid, f.file_name, f.kind, f.uploaded_at, b.size, u.name AS uploaded_by_name
                        FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id LEFT JOIN users u ON u.id = f.uploaded_by`;

/**
 * The files on many Tally vouchers at once, given as [companyId, guid] pairs.
 * Returns { voucher(companyId, guid) }, giving that row's files, oldest first.
 */
async function filesFor(client, { vouchers = [] }) {
  const ofVoucher = new Map();
  for (const part of chunks([...new Set(vouchers.map(([, g]) => g).filter(Boolean))])) {
    const rows = await rowsOf(client, `${SELECT_FILES} WHERE f.voucher_guid IN (${marks(part.length)}) ORDER BY f.id`, part);
    for (const r of rows) {
      const key = `${Number(r.company_id)}|${r.voucher_guid}`;
      if (!ofVoucher.has(key)) ofVoucher.set(key, []);
      ofVoucher.get(key).push(fileOut(r));
    }
  }
  return { voucher: (companyId, guid) => ofVoucher.get(`${Number(companyId)}|${guid}`) || [] };
}

// ------------------------------------------------------------ removing

// Deletes a blob no row uses any more. Returns whether it did.
async function freeBlob(tx, blobId) {
  const [{ n }] = await rowsOf(tx, 'SELECT COUNT(*) AS n FROM voucher_files WHERE blob_id = ?', [blobId]);
  if (Number(n)) return false;
  await tx.execute({ sql: 'DELETE FROM file_chunks WHERE blob_id = ?', args: [blobId] });
  await tx.execute({ sql: 'DELETE FROM file_blobs WHERE id = ?', args: [blobId] });
  return true;
}

// Takes one file off its row (and frees its blob if nothing else uses it).
// Returns the removed row, or null if it was already gone.
async function unlink(tx, fileId) {
  const [f] = await rowsOf(tx, 'SELECT * FROM voucher_files WHERE id = ?', [Number(fileId) || 0]);
  if (!f) return null;
  await tx.execute({ sql: 'DELETE FROM voucher_files WHERE id = ?', args: [f.id] });
  await freeBlob(tx, Number(f.blob_id));
  return f;
}

// ------------------------------------------------------------ usage

/**
 * For Admin -> File storage: how many files, the space they take, what was
 * saved (photos shrunk, PDFs and emails compressed, a file on several rows
 * stored once), per kind, and the 20 biggest.
 */
async function usage(client) {
  const [[t], [b], picked, stored, biggest] = await Promise.all([
    rowsOf(client, `SELECT COUNT(*) AS files, COALESCE(SUM(COALESCE(f.original_size, b.size)), 0) AS picked
                      FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id`),
    rowsOf(client, 'SELECT COUNT(*) AS blobs, COALESCE(SUM(size), 0) AS size, COALESCE(SUM(stored_size), 0) AS stored FROM file_blobs'),
    rowsOf(client, `SELECT f.kind, COUNT(*) AS files, COALESCE(SUM(COALESCE(f.original_size, b.size)), 0) AS picked
                      FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id GROUP BY f.kind`),
    rowsOf(client, `SELECT kind, COALESCE(SUM(stored_size), 0) AS stored
                      FROM (SELECT DISTINCT f.kind, b.id, b.stored_size FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id)
                     GROUP BY kind`),
    // Where each file is: the Tally voucher, its party, and the party's
    // marketplace (as Party Statements decides it: the mapping, else the suggestion),
    // so File storage can open it on Party Statements.
    rowsOf(client, `SELECT f.id, f.file_name, f.kind, f.company_id, f.voucher_guid, f.uploaded_at,
                           b.size, b.stored_size, u.name AS uploaded_by_name, c.code AS company,
                           v.voucher_type, v.number AS voucher_number, v.date AS voucher_date, v.party AS voucher_party, vl.guid AS voucher_ledger,
                           CASE WHEN vp.kind = 'vendor' THEN vp.vendor WHEN vp.kind IS NULL THEN vp.suggested_vendor END AS voucher_vendor
                      FROM voucher_files f JOIN file_blobs b ON b.id = f.blob_id
                      LEFT JOIN users u ON u.id = f.uploaded_by
                      LEFT JOIN tally_companies c ON c.id = f.company_id
                      LEFT JOIN tally_vouchers v ON v.company_id = f.company_id AND v.guid = f.voucher_guid
                      LEFT JOIN tally_ledgers vl ON vl.company_id = v.company_id AND vl.name = v.party AND vl.deleted_at IS NULL
                      LEFT JOIN party_ledgers vp ON vp.company_id = v.company_id AND vp.ledger_guid = vl.guid
                     ORDER BY b.stored_size DESC, f.id DESC
                     LIMIT 20`),
  ]);
  const storedOf = new Map(stored.map((r) => [r.kind, Number(r.stored)]));
  const pickedBytes = Number(t.picked);
  const storedBytes = Number(b.stored);
  return {
    files: Number(t.files),
    stored_files: Number(b.blobs),
    picked_bytes: pickedBytes,
    stored_bytes: storedBytes,
    saved_bytes: Math.max(0, pickedBytes - storedBytes),
    kinds: ['pdf', 'image', 'email'].map((kind) => {
      const p = picked.find((r) => r.kind === kind);
      return {
        kind, files: Number(p?.files || 0), picked_bytes: Number(p?.picked || 0), stored_bytes: storedOf.get(kind) || 0,
      };
    }),
    biggest: biggest.map((r) => ({
      id: Number(r.id),
      name: r.file_name,
      kind: r.kind,
      size: Number(r.size),
      stored_size: Number(r.stored_size),
      uploaded_by_name: r.uploaded_by_name ?? null,
      uploaded_at: r.uploaded_at,
      company_id: Number(r.company_id),
      company: r.company ?? null,
      on: {
        type: 'voucher', voucher_type: r.voucher_type ?? null, number: r.voucher_number ?? null, date: r.voucher_date ?? null, party: r.voucher_party ?? null, party_guid: r.voucher_ledger ?? null, vendor: r.voucher_vendor ?? null,
      },
    })),
  };
}

module.exports = {
  CHUNK_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_FILE_BYTES,
  MAX_PER_ROW,
  TOO_BIG,
  sniff,
  storeBlob,
  readFile,
  filesFor,
  unlink,
  usage,
};
