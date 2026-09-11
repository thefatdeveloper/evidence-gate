import type { NewClaim } from './api';

// Fictional device and study (same as backend/prisma/seed.ts). The claim
// overstates the evidence: 98% is a subgroup figure, and nobody under 22 was enrolled.
export const EXAMPLE_CLAIM: NewClaim = {
  productRef: 'VT-AF1',
  market: 'US',
  claimText:
    'The VitaTrace AF-1 wearable ECG patch detects atrial fibrillation with 98% sensitivity, clinically proven in adults over 18.',
  evidenceText: `Title: Diagnostic accuracy of a 14-day single-lead wearable ECG patch for atrial fibrillation detection: a prospective multicenter study (VT-AF1-DX-01)

Methods: Adults referred for ambulatory rhythm monitoring at three US cardiology centers were enrolled between March 2024 and January 2025. Participants wore the VitaTrace AF-1 patch and a reference 12-lead Holter monitor concurrently for up to 14 days. Holter recordings were adjudicated by two board-certified cardiologists blinded to patch output; disagreements were resolved by a third reader. Atrial fibrillation (AF) was defined as an irregular rhythm without discernible P waves lasting at least 30 seconds. Patients with implanted pacemakers or defibrillators were excluded.

Results: 412 participants completed monitoring (median age 64 years, range 22-84; 47% female). The reference standard identified AF in 139 participants. For detection of any AF episode of 30 seconds or longer, the patch algorithm achieved a sensitivity of 96.4% (95% CI 91.8-98.8%) and a specificity of 98.7% (95% CI 96.6-99.6%). For AF episodes lasting 6 minutes or longer (n=112), sensitivity was 98.2% (95% CI 93.7-99.8%). Median wear time was 13.1 days; 4.6% of recorded time was classified as unanalyzable due to signal noise.

Limitations: The study population was drawn from patients already referred for rhythm monitoring and may not represent screening of the general population. No participants under 22 years of age were enrolled.`,
};
