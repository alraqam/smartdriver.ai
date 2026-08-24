import { ContentStatus } from '@prisma/client';

export type ImportKind = 'topics' | 'rules' | 'questions';

export interface TopicRow {
  slug: string;
  order: number;
  titleUz: string;
  titleRu: string;
}

export interface RuleRow {
  code: string;
  order: number;
  titleUz: string;
  titleRu: string;
  bodyUz: string;
  bodyRu: string;
}

export interface OptionRow {
  textUz: string;
  textRu: string;
  isCorrect?: boolean;
}

export interface QuestionRow {
  externalId: string;
  topicSlug: string;
  difficulty?: number;
  imageUrl?: string | null;
  textUz: string;
  textRu: string;
  sourceNoteUz?: string | null;
  sourceNoteRu?: string | null;
  ruleRefs?: string[];
  status?: ContentStatus;
  options: OptionRow[];
}

export interface ImportOptions {
  /// Validate and report, write nothing.
  dryRun?: boolean;
  /// Waive the mass-retire guard. Only pass this after looking at why the
  /// import wants to retire so much.
  allowMassRetire?: boolean;
}

export interface ImportReport {
  kind: ImportKind;
  filename: string;
  checksum: string;
  dryRun: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  /// Human-readable notes: unresolved rule refs, retirements, and so on.
  warnings: string[];
}
