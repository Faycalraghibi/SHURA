import { describe, expect, it } from 'vitest';

import bundle from '../../data/bundle.json';
import { DEFAULT_LAYOUT, fitScale, layoutRankMap, prerequisiteClosure } from '../layout';
import type { Competency, Pack } from '../types';

const c = (id: string, tier: Competency['tier'], prerequisites: string[] = []): Competency => ({
  id,
  name: id,
  tier,
  prerequisites,
  mastery_criteria: '',
  common_mistakes: [],
  adapters: ['choice'],
  verifiability: 'objective',
  grounded_in: ['s1'],
  core: true,
});

describe('layoutRankMap', () => {
  it('stacks tiers bottom to top and only up to the highest used tier', () => {
    const map = layoutRankMap([c('a', 'F'), c('b', 'E', ['a']), c('c', 'D', ['b'])]);
    expect(map.rows.map((r) => r.tier)).toEqual(['F', 'E', 'D']);
    expect(map.nodes.a.y).toBeGreaterThan(map.nodes.b.y);
    expect(map.nodes.b.y).toBeGreaterThan(map.nodes.c.y);
  });

  it('never overlaps nodes in a row and keeps them inside the map', () => {
    const pack = (bundle as unknown as { packs: Record<string, Pack> }).packs.python;
    const map = layoutRankMap(pack.competencies);
    const all = Object.values(map.nodes);
    for (const n of all) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + DEFAULT_LAYOUT.nodeWidth).toBeLessThanOrEqual(map.width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + DEFAULT_LAYOUT.nodeHeight).toBeLessThanOrEqual(map.height);
    }
    for (const a of all)
      for (const b of all)
        if (a !== b && a.tier === b.tier) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.nodeWidth);
  });

  it('draws one edge per local prerequisite and skips cross-pack ones', () => {
    const map = layoutRankMap([c('a', 'F'), c('b', 'E', ['a', 'python:functions.define'])]);
    expect(map.edges).toHaveLength(1);
    const [x1, y1, , y2] = map.edges[0].points;
    expect(y1).toBeGreaterThan(y2); // edges go upward, from prerequisite to dependent
    expect(x1).toBeCloseTo(map.nodes.a.x + DEFAULT_LAYOUT.nodeWidth / 2);
  });

  it('places children under their prerequisites (barycenter order)', () => {
    const map = layoutRankMap([c('left', 'F'), c('right', 'F'), c('z_child_of_left', 'E', ['left']), c('a_child_of_right', 'E', ['right'])]);
    expect(map.nodes.left.x).toBeLessThan(map.nodes.right.x);
    expect(map.nodes.z_child_of_left.x).toBeLessThan(map.nodes.a_child_of_right.x);
  });
});

describe('prerequisiteClosure', () => {
  it('collects transitive local prerequisites', () => {
    const comps = [c('a', 'F'), c('b', 'E', ['a']), c('x', 'F'), c('d', 'D', ['b', 'other:thing'])];
    expect([...prerequisiteClosure(comps, 'd')].sort()).toEqual(['a', 'b']);
    expect(prerequisiteClosure(comps, 'a').size).toBe(0);
  });
});

describe('fitScale', () => {
  it('fits and never zooms in past 1', () => {
    expect(fitScale({ width: 800, height: 400 }, { width: 400, height: 800 })).toBe(0.5);
    expect(fitScale({ width: 100, height: 100 }, { width: 400, height: 800 })).toBe(1);
  });
});

describe('same-tier prerequisites', () => {
  it('start and end on the top edge of their nodes', () => {
    const map = layoutRankMap([c('a', 'F'), c('b', 'E', ['a']), c('c', 'E', ['a', 'b'])]);
    const e = map.edges.find((x) => x.from === 'b' && x.to === 'c')!;
    expect(e.sameRow).toBe(true);
    expect(e.points[1]).toBe(map.nodes.b.y);
    expect(e.points[3]).toBe(map.nodes.c.y);
  });
});
