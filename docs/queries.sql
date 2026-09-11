-- Evidence Gate: inspection and invariant queries, one section per feature.
--
-- Run everything:   psql -d evidence_gate -f docs/queries.sql
-- Or paste single queries into psql or pgAdmin's Query Tool.
--
-- The whole file runs inside a READ ONLY transaction, so it cannot change data.
-- Sections 1-7 show data. The INVARIANTS section must return ZERO rows for every
-- query; any row means an audit record is inconsistent.
-- Column names are camelCase, so they must be double-quoted.

BEGIN READ ONLY;

-- 1. Claims and their workflow status ---------------------------------------
SELECT id, "productRef", market, status, "createdAt"
FROM "Claim"
ORDER BY "createdAt" DESC;

-- 2. Run provenance: exactly what produced each verdict ----------------------
SELECT r."createdAt", c."productRef", r."overallVerdict", r."modelId", r."promptVersion",
       left(r."promptHash", 12) AS prompt_hash, r.temperature, r."maxTokens",
       r."latencyMs", r."inputTokens", r."outputTokens"
FROM "AssessmentRun" r
JOIN "Claim" c ON c.id = r."claimId"
ORDER BY r."createdAt" DESC;

-- 3. Assertions of the latest run, with the passage each quote matched -------
-- matched_passage is the text the UI highlights. matchedAt/matchedLength are
-- JavaScript string offsets; they equal PostgreSQL character offsets unless the
-- evidence contains characters outside the Basic Multilingual Plane.
SELECT a.verdict, a.confidence, a."quoteVerified",
       left(a.text, 60) AS assertion,
       substr(c."evidenceText", a."matchedAt" + 1, a."matchedLength") AS matched_passage
FROM "Assertion" a
JOIN "AssessmentRun" r ON r.id = a."runId"
JOIN "Claim" c ON c.id = r."claimId"
WHERE r.id = (SELECT id FROM "AssessmentRun" ORDER BY "createdAt" DESC LIMIT 1);

-- 4. Where the pipeline overrode the model -----------------------------------
-- Compares the model's own verdict (read from the unedited raw response) with
-- the stored verdict. Rows appear only when a quote was not found in the source.
WITH model AS (
  SELECT r.id AS run_id,
         m->>'text' AS text,
         m->>'quotedExcerpt' AS quote,
         m->>'verdict' AS model_verdict
  FROM "AssessmentRun" r,
       jsonb_array_elements(
         ((jsonb_path_query_first(r."rawResponse", '$.content[*] ? (@.type == "text").text') #>> '{}')::jsonb)
           -> 'assertions'
       ) AS m
)
SELECT a."runId", left(a.text, 50) AS assertion, m.model_verdict,
       a.verdict AS final_verdict, a."quoteVerified"
FROM "Assertion" a
JOIN model m ON m.run_id = a."runId" AND m.text = a.text AND m.quote = a."quotedExcerpt"
WHERE m.model_verdict <> a.verdict;

-- 5. Human decisions and the run each one signed off ------------------------
SELECT d."createdAt", c."productRef", d.outcome, d.justification,
       d."runId", r."overallVerdict" AS run_verdict
FROM "Decision" d
JOIN "Claim" c ON c.id = d."claimId"
JOIN "AssessmentRun" r ON r.id = d."runId"
ORDER BY d."createdAt" DESC;

-- 6. Evidence integrity: true means unchanged since it was hashed ------------
SELECT "productRef",
       "evidenceHash" = encode(sha256(convert_to("evidenceText", 'UTF8')), 'hex') AS evidence_unchanged
FROM "Claim";

-- 7. Spend so far, at $1 / $5 per million input / output tokens --------------
-- Update the two rates if the pinned model in assessment.config.ts changes.
SELECT count(*) AS runs,
       sum("inputTokens") AS input_tokens,
       sum("outputTokens") AS output_tokens,
       round(coalesce(sum("inputTokens"), 0) / 1e6 * 1
           + coalesce(sum("outputTokens"), 0) / 1e6 * 5, 4) AS usd
FROM "AssessmentRun";

-- ===== INVARIANTS: every query below must return ZERO rows ==================

-- I1. A run with no assertions. Runs and assertions are written in one transaction.
SELECT r.id AS run_without_assertions
FROM "AssessmentRun" r
WHERE NOT EXISTS (SELECT 1 FROM "Assertion" a WHERE a."runId" = r.id);

-- I2. An unverified quote whose verdict is not UNSUPPORTED. The model never gets the last word.
SELECT id AS unverified_but_not_unsupported, verdict
FROM "Assertion"
WHERE NOT "quoteVerified" AND verdict <> 'UNSUPPORTED';

-- I3. Highlight span inconsistent with verification: verified quotes need a span,
--     unverified quotes must not have one.
SELECT id AS inconsistent_span
FROM "Assertion"
WHERE "quoteVerified" <> ("matchedAt" IS NOT NULL AND "matchedLength" IS NOT NULL)
   OR ("matchedAt" IS NULL) <> ("matchedLength" IS NULL);

-- I4. Stored overall verdict differs from the one derived from its assertions.
SELECT v.id AS wrong_overall_verdict, v."overallVerdict", v.derived
FROM (
  SELECT r.id, r."overallVerdict",
         CASE WHEN bool_or(a.verdict = 'UNSUPPORTED') THEN 'NOT_SUBSTANTIATED'
              WHEN bool_and(a.verdict = 'SUPPORTED') THEN 'SUBSTANTIATED'
              ELSE 'PARTIAL' END AS derived
  FROM "AssessmentRun" r
  JOIN "Assertion" a ON a."runId" = r.id
  GROUP BY r.id
) v
WHERE v."overallVerdict" <> v.derived;

-- I5. A model ID that is not a dated snapshot. Aliases are never allowed.
SELECT DISTINCT "modelId" AS undated_model_id
FROM "AssessmentRun"
WHERE "modelId" !~ '-[0-9]{8}$';

-- I6. Evidence edited after it was hashed.
SELECT id AS evidence_changed
FROM "Claim"
WHERE "evidenceHash" <> encode(sha256(convert_to("evidenceText", 'UTF8')), 'hex');

-- I7. A decision against a run with no assertions. This is what the 409 gate prevents.
SELECT d.id AS decision_without_assessment
FROM "Decision" d
WHERE NOT EXISTS (SELECT 1 FROM "Assertion" a WHERE a."runId" = d."runId");

-- I8. A decision whose run belongs to a different claim.
SELECT d.id AS decision_on_wrong_run
FROM "Decision" d
JOIN "AssessmentRun" r ON r.id = d."runId"
WHERE r."claimId" <> d."claimId";

-- I9. Status out of step with history: assessed or decided with no run, or DRAFTED with one.
SELECT c.id AS status_out_of_step, c.status
FROM "Claim" c
WHERE (c.status <> 'DRAFTED') <> EXISTS (SELECT 1 FROM "AssessmentRun" r WHERE r."claimId" = c.id);

-- I10. APPROVED / SENT_BACK status that does not match the latest decision.
SELECT c.id AS status_not_latest_decision, c.status, d.outcome
FROM "Claim" c
LEFT JOIN LATERAL (
  SELECT outcome FROM "Decision" WHERE "claimId" = c.id ORDER BY "createdAt" DESC LIMIT 1
) d ON true
WHERE c.status IN ('APPROVED', 'SENT_BACK') AND c.status IS DISTINCT FROM d.outcome;

ROLLBACK;
