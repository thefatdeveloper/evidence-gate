import Anthropic from '@anthropic-ai/sdk';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { sha256 } from '../common/hash';
import { PrismaService } from '../prisma/prisma.service';
import { ModelAssessment } from './assessment.schema';
import { AssessmentResponseError, AssessmentService } from './assessment.service';

// No network and no API key: the Anthropic client and Prisma are both fakes.

const CLAIM_ID = '00000000-0000-4000-8000-000000000001';
const MODEL_ID = 'claude-haiku-4-5-20251001';
const CLAIM_TEXT = 'The AF-1 patch detects atrial fibrillation with 98% sensitivity in adults over 18.';
const EVIDENCE = `Results: 412 participants completed monitoring (median age 64 years, range 22–84).
For detection of any AF episode of 30 seconds or longer, the patch algorithm achieved a
sensitivity of 96.4% (95% CI 91.8–98.8%). For AF episodes lasting 6 minutes or longer,
sensitivity was 98.2%.`;

const GOOD_OUTPUT: ModelAssessment = {
  assertions: [
    {
      text: 'Detects AF with 98% sensitivity',
      verdict: 'PARTIAL',
      confidence: 80,
      rationale: '98.2% applies only to episodes of 6 minutes or longer.',
      quotedExcerpt: 'For AF episodes lasting 6 minutes or longer, sensitivity was 98.2%.',
    },
    {
      text: 'Applies to adults over 18',
      verdict: 'SUPPORTED',
      confidence: 70,
      rationale: 'The study enrolled adults.',
      // Fabricated: the evidence says "range 22–84", never "adults over 18".
      quotedExcerpt: 'enrolled adults over 18',
    },
  ],
};

function message(overrides: Partial<Anthropic.Message> & { output?: unknown } = {}): Anthropic.Message {
  const { output = GOOD_OUTPUT, ...rest } = overrides;
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: MODEL_ID,
    content: [
      {
        type: 'text',
        text: typeof output === 'string' ? output : JSON.stringify(output),
        citations: null,
      },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1234, output_tokens: 321 },
    ...rest,
  } as unknown as Anthropic.Message;
}

function setup(options: { response?: Anthropic.Message; storedHash?: string | null } = {}) {
  const storedHash = options.storedHash === undefined ? sha256(EVIDENCE) : options.storedHash;
  const findUnique = jest
    .fn()
    .mockResolvedValue(storedHash === null ? null : { evidenceHash: storedHash });
  const create = jest.fn(async (args: { data: Record<string, any> }) => ({
    id: 'run_1',
    ...args.data,
    assertions: args.data.assertions.create,
  }));
  const updateClaim = jest.fn().mockResolvedValue({});
  const tx = { claim: { findUnique, update: updateClaim }, assessmentRun: { create } };
  const prisma = {
    claim: { findUnique },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const messagesCreate = jest.fn().mockResolvedValue(options.response ?? message());
  const anthropic = { messages: { create: messagesCreate } } as unknown as Anthropic;

  const service = new AssessmentService(anthropic, prisma as unknown as PrismaService);
  return { service, messagesCreate, prisma, create, findUnique, updateClaim };
}

describe('AssessmentService.assess', () => {
  it('sends the whole evidence to the pinned model with a structured-output schema', async () => {
    const { service, messagesCreate } = setup();
    await service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);

    const request = messagesCreate.mock.calls[0][0];
    expect(request.model).toBe(MODEL_ID);
    expect(request.temperature).toBe(0);
    expect(request.max_tokens).toBe(4096);
    expect(request.messages[0].content).toContain(EVIDENCE);
    expect(request.messages[0].content).toContain(CLAIM_TEXT);
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.output_config.format.schema.properties.assertions).toBeDefined();
  });

  it('forces UNSUPPORTED on a fabricated quote and derives the overall verdict from the result', async () => {
    const { service } = setup();
    const run = await service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);

    expect(run.assertions.map((a) => [a.verdict, a.quoteVerified])).toEqual([
      ['PARTIAL', true],
      ['UNSUPPORTED', false],
    ]);
    expect(run.assertions[0].matchedAt).toBe(EVIDENCE.indexOf('For AF episodes lasting'));
    expect(run.assertions[1].matchedAt).toBeNull();
    expect(run.overallVerdict).toBe('NOT_SUBSTANTIATED');
  });

  it('persists the run with full provenance, in one transaction with its assertions', async () => {
    const response = message();
    const { service, prisma, create } = setup({ response });
    await service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data).toMatchObject({
      claimId: CLAIM_ID,
      modelId: MODEL_ID,
      promptVersion: 'v2.0.0',
      temperature: 0,
      maxTokens: 4096,
      inputTokens: 1234,
      outputTokens: 321,
      overallVerdict: 'NOT_SUBSTANTIATED',
    });
    expect(data.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.latencyMs).toEqual(expect.any(Number));
    expect(data.rawResponse).toBe(response);
    expect(data.assertions.create).toHaveLength(2);
  });

  it('produces the same promptHash for the same inputs and a different one when the evidence changes', async () => {
    const first = setup();
    await first.service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);
    const second = setup();
    await second.service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);
    const edited = `${EVIDENCE} Addendum.`;
    const third = setup({ storedHash: sha256(edited) });
    await third.service.assess(CLAIM_ID, CLAIM_TEXT, edited);

    const hashOf = (s: ReturnType<typeof setup>) => s.create.mock.calls[0][0].data.promptHash;
    expect(hashOf(first)).toBe(hashOf(second));
    expect(hashOf(third)).not.toBe(hashOf(first));
  });

  describe('rejects responses that do not match the schema, persisting nothing', () => {
    it.each([
      ['confidence out of range', { assertions: [{ ...GOOD_OUTPUT.assertions[0], confidence: 150 }] }],
      ['missing field', { assertions: [{ ...GOOD_OUTPUT.assertions[0], rationale: undefined }] }],
      ['unknown verdict', { assertions: [{ ...GOOD_OUTPUT.assertions[0], verdict: 'MAYBE' }] }],
      ['zero assertions', { assertions: [] }],
      ['not JSON', 'Sure! Here is my assessment...'],
    ])('%s', async (_label, output) => {
      const { service, prisma } = setup({ response: message({ output }) });

      const promise = service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);
      await expect(promise).rejects.toBeInstanceOf(AssessmentResponseError);
      await expect(promise).rejects.toThrow(/did not match the assessment schema/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('rejects output truncated at max_tokens with advice to raise the limit', async () => {
    const { service, prisma } = setup({ response: message({ stop_reason: 'max_tokens' }) });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toThrow(/cut off at max_tokens/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a refusal', async () => {
    const response = message({ stop_reason: 'refusal' as Anthropic.Message['stop_reason'] });
    const { service } = setup({ response });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toThrow(/stop_reason "refusal"/);
  });

  it('rejects a response produced by a different model than the pinned one', async () => {
    const { service, prisma } = setup({ response: message({ model: 'claude-haiku-4-5' }) });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toThrow(/not the pinned/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an unknown claim without calling the model', async () => {
    const { service, messagesCreate } = setup({ storedHash: null });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toBeInstanceOf(NotFoundException);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('refuses evidence that does not match the stored evidenceHash without calling the model', async () => {
    const { service, messagesCreate } = setup({ storedHash: sha256('different evidence') });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toBeInstanceOf(ConflictException);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it('writes nothing if the evidence changes while the model is running', async () => {
    const { service, findUnique, create, updateClaim } = setup();
    findUnique
      .mockResolvedValueOnce({ evidenceHash: sha256(EVIDENCE) }) // before the model call
      .mockResolvedValueOnce({ evidenceHash: sha256('edited meanwhile') }); // inside the transaction

    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(updateClaim).not.toHaveBeenCalled();
  });

  it('marks the claim ASSESSED inside the same transaction as the run', async () => {
    const { service, prisma, create, updateClaim } = setup();
    await service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(updateClaim).toHaveBeenCalledWith({ where: { id: CLAIM_ID }, data: { status: 'ASSESSED' } });
    // Status is set only after the run exists.
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(updateClaim.mock.invocationCallOrder[0]);
  });

  it('leaves the claim status alone when the model output is rejected', async () => {
    const { service, updateClaim } = setup({ response: message({ output: 'not json' }) });
    await expect(service.assess(CLAIM_ID, CLAIM_TEXT, EVIDENCE)).rejects.toBeInstanceOf(AssessmentResponseError);
    expect(updateClaim).not.toHaveBeenCalled();
  });
});
