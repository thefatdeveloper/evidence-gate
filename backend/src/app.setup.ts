import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

/** Vite dev server by default; set WEB_ORIGIN (comma-separated) to allow others. */
const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

/** Shared by main.ts and the e2e tests so both run the same HTTP behaviour. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Unknown fields are rejected, not silently dropped — e.g. a client cannot
      // create a claim with "status": "APPROVED".
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).split(',').map((o) => o.trim()),
  });
  // Express defaults to 100kb, which is smaller than an evidenceText at its DTO cap.
  app.useBodyParser('json', { limit: '1mb' });
}
