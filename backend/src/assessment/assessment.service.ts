import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { CLAIM_STATUS } from '../claims/claim-status';
import { sha256 } from '../common/hash';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ANTHROPIC_CLIENT } from './anthropic.provider';
import { ASSESSMENT_MODEL_CONFIG, assertPinnedModelId } from './assessment.config';
import { applyQuoteVerification, deriveOverallVerdict } from './assessment.logic';
import { ModelAssessment, ModelAssessmentSchema } from './assessment.schema';
import { renderAssessmentPrompt } from './prompts';

/** Validator for the model's output; `schema` is the JSON schema the API enforces. */
const OUTPUT_FORMAT = zodOutputFormat(ModelAssessmentSchema);
/** Exactly what goes on the wire as output_config.format (no client-side parse function). */
const OUTPUT_JSON_FORMAT = { type: 'json_schema' as const, schema: OUTPUT_FORMAT.schema };

/** The model returned something that cannot be recorded as an assessment. Nothing is persisted. */
export class AssessmentResponseError extends BadGatewayException {
  constructor(
    message: string,
    readonly stopReason: string | null = null,
  ) {
    super(message);
    this.name = 'AssessmentResponseError';
  }
}

type ClaimReader = Pick<PrismaService, 'claim'>;

@Injectable()
export class AssessmentService {
  private readonly modelId = assertPinnedModelId(ASSESSMENT_MODEL_CONFIG.modelId);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Assesses a claim against its evidence and records the run.
   * claimId is required because a run is always recorded against a claim.
   */
  async assess(claimId: string, claimText: string, evidenceText: string) {
    // Checked before calling the model so a mismatch costs nothing.
    await this.assertEvidenceUnchanged(this.prisma, claimId, evidenceText);

    const { temperature, maxTokens } = ASSESSMENT_MODEL_CONFIG;
    const prompt = renderAssessmentPrompt({ claimText, evidenceText }, OUTPUT_JSON_FORMAT.schema);

    // The whole evidenceText is sent in one request: no chunking, no embeddings.
    // Retrieval is deliberately out of scope at this size — a single study fits
    // easily in the context window, and sending all of it means every quote can
    // be checked against the full text. Retrieval for larger evidence sets is
    // covered in the HLD.
    const started = performance.now();
    const response = await this.anthropic.messages.create({
      model: this.modelId,
      max_tokens: maxTokens,
      temperature,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      output_config: { format: OUTPUT_JSON_FORMAT },
    });
    const latencyMs = Math.round(performance.now() - started);

    const modelOutput = this.parseResponse(response);
    // The model does not get the last word: unverifiable quotes become UNSUPPORTED.
    const assertions = applyQuoteVerification(modelOutput.assertions, evidenceText);
    const overallVerdict = deriveOverallVerdict(assertions.map((a) => a.verdict));

    // One transaction: a run without its assertions (or the reverse) is a corrupt
    // audit record, and a claim must never be ASSESSED without the run behind it.
    return this.prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction in case the evidence was edited during the model call.
      await this.assertEvidenceUnchanged(tx, claimId, evidenceText);

      const run = await tx.assessmentRun.create({
        data: {
          claimId,
          modelId: this.modelId,
          promptVersion: prompt.promptVersion,
          promptHash: prompt.promptHash,
          temperature,
          maxTokens,
          overallVerdict,
          latencyMs,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          rawResponse: response as unknown as Prisma.InputJsonValue,
          assertions: { create: assertions },
        },
        include: { assertions: true },
      });
      // A new run supersedes any earlier sign-off, so the claim needs a fresh decision.
      await tx.claim.update({ where: { id: claimId }, data: { status: CLAIM_STATUS.ASSESSED } });
      return run;
    });
  }

  private async assertEvidenceUnchanged(
    db: ClaimReader,
    claimId: string,
    evidenceText: string,
  ): Promise<void> {
    const claim = await db.claim.findUnique({
      where: { id: claimId },
      select: { evidenceHash: true },
    });
    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found.`);
    }
    if (sha256(evidenceText) !== claim.evidenceHash) {
      throw new ConflictException(
        `The evidence text does not match the evidenceHash recorded on claim ${claimId}, ` +
          'so the evidence has changed since it was stored. Refusing to assess it.',
      );
    }
  }

  private parseResponse(response: Anthropic.Message): ModelAssessment {
    if (response.model !== this.modelId) {
      throw new AssessmentResponseError(
        `The response was produced by "${response.model}", not the pinned "${this.modelId}". ` +
          'Refusing to record it under the wrong model.',
      );
    }
    if (response.stop_reason === 'max_tokens') {
      throw new AssessmentResponseError(
        `The model's output was cut off at max_tokens (${ASSESSMENT_MODEL_CONFIG.maxTokens}), ` +
          'so the assessment is incomplete. Raise maxTokens in assessment.config.ts.',
        response.stop_reason,
      );
    }
    if (response.stop_reason !== 'end_turn') {
      throw new AssessmentResponseError(
        `The model stopped with stop_reason "${response.stop_reason}" instead of finishing its answer.`,
        response.stop_reason,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    try {
      return OUTPUT_FORMAT.parse(text);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new AssessmentResponseError(
        `The model's response did not match the assessment schema. ${detail}`,
        response.stop_reason,
      );
    }
  }
}
