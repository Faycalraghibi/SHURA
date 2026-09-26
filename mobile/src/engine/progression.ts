// Rank, XP, level and stats (VISION §26, §27). XP measures progression; evidence determines mastery.

import { TIERS, tierIndex, type Pack, type Tier } from '../lib/types';
import { isIndependentPass, isMastered, isProven, newCompetencyState } from './mastery';
import type { EvidenceType, SkillState } from './types';

// ---------- rank ----------

export interface RankInfo {
  rank: Tier | null; // null = unranked: Rank F not yet proven
  next: Tier | null; // the rank being worked toward
  nextMastered: number;
  nextProven: number;
  nextTotal: number;
  capped: boolean; // the next rank is above what SHURA can verify for this skill
}

/** Rank R means every core competency at tiers F..R is mastered, and R is within the verified ceiling. */
export function rankInfo(skill: SkillState): RankInfo {
  const { pack, competencies } = skill;
  const ceilingIdx = pack.verified_ceiling ? tierIndex(pack.verified_ceiling) : -1;
  const top = Math.max(...pack.competencies.map((c) => tierIndex(c.tier)));
  const coreAt = (t: Tier) => {
    const all = pack.competencies.filter((c) => c.tier === t);
    const core = all.filter((c) => c.core);
    return core.length ? core : all;
  };
  let rank: Tier | null = null;
  for (const t of TIERS) {
    const i = tierIndex(t);
    if (i > ceilingIdx) break;
    if (i > top) {
      // S has no competencies of its own in most packs; it is earned by sustained mastery (later).
      break;
    }
    const comps = coreAt(t);
    if (!comps.length) break;
    const ok = comps.every((c) => isMastered(competencies[c.id] ?? newCompetencyState(), c.tier));
    if (!ok) break;
    rank = t;
  }
  const nextIdx = rank === null ? 0 : tierIndex(rank) + 1;
  const next = nextIdx <= Math.min(top, 6) ? TIERS[nextIdx] : null;
  const nextComps = next ? coreAt(next) : [];
  return {
    rank,
    next,
    nextMastered: nextComps.filter((c) => isMastered(competencies[c.id] ?? newCompetencyState(), c.tier)).length,
    nextProven: nextComps.filter((c) => isProven(competencies[c.id] ?? newCompetencyState(), c.tier)).length,
    nextTotal: nextComps.length,
    capped: next !== null && tierIndex(next) > ceilingIdx,
  };
}

// ---------- XP and level ----------

const TIER_XP: Record<Tier, number> = { F: 50, E: 80, D: 120, C: 180, B: 260, A: 360, S: 500 };
const TYPE_XP: Record<EvidenceType, number> = {
  recognition: 0.5,
  recall: 0.7,
  explanation: 0.9,
  modification: 1.0,
  debugging: 1.1,
  production: 1.2,
  transfer: 1.5,
};
const HINT_XP = [1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0];

/** XP for a quest. Failing earns nothing; grinding something already mastered earns little (§26). */
export function questXp(opts: {
  tier: Tier;
  type: EvidenceType;
  score: number;
  passed: boolean;
  hintLevel: number;
  retest: boolean;
  alreadyMastered: boolean;
}): number {
  if (!opts.passed) return 0;
  let xp = TIER_XP[opts.tier] * TYPE_XP[opts.type] * (HINT_XP[Math.min(6, opts.hintLevel)] ?? 0) * opts.score;
  if (opts.alreadyMastered && !opts.retest) xp *= 0.2;
  if (opts.retest) xp *= 1.2;
  return Math.round(xp);
}

export function xpForLevel(level: number): number {
  // XP needed to go from `level` to `level + 1`.
  return 100 + 60 * (level - 1);
}

export function levelFromXp(total: number): { level: number; into: number; needed: number } {
  let level = 1;
  let left = total;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level += 1;
  }
  return { level, into: left, needed: xpForLevel(level) };
}

// ---------- stats ----------

export interface Stats {
  INT: number; // understanding: recognition, recall
  STR: number; // production
  AGI: number; // debugging, modification
  PER: number; // transfer
  SEN: number; // explanation
  VIT: number; // retention: passed retests
}

export const STAT_INFO: Record<keyof Stats, string> = {
  INT: 'Understanding',
  STR: 'Production',
  AGI: 'Debugging',
  PER: 'Transfer',
  SEN: 'Explanation',
  VIT: 'Retention',
};

const STAT_OF: Record<EvidenceType, keyof Stats> = {
  recognition: 'INT',
  recall: 'INT',
  production: 'STR',
  debugging: 'AGI',
  modification: 'AGI',
  transfer: 'PER',
  explanation: 'SEN',
};

/** Stats come from independent passes only; the base is 10 like a fresh hunter. */
export function stats(skills: SkillState[]): Stats {
  const s: Stats = { INT: 10, STR: 10, AGI: 10, PER: 10, SEN: 10, VIT: 10 };
  for (const skill of skills) {
    for (const cs of Object.values(skill.competencies)) {
      for (const e of cs.evidence) {
        if (!isIndependentPass(e)) continue;
        if (e.retest) s.VIT += 1;
        else s[STAT_OF[e.type]] += 1;
      }
    }
  }
  return s;
}

export function packTopTier(pack: Pack): Tier {
  return TIERS[Math.max(...pack.competencies.map((c) => tierIndex(c.tier)))];
}
