// Loaded before anything else so the app boots against the TEST database.
// Without this the suite would truncate the development data.
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.test'), override: true });

if (!/smartdriverai_test/.test(process.env.DATABASE_URL || '')) {
  throw new Error(
    'E2E refusing to run: DATABASE_URL does not point at smartdriverai_test. ' +
      'These tests TRUNCATE every table.',
  );
}
