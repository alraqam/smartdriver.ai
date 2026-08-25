import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PackFingerprint, packVersion } from './pack-version';

/// An offline pack is the published question bank, answer key included, small
/// enough to sit on a phone.
///
/// Shipping the key is the whole tension here, and the line is drawn at the
/// mode rather than fudged:
///
///   - PRACTICE may run offline. It already reveals the correct option the
///     instant an answer is submitted, so the key is not a secret it was
///     keeping — and the underlying traffic rules are public material that
///     every competing app ships in a PDF.
///   - EXAMS never may. Their value is that the server owns the paper, the
///     clock and the score. A downloadable exam is not an exam.
///
/// That is the same line the service worker draws around `/api`, for the same
/// reason: the things that must be trustworthy stay on the server.
@Injectable()
export class OfflineService {
  constructor(private readonly prisma: PrismaService) {}

  /// The pack's current version, without building the pack. This is what makes
  /// a conditional request cheap — the common case is a learner opening the app
  /// with an already-current pack, and that should cost one aggregate, not a
  /// full serialisation of the bank.
  async version(): Promise<string> {
    return packVersion(await this.fingerprint());
  }

  private async fingerprint(): Promise<PackFingerprint> {
    const [agg, topics] = await Promise.all([
      this.prisma.question.aggregate({
        where: { status: 'published' },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      this.prisma.topic.findMany({
        orderBy: { order: 'asc' },
        select: { id: true, slug: true, order: true, titleUz: true, titleRu: true },
      }),
    ]);

    return {
      questionCount: agg._count._all,
      latestUpdate: agg._max.updatedAt,
      topics,
    };
  }

  async pack() {
    const fp = await this.fingerprint();

    const questions = await this.prisma.question.findMany({
      where: { status: 'published' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        topicId: true,
        difficulty: true,
        imageUrl: true,
        textUz: true,
        textRu: true,
        sourceNoteUz: true,
        sourceNoteRu: true,
        ruleRefs: true,
        options: {
          orderBy: { order: 'asc' },
          select: { id: true, order: true, textUz: true, textRu: true, isCorrect: true },
        },
      },
    });

    return {
      version: packVersion(fp),
      generatedAt: new Date().toISOString(),
      // Practice only, stated in the payload as well as the docs, so a client
      // author who never reads this file still cannot mistake it for an exam
      // bank. The sync endpoint enforces it regardless of what the client does.
      modes: ['practice'],
      topics: fp.topics,
      questions,
    };
  }
}
