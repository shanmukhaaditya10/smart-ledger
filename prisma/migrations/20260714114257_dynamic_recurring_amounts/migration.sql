-- CreateEnum
CREATE TYPE "AmountMode" AS ENUM ('FIXED', 'PAYOFF', 'SWEEP_SURPLUS');

-- AlterTable
ALTER TABLE "RecurringRule" ADD COLUMN     "amountMode" "AmountMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "thresholdMinor" BIGINT;
