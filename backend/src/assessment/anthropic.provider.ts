import Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [ConfigService],
  // The key is passed explicitly so the client uses only ANTHROPIC_API_KEY from
  // config, never another credential source the SDK might otherwise pick up.
  useFactory: (config: ConfigService) =>
    new Anthropic({ apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY') }),
};
