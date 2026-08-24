import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';

// The importer's job is to reject a bad file WHOLE, before it writes anything.
// These tests drive it with a stub Prisma so they cover exactly that decision
// and never touch a database.
function stubPrisma(over: any = {}): PrismaService {
  return {
    topic: { findMany: async () => [{ slug: 'signals', id: 't1' }], findUnique: async () => null },
    ruleSection: { findMany: async () => [{ code: 'PDD-6.2' }], findUnique: async () => null },
    question: { count: async () => 0, findUnique: async () => null },
    contentImport: { create: async () => ({}) },
    $transaction: async (fn: any) => fn({}),
    ...over,
  } as unknown as PrismaService;
}

const goodQuestion = () => ({
  externalId: 'q1',
  topicSlug: 'signals',
  textUz: 'Savol',
  textRu: 'Вопрос',
  ruleRefs: ['PDD-6.2'],
  options: [
    { textUz: 'A', textRu: 'А', isCorrect: true },
    { textUz: 'B', textRu: 'Б', isCorrect: false },
  ],
});

describe('ImportService.detectKind', () => {
  const svc = new ImportService(stubPrisma());

  it('recognises each file kind from its first row', () => {
    expect(svc.detectKind([{ slug: 'signals', order: 1 }])).toBe('topics');
    expect(svc.detectKind([{ code: 'PDD-6.2' }])).toBe('rules');
    expect(svc.detectKind([{ externalId: 'q1' }])).toBe('questions');
  });

  it('refuses an empty file rather than reporting a successful no-op', () => {
    expect(() => svc.detectKind([])).toThrow();
  });

  it('refuses a shape it cannot identify', () => {
    expect(() => svc.detectKind([{ hello: 'world' }])).toThrow();
  });
});

describe('ImportService question validation', () => {
  const run = (rows: any[], prisma = stubPrisma()) =>
    new ImportService(prisma).import(rows, 'test.json', { dryRun: true });

  it('accepts a well-formed question', async () => {
    const r = await run([goodQuestion()]);
    expect(r.inserted).toBe(1);
    expect(r.warnings).toEqual([]);
  });

  it('rejects a question with no correct answer', async () => {
    const q = goodQuestion();
    q.options.forEach((o) => (o.isCorrect = false));
    await expect(run([q])).rejects.toThrow(/bitta to'g'ri javob/);
  });

  it('rejects a question with two correct answers', async () => {
    const q = goodQuestion();
    q.options.forEach((o) => (o.isCorrect = true));
    await expect(run([q])).rejects.toThrow(/bitta to'g'ri javob/);
  });

  it('rejects fewer than two options', async () => {
    const q = goodQuestion();
    q.options = [{ textUz: 'A', textRu: 'А', isCorrect: true }];
    await expect(run([q])).rejects.toThrow(/2 dan 6 tagacha/);
  });

  it('rejects a duplicate externalId within one file', async () => {
    await expect(run([goodQuestion(), goodQuestion()])).rejects.toThrow(/Takrorlangan externalId/);
  });

  it('rejects an unknown topicSlug instead of silently orphaning the question', async () => {
    const q = { ...goodQuestion(), topicSlug: 'nope' };
    await expect(run([q])).rejects.toThrow(/Noma'lum topicSlug/);
  });

  it('rejects a missing translation', async () => {
    const q: any = goodQuestion();
    delete q.textRu;
    await expect(run([q])).rejects.toThrow(/textRu/);
  });

  it('rejects an out-of-range difficulty', async () => {
    await expect(run([{ ...goodQuestion(), difficulty: 9 }])).rejects.toThrow(/difficulty/);
  });

  // A dangling rule reference costs the explanation its grounding but does not
  // break the question, so it warns rather than failing the file.
  it('warns about an unresolved ruleRef without failing', async () => {
    const q = { ...goodQuestion(), ruleRefs: ['PDD-6.2', 'PDD-99.9'] };
    const r = await run([q]);
    expect(r.inserted).toBe(1);
    expect(r.warnings.join(' ')).toMatch(/PDD-99\.9/);
  });
});

describe('ImportService mass-retire guard', () => {
  // 10 published questions, an import that would retire 5 of them.
  const prisma = stubPrisma({
    question: {
      count: async ({ where }: any) => (where?.externalId ? 5 : 10),
      findUnique: async () => null,
    },
  });

  const retiringRows = Array.from({ length: 5 }, (_, i) => ({
    ...goodQuestion(),
    externalId: `q${i}`,
    status: 'retired',
  }));

  it('refuses an import that would retire half the live bank', async () => {
    await expect(
      new ImportService(prisma).import(retiringRows, 'test.json', { dryRun: true }),
    ).rejects.toThrow(/allow-mass-retire/);
  });

  it('goes ahead when the caller explicitly waives the guard', async () => {
    const r = await new ImportService(prisma).import(retiringRows, 'test.json', {
      dryRun: true,
      allowMassRetire: true,
    });
    expect(r.inserted).toBe(5);
  });
});
