// What to do next (VISION §22, §23, §24, §38): due retests first, step back to a missing
// prerequisite, otherwise the weakest relevant link, with the evidence type it still lacks.

import { tierIndex, type Competency } from '../lib/types';
import { isDue, isIndependentPass, isMastered, newCompetencyState, predictedSuccess, status } from './mastery';
import type { EvidenceType, SkillState } from './types';

export interface QuestPlan {
  competencyId: string;
  evidenceType: EvidenceType;
  retest: boolean;
  reason: 'retest' | 'step_back' | 'weakest_link' | 'extra_training';
}

/** Order in which a competency collects evidence: recognize it, build it, explain it, fix it, transfer it. */
export const EVIDENCE_LADDER: EvidenceType[] = ['recognition', 'production', 'explanation', 'debugging', 'transfer'];
const RETEST_TYPES: EvidenceType[] = ['recall', 'production', 'transfer', 'debugging'];

export function nextEvidenceType(skill: SkillState, c: Competency): EvidenceType {
  const s = skill.competencies[c.id] ?? newCompetencyState();
  const passed = new Set(s.evidence.filter(isIndependentPass).map((e) => e.type));
  const recentFails = s.evidence.slice(-2).filter((e) => !e.passed).length;
  // Two recent failures: drop to an easier kind of evidence instead of repeating the wall.
  if (recentFails >= 2 && !passed.has('recognition')) return 'recognition';
  return EVIDENCE_LADDER.find((t) => !passed.has(t)) ?? 'transfer';
}

export function dueRetests(skill: SkillState, now: number): Competency[] {
  return skill.pack.competencies
    .filter((c) => isDue(skill.competencies[c.id] ?? newCompetencyState(), now))
    .sort((a, b) => (skill.competencies[a.id].nextReviewAt ?? 0) - (skill.competencies[b.id].nextReviewAt ?? 0));
}

export function planNext(skill: SkillState, now: number, opts: { forceRetest?: boolean } = {}): QuestPlan | null {
  const { pack } = skill;
  const byId = new Map(pack.competencies.map((c) => [c.id, c]));

  const due = dueRetests(skill, now);
  if (due.length) {
    const c = due[0];
    const s = skill.competencies[c.id];
    const count = s.evidence.filter((e) => e.retest).length;
    return { competencyId: c.id, evidenceType: RETEST_TYPES[count % RETEST_TYPES.length], retest: true, reason: 'retest' };
  }
  if (opts.forceRetest) {
    // Penalty quest: retest the proven competency whose review is closest.
    const reviewed = pack.competencies
      .filter((c) => skill.competencies[c.id]?.firstSuccessAt != null)
      .sort((a, b) => (skill.competencies[a.id].nextReviewAt ?? 0) - (skill.competencies[b.id].nextReviewAt ?? 0));
    if (reviewed.length) return { competencyId: reviewed[0].id, evidenceType: 'recall', retest: true, reason: 'retest' };
  }

  // Step back: the evaluator found a missing prerequisite on the most recent failure.
  let latest: { at: number; missing: string } | null = null;
  for (const [, s] of Object.entries(skill.competencies)) {
    const last = s.evidence[s.evidence.length - 1];
    if (s.missingPrerequisite && last && !last.passed && (!latest || last.at > latest.at)) {
      latest = { at: last.at, missing: s.missingPrerequisite };
    }
  }
  if (latest && byId.has(latest.missing)) {
    const pre = byId.get(latest.missing)!;
    if (!isMastered(skill.competencies[pre.id] ?? newCompetencyState(), pre.tier)) {
      return { competencyId: pre.id, evidenceType: nextEvidenceType(skill, pre), retest: false, reason: 'step_back' };
    }
  }

  // Weakest relevant link: lowest tier first, then lowest predicted success, then most unlocks.
  const dependents = (id: string) => pack.competencies.filter((c) => c.prerequisites.includes(id)).length;
  const candidates = pack.competencies.filter((c) => {
    const st = status(pack, skill.competencies, c, now);
    return st === 'available' || st === 'training';
  });
  if (candidates.length) {
    candidates.sort((a, b) => {
      const t = tierIndex(a.tier) - tierIndex(b.tier);
      if (t) return t;
      const pa = predictedSuccess((skill.competencies[a.id] ?? newCompetencyState()).ability, a.tier);
      const pb = predictedSuccess((skill.competencies[b.id] ?? newCompetencyState()).ability, b.tier);
      if (pa !== pb) return pa - pb;
      return dependents(b.id) - dependents(a.id) || a.id.localeCompare(b.id);
    });
    const c = candidates[0];
    return { competencyId: c.id, evidenceType: nextEvidenceType(skill, c), retest: false, reason: 'weakest_link' };
  }

  // Everything open is proven: extra transfer training on the proven competency that is not yet mastered.
  const proven = pack.competencies.find((c) => status(pack, skill.competencies, c, now) === 'proven');
  if (proven) return { competencyId: proven.id, evidenceType: 'transfer', retest: false, reason: 'extra_training' };
  return null;
}
