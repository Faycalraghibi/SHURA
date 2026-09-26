// Learner model (VISION §16, §17, §21, §23, §24). Deterministic: the AI never writes these values.

import { type Competency, type Pack, type Tier } from '../lib/types';
import type { CompetencyState, CompetencyStatus, EvidenceRecord, EvidenceType } from './types';

export const DAY = 24 * 60 * 60 * 1000;

// Ability is measured relative to the competency's own tier: 0 means a 50% chance of passing a
// typical quest at that tier. Every competency starts below that.
export const START_ABILITY = -200;
export const PROVEN_P = 0.65;
export const RETEST_GAP_DAYS = 2;

/** How strongly each kind of evidence counts (recognition is weak, transfer is strong). */
export const TYPE_WEIGHT: Record<EvidenceType, number> = {
  recognition: 0.3,
  recall: 0.5,
  explanation: 0.6,
  modification: 0.8,
  debugging: 0.9,
  production: 1.0,
  transfer: 1.2,
};

/** Evidence weight by the highest hint level seen before submitting (0 = none, 6 = full solution). */
export const INDEPENDENCE: number[] = [1.0, 0.8, 0.6, 0.45, 0.3, 0.15, 0];

export function newCompetencyState(): CompetencyState {
  return { ability: START_ABILITY, evidence: [], firstSuccessAt: null, stabilityDays: 1, nextReviewAt: null, missingPrerequisite: null };
}

export function predictedSuccess(ability: number, _tier?: Tier): number {
  return 1 / (1 + Math.pow(10, -ability / 400));
}

function kFactor(evidenceCount: number): number {
  return Math.max(64, 240 - 24 * evidenceCount);
}

export function isIndependentPass(e: EvidenceRecord): boolean {
  return e.passed && e.hintLevel <= 1;
}

/** Apply one graded attempt. Returns a new state; the input is not modified. */
export function applyEvidence(state: CompetencyState, tier: Tier, e: EvidenceRecord): CompetencyState {
  const w = TYPE_WEIGHT[e.type] * (INDEPENDENCE[Math.min(6, Math.max(0, e.hintLevel))] ?? 0);
  const p = predictedSuccess(state.ability, tier);
  const ability = state.ability + kFactor(state.evidence.length) * w * (e.score - p);
  const next: CompetencyState = { ...state, ability, evidence: [...state.evidence, e].slice(-60) };

  if (e.passed && e.hintLevel < 6) {
    if (next.firstSuccessAt === null) {
      next.firstSuccessAt = e.at;
      next.stabilityDays = RETEST_GAP_DAYS;
      next.nextReviewAt = e.at + RETEST_GAP_DAYS * DAY;
    } else if (e.retest) {
      next.stabilityDays = Math.min(120, state.stabilityDays * 2.5);
      next.nextReviewAt = e.at + next.stabilityDays * DAY;
    }
    next.missingPrerequisite = null;
  } else if (!e.passed && e.retest) {
    next.stabilityDays = Math.max(1, state.stabilityDays / 2);
    next.nextReviewAt = e.at + DAY;
  }
  return next;
}

export function isProven(state: CompetencyState, tier: Tier): boolean {
  if (predictedSuccess(state.ability, tier) < PROVEN_P) return false;
  const passes = state.evidence.filter(isIndependentPass);
  return passes.length >= 2 && new Set(passes.map((e) => e.type)).size >= 2;
}

/** Proven, and it held up in a retest at least RETEST_GAP_DAYS after the first success (§17, §24). */
export function isMastered(state: CompetencyState, tier: Tier): boolean {
  if (!isProven(state, tier) || state.firstSuccessAt === null) return false;
  const first = state.firstSuccessAt;
  return state.evidence.some((e) => e.retest && e.passed && e.hintLevel <= 1 && e.at - first >= RETEST_GAP_DAYS * DAY);
}

export function isDue(state: CompetencyState, now: number): boolean {
  return state.nextReviewAt !== null && state.nextReviewAt <= now && state.firstSuccessAt !== null;
}

export function status(pack: Pack, states: Record<string, CompetencyState>, c: Competency, now: number): CompetencyStatus {
  const s = states[c.id] ?? newCompetencyState();
  if (isMastered(s, c.tier)) return isDue(s, now) ? 'decaying' : 'mastered';
  if (isProven(s, c.tier)) return 'proven';
  const local = new Set(pack.competencies.map((x) => x.id));
  const locked = c.prerequisites.some((p) => {
    if (!local.has(p)) return false; // cross-pack prerequisites never lock
    const pc = pack.competencies.find((x) => x.id === p)!;
    const ps = states[p] ?? newCompetencyState();
    return !isProven(ps, pc.tier) && !isMastered(ps, pc.tier);
  });
  if (locked) return 'locked';
  return s.evidence.length ? 'training' : 'available';
}

/** 0..100 for skill bars: predicted success at the competency's tier, capped until it is proven. */
export function masteryPercent(state: CompetencyState | undefined, tier: Tier): number {
  const s = state ?? newCompetencyState();
  if (isMastered(s, tier)) return 100;
  const p = predictedSuccess(s.ability, tier);
  if (isProven(s, tier)) return 90;
  return Math.round(Math.min(p / PROVEN_P, 1) * 85);
}
