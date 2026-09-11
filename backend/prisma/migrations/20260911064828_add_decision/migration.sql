-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssessmentRun"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
