import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/// Shape of the official exam, as configured. These defaults reflect the
/// standard Uzbek theory exam, but they live in the database rather than in
/// code so they can be corrected the day the rules change, without a deploy.
export interface ExamConfig {
  questionCount: number;
  timeLimitSec: number;
  /// Wrong answers allowed and still pass.
  maxErrors: number;
}

export const EXAM_CONFIG_KEY = 'exam';

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  questionCount: 20,
  timeLimitSec: 25 * 60,
  maxErrors: 2,
};

/// Questions in a default practice set. Short enough to finish on a bus.
export const DEFAULT_PRACTICE_COUNT = 10;

@Injectable()
export class SettingsService implements OnModuleInit {
  async onModuleInit() {
    // Seed the defaults once so an operator editing the exam shape has a row
    // to edit, rather than having to know the key name and JSON shape.
    await this.prisma.setting.upsert({
      where: { key: EXAM_CONFIG_KEY },
      create: { key: EXAM_CONFIG_KEY, value: DEFAULT_EXAM_CONFIG as any },
      update: {},
    });
  }

  constructor(private readonly prisma: PrismaService) {}

  async examConfig(): Promise<ExamConfig> {
    const row = await this.prisma.setting.findUnique({ where: { key: EXAM_CONFIG_KEY } });
    const v = (row?.value ?? {}) as Partial<ExamConfig>;
    // Merged over the defaults so a partial or hand-edited row degrades to
    // sane values instead of producing an exam with NaN questions.
    return {
      questionCount: Number(v.questionCount) || DEFAULT_EXAM_CONFIG.questionCount,
      timeLimitSec: Number(v.timeLimitSec) || DEFAULT_EXAM_CONFIG.timeLimitSec,
      maxErrors: Number.isFinite(Number(v.maxErrors))
        ? Number(v.maxErrors)
        : DEFAULT_EXAM_CONFIG.maxErrors,
    };
  }

  async setExamConfig(cfg: Partial<ExamConfig>): Promise<ExamConfig> {
    const merged = { ...(await this.examConfig()), ...cfg };
    await this.prisma.setting.upsert({
      where: { key: EXAM_CONFIG_KEY },
      create: { key: EXAM_CONFIG_KEY, value: merged as any },
      update: { value: merged as any },
    });
    return merged;
  }
}
