/**
 * Request settings for every assessment. Each value is stored on the
 * AssessmentRun it produces, so changing one here changes what future runs
 * record — past runs keep the values they were made with.
 */
export const ASSESSMENT_MODEL_CONFIG = {
  // Exact dated snapshot, never an alias: an alias can be repointed to a newer
  // model, silently changing what produced the verdicts stored under its name.
  // Claude Haiku 4.5 — the cheapest current model; chosen for POC budget.
  modelId: 'claude-haiku-4-5-20251001',
  // 0 minimises run-to-run variation. It does not guarantee identical output.
  temperature: 0,
  // Caps worst-case output cost per call. A typical claim needs well under this;
  // hitting it fails the run rather than persisting a truncated assessment.
  maxTokens: 4096,
} as const;

const DATED_MODEL_ID = /^claude-[a-z0-9-]+-\d{8}$/;

/** Throws unless modelId ends in an 8-digit snapshot date (e.g. claude-haiku-4-5-20251001). */
export function assertPinnedModelId(modelId: string): string {
  if (!DATED_MODEL_ID.test(modelId)) {
    throw new Error(
      `Assessment modelId "${modelId}" is not a dated snapshot. ` +
        'Pin an exact dated model ID (e.g. claude-haiku-4-5-20251001), never an alias such as ' +
        '"claude-haiku-4-5" or "*-latest", so stored verdicts always name the model that produced them.',
    );
  }
  return modelId;
}
