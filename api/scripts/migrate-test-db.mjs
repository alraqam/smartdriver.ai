// Bring the e2e database's schema up to date, then get out of the way.
//
// Runs as `pretest:e2e`. CI already does `prisma migrate deploy` against its
// own service container before the suite; locally nothing did, so the moment
// the schema changed every e2e test failed with a 500 whose stack pointed at
// whichever query happened to run first rather than at the missing column.
//
// A one-line `dotenv -e .env.test -- prisma migrate deploy` would do this, but
// dotenv-cli is not a dependency and adding one for a two-line env swap is a
// poor trade in a project this lean.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.test');

if (!existsSync(envPath)) {
  console.error(`[migrate-test-db] no .env.test at ${envPath} — see README, "Tests".`);
  process.exit(1);
}

/// Minimal .env reader: KEY=VALUE, `#` comments, optional surrounding quotes.
/// Values here are connection strings, so anything fancier is unnecessary.
function readEnv(path) {
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

// CI sets DATABASE_URL itself and must win, exactly as test/env.ts does — its
// database is a service container, not whatever .env.test names.
const url = process.env.DATABASE_URL || readEnv(envPath).DATABASE_URL;

// The same guard the suite carries, for the same reason: `migrate deploy` can
// rewrite a schema, and pointing it at the development database by accident is
// the kind of mistake you only make once.
if (!/smartdriverai_test/.test(url || '')) {
  console.error(
    '[migrate-test-db] refusing to migrate: DATABASE_URL does not name ' +
      `smartdriverai_test.\nGot: ${url || '(unset)'}`,
  );
  process.exit(1);
}

const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(res.status ?? 1);
