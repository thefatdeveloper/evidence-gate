import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentService } from '../assessment/assessment.service';
import { sha256 } from '../common/hash';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { DecisionDto } from './dto/decision.dto';

/** Full audit view: every run (newest first) with its assertions, and every decision. */
const CLAIM_DETAIL_INCLUDE = {
  runs: { orderBy: { createdAt: 'desc' }, include: { assertions: true } },
  decisions: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ClaimInclude;

@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessment: AssessmentService,
  ) {}

  create(dto: CreateClaimDto) {
    return this.prisma.claim.create({
      data: {
        productRef: dto.productRef,
        claimText: dto.claimText,
        market: dto.market,
        evidenceText: dto.evidenceText,
        evidenceHash: sha256(dto.evidenceText),
      },
    });
  }

  /** Newest first, without the (large) evidence text, with each claim's latest verdict. */
  findAll() {
    return this.prisma.claim.findMany({
      orderBy: { createdAt: 'desc' },
      omit: { evidenceText: true },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, overallVerdict: true, createdAt: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: CLAIM_DETAIL_INCLUDE,
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found.`);
    return claim;
  }

  async assess(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      select: { claimText: true, evidenceText: true },
    });
    if (!claim) throw new NotFoundException(`Claim ${id} not found.`);

    // Writes the run, its assertions and status ASSESSED in one transaction.
    await this.assessment.assess(id, claim.claimText, claim.evidenceText);
    return this.findOne(id);
  }

  async decide(id: string, dto: DecisionDto) {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id }, select: { id: true } });
      if (!claim) throw new NotFoundException(`Claim ${id} not found.`);

      // Governance gate: a human cannot sign off on something that was never assessed.
      const latestRun = await tx.assessmentRun.findFirst({
        where: { claimId: id, assertions: { some: {} } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latestRun) {
        throw new ConflictException(
          `Claim ${id} has no assessed assertions yet, so there is nothing to sign off. ` +
            `Run POST /api/claims/${id}/assess first.`,
        );
      }

      await tx.decision.create({
        data: {
          claimId: id,
          runId: latestRun.id,
          outcome: dto.outcome,
          justification: dto.justification,
        },
      });
      await tx.claim.update({ where: { id }, data: { status: dto.outcome } });
    });

    return this.findOne(id);
  }
}
