-- AlterEnum
ALTER TYPE "SessionMode" ADD VALUE 'review';

-- CreateTable
CREATE TABLE "QuestionReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "rightStreak" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastWrongAt" TIMESTAMP(3),
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionReview_userId_mastered_dueAt_idx" ON "QuestionReview"("userId", "mastered", "dueAt");

-- CreateIndex
CREATE INDEX "QuestionReview_userId_wrongCount_idx" ON "QuestionReview"("userId", "wrongCount");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReview_userId_questionId_key" ON "QuestionReview"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "QuestionReview" ADD CONSTRAINT "QuestionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReview" ADD CONSTRAINT "QuestionReview_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
