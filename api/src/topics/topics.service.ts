import { Injectable } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { MasteryState, adjustedScore, isWeak } from '../progress/mastery';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  /// The topic list, with this learner's progress folded in when they are
  /// signed in. `userId` is optional so the same endpoint serves the
  /// signed-out browsing case without a second code path.
  async list(userId: string | undefined, locale: Locale) {
    const topics = await this.prisma.topic.findMany({ orderBy: { order: 'asc' } });

    // One grouped count instead of a query per topic.
    const counts = await this.prisma.question.groupBy({
      by: ['topicId'],
      where: { status: 'published' },
      _count: { _all: true },
    });
    const countByTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));

    const mastery = userId
      ? new Map(
          (await this.prisma.topicMastery.findMany({ where: { userId } })).map((m) => [
            m.topicId,
            { attempts: m.attempts, correct: m.correct, ewma: m.ewma } as MasteryState,
          ]),
        )
      : new Map<string, MasteryState>();

    const empty: MasteryState = { attempts: 0, correct: 0, ewma: 0 };

    return topics.map((t) => {
      const m = mastery.get(t.id) ?? empty;
      return {
        id: t.id,
        slug: t.slug,
        order: t.order,
        title: locale === Locale.ru ? t.titleRu : t.titleUz,
        titleUz: t.titleUz,
        titleRu: t.titleRu,
        questionCount: countByTopic.get(t.id) ?? 0,
        progress: userId
          ? { attempts: m.attempts, correct: m.correct, score: Number(adjustedScore(m).toFixed(3)), weak: isWeak(m) }
          : null,
      };
    });
  }

  /// The rule sections a topic actually tests, derived from the ruleRefs on its
  /// published questions.
  ///
  /// Derived rather than stored as a Topic->Rule join: the questions already
  /// declare which rules they turn on, so a second mapping would be a copy that
  /// drifts. It also means importing new questions extends the lesson text for
  /// free.
  async rules(topicId: string, locale: Locale) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('Mavzu topilmadi');

    const questions = await this.prisma.question.findMany({
      where: { topicId, status: 'published' },
      select: { ruleRefs: true },
    });

    // Ordered by how many of the topic's questions lean on each rule, so the
    // rule that actually defines the topic leads the lesson.
    const weight = new Map<string, number>();
    for (const q of questions) {
      for (const code of q.ruleRefs) weight.set(code, (weight.get(code) ?? 0) + 1);
    }

    const codes = [...weight.keys()];
    const sections = codes.length
      ? await this.prisma.ruleSection.findMany({ where: { code: { in: codes } } })
      : [];

    return {
      topic: {
        id: topic.id,
        slug: topic.slug,
        title: locale === Locale.ru ? topic.titleRu : topic.titleUz,
      },
      questionCount: questions.length,
      rules: sections
        .sort((a, b) => (weight.get(b.code) ?? 0) - (weight.get(a.code) ?? 0) || a.order - b.order)
        .map((r) => ({
          code: r.code,
          title: locale === Locale.ru ? r.titleRu : r.titleUz,
          body: locale === Locale.ru ? r.bodyRu : r.bodyUz,
          questionCount: weight.get(r.code) ?? 0,
        })),
    };
  }
}
