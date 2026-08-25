import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Locale, SessionMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService, DEFAULT_PRACTICE_COUNT } from '../settings/settings.service';
import { MasteryState, adjustedScore, isWeak, readiness, updateMastery } from '../progress/mastery';
import { Candidate, RECENCY_WINDOW, selectForExam, selectForTopic, selectWeakTopics } from './selection';
import { ReviewsService, REVIEW_SESSION_SIZE } from '../reviews/reviews.service';
import { shuffleOptions } from './shuffle';
import { clampSessionWindow } from './offline-window';
import { OfflineSessionDto } from './sync.dto';

/// How many recent exams feed the readiness score.
const READINESS_EXAM_WINDOW = 5;

type OfflineSessionInput = OfflineSessionDto;

/// What happened to one queued drill. `duplicate` is a success, not a warning:
/// it means an earlier attempt already landed and the client can drop it.
interface SyncResult {
  clientId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  sessionId?: string;
  correctCount?: number;
  questionCount?: number;
  /// Answers whose question no longer exists on the server.
  dropped?: number;
  reason?: string;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reviews: ReviewsService,
  ) {}

  // ── creating a session ────────────────────────────────────

  async create(
    userId: string,
    mode: SessionMode,
    opts: { topicId?: string; count?: number } = {},
  ) {
    const exam = await this.settings.examConfig();

    if (mode === SessionMode.practice && !opts.topicId) {
      throw new BadRequestException('practice rejimi uchun topicId talab qilinadi');
    }
    if (mode !== SessionMode.practice && opts.topicId) {
      throw new BadRequestException(`${mode} rejimida topicId ishlatilmaydi`);
    }

    // A review drill draws from the mistake bank rather than the question bank,
    // so it skips candidate selection entirely — the schedule already decided
    // which questions are owed.
    if (mode === SessionMode.review) {
      const due = await this.reviews.due(userId, Math.min(REVIEW_SESSION_SIZE, Math.max(1, opts.count ?? REVIEW_SESSION_SIZE)));
      if (due.length === 0) {
        throw new ConflictException("Takrorlash uchun savol yo'q — hammasi bajarilgan.");
      }
      const created = await this.prisma.session.create({
        data: {
          userId,
          mode,
          questionCount: due.length,
          items: { create: due.map((r, order) => ({ questionId: r.questionId, order })) },
        },
      });
      return this.get(userId, created.id);
    }

    if (opts.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: opts.topicId } });
      if (!topic) throw new NotFoundException('Mavzu topilmadi');
    }

    const count =
      mode === SessionMode.exam
        ? exam.questionCount
        : Math.min(50, Math.max(1, opts.count ?? DEFAULT_PRACTICE_COUNT));

    const candidates = await this.candidates(userId, mode === SessionMode.practice ? opts.topicId : undefined);
    if (candidates.length === 0) {
      throw new ConflictException(
        'Bu mavzu uchun nashr etilgan savollar yo\'q. Kontentni import qiling.',
      );
    }

    let questionIds: string[];
    if (mode === SessionMode.exam) {
      questionIds = selectForExam(candidates, count);
    } else if (mode === SessionMode.weak_topics) {
      questionIds = selectWeakTopics(candidates, await this.masteryMap(userId), count);
    } else {
      questionIds = selectForTopic(candidates, count);
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        mode,
        topicId: opts.topicId ?? null,
        questionCount: questionIds.length,
        timeLimitSec: mode === SessionMode.exam ? exam.timeLimitSec : null,
        items: {
          create: questionIds.map((questionId, order) => ({ questionId, order })),
        },
      },
    });

    return this.get(userId, session.id);
  }

  /// Every question eligible for this learner, annotated with how recently
  /// they saw it. Only `published` questions are ever served — drafts and
  /// retired items exist for the content team, not for learners.
  private async candidates(userId: string, topicId?: string): Promise<Candidate[]> {
    const questions = await this.prisma.question.findMany({
      where: { status: 'published', ...(topicId ? { topicId } : {}) },
      select: { id: true, topicId: true, difficulty: true },
    });

    // Their most recent answers, newest first, to compute lastSeenAgo.
    const recent = await this.prisma.sessionItem.findMany({
      where: { session: { userId }, answeredAt: { not: null } },
      orderBy: { answeredAt: 'desc' },
      take: RECENCY_WINDOW,
      select: { questionId: true },
    });
    const seenAgo = new Map<string, number>();
    recent.forEach((r, i) => {
      if (!seenAgo.has(r.questionId)) seenAgo.set(r.questionId, i);
    });

    return questions.map((q) => ({
      id: q.id,
      topicId: q.topicId,
      difficulty: q.difficulty,
      lastSeenAgo: seenAgo.get(q.id) ?? Infinity,
    }));
  }

  private async masteryMap(userId: string): Promise<Map<string, MasteryState>> {
    const rows = await this.prisma.topicMastery.findMany({ where: { userId } });
    return new Map(
      rows.map((r) => [r.topicId, { attempts: r.attempts, correct: r.correct, ewma: r.ewma }]),
    );
  }

  // ── reading a session ─────────────────────────────────────

  async get(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            question: {
              include: { options: { orderBy: { order: 'asc' } }, topic: true },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Sessiya topilmadi');
    if (session.userId !== userId) throw new ForbiddenException('Bu sessiya sizga tegishli emas');

    // What may be revealed is decided PER ITEM, not per session. Practice
    // gives feedback as soon as an answer is submitted, but an unanswered
    // question must not ship its correct option to the client — otherwise the
    // answer key is sitting in the network tab and both practice and the
    // readiness score built on it mean nothing.
    const finished = session.finishedAt !== null;
    const revealAnswered = session.mode !== SessionMode.exam;

    return {
      id: session.id,
      mode: session.mode,
      topicId: session.topicId,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      questionCount: session.questionCount,
      correctCount: session.correctCount,
      timeLimitSec: session.timeLimitSec,
      passed: session.passed,
      secondsLeft: this.secondsLeft(session),
      items: session.items.map((it) => {
        const reveal = finished || (revealAnswered && it.answeredAt !== null);
        return {
          id: it.id,
          order: it.order,
          chosenOptionId: it.chosenOptionId,
          isCorrect: reveal ? it.isCorrect : null,
          answeredAt: it.answeredAt,
          question: {
            id: it.question.id,
            topicId: it.question.topicId,
            topicSlug: it.question.topic.slug,
            difficulty: it.question.difficulty,
            imageUrl: it.question.imageUrl,
            textUz: it.question.textUz,
            textRu: it.question.textRu,
            sourceNoteUz: reveal ? it.question.sourceNoteUz : null,
            sourceNoteRu: reveal ? it.question.sourceNoteRu : null,
            ruleRefs: reveal ? it.question.ruleRefs : [],
            options: shuffleOptions(it.id, it.question.options).map((o) => ({
              id: o.id,
              textUz: o.textUz,
              textRu: o.textRu,
              ...(reveal ? { isCorrect: o.isCorrect } : {}),
            })),
          },
        };
      }),
    };
  }

  private secondsLeft(session: { timeLimitSec: number | null; startedAt: Date; finishedAt: Date | null }) {
    if (session.timeLimitSec === null || session.finishedAt) return null;
    const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
    return Math.max(0, Math.round(session.timeLimitSec - elapsed));
  }

  async list(userId: string, take = 20) {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(100, take),
    });
    return sessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      topicId: s.topicId,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      questionCount: s.questionCount,
      correctCount: s.correctCount,
      passed: s.passed,
    }));
  }

  // ── answering ─────────────────────────────────────────────

  async answer(userId: string, sessionId: string, itemId: string, optionId: string, msSpent?: number) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sessiya topilmadi');
    if (session.userId !== userId) throw new ForbiddenException('Bu sessiya sizga tegishli emas');
    if (session.finishedAt) throw new ConflictException('Sessiya allaqachon yakunlangan');

    if (this.isExpired(session)) {
      // The timer ran out while they were on this question. Finish the exam
      // rather than accepting an answer that arrives after time — otherwise the
      // limit is advisory and a paused tab is a cheat code.
      await this.finish(userId, sessionId);
      throw new ConflictException('Imtihon vaqti tugadi');
    }

    const item = await this.prisma.sessionItem.findUnique({
      where: { id: itemId },
      include: { question: { include: { options: true } } },
    });
    if (!item || item.sessionId !== sessionId) {
      throw new NotFoundException('Savol bu sessiyada topilmadi');
    }
    const option = item.question.options.find((o) => o.id === optionId);
    if (!option) throw new BadRequestException('Javob varianti bu savolga tegishli emas');

    const isCorrect = option.isCorrect;
    const isExam = session.mode === SessionMode.exam;

    // In an EXAM an answer stays revisable until the paper is handed in — that
    // is how the real test works, and the runner lets a learner navigate back.
    // So the exam defers everything derived from answers (the score, mastery)
    // to finish(); re-answering would otherwise double-count.
    //
    // In practice mode an answer is final: feedback has already been shown, so
    // letting them change it afterwards would just be a way to fake a score.
    if (!isExam && item.answeredAt) {
      throw new ConflictException('Bu savolga allaqachon javob berilgan');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sessionItem.update({
        where: { id: itemId },
        data: {
          chosenOptionId: optionId,
          isCorrect,
          answeredAt: new Date(),
          msSpent: msSpent ?? null,
        },
      });

      if (isExam) return;

      if (isCorrect) {
        await tx.session.update({
          where: { id: sessionId },
          data: { correctCount: { increment: 1 } },
        });
      }

      // Mastery updates as each answer lands, not at finish: an abandoned
      // session should still teach the model something, and the learner's weak
      // topics should reflect what they just did.
      const existing = await tx.topicMastery.findUnique({
        where: { userId_topicId: { userId, topicId: item.question.topicId } },
      });
      const next = updateMastery(
        existing
          ? { attempts: existing.attempts, correct: existing.correct, ewma: existing.ewma }
          : { attempts: 0, correct: 0, ewma: 0 },
        isCorrect,
      );
      await tx.topicMastery.upsert({
        where: { userId_topicId: { userId, topicId: item.question.topicId } },
        create: { userId, topicId: item.question.topicId, ...next },
        update: next,
      });

      // Same transaction as the answer: a mistake-bank row that disagrees with
      // the answer that produced it would be worse than no row.
      await this.reviews.record(tx, userId, item.questionId, isCorrect);
    });

    const correctOption = item.question.options.find((o) => o.isCorrect)!;
    const reveal = session.mode !== SessionMode.exam;

    return {
      itemId,
      // Exam mode gives nothing back until the end — same as the real thing.
      isCorrect: reveal ? isCorrect : null,
      correctOptionId: reveal ? correctOption.id : null,
      sourceNoteUz: reveal ? item.question.sourceNoteUz : null,
      sourceNoteRu: reveal ? item.question.sourceNoteRu : null,
    };
  }

  private isExpired(session: { timeLimitSec: number | null; startedAt: Date }) {
    if (session.timeLimitSec === null) return false;
    return (Date.now() - session.startedAt.getTime()) / 1000 > session.timeLimitSec;
  }

  // ── finishing ─────────────────────────────────────────────

  async finish(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { items: true },
    });
    if (!session) throw new NotFoundException('Sessiya topilmadi');
    if (session.userId !== userId) throw new ForbiddenException('Bu sessiya sizga tegishli emas');

    if (!session.finishedAt) {
      const exam = await this.settings.examConfig();
      const isExam = session.mode === SessionMode.exam;

      // The exam's score is computed HERE, not as answers arrive, because they
      // stay revisable until submission (see answer()). Practice already has an
      // accurate correctCount by this point.
      const correctCount = isExam
        ? session.items.filter((it) => it.isCorrect === true).length
        : session.correctCount;

      // Unanswered questions count as wrong: leaving the exam half-done is not
      // the same as passing it.
      const wrong = session.questionCount - correctCount;
      const passed = isExam ? wrong <= exam.maxErrors : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: sessionId },
          data: { finishedAt: new Date(), passed, correctCount },
        });

        // Exam mastery is applied once, at submission, for the answers the
        // learner actually settled on.
        if (!isExam) return;

        const answered = session.items.filter((it) => it.answeredAt !== null);
        if (answered.length === 0) return;

        const questions = await tx.question.findMany({
          where: { id: { in: answered.map((it) => it.questionId) } },
          select: { id: true, topicId: true },
        });
        const topicOf = new Map(questions.map((q) => [q.id, q.topicId]));

        // Folded per topic in memory first, so a 20-question exam is a handful
        // of upserts rather than twenty read-modify-writes.
        const byTopic = new Map<string, boolean[]>();
        for (const it of answered) {
          const topicId = topicOf.get(it.questionId);
          if (!topicId) continue;
          const list = byTopic.get(topicId) ?? [];
          list.push(it.isCorrect === true);
          byTopic.set(topicId, list);
        }

        // Exam answers feed the mistake bank as well — a question missed under
        // exam conditions is exactly the one worth drilling.
        for (const it of answered) {
          await this.reviews.record(tx, userId, it.questionId, it.isCorrect === true);
        }

        for (const [topicId, results] of byTopic) {
          const existing = await tx.topicMastery.findUnique({
            where: { userId_topicId: { userId, topicId } },
          });
          let state: MasteryState = existing
            ? { attempts: existing.attempts, correct: existing.correct, ewma: existing.ewma }
            : { attempts: 0, correct: 0, ewma: 0 };
          for (const ok of results) state = updateMastery(state, ok);
          await tx.topicMastery.upsert({
            where: { userId_topicId: { userId, topicId } },
            create: { userId, topicId, ...state },
            update: state,
          });
        }
      });
    }

    const full = await this.get(userId, sessionId);
    return { ...full, readiness: await this.readiness(userId) };
  }

  // ── syncing offline practice ──────────────────────────────

  /// Replay practice drills that happened on a device with no connection.
  ///
  /// Three rules hold this together, and all three are about not trusting the
  /// device that just spent an hour alone with the answer key:
  ///
  ///  1. **The server re-grades.** The client sends which option was tapped,
  ///     never whether it was right. Readiness is built on these numbers.
  ///  2. **Practice only.** The mode is set here, not read from the request.
  ///     An exam whose paper and clock lived on the learner's phone is not an
  ///     exam, and no request shape should be able to ask for one.
  ///  3. **Idempotent on `clientId`.** Reconnects are flaky by nature: the
  ///     queue flushes, the response is lost, the queue flushes again. Landing
  ///     twice must be indistinguishable from landing once.
  async syncOffline(userId: string, sessions: OfflineSessionInput[]) {
    const results: SyncResult[] = [];
    for (const s of sessions) {
      try {
        results.push(await this.syncOne(userId, s));
      } catch (err) {
        // One malformed drill must not cost the learner the rest of the queue,
        // so a failure is reported per session rather than thrown for the batch.
        results.push({
          clientId: s.clientId,
          status: 'rejected',
          reason: err instanceof Error ? err.message : 'nomaʼlum xatolik',
        });
      }
    }

    return {
      results,
      accepted: results.filter((r) => r.status === 'accepted').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
      readiness: await this.readiness(userId),
    };
  }

  private async syncOne(userId: string, dto: OfflineSessionInput): Promise<SyncResult> {
    const existing = await this.prisma.session.findUnique({
      where: { userId_clientId: { userId, clientId: dto.clientId } },
      select: { id: true, correctCount: true, questionCount: true },
    });
    if (existing) {
      return {
        clientId: dto.clientId,
        status: 'duplicate',
        sessionId: existing.id,
        correctCount: existing.correctCount,
        questionCount: existing.questionCount,
      };
    }

    const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
    if (!topic) throw new NotFoundException('Mavzu topilmadi');

    // A client bug that submits the same question twice must not let one
    // question move mastery twice. First answer wins — it is the one the
    // learner actually gave.
    const seen = new Set<string>();
    const answers = dto.answers.filter((a) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    });

    const questions = await this.prisma.question.findMany({
      where: { id: { in: answers.map((a) => a.questionId) } },
      select: { id: true, topicId: true, options: { select: { id: true, isCorrect: true } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    // A question retired or deleted between the download and the sync is an
    // ordinary event, not a reason to throw the drill away. Grade what still
    // exists and report the rest. Status is not checked: the learner answered
    // it in good faith while it was published, and retiring content should not
    // reach back and erase work.
    const graded: { questionId: string; topicId: string; optionId: string; isCorrect: boolean; msSpent?: number }[] = [];
    let dropped = 0;
    for (const a of answers) {
      const q = byId.get(a.questionId);
      const option = q?.options.find((o) => o.id === a.optionId);
      if (!q || !option) {
        dropped++;
        continue;
      }
      graded.push({
        questionId: q.id,
        topicId: q.topicId,
        optionId: option.id,
        isCorrect: option.isCorrect,
        msSpent: a.msSpent,
      });
    }

    if (graded.length === 0) {
      throw new BadRequestException('Bu sessiyadagi savollar endi mavjud emas');
    }

    const { startedAt, finishedAt } = clampSessionWindow(dto.startedAt, dto.finishedAt);
    const correctCount = graded.filter((g) => g.isCorrect).length;

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          userId,
          clientId: dto.clientId,
          mode: SessionMode.practice,
          topicId: topic.id,
          startedAt,
          finishedAt,
          questionCount: graded.length,
          correctCount,
          items: {
            create: graded.map((g, order) => ({
              questionId: g.questionId,
              order,
              chosenOptionId: g.optionId,
              isCorrect: g.isCorrect,
              answeredAt: finishedAt,
              msSpent: g.msSpent ?? null,
            })),
          },
        },
        select: { id: true },
      });

      // Folded per topic first, so a drill is a handful of upserts rather than
      // one read-modify-write per answer. Grouped by the question's OWN topic
      // rather than the session's: if content moved between topics after the
      // download, the answer should still count where the question now lives.
      const byTopic = new Map<string, boolean[]>();
      for (const g of graded) {
        const list = byTopic.get(g.topicId) ?? [];
        list.push(g.isCorrect);
        byTopic.set(g.topicId, list);
      }

      for (const [topicId, results] of byTopic) {
        const prev = await tx.topicMastery.findUnique({
          where: { userId_topicId: { userId, topicId } },
        });
        let state: MasteryState = prev
          ? { attempts: prev.attempts, correct: prev.correct, ewma: prev.ewma }
          : { attempts: 0, correct: 0, ewma: 0 };
        for (const ok of results) state = updateMastery(state, ok);
        await tx.topicMastery.upsert({
          where: { userId_topicId: { userId, topicId } },
          create: { userId, topicId, ...state },
          update: state,
        });
      }

      // The mistake bank is scheduled from `now`, not from when the drill
      // happened offline: a question missed on a plane yesterday is due
      // relative to today, and backdating it would make it due on arrival.
      for (const g of graded) {
        await this.reviews.record(tx, userId, g.questionId, g.isCorrect);
      }

      return session;
    });

    return {
      clientId: dto.clientId,
      status: 'accepted',
      sessionId: created.id,
      correctCount,
      questionCount: graded.length,
      ...(dropped > 0 ? { dropped } : {}),
    };
  }

  // ── progress ──────────────────────────────────────────────

  async progress(userId: string, locale: Locale = Locale.uz) {
    const topics = await this.prisma.topic.findMany({ orderBy: { order: 'asc' } });
    const mastery = await this.masteryMap(userId);
    const empty: MasteryState = { attempts: 0, correct: 0, ewma: 0 };

    const perTopic = topics.map((t) => {
      const m = mastery.get(t.id) ?? empty;
      return {
        topicId: t.id,
        slug: t.slug,
        title: locale === Locale.ru ? t.titleRu : t.titleUz,
        attempts: m.attempts,
        correct: m.correct,
        score: Number(adjustedScore(m).toFixed(3)),
        weak: isWeak(m),
      };
    });

    return {
      readiness: await this.readiness(userId),
      topics: perTopic,
      weakest: perTopic
        .filter((t) => t.attempts === 0 || t.weak)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((t) => ({ topicId: t.topicId, slug: t.slug, title: t.title, score: t.score })),
    };
  }

  async readiness(userId: string) {
    const topics = await this.prisma.topic.findMany({ select: { id: true } });
    const mastery = await this.masteryMap(userId);
    const empty: MasteryState = { attempts: 0, correct: 0, ewma: 0 };

    const exams = await this.prisma.session.findMany({
      where: { userId, mode: SessionMode.exam, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      take: READINESS_EXAM_WINDOW,
    });

    return readiness({
      topics: topics.map((t) => mastery.get(t.id) ?? empty),
      exams: exams.map((e, i) => ({
        score: e.questionCount > 0 ? e.correctCount / e.questionCount : 0,
        passed: !!e.passed,
        ageIndex: i,
      })),
    });
  }
}
