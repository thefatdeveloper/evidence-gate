import { assertPinnedModelId, ASSESSMENT_MODEL_CONFIG } from '../assessment/assessment.config';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('accepts a configured key', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-api03-abc' };
    expect(validateEnv(env)).toBe(env);
  });

  it.each([
    ['missing', {}],
    ['empty', { ANTHROPIC_API_KEY: '' }],
    ['whitespace', { ANTHROPIC_API_KEY: '   ' }],
  ])('fails fast with a readable message when the key is %s', (_label, env) => {
    expect(() => validateEnv(env)).toThrow(
      'ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and set it there.',
    );
  });

  it('rejects the unchanged .env.example placeholder', () => {
    expect(() => validateEnv({ ANTHROPIC_API_KEY: 'sk-ant-...' })).toThrow(/placeholder/);
  });
});

describe('assertPinnedModelId', () => {
  it('accepts the configured model', () => {
    expect(assertPinnedModelId(ASSESSMENT_MODEL_CONFIG.modelId)).toBe('claude-haiku-4-5-20251001');
  });

  it.each(['claude-haiku-4-5', 'claude-3-5-sonnet-latest', 'claude-opus-5', 'latest', ''])(
    'rejects the alias "%s"',
    (modelId) => {
      expect(() => assertPinnedModelId(modelId)).toThrow(/not a dated snapshot/);
    },
  );
});
