// `check`, the setup window's one line of JSON: Tally first (so its fix shows
// even before a token is pasted), then RAMS with the token, against the mock
// Tally and the real RAMS API (helpers/rams.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildDataset } = require('../mock/dataset');
const { main } = require('../src/cli');
const { startRams, startMockTally, hasBackend } = require('./helpers/rams');

const describeIf = hasBackend ? describe : describe.skip;
jest.setTimeout(60000);

let rams;
let mock;
let dir;

// Writes a connector.json and runs `check` with it; returns the parsed line.
async function check(settings) {
  const file = path.join(dir, `connector-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(settings));
  const lines = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((s) => lines.push(s));
  try {
    expect(await main(['check', '--config', file])).toBe(0);
  } finally {
    spy.mockRestore();
  }
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}

describeIf('rams-connector check', () => {
  beforeAll(async () => {
    rams = await startRams({ name: 'check' });
    mock = await startMockTally(buildDataset());
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rams-check-'));
  });

  afterAll(async () => {
    await mock?.close();
    await rams?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('everything answers: the open companies, RAMS accepts the token, and nothing is synced yet', async () => {
    const r = await check({ apiUrl: rams.url, token: rams.token, tally: { port: mock.port } });
    expect(r.tally).toMatchObject({ ok: true, message: '', educational: false });
    expect(r.tally.companies).toHaveLength(3);
    expect(r.rams).toMatchObject({ ok: true, syncOn: [], code: null });
    expect(r.rams.syncFrom).toBe('2026-04-01');
    // The heartbeat told RAMS which companies are open, so an Admin can turn them on.
    const rows = await rams.all('SELECT guid FROM tally_companies ORDER BY guid');
    expect(rows.map((x) => x.guid)).toEqual(['company-hr', 'company-mh', 'company-wb']);

    await rams.enable('company-mh');
    const after = await check({ apiUrl: rams.url, token: rams.token, tally: { port: mock.port } });
    expect(after.rams.syncOn).toHaveLength(1);
  });

  test('a wrong token is refused, with a code the window can explain', async () => {
    const r = await check({ apiUrl: rams.url, token: 'rams_wrong', tally: { port: mock.port } });
    expect(r.tally.ok).toBe(true);
    expect(r.rams).toMatchObject({ ok: false, code: 'TOKEN_REJECTED' });
    expect(r.rams.message).toMatch(/rejected the Connector token/);
  });

  test('no token yet: Tally is still checked, and RAMS says what is missing', async () => {
    const r = await check({ apiUrl: rams.url, token: '', tally: { port: mock.port } });
    expect(r.tally.ok).toBe(true);
    expect(r.rams).toMatchObject({ ok: false, code: null });
    expect(r.rams.message).toMatch(/No Connector token/);
  });

  test('Tally not answering, and RAMS not answering, each say so', async () => {
    const closed = await startMockTally(buildDataset());
    const port = closed.port;
    await closed.close();
    const r = await check({ apiUrl: 'http://127.0.0.1:9', token: rams.token, tally: { port, timeoutSeconds: 5 } });
    expect(r.tally).toMatchObject({ ok: false, companies: [] });
    expect(r.tally.message).not.toBe('');
    expect(r.rams).toMatchObject({ ok: false, code: 'UNREACHABLE' });
    expect(r.rams.message).toMatch(/did not answer/);
  });
});
