import { Injectable, Logger } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Rule sections handed to the model per tutor question. Enough to cover a
/// question that spans two or three rules, few enough that the model is not
/// choosing an answer out of a haystack.
export const RETRIEVAL_LIMIT = 6;

/// Minimum normalised rank (0..1) for a section to count as a candidate.
export const MIN_RANK = 0.05;

/// A term appearing in more than this share of rule sections carries no
/// signal and is dropped from the query.
///
/// Postgres ships no Uzbek dictionary, so `simple` gives no stopword list at
/// all and words like "harakat" and "haydovchi" appear everywhere. Deriving
/// the stoplist from the corpus itself works for both locales and needs no
/// language resources.
export const MAX_DOC_FREQUENCY = 0.34;

/// Rarest query terms that are ALWAYS kept, whatever their document frequency.
///
/// An absolute frequency cutoff is meaningless on a small corpus, and it fails
/// in the worst possible direction — by discarding the query's most
/// informative word. "Chorrahada kim birinchi o'tadi?" was returning the
/// first-aid rule because "chorraha" (intersection) appeared in 7 of 20
/// sections, one section past the cutoff, and was dropped as a stopword; the
/// query was then decided by the word "birinchi" (first). A term cannot be
/// noise relative to the other words in its own query when it is the rarest
/// one there, so the rarest few always survive.
export const ALWAYS_KEEP_RAREST = 3;

/// Distinct query terms a section must match to be returned. Rank alone let a
/// question about dinner recommendations match the right-of-way rule on one
/// word in common.
export const MIN_TERM_COVERAGE = 2;

/// A section scoring at least this much is admitted on rank alone, without
/// meeting the term-coverage bar. One decisive word — usually matching the
/// section's TITLE, which carries the heavier weight — is genuine evidence:
/// "Chorrahada kim birinchi o'tadi?" shares exactly one meaningful word with
/// the right-of-way rule, and that word is in its title.
export const STRONG_RANK = 0.15;

/// Characters kept from each Uzbek query term before prefix-matching.
///
/// Uzbek is agglutinative and Postgres has no Uzbek dictionary, so `simple`
/// compares raw tokens: "chorrahada" (in the question) never matches
/// "chorraha" (in the rule), and "svetoforning" never matches "svetofor".
/// Matching on a truncated prefix instead recovers exactly those cases. Six is
/// long enough to keep distinct roots apart and short enough to survive the
/// case suffixes learners actually type.
export const UZ_PREFIX_LEN = 6;

export interface RetrievedRule {
  code: string;
  title: string;
  body: string;
  rank: number;
}

// Fixed allow-list. These are interpolated into SQL as literals, so they must
// never come from user input.
const CONFIG: Record<Locale, string> = { uz: 'simple', ru: 'russian' };
const TITLE_COL: Record<Locale, string> = { uz: 'titleUz', ru: 'titleRu' };
const BODY_COL: Record<Locale, string> = { uz: 'bodyUz', ru: 'bodyRu' };

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger('RetrievalService');

  constructor(private readonly prisma: PrismaService) {}

  /// Full-text search over the rule corpus.
  ///
  /// Postgres FTS rather than embeddings: the corpus is a few hundred short
  /// sections, the questions are dense with the corpus's own vocabulary, and
  /// it needs no extra service, no index build step, and no drift between an
  /// index and the table. Revisit if the corpus grows past a few thousand
  /// sections or the questions get more paraphrastic.
  ///
  /// The question is tokenised by Postgres itself rather than by a regex here,
  /// so query tokens are produced by exactly the same rules as the corpus
  /// tokens they have to match — apostrophes in "to'xtash" included.
  ///
  /// Note that this returns CANDIDATES, not answers. Deciding whether these
  /// sections actually settle the question is the model's job, and the tutor
  /// prompt instructs it to decline when they do not.
  async search(query: string, locale: Locale, limit = RETRIEVAL_LIMIT): Promise<RetrievedRule[]> {
    const cfg = CONFIG[locale];
    const titleCol = TITLE_COL[locale];
    const bodyCol = BODY_COL[locale];

    if (!query || query.trim().length === 0) return [];

    const docExpr =
      `setweight(to_tsvector('${cfg}', coalesce("${titleCol}", '')), 'A') || ` +
      `setweight(to_tsvector('${cfg}', coalesce("${bodyCol}", '')), 'B')`;

    // Russian lexemes are already stemmed, so they need no truncation; Uzbek
    // ones do. `:*` on both makes each atom a prefix match.
    const atomExpr =
      locale === Locale.ru
        ? `quote_literal(term) || ':*'`
        : `quote_literal(left(term, ${UZ_PREFIX_LEN})) || ':*'`;

    const sql = `
      WITH docs AS (
        SELECT "code", "${titleCol}" AS title, "${bodyCol}" AS body, ${docExpr} AS tsv
          FROM "RuleSection"
      ),
      total AS (SELECT GREATEST(count(*), 1)::float AS n FROM docs),
      -- Tokenise the question with the same analyzer the corpus was indexed
      -- with, so query and corpus tokens are directly comparable.
      terms AS (
        SELECT DISTINCT lexeme AS term
          FROM unnest(to_tsvector('${cfg}', $1)) AS lexeme
         WHERE length(lexeme) > 3
         LIMIT 20
      ),
      atoms AS (SELECT term, ${atomExpr} AS atom FROM terms),
      df AS (
        SELECT a.term, a.atom,
               (SELECT count(*) FROM docs d WHERE d.tsv @@ to_tsquery('${cfg}', a.atom))::float AS n
          FROM atoms a
      ),
      ranked AS (
        SELECT df.term, df.atom, df.n,
               row_number() OVER (ORDER BY df.n ASC, df.term ASC) AS rarity
          FROM df
         WHERE df.n > 0
      ),
      kept AS (
        SELECT r.term, r.atom FROM ranked r, total
         WHERE r.n <= total.n * $2 OR r.rarity <= $6
      ),
      q AS (SELECT to_tsquery('${cfg}', string_agg(atom, ' | ')) AS tsq FROM kept),
      -- How many DISTINCT meaningful query terms each section actually hits.
      coverage AS (
        SELECT d."code" AS code, count(*)::int AS matched
          FROM docs d, kept k
         WHERE d.tsv @@ to_tsquery('${cfg}', k.atom)
         GROUP BY d."code"
      ),
      need AS (SELECT LEAST($4::int, GREATEST(count(*), 1))::int AS n FROM kept)
      SELECT d."code",
             d.title,
             d.body,
             ts_rank(d.tsv, q.tsq, 32) AS rank
        FROM docs d
        JOIN coverage c ON c.code = d."code"
        CROSS JOIN q
        CROSS JOIN need
       WHERE q.tsq IS NOT NULL
         AND d.tsv @@ q.tsq
         AND (c.matched >= need.n OR ts_rank(d.tsv, q.tsq, 32) >= $5)
       ORDER BY rank DESC
       LIMIT $3`;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        { code: string; title: string; body: string; rank: number }[]
      >(sql, query, MAX_DOC_FREQUENCY, limit, MIN_TERM_COVERAGE, STRONG_RANK, ALWAYS_KEEP_RAREST);

      return rows.map((r) => ({ ...r, rank: Number(r.rank) })).filter((r) => r.rank >= MIN_RANK);
    } catch (e: any) {
      // A malformed query must degrade to "no sources found" — which the tutor
      // already handles by declining to answer — not to a 500.
      this.logger.warn(`Rule search failed for "${query.slice(0, 60)}": ${e?.message ?? e}`);
      return [];
    }
  }

  /// Rules named explicitly by code, for the "explain this question" path where
  /// the relevant rules are already known and search would only add noise.
  async byCodes(codes: string[], locale: Locale): Promise<RetrievedRule[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.ruleSection.findMany({
      where: { code: { in: codes } },
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => ({
      code: r.code,
      title: locale === Locale.ru ? r.titleRu : r.titleUz,
      body: locale === Locale.ru ? r.bodyRu : r.bodyUz,
      rank: 1,
    }));
  }
}
