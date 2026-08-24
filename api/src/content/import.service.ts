import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ImportKind,
  ImportOptions,
  ImportReport,
  QuestionRow,
  RuleRow,
  TopicRow,
} from './import.types';

// An import that would retire more than this share of the live bank is almost
// certainly a truncated or wrong file, not a deliberate cull. Refusing it by
// default means a bad export cannot quietly empty the app for every learner.
const MASS_RETIRE_THRESHOLD = 0.2;

@Injectable()
export class ImportService {
  private readonly logger = new Logger('ImportService');

  constructor(private readonly prisma: PrismaService) {}

  /// Work out what a file holds from its first row, so the caller does not
  /// have to name the kind and cannot mislabel it.
  detectKind(rows: any[]): ImportKind {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('Import fayli bo\'sh yoki massiv emas');
    }
    const first = rows[0];
    if (first && typeof first === 'object') {
      if ('externalId' in first || 'options' in first) return 'questions';
      if ('code' in first || 'bodyUz' in first) return 'rules';
      if ('slug' in first) return 'topics';
    }
    throw new BadRequestException(
      'Fayl turini aniqlab bo\'lmadi. topics (slug), rules (code) yoki questions (externalId) kutilgan.',
    );
  }

  async import(
    rows: any[],
    filename: string,
    opts: ImportOptions = {},
  ): Promise<ImportReport> {
    const kind = this.detectKind(rows);
    const checksum = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
    const dryRun = !!opts.dryRun;

    const report: ImportReport =
      kind === 'topics'
        ? await this.importTopics(rows, filename, checksum, dryRun)
        : kind === 'rules'
          ? await this.importRules(rows, filename, checksum, dryRun)
          : await this.importQuestions(rows, filename, checksum, opts);

    if (!dryRun) {
      await this.prisma.contentImport.create({
        data: {
          filename,
          checksum,
          kind,
          inserted: report.inserted,
          updated: report.updated,
          skipped: report.skipped,
          dryRun: false,
          note: report.warnings.length ? report.warnings.join(' | ').slice(0, 2000) : null,
        },
      });
    }

    this.logger.log(
      `${dryRun ? '[dry-run] ' : ''}${kind} ${filename}: +${report.inserted} ~${report.updated} =${report.skipped}`,
    );
    return report;
  }

  // ── topics ────────────────────────────────────────────────
  private async importTopics(
    rows: TopicRow[],
    filename: string,
    checksum: string,
    dryRun: boolean,
  ): Promise<ImportReport> {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      this.requireString(r.slug, `topics[${i}].slug`);
      if (!/^[a-z0-9-]+$/.test(r.slug)) {
        throw new BadRequestException(`topics[${i}].slug faqat a-z, 0-9 va - dan iborat bo'lishi kerak`);
      }
      if (seen.has(r.slug)) throw new BadRequestException(`Takrorlangan slug: ${r.slug}`);
      seen.add(r.slug);
      this.requireNumber(r.order, `topics[${i}].order`);
      this.requireString(r.titleUz, `topics[${i}].titleUz`);
      this.requireString(r.titleRu, `topics[${i}].titleRu`);
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of rows) {
      const existing = await this.prisma.topic.findUnique({ where: { slug: r.slug } });
      const same =
        existing &&
        existing.order === r.order &&
        existing.titleUz === r.titleUz &&
        existing.titleRu === r.titleRu;

      if (same) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await this.prisma.topic.upsert({
          where: { slug: r.slug },
          create: { slug: r.slug, order: r.order, titleUz: r.titleUz, titleRu: r.titleRu },
          update: { order: r.order, titleUz: r.titleUz, titleRu: r.titleRu },
        });
      }
      existing ? updated++ : inserted++;
    }

    return { kind: 'topics', filename, checksum, dryRun, inserted, updated, skipped, warnings: [] };
  }

  // ── rules ─────────────────────────────────────────────────
  private async importRules(
    rows: RuleRow[],
    filename: string,
    checksum: string,
    dryRun: boolean,
  ): Promise<ImportReport> {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      this.requireString(r.code, `rules[${i}].code`);
      if (seen.has(r.code)) throw new BadRequestException(`Takrorlangan rule code: ${r.code}`);
      seen.add(r.code);
      this.requireNumber(r.order, `rules[${i}].order`);
      for (const f of ['titleUz', 'titleRu', 'bodyUz', 'bodyRu'] as const) {
        this.requireString(r[f], `rules[${i}].${f}`);
      }
    });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of rows) {
      const existing = await this.prisma.ruleSection.findUnique({ where: { code: r.code } });
      const same =
        existing &&
        existing.order === r.order &&
        existing.titleUz === r.titleUz &&
        existing.titleRu === r.titleRu &&
        existing.bodyUz === r.bodyUz &&
        existing.bodyRu === r.bodyRu;

      if (same) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await this.prisma.ruleSection.upsert({
          where: { code: r.code },
          create: r,
          update: r,
        });
      }
      existing ? updated++ : inserted++;
    }

    return { kind: 'rules', filename, checksum, dryRun, inserted, updated, skipped, warnings: [] };
  }

  // ── questions ─────────────────────────────────────────────
  private async importQuestions(
    rows: QuestionRow[],
    filename: string,
    checksum: string,
    opts: ImportOptions,
  ): Promise<ImportReport> {
    const dryRun = !!opts.dryRun;
    const warnings: string[] = [];

    // Validate the WHOLE file before writing anything: a half-applied import
    // leaves the bank in a state nobody chose.
    const seen = new Set<string>();
    rows.forEach((q, i) => {
      this.requireString(q.externalId, `questions[${i}].externalId`);
      if (seen.has(q.externalId)) {
        throw new BadRequestException(`Takrorlangan externalId: ${q.externalId}`);
      }
      seen.add(q.externalId);
      this.requireString(q.topicSlug, `questions[${i}].topicSlug`);
      this.requireString(q.textUz, `questions[${i}].textUz`);
      this.requireString(q.textRu, `questions[${i}].textRu`);

      if (q.difficulty !== undefined && (q.difficulty < 1 || q.difficulty > 5)) {
        throw new BadRequestException(`questions[${i}].difficulty 1..5 oralig'ida bo'lishi kerak`);
      }
      if (q.status !== undefined && !Object.values(ContentStatus).includes(q.status)) {
        throw new BadRequestException(`questions[${i}].status noto'g'ri: ${q.status}`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
        throw new BadRequestException(`questions[${i}] (${q.externalId}): 2 dan 6 tagacha javob varianti bo'lishi kerak`);
      }
      const correct = q.options.filter((o) => o.isCorrect).length;
      if (correct !== 1) {
        throw new BadRequestException(
          `questions[${i}] (${q.externalId}): aynan bitta to'g'ri javob bo'lishi kerak, ${correct} ta topildi`,
        );
      }
      q.options.forEach((o, j) => {
        this.requireString(o.textUz, `questions[${i}].options[${j}].textUz`);
        this.requireString(o.textRu, `questions[${i}].options[${j}].textRu`);
      });
    });

    // Topic slugs must all resolve — a typo would otherwise file questions
    // under a topic that silently never appears.
    const topics = await this.prisma.topic.findMany();
    const topicBySlug = new Map(topics.map((t) => [t.slug, t.id]));
    const missingTopics = [...new Set(rows.map((q) => q.topicSlug))].filter(
      (s) => !topicBySlug.has(s),
    );
    if (missingTopics.length) {
      throw new BadRequestException(
        `Noma'lum topicSlug: ${missingTopics.join(', ')}. Avval topics faylini import qiling.`,
      );
    }

    // Unresolved rule refs are a warning, not an error: the question still
    // works, its explanation is just ungrounded.
    const rules = await this.prisma.ruleSection.findMany({ select: { code: true } });
    const ruleCodes = new Set(rules.map((r) => r.code));
    const danglingRefs = [
      ...new Set(rows.flatMap((q) => q.ruleRefs ?? []).filter((c) => !ruleCodes.has(c))),
    ];
    if (danglingRefs.length) {
      warnings.push(
        `${danglingRefs.length} ta noma'lum ruleRef (tushuntirishlar asossiz qoladi): ${danglingRefs.slice(0, 10).join(', ')}`,
      );
    }

    // Mass-retire guard.
    const publishedNow = await this.prisma.question.count({ where: { status: 'published' } });
    const retiringIds = rows.filter((q) => q.status === 'retired').map((q) => q.externalId);
    if (publishedNow > 0 && retiringIds.length > 0) {
      const wouldRetire = await this.prisma.question.count({
        where: { externalId: { in: retiringIds }, status: 'published' },
      });
      const share = wouldRetire / publishedNow;
      if (share > MASS_RETIRE_THRESHOLD && !opts.allowMassRetire) {
        throw new BadRequestException(
          `Import ${Math.round(share * 100)}% nashr etilgan savollarni (${wouldRetire}/${publishedNow}) retired qiladi. ` +
            `Bu odatda noto'g'ri fayl belgisi. Ataylab bo'lsa --allow-mass-retire bilan qayta ishga tushiring.`,
        );
      }
      if (wouldRetire > 0) warnings.push(`${wouldRetire} ta savol retired holatiga o'tadi`);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const q of rows) {
      const topicId = topicBySlug.get(q.topicSlug)!;
      const desired = {
        topicId,
        difficulty: q.difficulty ?? 3,
        imageUrl: q.imageUrl ?? null,
        textUz: q.textUz,
        textRu: q.textRu,
        sourceNoteUz: q.sourceNoteUz ?? null,
        sourceNoteRu: q.sourceNoteRu ?? null,
        ruleRefs: q.ruleRefs ?? [],
        status: q.status ?? ContentStatus.draft,
      };

      const existing = await this.prisma.question.findUnique({
        where: { externalId: q.externalId },
        include: { options: { orderBy: { order: 'asc' } } },
      });

      if (existing && this.questionUnchanged(existing, desired, q)) {
        skipped++;
        continue;
      }

      if (!dryRun) {
        // Options are replaced wholesale rather than diffed. They are a small,
        // ordered set with no history worth preserving, and rewriting them is
        // the only way an edit that reorders or removes one stays correct.
        await this.prisma.$transaction(async (tx) => {
          const saved = await tx.question.upsert({
            where: { externalId: q.externalId },
            create: { externalId: q.externalId, ...desired },
            update: desired,
          });
          await tx.answerOption.deleteMany({ where: { questionId: saved.id } });
          await tx.answerOption.createMany({
            data: q.options.map((o, idx) => ({
              questionId: saved.id,
              order: idx,
              textUz: o.textUz,
              textRu: o.textRu,
              isCorrect: !!o.isCorrect,
            })),
          });
        });
      }
      existing ? updated++ : inserted++;
    }

    return { kind: 'questions', filename, checksum, dryRun, inserted, updated, skipped, warnings };
  }

  /// True when re-importing this row would change nothing. Without this every
  /// import reports every question as "updated" and the idempotency claim in
  /// the docs is untestable.
  private questionUnchanged(
    existing: any,
    desired: any,
    row: QuestionRow,
  ): boolean {
    const fieldsSame =
      existing.topicId === desired.topicId &&
      existing.difficulty === desired.difficulty &&
      existing.imageUrl === desired.imageUrl &&
      existing.textUz === desired.textUz &&
      existing.textRu === desired.textRu &&
      existing.sourceNoteUz === desired.sourceNoteUz &&
      existing.sourceNoteRu === desired.sourceNoteRu &&
      existing.status === desired.status &&
      JSON.stringify(existing.ruleRefs) === JSON.stringify(desired.ruleRefs);
    if (!fieldsSame) return false;

    if (existing.options.length !== row.options.length) return false;
    return row.options.every((o, i) => {
      const e = existing.options[i];
      return (
        e.order === i &&
        e.textUz === o.textUz &&
        e.textRu === o.textRu &&
        e.isCorrect === !!o.isCorrect
      );
    });
  }

  private requireString(v: unknown, field: string) {
    if (typeof v !== 'string' || v.trim().length === 0) {
      throw new BadRequestException(`${field} bo'sh bo'lmagan matn bo'lishi kerak`);
    }
  }

  private requireNumber(v: unknown, field: string) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new BadRequestException(`${field} son bo'lishi kerak`);
    }
  }
}
