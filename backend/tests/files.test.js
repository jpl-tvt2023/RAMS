const crypto = require('crypto');
const zlib = require('zlib');
const request = require('supertest');
const app = require('../app');
const { db } = require('./helpers/db');
const { signIn, bearer } = require('./helpers/auth');
const {
  newAgent, agentPost, tallyCompany, voucher, enabledCompanies, startRun,
} = require('./helpers/agent');
const { sniff, CHUNK_BYTES } = require('../src/services/files');
const { cleanName, disposition } = require('../src/controllers/files.controller');

// Files on Ledgers rows end to end: a Zepto party with one sales invoice and
// one credit note pushed by a Connector, debit notes typed in RAMS, and PDFs,
// photos and emails attached to both -- stored once, compressed where it
// helps, and downloaded byte for byte.

let admin; let accountant; let viewer; let company;
const Z = 'FL ZEPTO PRIVATE LIMITED ( PUNE ) - Dark Store';
const PARTY = 'FLZ1';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const binary = (res, cb) => {
  const parts = [];
  res.on('data', (c) => parts.push(Buffer.from(c)));
  res.on('end', () => cb(null, Buffer.concat(parts)));
};
const upload = (token, params, bytes) => bearer(request(app).post(`/api/files?${new URLSearchParams(params)}`), token)
  .set('Content-Type', 'application/octet-stream').send(bytes);
const download = (token, id) => bearer(request(app).get(`/api/files/${id}`), token).buffer(true).parse(binary);
const remove = (token, id) => bearer(request(app).delete(`/api/files/${id}`), token);
const ledgers = (method, token, path) => bearer(request(app)[method](`/api/ledgers${path}`), token);
const partyOf = (token) => ledgers('get', token, `/party?company_id=${company.id}&ledger_guid=${PARTY}&from=2026-08-01&to=2026-08-31`);
const entry = async (number, date = '2026-08-10') => {
  const res = await ledgers('post', accountant.token, '/entries').send({
    company_id: company.id, ledger_guid: PARTY, kind: 'debit_note', number, amount_paise: 10000, date,
  });
  if (res.status !== 201) throw new Error(`entry ${res.status} ${res.body.message}`);
  return res.body.id;
};
const onEntry = (id) => ({ company_id: company.id, entry_id: id });
const onVoucher = (guid) => ({ company_id: company.id, voucher_guid: guid });
const blobsOf = async (hash) => (await db.execute({ sql: 'SELECT * FROM file_blobs WHERE sha256 = ?', args: [hash] })).rows;

// Test files, each starting the way the real kind does.
const PDF = Buffer.from(`%PDF-1.4\n${'1 0 obj << /Type /Page >> endobj\n'.repeat(300)}%%EOF\n`);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(3000)]);
const EML = Buffer.from(`Received: from mx.zepto.com\r\nFrom: "Zepto Accounts" <accounts@zepto.example>\r\nTo: ar@royalmart.example\r\nSubject: Debit note FKIDN50000002\r\nMIME-Version: 1.0\r\n\r\n${'Please find the debit note attached.\r\n'.repeat(200)}`);
const MSG = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(4000, 7)]);

beforeAll(async () => {
  [admin, accountant, viewer] = await Promise.all([signIn('admin'), signIn('accountant'), signIn('viewer')]);
  const agent = await newAgent('Files suite PC');
  [company] = await enabledCompanies(agent, admin, [tallyCompany({ state: 'Maharashtra' })]);
  const run = await startRun(agent, company.id, 'backfill');
  await agentPost(agent.token, `/runs/${run}/masters`, {
    groups: [{ guid: 'FLG1', name: 'Sundry Debtors', parent: '', reserved: 'Sundry Debtors', alterId: 1 }],
    ledgers: [
      { guid: PARTY, name: Z, parent: 'Sundry Debtors', gstins: ['27AAICK4821A1ZV'], state: 'Maharashtra', billWise: true, alterId: 1 },
      { guid: 'FLX1', name: 'FL SALES', parent: '', gstins: [], state: '', billWise: false, alterId: 1 },
    ],
    stockItems: [],
    voucherTypes: [],
  });
  const line = (ledger, amount, bills = []) => ({
    ledger, amount, isParty: ledger === Z, debit: amount < 0, bills,
  });
  const vouchers = [
    voucher('fl-s1', 10, {
      number: '501/FL/26-27', date: '2026-08-03', party: Z, total: 1180.5, narration: 'PO FL1', orders: [], inventoryLines: [],
      ledgerLines: [line(Z, -1180.5, [{ name: '501/FL/26-27', type: 'New Ref', amount: -1180.5 }]), line('FL SALES', 1180.5)],
    }),
    voucher('fl-cn1', 11, {
      type: 'Credit Note', baseType: 'Credit Note', invoice: false, number: '951', date: '2026-08-20', party: Z, total: 100, narration: 'FKIDN50000001', orders: [], inventoryLines: [],
      ledgerLines: [line(Z, 100), line('FL SALES', -100)],
    }),
  ];
  await agentPost(agent.token, `/runs/${run}/vouchers`, { vouchers });
  await agentPost(agent.token, `/runs/${run}/reconcile`, { from: '2026-08-01', to: '2026-08-31', vouchers: vouchers.map((v) => ({ guid: v.guid, alterId: v.alterId })) });
  await agentPost(agent.token, `/runs/${run}/finish`, { ok: true, backfillDone: true });
  await db.execute({
    sql: "INSERT OR REPLACE INTO party_ledgers (company_id, ledger_guid, kind, vendor, source) VALUES (?, ?, 'vendor', 'Zepto', 'person')",
    args: [company.id, PARTY],
  });
});

describe('What a file is', () => {
  test('known by its first bytes, never by its name alone', () => {
    expect(sniff(PDF, 'dn.pdf')).toMatchObject({ kind: 'pdf' });
    expect(sniff(JPEG, 'photo.jpg')).toMatchObject({ kind: 'image', mime: 'image/jpeg' });
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'x.png')).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(sniff(Buffer.from('RIFF1234WEBPVP8 '), 'x.webp')).toMatchObject({ kind: 'image', mime: 'image/webp' });
    expect(sniff(EML, 'mail.eml')).toMatchObject({ kind: 'email', mime: 'message/rfc822' });
    expect(sniff(MSG, 'mail.msg')).toMatchObject({ kind: 'email' });
    // An Office file shares the .msg signature: it has to be named .msg.
    expect(sniff(MSG, 'sheet.xls')).toBeNull();
    // Mail headers in a file not named .eml, or plain text, aren't an email.
    expect(sniff(EML, 'mail.txt')).toBeNull();
    expect(sniff(Buffer.from('hello there'), 'note.eml')).toBeNull();
    // A program renamed to .pdf is still a program.
    expect(sniff(Buffer.from('MZ\x90\x00\x03'), 'dn.pdf')).toBeNull();
  });

  test('names lose folders, quotes and control characters; downloads carry the real name', () => {
    expect(cleanName('C:\\Users\\me\\Desktop\\DN "123".pdf')).toBe('DN 123.pdf');
    expect(cleanName('a/b/c.eml')).toBe('c.eml');
    expect(() => cleanName('  ')).toThrow('Give the file a name');
    expect(disposition('डेबिट नोट.pdf')).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''%E0/);
  });
});

describe('Adding and downloading', () => {
  test('a PDF, a photo, a gzipped .eml and a .msg come back byte for byte', async () => {
    const id = await entry('FKIDN50000002');
    const sent = [
      ['dn.pdf', PDF, false],
      ['photo.jpg', JPEG, false],
      ['mail.eml', EML, true],
      ['mail.msg', MSG, false],
    ];
    for (const [name, bytes, gz] of sent) {
      const res = await upload(accountant.token, {
        ...onEntry(id), name, ...(gz ? { gzip: 1 } : {}), original_size: bytes.length,
      }, gz ? zlib.gzipSync(bytes) : bytes);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name, size: bytes.length, uploaded_by_name: expect.any(String) });
      const back = await download(viewer.token, res.body.id);
      expect(back.status).toBe(200);
      expect(sha(back.body)).toBe(sha(bytes));
      expect(back.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
      expect(back.headers['cache-control']).toBe('private, no-store');
    }
    // The PDF and the email are kept as gzip, the photo as it is.
    const [pdf] = await blobsOf(sha(PDF));
    expect(pdf).toMatchObject({ encoding: 'gzip', mime: 'application/pdf' });
    expect(Number(pdf.stored_size)).toBeLessThan(PDF.length / 2);
    expect((await blobsOf(sha(EML)))[0].encoding).toBe('gzip');
    expect((await blobsOf(sha(JPEG)))[0]).toMatchObject({ encoding: 'none', mime: 'image/jpeg' });
  });

  test('a file over 512 KB is stored in pieces and still comes back whole', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), crypto.randomBytes(CHUNK_BYTES * 2 + 1234)]);
    const id = await entry('FKIDN50000003');
    const res = await upload(accountant.token, { ...onEntry(id), name: 'big.jpg' }, big);
    expect(res.status).toBe(201);
    const [blob] = await blobsOf(sha(big));
    const { rows: [{ n }] } = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM file_chunks WHERE blob_id = ?', args: [blob.id] });
    expect(Number(n)).toBe(3);
    expect(sha((await download(viewer.token, res.body.id)).body)).toBe(sha(big));
  });

  test('refused: a file that isn’t a PDF, photo or email, one too big, and a gzip bomb', async () => {
    const id = await entry('FKIDN50000004');
    const exe = await upload(accountant.token, { ...onEntry(id), name: 'dn.pdf' }, Buffer.from('MZ\x90\x00 not a pdf'));
    expect(exe.status).toBe(415);
    expect(exe.body.message).toMatch(/PDFs, photos .* and emails/);
    const huge = await upload(accountant.token, { ...onEntry(id), name: 'big.pdf' }, Buffer.alloc(4 * 1024 * 1024 + 10, 0x25));
    expect(huge.status).toBe(413);
    expect(huge.body.message).toMatch(/at most 4\.0 MB/);
    const bomb = zlib.gzipSync(Buffer.alloc(26 * 1024 * 1024));
    const res = await upload(accountant.token, { ...onEntry(id), name: 'bomb.pdf', gzip: 1 }, bomb);
    expect(res.status).toBe(413);
    const broken = await upload(accountant.token, { ...onEntry(id), name: 'dn.pdf', gzip: 1 }, Buffer.from('not gzip at all'));
    expect(broken.status).toBe(400);
  });

  test('the row must exist, and the same file once per row', async () => {
    expect((await upload(accountant.token, { ...onEntry(99999999), name: 'dn.pdf' }, PDF)).status).toBe(404);
    expect((await upload(accountant.token, { ...onVoucher('no-such-guid'), name: 'dn.pdf' }, PDF)).status).toBe(404);
    expect((await upload(accountant.token, { company_id: company.id, name: 'dn.pdf' }, PDF)).status).toBe(400);
    const id = await entry('FKIDN50000005');
    expect((await upload(accountant.token, { ...onEntry(id), name: 'a.pdf' }, PDF)).status).toBe(201);
    const again = await upload(accountant.token, { ...onEntry(id), name: 'b.pdf' }, PDF);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already on Marketplace DN FKIDN50000005, as “a.pdf”/);
  });
});

describe('Who may', () => {
  test('a Viewer downloads but can’t add or remove', async () => {
    const id = await entry('FKIDN50000006');
    expect((await upload(viewer.token, { ...onEntry(id), name: 'dn.pdf' }, PDF)).status).toBe(403);
    const added = await upload(accountant.token, { ...onEntry(id), name: 'dn.pdf' }, PDF);
    expect((await download(viewer.token, added.body.id)).status).toBe(200);
    expect((await remove(viewer.token, added.body.id)).status).toBe(403);
  });

  test('seeing Debtors alone is enough to download', async () => {
    const added = await upload(accountant.token, { ...onVoucher('fl-s1'), name: 'invoice.pdf' }, Buffer.concat([PDF, Buffer.from('% viewer')]));
    await db.execute("DELETE FROM role_permissions WHERE role = 'Viewer' AND permission = 'ledgers.view'");
    try {
      expect((await download(viewer.token, added.body.id)).status).toBe(200);
      await db.execute("DELETE FROM role_permissions WHERE role = 'Viewer' AND permission = 'reports.view'");
      expect((await download(viewer.token, added.body.id)).status).toBe(403);
    } finally {
      await db.execute("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES ('Viewer', 'ledgers.view'), ('Viewer', 'reports.view')");
    }
  });

  test('the storage figures are Admin and Owner only', async () => {
    expect((await bearer(request(app).get('/api/files/usage'), accountant.token)).status).toBe(403);
    expect((await bearer(request(app).get('/api/files/usage'), admin.token)).status).toBe(200);
  });
});

describe('Stored once, freed when unused', () => {
  test('the same email on a DN and on its Tally credit note is one blob, deleted with its last row', async () => {
    const mail = Buffer.concat([EML, Buffer.from('\r\nOnce only.\r\n')]);
    const id = await entry('FKIDN50000007');
    const a = await upload(accountant.token, { ...onEntry(id), name: 'dn.eml' }, mail);
    const b = await upload(accountant.token, { ...onVoucher('fl-cn1'), name: 'same dn.eml' }, mail);
    expect(b.body.stored_once).toBe(true);
    const [blob] = await blobsOf(sha(mail));
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM ledger_files WHERE blob_id = ?', args: [blob.id] })).rows[0].n).toBe(2);

    expect((await remove(accountant.token, a.body.id)).body).toEqual({ id: a.body.id, removed: true });
    expect(await blobsOf(sha(mail))).toHaveLength(1);
    expect((await remove(accountant.token, b.body.id)).status).toBe(200);
    expect(await blobsOf(sha(mail))).toHaveLength(0);
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM file_chunks WHERE blob_id = ?', args: [blob.id] })).rows[0].n).toBe(0);
    expect((await download(viewer.token, b.body.id)).status).toBe(404);
  });

  test('removing a typed note removes its files', async () => {
    const pdf = Buffer.concat([PDF, Buffer.from('% removed with its entry')]);
    const id = await entry('FKIDN50000008');
    const added = await upload(accountant.token, { ...onEntry(id), name: 'dn.pdf' }, pdf);
    const res = await ledgers('delete', accountant.token, `/entries/${id}`);
    expect(res.body).toMatchObject({ deleted: true, files_removed: 1 });
    expect(await blobsOf(sha(pdf))).toHaveLength(0);
    expect((await download(viewer.token, added.body.id)).status).toBe(404);
    const { rows: [log] } = await db.execute({ sql: "SELECT description FROM audit_logs WHERE action_type = 'LEDGER_ENTRY_DELETE' AND entity_id = ?", args: [id] });
    expect(log.description).toMatch(/and its file \(dn\.pdf\)$/);
  });

  test('each add and remove is in the audit log, on the typed note itself', async () => {
    const pdf = Buffer.concat([PDF, Buffer.from('% audited')]);
    const id = await entry('FKIDN50000009');
    const added = await upload(accountant.token, { ...onEntry(id), name: 'audited.pdf' }, pdf);
    await remove(accountant.token, added.body.id);
    const { rows } = await db.execute({
      sql: "SELECT action_type, description, entity_ref FROM audit_logs WHERE entity_type = 'ledger_entries' AND entity_id = ? AND action_type LIKE 'FILE_%' ORDER BY id",
      args: [id],
    });
    expect(rows.map((r) => r.action_type)).toEqual(['FILE_ADD', 'FILE_REMOVE']);
    expect(rows[0].description).toBe(`File added — audited.pdf on Marketplace DN FKIDN50000009 (${Z})`);
    expect(rows[0].entity_ref).toBe(Z);
  });
});

describe('On the screens', () => {
  let bare; let filed;
  beforeAll(async () => {
    bare = await entry('FKIDN50000010', '2026-08-25');
    filed = await entry('FKIDN50000011', '2026-08-26');
    await upload(accountant.token, { ...onEntry(filed), name: 'filed.pdf' }, Buffer.concat([PDF, Buffer.from('% filed')]));
  });

  test('the party: files on each typed note and each Tally voucher', async () => {
    await upload(accountant.token, { ...onVoucher('fl-s1'), name: 'party invoice.pdf' }, Buffer.concat([PDF, Buffer.from('% party')]));
    const { status, body } = await partyOf(viewer.token);
    expect(status).toBe(200);
    const byNumber = Object.fromEntries(body.entries.map((e) => [e.number, e]));
    expect(byNumber.FKIDN50000010).toMatchObject({ has_file: false, files: [] });
    expect(byNumber.FKIDN50000011).toMatchObject({ has_file: true, files: [{ name: 'filed.pdf', kind: 'pdf', size: expect.any(Number) }] });
    const invoice = body.vouchers.find((v) => v.guid === 'fl-s1');
    expect(invoice.files.map((f) => f.name)).toContain('party invoice.pdf');
    expect(body.entries_without_file).toBe(body.entries.filter((e) => !e.files.length).length);
  });

  test('the statement counts the typed notes without a file', async () => {
    const { body } = await ledgers('get', viewer.token, `/statement?company_id=${company.id}&vendor=Zepto&states=all&parties=${company.id}:${PARTY}&from=2026-08-01&to=2026-08-31`);
    const detail = (await partyOf(viewer.token)).body;
    expect(body.rows[0].entries_without_file).toBe(detail.entries.filter((e) => !e.files.length).length);
    expect(body.rows[0].entries_without_file).toBeGreaterThan(0);
    expect(body.totals.entries_without_file).toBe(body.rows[0].entries_without_file);
  });

  test('Needs attention counts every typed note without a file', async () => {
    const { body } = await ledgers('get', viewer.token, '/parties');
    const mine = body.attention.find((a) => a.party.company_id === company.id && a.party.guid === PARTY);
    expect(mine.counts.no_file).toBeGreaterThan(0);
    expect(mine.since).toBe('2026-08-10');
  });

  test('Debtors shows an invoice’s files', async () => {
    const { body } = await bearer(request(app).get(`/api/reports/debtors?company_id=${company.id}&page_size=100`), viewer.token);
    const row = body.rows.find((r) => r.guid === 'fl-s1');
    expect(row.files.map((f) => f.name)).toContain('party invoice.pdf');
    expect(row.files[0]).toEqual({
      id: expect.any(Number), name: expect.any(String), kind: 'pdf', size: expect.any(Number), uploaded_by_name: expect.any(String), uploaded_at: expect.any(String),
    });
  });
});

describe('File storage', () => {
  test('space used, space saved, per kind, and the biggest files with where they are', async () => {
    const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), crypto.randomBytes(9000)]);
    const id = await entry('FKIDN50000012');
    // The browser shrank a 3 MB photo to this one.
    await upload(accountant.token, { ...onEntry(id), name: 'shrunk.jpg', original_size: 3000000 }, photo);
    const { status, body } = await bearer(request(app).get('/api/files/usage'), admin.token);
    expect(status).toBe(200);
    const { rows: [t] } = await db.execute('SELECT COUNT(*) AS files FROM ledger_files');
    const { rows: [b] } = await db.execute('SELECT COUNT(*) AS blobs, SUM(stored_size) AS stored FROM file_blobs');
    expect(body).toMatchObject({
      files: Number(t.files), stored_files: Number(b.blobs), stored_bytes: Number(b.stored), max_upload_bytes: 4 * 1024 * 1024, sync_from: '2026-06-08',
    });
    expect(body.saved_bytes).toBe(body.picked_bytes - body.stored_bytes);
    expect(body.saved_bytes).toBeGreaterThan(3000000 - photo.length - 1);
    expect(body.kinds.map((k) => k.kind)).toEqual(['pdf', 'image', 'email']);
    const top = body.biggest.find((f) => f.name === 'shrunk.jpg');
    expect(top).toMatchObject({
      kind: 'image', size: photo.length, company_id: company.id, on: {
        type: 'entry', entry_kind: 'debit_note', number: 'FKIDN50000012', party: Z, party_guid: PARTY, vendor: 'Zepto',
      },
    });
    // A file on a Tally voucher knows its party and marketplace too.
    const onInvoice = body.biggest.find((f) => f.name === 'party invoice.pdf');
    expect(onInvoice.on).toMatchObject({
      type: 'voucher', voucher_type: 'Sales', number: '501/FL/26-27', party: Z, party_guid: PARTY, vendor: 'Zepto',
    });
    expect(body.biggest.length).toBeLessThanOrEqual(20);
  });
});
