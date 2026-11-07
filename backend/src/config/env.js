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

// The first day of Tally books RAMS mirrors: ROMS go-live by default. Changing
// it later needs a re-backfill of each company.
const SYNC_FROM = process.env.RAMS_SYNC_FROM || '2026-06-08';
if (!/^\d{4}-\d{2}-\d{2}$/.test(SYNC_FROM)) {
  console.error(`RAMS_SYNC_FROM must be YYYY-MM-DD, got "${SYNC_FROM}"`);
  process.exit(1);
}

module.exports = {
  requireServerEnv,
  SYNC_FROM,
  PORT: process.env.PORT || 5001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
};
