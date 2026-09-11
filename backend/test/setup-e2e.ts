import { TEST_DATABASE_URL, assertTestDatabaseUrl } from './test-db';

// Runs in each test worker before any app code loads. Real environment variables
// take precedence over backend/.env, so these win over your dev settings.
assertTestDatabaseUrl(TEST_DATABASE_URL);
process.env.DATABASE_URL = TEST_DATABASE_URL;
// Satisfies config validation only: the Anthropic client is replaced by a fake in the tests.
process.env.ANTHROPIC_API_KEY = 'sk-ant-e2e-fake-key-never-sent';
