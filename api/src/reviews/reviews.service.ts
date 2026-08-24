import { Injectable, Logger } from '@nestjs/common';
import { Locale, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MASTERED_BOX, ReviewState, recordAnswer, reviewProgress } from './schedule';

/// Questions in a review drill. Short by design — a review session is meant to
/// be a five-minute clear-down of what is due, not another exam.
export const REVIEW_SESSION_SIZE = 10;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger('ReviewsService');

  constructor(private readonly prisma: PrismaService) {}

  /// Fold one answered question into the learner's mistake bank.
  ///
  /// Takes a transaction client so it runs inside the same transaction as the
  /// answer that produced it — a review row that disagrees with the answer it
  /// came from would be worse than no row at all.
  async record(
    tx: Prisma.TransactionClient,
    userId: string,
    questionId: string,
    isCorrect: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    const existing = await tx.questionReview.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });

    const prev: ReviewState | null = existing
      ? {
          box: existing.box,
          wrongCount: existing.wrongCount,
          rightStreak: existing.rightStreak,
          dueAt: existing.dueAt,
          lastWrongAt: existing.lastWrongAt,
          mastered: existing.mastered,
        }
      : null;

    const next = recordAnswer(prev, isCorrect, now);
    // null means "nothing worth tracking" — a question answered right that was
    // never missed. Creating a row for it would turn the mistake bank into a
    // schedule over the entire question bank.
    if (!next) return;

    await tx.questionReview.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId, ...next },
      update: next,
    });
  }

  /// Everything currently due, most-missed first, capped.
  async due(userId: string, take = REVIEW_SESSION_SIZE) {
    return this.prisma.questionReview.findMany({
      where: { userId, mastered: false, dueAt: { lte: new Date() } },
      // A question missed five times outranks one missed once; among equals,
      // the one waiting longest goes first.
      orderBy: [{ wrongCount: 'desc' }, { dueAt: 'asc' }],
      take,
    });
  }

  async dueCount(userId: string): Promise<number> {
    return this.prisma.questionReview.count({
      where: { userId, mastered: false, dueAt: { lte: new Date() } },
    });
  }

  /// The mistake bank screen: everything ever missed, with its standing.
  async list(
    userId: string,
    locale: Locale,
    filter: 'open' | 'due' | 'mastered' | 'all' = 'open',
  ) {
    const now = new Date();
    const where: Prisma.QuestionReviewWhereInput = { userId };
    if (filter === 'open') where.mastered = false;
    else if (filter === 'due') { where.mastered = false; where.dueAt = { lte: now }; }
    else if (filter === 'mastered') where.mastered = true;

    const rows = await this.prisma.questionReview.findMany({
      where,
      orderBy: [{ mastered: 'asc' }, { wrongCount: 'desc' }, { dueAt: 'asc' }],
      take: 200,
      include: {
        question: {
          include: { topic: true, options: { orderBy: { order: 'asc' } } },
        },
      },
    });

    const [openCount, dueCount, masteredCount] = await Promise.all([
      this.prisma.questionReview.count({ where: { userId, mastered: false } }),
      this.dueCount(userId),
      this.prisma.questionReview.count({ where: { userId, mastered: true } }),
    ]);

    return {
      counts: { open: openCount, due: dueCount, mastered: masteredCount },
      items: rows.map((r) => {
        const state: ReviewState = {
          box: r.box,
          wrongCount: r.wrongCount,
          rightStreak: r.rightStreak,
          dueAt: r.dueAt,
          lastWrongAt: r.lastWrongAt,
          mastered: r.mastered,
        };
        return {
          questionId: r.questionId,
          topicId: r.question.topicId,
          topicTitle: locale === Locale.ru ? r.question.topic.titleRu : r.question.topic.titleUz,
          text: locale === Locale.ru ? r.question.textRu : r.question.textUz,
          imageUrl: r.question.imageUrl,
          correctAnswer: (() => {
            const o = r.question.options.find((x) => x.isCorrect);
            return o ? (locale === Locale.ru ? o.textRu : o.textUz) : '';
          })(),
          wrongCount: r.wrongCount,
          box: r.box,
          maxBox: MASTERED_BOX,
          progress: Number(reviewProgress(state).toFixed(3)),
          mastered: r.mastered,
          due: !r.mastered && r.dueAt.getTime() <= now.getTime(),
          dueAt: r.dueAt,
          lastWrongAt: r.lastWrongAt,
        };
      }),
    };
  }
}
