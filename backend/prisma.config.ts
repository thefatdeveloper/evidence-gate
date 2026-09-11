import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // process.env rather than env(): env() throws when unset, which would break
    // `prisma generate` (and so `pnpm install`) on machines without a .env.
    // Commands that actually need the database still fail clearly without it.
    url: process.env.DATABASE_URL,
  },
});
