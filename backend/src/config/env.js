require('dotenv').config();

// Fails fast: a missing one of these exits before anything else boots.
// TURSO_AUTH_TOKEN and FRONTEND_URL are read straight from process.env by
// db.js and app.js, so a remote DB with a blank token boots and then fails on
// the first query.
function exitIfMissing(keys) {
  for (const key of keys) {
    if (!process.env[key]) {
      console.error(`Missing required env variable: ${key}`);
      process.exit(1);
    }
  }
}

// Every entry point needs the database.
exitIfMissing(['TURSO_DATABASE_URL']);

// Only the web server signs users in. app.js calls this first, so the API
// still refuses to boot without the secrets, while the npm scripts (migrate,
// agent-token, bootstrap-admin...) run with just the database in .env.
function requireServerEnv() {
  exitIfMissing(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']);
}

// Two dates (YYYY-MM-DD):
//   SYNC_FROM   the first day of Tally books RAMS mirrors: the start of the
//               financial year, so every month matches Tally's registers.
//               Moving it earlier needs a resync of each company.
//   MATCH_FROM  the first day matching looks at: ROMS go-live, since ROMS
//               has no POs before it. Never before SYNC_FROM.
function dateEnv(key, fallback) {
  const value = process.env[key] || fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`${key} must be YYYY-MM-DD, got "${value}"`);
    process.exit(1);
  }
  return value;
}
const SYNC_FROM = dateEnv('RAMS_SYNC_FROM', '2026-04-01');
const MATCH_FROM = [dateEnv('RAMS_MATCH_FROM', '2026-06-08'), SYNC_FROM].sort()[1];

module.exports = {
  requireServerEnv,
  SYNC_FROM,
  MATCH_FROM,
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
};
