import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ANTHROPIC_CLIENT } from '../src/assessment/anthropic.provider';
import { ASSESSMENT_MODEL_CONFIG } from '../src/assessment/assessment.config';
import { ModelAssessment } from '../src/assessment/assessment.schema';
import { sha256 } from '../src/common/hash';
import { PrismaService } from '../src/prisma/prisma.service';

// Real HTTP stack, real Postgres (the _test database), real AssessmentService.
// Only the Anthropic client is faked, so no API key or network is needed.

const EVIDENCE = `Results: 412 participants completed monitoring (median age 64 years, range 22–84).
For detection of any AF episode of 30 seconds or longer, the patch algorithm achieved a
sensitivity of 96.4% (95% CI 91.8–98.8%). For AF episodes lasting 6 minutes or longer,
sensitivity was 98.2%.`;

const CLAIM = {
  productRef: 'VT-AF1',
  claimText: 'The AF-1 patch detects atrial fibrillation with 98% sensitivity in adults over 18.',
  market: 'US',
  evidenceText: EVIDENCE,
};

const ASSERTIONS: ModelAssessment['assertions'] = [
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
    quotedExcerpt: 'enrolled adults over 18', // fabricated: not in the evidence
  },
];

function modelReply(text: string) {
  return {
    id: 'msg_e2e',
    type: 'message',
    role: 'assistant',
    model: ASSESSMENT_MODEL_CONFIG.modelId,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 250 },
  };
}

describe('Claims API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const anthropicCreate = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ANTHROPIC_CLIENT)
      .useValue({ messages: { create: anthropicCreate } })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Claim" CASCADE');
    anthropicCreate.mockReset();
    anthropicCreate.mockResolvedValue(modelReply(JSON.stringify({ assertions: ASSERTIONS })));
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function createClaim(body: object = CLAIM) {
    const res = await http().post('/api/claims').send(body).expect(201);
    return res.body;
  }

  describe('POST /api/claims', () => {
    it('creates a DRAFTED claim with the evidence hashed', async () => {
      const claim = await createClaim();

      expect(claim).toMatchObject({ ...CLAIM, status: 'DRAFTED', evidenceHash: sha256(EVIDENCE) });
      expect(claim.id).toEqual(expect.any(String));
    });

    it('rejects missing, blank and unknown fields with 400', async () => {
      const res = await http()
        .post('/api/claims')
        .send({ productRef: 'VT-AF1', claimText: '   ', market: 'US', status: 'APPROVED' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'claimText must not be blank',
          'evidenceText must be a string',
          'property status should not exist',
        ]),
      );
      expect(await prisma.claim.count()).toBe(0);
    });

    it('accepts evidence larger than the default 100kb request body', async () => {
      const bigEvidence = 'é'.repeat(60_000); // ~120kb as UTF-8 JSON
      const claim = await createClaim({ ...CLAIM, evidenceText: bigEvidence });
      expect(claim.evidenceHash).toBe(sha256(bigEvidence));
    });
  });

  describe('GET /api/claims', () => {
    it('lists claims newest first, without evidence text', async () => {
      const first = await createClaim();
      const second = await createClaim({ ...CLAIM, productRef: 'VT-AF2' });

      const res = await http().get('/api/claims').expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([second.id, first.id]);
      expect(res.body[0]).not.toHaveProperty('evidenceText');
      expect(res.body[0].runs).toEqual([]);
    });
  });

  describe('GET /api/claims/:id', () => {
    it('returns the claim with its (empty) runs and decisions', async () => {
      const claim = await createClaim();
      const res = await http().get(`/api/claims/${claim.id}`).expect(200);
      expect(res.body).toMatchObject({ id: claim.id, runs: [], decisions: [] });
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      await http().get('/api/claims/00000000-0000-4000-8000-000000000099').expect(404);
      await http().get('/api/claims/not-a-uuid').expect(400);
    });
  });

  describe('POST /api/claims/:id/assess', () => {
    it('runs the assessment, persists verified assertions and sets status ASSESSED', async () => {
      const claim = await createClaim();
      const res = await http().post(`/api/claims/${claim.id}/assess`).expect(200);

      expect(res.body.status).toBe('ASSESSED');
      expect(res.body.runs).toHaveLength(1);
      const [run] = res.body.runs;
      expect(run).toMatchObject({
        modelId: ASSESSMENT_MODEL_CONFIG.modelId,
        promptVersion: 'v2.0.0',
        overallVerdict: 'NOT_SUBSTANTIATED',
        inputTokens: 900,
        outputTokens: 250,
      });
      expect(run.rawResponse.id).toBe('msg_e2e');
      expect(run.assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            verdict: 'PARTIAL',
            quoteVerified: true,
            matchedAt: EVIDENCE.indexOf('For AF episodes lasting'),
            // Source wraps a line mid-quote; the span still covers exactly the passage.
            matchedLength: ASSERTIONS[0].quotedExcerpt.length,
          }),
          // The model said SUPPORTED; its quote does not exist, so the pipeline overrode it.
          expect.objectContaining({
            verdict: 'UNSUPPORTED',
            quoteVerified: false,
            matchedAt: null,
            matchedLength: null,
          }),
        ]),
      );
      // The whole evidence text was sent to the model.
      expect(anthropicCreate.mock.calls[0][0].messages[0].content).toContain(EVIDENCE);
    });

    it('returns 502 and changes nothing when the model output fails the schema', async () => {
      anthropicCreate.mockResolvedValue(modelReply('Sure! The claim looks fine.'));
      const claim = await createClaim();

      const res = await http().post(`/api/claims/${claim.id}/assess`).expect(502);
      expect(res.body.message).toMatch(/did not match the assessment schema/);

      const after = await http().get(`/api/claims/${claim.id}`).expect(200);
      expect(after.body).toMatchObject({ status: 'DRAFTED', runs: [] });
    });

    it('returns 404 for an unknown claim without calling the model', async () => {
      await http().post('/api/claims/00000000-0000-4000-8000-000000000099/assess').expect(404);
      expect(anthropicCreate).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/claims/:id/decision', () => {
    const decision = { outcome: 'APPROVED', justification: 'Reviewed against study VT-AF1-DX-01.' };

    it('returns 409 when the claim has never been assessed — the governance gate', async () => {
      const claim = await createClaim();

      const res = await http().post(`/api/claims/${claim.id}/decision`).send(decision).expect(409);

      expect(res.body.message).toMatch(/no assessed assertions yet/);
      const after = await http().get(`/api/claims/${claim.id}`).expect(200);
      expect(after.body).toMatchObject({ status: 'DRAFTED', decisions: [] });
    });

    it('records the decision against the run it signed off and updates the status', async () => {
      const claim = await createClaim();
      await http().post(`/api/claims/${claim.id}/assess`).expect(200);

      const res = await http().post(`/api/claims/${claim.id}/decision`).send(decision).expect(200);

      expect(res.body.status).toBe('APPROVED');
      expect(res.body.decisions).toHaveLength(1);
      expect(res.body.decisions[0]).toMatchObject({
        outcome: 'APPROVED',
        justification: decision.justification,
        runId: res.body.runs[0].id,
      });
    });

    it('returns a SENT_BACK claim to ASSESSED on re-assessment, keeping the full history', async () => {
      const claim = await createClaim();
      await http().post(`/api/claims/${claim.id}/assess`).expect(200);
      await http()
        .post(`/api/claims/${claim.id}/decision`)
        .send({ outcome: 'SENT_BACK', justification: 'Headline figure is subgroup-only.' })
        .expect(200);

      const res = await http().post(`/api/claims/${claim.id}/assess`).expect(200);

      expect(res.body.status).toBe('ASSESSED');
      expect(res.body.runs).toHaveLength(2);
      expect(res.body.decisions).toHaveLength(1);
    });

    it('rejects an invalid outcome or blank justification with 400', async () => {
      const claim = await createClaim();
      const res = await http()
        .post(`/api/claims/${claim.id}/decision`)
        .send({ outcome: 'ASSESSED', justification: ' ' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'outcome must be one of the following values: APPROVED, SENT_BACK',
          'justification must not be blank',
        ]),
      );
    });
  });

  describe('CORS', () => {
    it('allows the Vite dev server and no other origin', async () => {
      await http()
        .get('/api/claims')
        .set('Origin', 'http://localhost:5173')
        .expect('Access-Control-Allow-Origin', 'http://localhost:5173');

      const other = await http().get('/api/claims').set('Origin', 'https://evil.example');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
