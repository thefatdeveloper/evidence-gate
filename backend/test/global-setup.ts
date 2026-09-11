import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { TEST_DATABASE_URL, assertTestDatabaseUrl } from './test-db';

/** Brings the test database up to the latest migration before any e2e test runs. */
export default function globalSetup(): void {
  assertTestDatabaseUrl(TEST_DATABASE_URL);
  const backendDir = join(__dirname, '..');
  execFileSync(join(backendDir, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
