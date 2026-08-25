import { createHash } from 'node:crypto';

/// What the pack's version is computed from.
///
/// Deliberately not a hash of the payload itself: a 304 has to be answerable
/// without building and serialising the whole bank, which is the entire point
/// of asking. These three inputs move whenever the bank does — an edit bumps
/// `updatedAt`, an import or a retirement changes the count, and topic titles
/// are carried whole because Topic has no `updatedAt` to watch.
export interface PackFingerprint {
  questionCount: number;
  /// Newest `updatedAt` across published questions; null when there are none.
  latestUpdate: Date | null;
  topics: { id: string; slug: string; order: number; titleUz: string; titleRu: string }[];
}

/// A short, stable version string for a pack, used as its ETag.
///
/// The one thing this cannot see is a same-millisecond delete-plus-insert that
/// leaves the count identical and the newest `updatedAt` no later than before.
/// Reaching that needs a question to be created with a backdated timestamp in
/// the same tick another was removed, which the importer cannot do.
export function packVersion(fp: PackFingerprint): string {
  const h = createHash('sha256');
  h.update(`n=${fp.questionCount}`);
  h.update(`|t=${fp.latestUpdate ? fp.latestUpdate.toISOString() : 'none'}`);
  // Sorted so two servers reading the same rows in a different order agree,
  // which matters the moment there is more than one replica.
  for (const t of [...fp.topics].sort((a, b) => a.id.localeCompare(b.id))) {
    h.update(`|${t.id}:${t.order}:${t.slug}:${t.titleUz}:${t.titleRu}`);
  }
  // 16 hex characters: this is a cache key, not a signature, and a short one
  // is readable in a log line.
  return h.digest('hex').slice(0, 16);
}
