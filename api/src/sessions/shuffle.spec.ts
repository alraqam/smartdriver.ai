import { shuffleOptions } from './shuffle';

const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, textUz: `x${i}` }));

describe('shuffleOptions', () => {
  it('keeps every option exactly once', () => {
    const out = shuffleOptions('item-1', opts(4));
    expect(out).toHaveLength(4);
    expect(new Set(out.map((o) => o.id))).toEqual(new Set(['o0', 'o1', 'o2', 'o3']));
  });

  it('gives the same order every time for the same item', () => {
    // Stability is what lets a learner scroll back or review without the
    // answers appearing to move around.
    const a = shuffleOptions('item-1', opts(4)).map((o) => o.id);
    const b = shuffleOptions('item-1', opts(4)).map((o) => o.id);
    expect(a).toEqual(b);
  });

  it('is unaffected by the order the options arrive in', () => {
    const a = shuffleOptions('item-1', opts(4)).map((o) => o.id);
    const b = shuffleOptions('item-1', [...opts(4)].reverse()).map((o) => o.id);
    expect(a).toEqual(b);
  });

  it('gives different items different orders', () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => shuffleOptions(`item-${i}`, opts(4)).map((o) => o.id).join(',')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not leave the first-listed option in first place across a bank', () => {
    // The failure this whole module exists to prevent: the seed bank listed
    // the correct answer first in every question, so "always pick option 0"
    // scored 100%. After shuffling, o0's position must vary.
    const positions = new Set(
      Array.from({ length: 200 }, (_, i) =>
        shuffleOptions(`item-${i}`, opts(4)).findIndex((o) => o.id === 'o0'),
      ),
    );
    expect(positions.size).toBeGreaterThan(1);

    let firstCount = 0;
    for (let i = 0; i < 400; i++) {
      if (shuffleOptions(`q-${i}`, opts(4))[0].id === 'o0') firstCount++;
    }
    // Should sit near 400/4 = 100, nowhere near 400.
    expect(firstCount).toBeGreaterThan(50);
    expect(firstCount).toBeLessThan(160);
  });

  it('handles an empty or single-option list', () => {
    expect(shuffleOptions('i', [])).toEqual([]);
    expect(shuffleOptions('i', opts(1)).map((o) => o.id)).toEqual(['o0']);
  });
});
