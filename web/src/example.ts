import type { NewClaim } from './api';

// Fictional product and test report (same as backend/prisma/seed.ts). The claim
// overstates the evidence: 32 hours is the noise-cancelling-off figure, and
// IPX4 means splash resistant, not waterproof.
export const EXAMPLE_CLAIM: NewClaim = {
  productRef: 'TS-T2',
  market: 'US',
  claimText:
    'The Tessel T2 wireless earbuds give you 32 hours of listening with noise cancelling on, a 10-minute charge gives 3 hours of playback, and they are waterproof.',
  evidenceText: `Title: Independent battery and durability test report, Tessel T2 wireless earbuds (report TR-2291)

Method: Six production units were tested at an independent audio lab between April and June 2025. Playback used the same music playlist at 50% volume over Bluetooth from one phone. Each result is the median of the six units. Battery life was measured from full charge to shutdown, including recharges from the fully charged case.

Results: Total playback time with the charging case was 32.4 hours with active noise cancelling (ANC) off and 24.1 hours with ANC on. The earbuds alone lasted 8.1 hours with ANC off and 6.0 hours with ANC on. After a 10-minute charge from empty, the earbuds played for 3.1 hours with ANC off. A full charge of the case took 1 hour 52 minutes over USB-C.

Durability: The earbuds are rated IPX4 (resistant to splashing water). They were not tested for immersion, and the charging case has no water-resistance rating.

Limitations: Battery life at higher volume, or during calls rather than music, will be lower. Results apply to firmware 1.4.2 only.`,
};
