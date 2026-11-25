const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

// Each case runs in a fresh Node, from a folder with no .env, holding only the
// variables given, so neither backend/.env nor .env.test can fill a gap.
const backend = path.resolve(__dirname, '..');
function load(file, vars) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...vars };
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(backend, file))})`], {
    cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 20000,
  });
}

describe('required env variables', () => {
  const dbOnly = { TURSO_DATABASE_URL: 'file:unused.db' };

  test('the npm scripts need only the database (agent-token runs without the JWT secrets)', () => {
    const r = load('src/config/env.js', dbOnly);
    expect(r.stderr).not.toContain('Missing required env variable');
    expect(r.status).toBe(0);
  });

  test('every entry point still refuses to start without the database', () => {
    const r = load('src/config/env.js', {});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Missing required env variable: TURSO_DATABASE_URL');
  });

  test('the API still refuses to boot without the JWT secrets', () => {
    const r = load('app.js', dbOnly);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Missing required env variable: JWT_ACCESS_SECRET');

    const r2 = load('app.js', { ...dbOnly, JWT_ACCESS_SECRET: 'a' });
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain('Missing required env variable: JWT_REFRESH_SECRET');
  });
});

describe('the copy start and the matching start', () => {
  const dbOnly = { TURSO_DATABASE_URL: 'file:unused.db' };
  const dates = (vars) => {
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...dbOnly, ...vars };
    const file = JSON.stringify(path.join(backend, 'src/config/env.js'));
    const r = spawnSync(process.execPath, ['-e', `const e = require(${file}); console.log(JSON.stringify([e.SYNC_FROM, e.MATCH_FROM]))`], {
      cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 20000,
    });
    // dotenv may print a line of its own first: the answer is the last line.
    return { ...r, value: r.status === 0 ? JSON.parse(r.stdout.trim().split(/\r?\n/).pop()) : null };
  };

  test('by default the copy starts on 1 April and matching on ROMS go-live (8 June)', () => {
    expect(dates({}).value).toEqual(['2026-04-01', '2026-06-08']);
  });

  test('each can be set, and matching never starts before the copy', () => {
    expect(dates({ RAMS_SYNC_FROM: '2026-05-01', RAMS_MATCH_FROM: '2026-07-01' }).value).toEqual(['2026-05-01', '2026-07-01']);
    expect(dates({ RAMS_SYNC_FROM: '2026-07-01', RAMS_MATCH_FROM: '2026-06-08' }).value).toEqual(['2026-07-01', '2026-07-01']);
  });

  test('a date not in YYYY-MM-DD stops the start', () => {
    const r = dates({ RAMS_MATCH_FROM: '8/6/2026' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('RAMS_MATCH_FROM must be YYYY-MM-DD');
  });
});
