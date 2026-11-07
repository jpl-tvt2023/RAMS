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
