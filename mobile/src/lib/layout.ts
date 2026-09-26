// Pure layout of a rank map: tiers stacked bottom (F) to top (S), competencies spread across each
// tier row, ordered to keep prerequisite edges short. No React here so it is unit-tested.

import { TIERS, tierIndex, type Competency, type Tier } from './types';

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  hGap: number;
  rowGap: number;
  padding: number;
  labelWidth: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 132,
  nodeHeight: 64,
  hGap: 20,
  rowGap: 64,
  padding: 24,
  labelWidth: 44,
};

export interface NodePos {
  id: string;
  tier: Tier;
  x: number;
  y: number;
}

export interface Edge {
  from: string; // prerequisite
  to: string; // dependent
  points: [number, number, number, number];
  // Prerequisite on the same tier: drawn as an arc above the row instead of bottom to top.
  sameRow: boolean;
}

export interface RowPos {
  tier: Tier;
  y: number;
  height: number;
}

export interface MapLayout {
  width: number;
  height: number;
  nodes: Record<string, NodePos>;
  edges: Edge[];
  rows: RowPos[];
}

export function layoutRankMap(competencies: Competency[], opts: LayoutOptions = DEFAULT_LAYOUT): MapLayout {
  const ids = new Set(competencies.map((c) => c.id));
  const byTier = new Map<Tier, Competency[]>();
  for (const t of TIERS) byTier.set(t, []);
  for (const c of competencies) byTier.get(c.tier)!.push(c);

  // Only show tiers from F up to the highest tier that has competencies.
  const top = Math.max(0, ...competencies.map((c) => tierIndex(c.tier)));
  const shown = TIERS.slice(0, top + 1);
  const widest = Math.max(1, ...shown.map((t) => byTier.get(t)!.length));
  const rowWidth = widest * opts.nodeWidth + (widest - 1) * opts.hGap;
  const width = opts.padding * 2 + opts.labelWidth + rowWidth;
  const rowHeight = opts.nodeHeight + opts.rowGap;
  const height = opts.padding * 2 + shown.length * rowHeight - opts.rowGap;

  const nodes: Record<string, NodePos> = {};
  const rows: RowPos[] = [];
  const order = new Map<string, number>(); // horizontal centre of each placed node

  shown.forEach((tier, i) => {
    const y = height - opts.padding - opts.nodeHeight - i * rowHeight;
    rows.push({ tier, y, height: opts.nodeHeight });
    const row = [...byTier.get(tier)!];
    // Barycenter ordering: sit each node under the average position of its local prerequisites.
    const bary = (c: Competency) => {
      const xs = c.prerequisites.filter((p) => order.has(p)).map((p) => order.get(p)!);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
    };
    row.sort((a, b) => bary(a) - bary(b) || a.id.localeCompare(b.id));
    const used = row.length * opts.nodeWidth + Math.max(0, row.length - 1) * opts.hGap;
    const startX = opts.padding + opts.labelWidth + (rowWidth - used) / 2;
    row.forEach((c, j) => {
      const x = startX + j * (opts.nodeWidth + opts.hGap);
      nodes[c.id] = { id: c.id, tier, x, y };
      order.set(c.id, x + opts.nodeWidth / 2);
    });
  });

  const edges: Edge[] = [];
  for (const c of competencies) {
    for (const p of c.prerequisites) {
      if (!ids.has(p)) continue; // cross-pack prerequisites are listed, not drawn
      const a = nodes[p];
      const b = nodes[c.id];
      if (a.y === b.y) {
        // Top centre to top centre; drawn as an arc through the gap above the row so it never
        // crosses the nodes in between.
        edges.push({
          from: p,
          to: c.id,
          points: [a.x + opts.nodeWidth / 2, a.y, b.x + opts.nodeWidth / 2, b.y],
          sameRow: true,
        });
      } else {
        edges.push({
          from: p,
          to: c.id,
          points: [a.x + opts.nodeWidth / 2, a.y, b.x + opts.nodeWidth / 2, b.y + opts.nodeHeight],
          sameRow: false,
        });
      }
    }
  }
  return { width, height, nodes, edges, rows };
}

/** Transitive prerequisites of a competency (local ones only), for highlighting a path. */
export function prerequisiteClosure(competencies: Competency[], id: string): Set<string> {
  const byId = new Map(competencies.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.prerequisites ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next) || !byId.has(next)) continue;
    seen.add(next);
    stack.push(...byId.get(next)!.prerequisites);
  }
  return seen;
}

/** Scale that fits the whole map on screen, never zooming in past 1. */
export function fitScale(map: { width: number; height: number }, view: { width: number; height: number }): number {
  if (!view.width || !view.height) return 1;
  return Math.min(1, view.width / map.width, view.height / map.height);
}
