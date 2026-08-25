// Points the e2e suite at the TEST database, before anything else loads.
//
// Deliberately does NOT override an existing DATABASE_URL: CI supplies its own
// (a service container), and clobbering it would send the suite at a database
// that is not there. Locally nothing has set it yet at this point, so .env.test
// fills the gap — and it must happen HERE, because importing PrismaClient loads
// `.env` as a side effect, which would otherwise point the suite at the
// development database.
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.test') });

// The suite truncates every table. This is the line between doing that to a
// scratch database and doing it to someone's work.
if (!/smartdriverai_test/.test(process.env.DATABASE_URL || '')) {
  throw new Error(
    'E2E refusing to run: DATABASE_URL does not name smartdriverai_test. ' +
      'These tests TRUNCATE every table.\n' +
      `Got: ${process.env.DATABASE_URL || '(unset)'}`,
  );
}
