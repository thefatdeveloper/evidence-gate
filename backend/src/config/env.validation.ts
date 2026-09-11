const ENV_HELP = 'Copy backend/.env.example to backend/.env and set it there.';

/**
 * Passed to ConfigModule.forRoot({ validate }). Throwing here stops the app at
 * boot with this message, instead of failing later on the first model call.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const apiKey = config.ANTHROPIC_API_KEY;

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error(`ANTHROPIC_API_KEY is not set. ${ENV_HELP}`);
  }
  if (apiKey.trim() === 'sk-ant-...') {
    throw new Error(
      `ANTHROPIC_API_KEY is still the placeholder from .env.example. Replace it with a real key. ${ENV_HELP}`,
    );
  }

  return config;
}
