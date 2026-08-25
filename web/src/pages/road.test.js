import { describe, expect, it } from 'vitest';
import { buildPath, ROAD_MAX_W, ROAD_MIN_W } from './Road.jsx';

// The road is the one screen with hand-computed geometry, and the one that
// broke on a phone: a fixed 360px column whose node labels hung ~19px off each
// side. That was invisible inside a 560px desktop panel and became a horizontal
// scrollbar at 375px.
//
// A node is a 64px tile + a 10px gap + a 104px label centred on the path, so it
// reaches 89px either side. Kept in sync with NODE_HALF_W in Road.jsx — if the
// node markup changes, these numbers have to move with it.
const NODE_HALF_W = 89;

function midOf(d) {
  return Number(d.match(/^M ([\d.]+)/)[1]);
}

/// The swing of the road, recovered from the path data. Every cubic segment
/// puts its control points at `mid ± amp`, and the first one swings left.
function ampOf(d) {
  const firstControlX = Number(d.match(/C ([\d.-]+) /)[1]);
  return midOf(d) - firstControlX;
}

/// How much horizontal room the drawing actually needs, labels included.
function contentWidth(geom) {
  return 2 * ampOf(geom.d) + 2 * NODE_HALF_W;
}

describe('buildPath', () => {
  it('leaves the desktop road exactly as the prototype drew it', () => {
    // 560 is the road's panel width in Shell's PANEL_W table. The promise made
    // when this went responsive was that desktop would not shift a pixel.
    const geom = buildPath(12, 560);
    expect(geom.W).toBe(360);
    expect(midOf(geom.d)).toBe(180);
    expect(ampOf(geom.d)).toBeCloseTo(110, 6);
  });

  it('fits inside a 375px phone, labels included', () => {
    const geom = buildPath(12, 375);
    expect(geom.W).toBeLessThanOrEqual(375);
    expect(contentWidth(geom)).toBeLessThanOrEqual(375);
  });

  it('fits at every width a phone or desktop can present', () => {
    for (let available = 280; available <= 1200; available += 1) {
      const geom = buildPath(12, available);
      expect(geom.W).toBeGreaterThanOrEqual(ROAD_MIN_W);
      expect(geom.W).toBeLessThanOrEqual(ROAD_MAX_W);
      // The binding promise: no horizontal overflow, at any width.
      expect(contentWidth(geom)).toBeLessThanOrEqual(Math.max(available, ROAD_MIN_W));
    }
  });

  it('keeps a visible curve rather than collapsing to a straight line', () => {
    // A road that does not bend stops reading as a road, so the swing is
    // floored even when the viewport cannot really afford it.
    for (const available of [200, 240, 280, 320, 375, 414]) {
      expect(ampOf(buildPath(12, available).d)).toBeGreaterThanOrEqual(40);
    }
  });

  it('never lets the swing grow with the viewport past the design width', () => {
    // Wider screens get a wider panel, not a wider road: the metaphor wants a
    // lane, and beyond 360 the serpentine flattens into a wiggle.
    const wide = buildPath(12, 2000);
    expect(ampOf(wide.d)).toBeCloseTo(110, 6);
    expect(wide.W).toBe(ROAD_MAX_W);
  });

  it('grows in height with the topic count', () => {
    const twelve = buildPath(12, 375);
    const nine = buildPath(9, 375);
    expect(twelve.H).toBeGreaterThan(nine.H);
    // Every extra topic is one more 150px segment.
    expect(twelve.H - nine.H).toBe(3 * 150);
  });

  it('draws one segment more than there are nodes, so the last node is not the end', () => {
    // The finish flag sits past the final topic; without the extra segment the
    // last node lands on the terminus and the trophy has nowhere to go.
    const count = (d) => (d.match(/C /g) || []).length;
    expect(count(buildPath(5, 375).d)).toBe(6);
    expect(count(buildPath(12, 375).d)).toBe(13);
  });

  it('defaults to the design width when nothing has been measured yet', () => {
    // First render, before the ResizeObserver has reported.
    expect(buildPath(12).W).toBe(ROAD_MAX_W);
  });
});
