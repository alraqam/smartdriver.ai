import { PackFingerprint, packVersion } from './pack-version';

// The version is the whole cache story: get it wrong in one direction and every
// launch re-downloads the bank over mobile data, wrong in the other and a phone
// practises against content the team retired weeks ago.

const topic = (id: string, over: Partial<PackFingerprint['topics'][0]> = {}) => ({
  id,
  slug: id,
  order: 1,
  titleUz: `uz-${id}`,
  titleRu: `ru-${id}`,
  ...over,
});

const base: PackFingerprint = {
  questionCount: 54,
  latestUpdate: new Date('2026-08-20T10:00:00.000Z'),
  topics: [topic('a'), topic('b')],
};

describe('packVersion', () => {
  it('is stable for identical input', () => {
    expect(packVersion(base)).toBe(packVersion({ ...base, topics: [topic('a'), topic('b')] }));
  });

  it('does not depend on the order rows came back in', () => {
    // Two replicas reading the same table must agree, or they fight over the
    // client's ETag and it re-downloads on alternating requests.
    expect(packVersion({ ...base, topics: [topic('b'), topic('a')] })).toBe(packVersion(base));
  });

  it('changes when a question is added or retired', () => {
    expect(packVersion({ ...base, questionCount: 55 })).not.toBe(packVersion(base));
  });

  it('changes when a question is edited', () => {
    const edited = { ...base, latestUpdate: new Date('2026-08-21T10:00:00.000Z') };
    expect(packVersion(edited)).not.toBe(packVersion(base));
  });

  it('changes when a topic is renamed', () => {
    // Topic has no updatedAt, which is exactly why the titles are hashed whole.
    const renamed = { ...base, topics: [topic('a', { titleUz: 'boshqa' }), topic('b')] };
    expect(packVersion(renamed)).not.toBe(packVersion(base));
  });

  it('changes when topics are reordered', () => {
    const reordered = { ...base, topics: [topic('a', { order: 9 }), topic('b')] };
    expect(packVersion(reordered)).not.toBe(packVersion(base));
  });

  it('handles an empty bank without throwing', () => {
    const empty: PackFingerprint = { questionCount: 0, latestUpdate: null, topics: [] };
    expect(packVersion(empty)).toMatch(/^[0-9a-f]{16}$/);
    expect(packVersion(empty)).not.toBe(packVersion(base));
  });

  it('is a short lowercase hex string', () => {
    expect(packVersion(base)).toMatch(/^[0-9a-f]{16}$/);
  });
});
