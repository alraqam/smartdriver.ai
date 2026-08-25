import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionQueryDto } from './dto';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /// Content overview: what exists, and what is waiting to be reviewed.
  async stats() {
    const [byStatus, byTopic, rules, topics, imports] = await Promise.all([
      this.prisma.question.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.question.groupBy({ by: ['topicId', 'status'], _count: { _all: true } }),
      this.prisma.ruleSection.count(),
      this.prisma.topic.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.contentImport.count(),
    ]);

    const statusOf = (s: ContentStatus) =>
      byStatus.find((r) => r.status === s)?._count._all ?? 0;

    // Questions whose ruleRefs point at codes with no RuleSection behind them.
    // Surfaced here because it is invisible to a learner and silently
    // degrades every explanation for those questions.
    const withRefs = await this.prisma.question.findMany({
      where: { ruleRefs: { isEmpty: false } },
      select: { ruleRefs: true },
    });
    const known = new Set(
      (await this.prisma.ruleSection.findMany({ select: { code: true } })).map((r) => r.code),
    );
    const dangling = [...new Set(withRefs.flatMap((q) => q.ruleRefs))].filter((c) => !known.has(c));

    const noRefs = await this.prisma.question.count({
      where: { status: 'published', ruleRefs: { isEmpty: true } },
    });

    return {
      questions: {
        draft: statusOf(ContentStatus.draft),
        published: statusOf(ContentStatus.published),
        retired: statusOf(ContentStatus.retired),
        total: byStatus.reduce((s, r) => s + r._count._all, 0),
      },
      rules,
      imports,
      /// Published questions with no rule references — their AI explanations
      /// have nothing to cite.
      ungroundedQuestions: noRefs,
      danglingRuleRefs: dangling,
      topics: topics.map((t) => {
        const rows = byTopic.filter((r) => r.topicId === t.id);
        const count = (s: ContentStatus) =>
          rows.find((r) => r.status === s)?._count._all ?? 0;
        return {
          id: t.id,
          slug: t.slug,
          titleUz: t.titleUz,
          titleRu: t.titleRu,
          draft: count(ContentStatus.draft),
          published: count(ContentStatus.published),
          retired: count(ContentStatus.retired),
        };
      }),
    };
  }

  /// The review queue. Defaults to drafts, which is what a reviewer opens for.
  async questions(query: QuestionQueryDto) {
    const take = Math.min(MAX_TAKE, Math.max(1, query.take ?? DEFAULT_TAKE));
    const skip = Math.max(0, query.skip ?? 0);

    const where: Prisma.QuestionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.topicId) where.topicId = query.topicId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { textUz: { contains: q, mode: 'insensitive' } },
        { textRu: { contains: q, mode: 'insensitive' } },
        { externalId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
        include: {
          topic: true,
          options: { orderBy: { order: 'asc' } },
        },
      }),
    ]);

    return {
      total,
      skip,
      take,
      items: rows.map((q) => ({
        id: q.id,
        externalId: q.externalId,
        status: q.status,
        difficulty: q.difficulty,
        imageUrl: q.imageUrl,
        textUz: q.textUz,
        textRu: q.textRu,
        sourceNoteUz: q.sourceNoteUz,
        sourceNoteRu: q.sourceNoteRu,
        ruleRefs: q.ruleRefs,
        reviewedAt: q.reviewedAt,
        createdAt: q.createdAt,
        topic: { id: q.topic.id, slug: q.topic.slug, titleUz: q.topic.titleUz, titleRu: q.topic.titleRu },
        options: q.options.map((o) => ({
          id: o.id,
          order: o.order,
          textUz: o.textUz,
          textRu: o.textRu,
          isCorrect: o.isCorrect,
        })),
      })),
    };
  }

  async setStatus(id: string, status: ContentStatus) {
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Savol topilmadi');

    const q = await this.prisma.question.update({
      where: { id },
      data: {
        status,
        // Stamped on any deliberate status change, so "who has looked at this"
        // is answerable later. Only set when leaving draft — re-retiring a
        // published question is also a review decision.
        reviewedAt: new Date(),
      },
    });
    return { id: q.id, externalId: q.externalId, status: q.status, reviewedAt: q.reviewedAt };
  }

  /// Edit the fields a reviewer changes by hand. Deliberately narrow: the
  /// question TEXT stays owned by the import file, so an edit here cannot be
  /// silently reverted by the next re-import.
  async updateQuestion(id: string, patch: { imageUrl?: string | null; difficulty?: number }) {
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Savol topilmadi');

    // Only accept a path this API produced. A full URL here would let an admin
    // point every question at a third party who then sees every learner.
    if (patch.imageUrl != null && !/^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(patch.imageUrl)) {
      throw new BadRequestException("imageUrl /api/uploads/ ostidagi yo'l bo'lishi kerak");
    }

    const q = await this.prisma.question.update({
      where: { id },
      data: {
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
        ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
      },
    });
    return { id: q.id, externalId: q.externalId, imageUrl: q.imageUrl, difficulty: q.difficulty };
  }

  async setStatusBulk(ids: string[], status: ContentStatus) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.question.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((f) => f.id));
    const missing = unique.filter((id) => !foundIds.has(id));

    const res = await this.prisma.question.updateMany({
      where: { id: { in: [...foundIds] } },
      data: { status, reviewedAt: new Date() },
    });

    // Missing ids are reported rather than silently dropped: a bulk publish
    // that quietly did less than asked is how a review queue loses work.
    return { updated: res.count, requested: unique.length, missing };
  }

  async imports(take = 30) {
    const rows = await this.prisma.contentImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, take),
    });
    return rows;
  }

  /// AI spend, so the explanation cache and the tutor limit can be checked
  /// against reality rather than assumed to be working.
  async aiUsage(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byFeature, recent, total] = await Promise.all([
      this.prisma.aiUsage.groupBy({
        by: ['feature', 'mock'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
      }),
      this.prisma.aiUsage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, feature: true, model: true, mock: true,
          inputTokens: true, outputTokens: true, cacheReadTokens: true, createdAt: true,
        },
      }),
      this.prisma.aiUsage.count(),
    ]);

    const cachedExplanations = await this.prisma.questionExplanation.count();

    return {
      windowDays: days,
      totalCallsAllTime: total,
      /// Every row here is a call that did NOT have to be made again.
      cachedExplanations,
      byFeature: byFeature.map((r) => ({
        feature: r.feature,
        mock: r.mock,
        calls: r._count._all,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        cacheReadTokens: r._sum.cacheReadTokens ?? 0,
      })),
      recent,
    };
  }
}
