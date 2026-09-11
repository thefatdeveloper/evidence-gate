import 'dotenv/config';
import { userInfo } from 'node:os';

/**
 * The e2e suite truncates every table, so it only ever runs against a database
 * whose name ends in _test.
 *
 * Resolution order:
 *   1. TEST_DATABASE_URL, if set.
 *   2. Your DATABASE_URL with "_test" appended to the database name — same
 *      server and credentials as dev, separate data.
 *   3. postgresql://<os user>@localhost:5432/evidence_gate_test
 *
 * Create the database once with:  createdb evidence_gate_test
 */
function defaultTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    return `postgresql://${userInfo().username}@localhost:5432/evidence_gate_test`;
  }
  const url = new URL(devUrl);
  const name = url.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  return url.toString();
}

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl();

export function assertTestDatabaseUrl(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against database "${name}": the suite deletes all data, ` +
        'so the database name must end in _test. Set TEST_DATABASE_URL to a test database.',
    );
  }
}
