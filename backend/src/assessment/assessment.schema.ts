import { z } from 'zod';

export const ASSERTION_VERDICTS = ['SUPPORTED', 'PARTIAL', 'UNSUPPORTED'] as const;
export type AssertionVerdict = (typeof ASSERTION_VERDICTS)[number];

export const OVERALL_VERDICTS = ['SUBSTANTIATED', 'PARTIAL', 'NOT_SUBSTANTIATED'] as const;
export type OverallVerdict = (typeof OVERALL_VERDICTS)[number];

/**
 * The exact shape the model must return. Sent to the API as the structured-output
 * JSON schema and re-checked locally, so constraints the API cannot enforce
 * (integer range, non-empty arrays/strings) are still enforced here.
 *
 * overallVerdict is deliberately absent: it is derived in code from the
 * verified assertions, never taken from the model.
 */
export const ModelAssertionSchema = z
  .object({
    text: z.string().min(1).describe('One factual assertion from the claim, stated on its own.'),
    verdict: z.enum(ASSERTION_VERDICTS),
    confidence: z.number().int().min(0).max(100),
    rationale: z.string().min(1).describe('One sentence explaining the verdict.'),
    quotedExcerpt: z
      .string()
      .describe('Passage copied verbatim from the evidence, or "" if nothing is relevant.'),
  })
  .strict();

export const ModelAssessmentSchema = z
  .object({
    assertions: z.array(ModelAssertionSchema).min(1),
  })
  .strict();

export type ModelAssertion = z.infer<typeof ModelAssertionSchema>;
export type ModelAssessment = z.infer<typeof ModelAssessmentSchema>;
