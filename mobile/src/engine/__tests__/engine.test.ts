import { describe, expect, it } from 'vitest';

import bundle from '../../data/bundle.json';
import type { Pack } from '../../lib/types';
import { DAY, isMastered, isProven, masteryPercent, newCompetencyState, predictedSuccess, status } from '../mastery';
import { planNext } from '../planner';
import { applyPlacement, createPlayer, recordResult, rollDaily, startSkill, type QuestResult } from '../player';
import { levelFromXp, questXp, rankInfo, stats } from '../progression';
import type { Player } from '../types';

const packs = (bundle as unknown as { packs: Record<string, Pack> }).packs;
const T0 = new Date(2026, 8, 1, 10).getTime();

function fresh(packId = 'sql'): Player {
  return startSkill(createPlayer('Jin', T0), packs[packId], T0);
}

function pass(p: Player, competencyId: string, type: QuestResult['type'], at: number, extra: Partial<QuestResult> = {}) {
  return recordResult(
    p,
    { packId: 'sql', competencyId, type, score: 1, passed: true, hintLevel: 0, retest: false, cause: 'none', missingPrerequisite: null, questTitle: 'Q', ...extra },
    at,
  );
}

describe('learner model', () => {
  it('proves a competency after a few independent passes of different kinds, not one', () => {
    let p = fresh();
    p = pass(p, 'select.basic', 'production', T0).player;
    const s1 = p.skills.sql.competencies['select.basic'];
    expect(isProven(s1, 'F')).toBe(false); // one problem does not prove mastery (§17)

    let n = 1;
    const types = ['explanation', 'debugging', 'transfer', 'production'] as const;
    while (!isProven(p.skills.sql.competencies['select.basic'], 'F') && n < 10) {
      p = pass(p, 'select.basic', types[(n - 1) % types.length], T0 + n * 60_000).player;
      n += 1;
    }
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('needs a later retest to master (retention is part of mastery)', () => {
    let p = fresh();
    for (const [i, t] of (['production', 'explanation', 'debugging', 'transfer'] as const).entries()) {
      p = pass(p, 'select.basic', t, T0 + i * 1000).player;
    }
    const s = p.skills.sql.competencies['select.basic'];
    expect(isProven(s, 'F')).toBe(true);
    expect(isMastered(s, 'F')).toBe(false);
    expect(s.nextReviewAt).toBe(T0 + 2 * DAY);

    const early = pass(p, 'select.basic', 'recall', T0 + DAY, { retest: true }).player;
    expect(isMastered(early.skills.sql.competencies['select.basic'], 'F')).toBe(false);
    const later = pass(p, 'select.basic', 'recall', T0 + 2 * DAY, { retest: true }).player;
    expect(isMastered(later.skills.sql.competencies['select.basic'], 'F')).toBe(true);
    expect(masteryPercent(later.skills.sql.competencies['select.basic'], 'F')).toBe(100);
  });

  it('weights evidence by independence: a full solution proves nothing', () => {
    let p = fresh();
    for (let i = 0; i < 6; i++) p = pass(p, 'select.basic', 'production', T0 + i, { hintLevel: 6 }).player;
    const s = p.skills.sql.competencies['select.basic'];
    expect(s.ability).toBe(newCompetencyState().ability);
    expect(isProven(s, 'F')).toBe(false);
  });

  it('locks competencies behind unproven prerequisites', () => {
    const p = fresh();
    const pack = packs.sql;
    const where = pack.competencies.find((c) => c.id === 'filter.where')!;
    const select = pack.competencies.find((c) => c.id === 'select.basic')!;
    expect(status(pack, p.skills.sql.competencies, select, T0)).toBe('available');
    expect(status(pack, p.skills.sql.competencies, where, T0)).toBe('locked');
  });
});

describe('placement', () => {
  it('gives recognition evidence and prerequisite credit but never proves or ranks', () => {
    let p = fresh();
    p = applyPlacement(p, 'sql', [
      { competencyId: 'join.inner', correct: true },
      { competencyId: 'aggregate.basic', correct: false },
    ], T0);
    const where = p.skills.sql.competencies['filter.where'];
    expect(predictedSuccess(where.ability)).toBeGreaterThan(predictedSuccess(newCompetencyState().ability));
    expect(p.skills.sql.assessed).toBe(true);
    expect(rankInfo(p.skills.sql).rank).toBeNull();
    expect(p.skills.sql.competencies['join.inner'].firstSuccessAt).toBeNull();
  });
});

describe('rank', () => {
  it('ranks up only when every F competency is mastered, and emits the event', () => {
    let p = fresh();
    const fComps = packs.sql.competencies.filter((c) => c.tier === 'F').map((c) => c.id);
    for (const id of fComps) {
      for (const [i, t] of (['production', 'explanation', 'debugging', 'transfer'] as const).entries()) {
        p = pass(p, id, t, T0 + i * 1000).player;
      }
    }
    expect(rankInfo(p.skills.sql).rank).toBeNull();
    let events: string[] = [];
    for (const id of fComps) {
      const r = pass(p, id, 'recall', T0 + 3 * DAY, { retest: true });
      p = r.player;
      events = events.concat(r.events.map((e) => e.kind));
    }
    expect(rankInfo(p.skills.sql).rank).toBe('F');
    expect(events).toContain('rank_up');
    expect(p.skills.sql.bestRank).toBe('F');
  });

  it('never ranks above the verified ceiling', () => {
    const info = rankInfo(fresh('japanese').skills.japanese);
    expect(info.rank).toBeNull();
    expect(info.next).toBe('F');
  });
});

describe('xp and level', () => {
  it('pays for independence and difficulty, nothing for failure, little for grinding', () => {
    const base = { tier: 'D' as const, type: 'production' as const, score: 1, passed: true, retest: false, alreadyMastered: false };
    const solo = questXp({ ...base, hintLevel: 0 });
    expect(questXp({ ...base, hintLevel: 3 })).toBeLessThan(solo);
    expect(questXp({ ...base, hintLevel: 6 })).toBe(0);
    expect(questXp({ ...base, hintLevel: 0, passed: false })).toBe(0);
    expect(questXp({ ...base, hintLevel: 0, alreadyMastered: true })).toBeLessThan(solo / 4);
    expect(questXp({ ...base, tier: 'F', hintLevel: 0 })).toBeLessThan(solo);
  });

  it('levels up with a notification', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelFromXp(100).level).toBe(2);
    let p = fresh();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = pass(p, 'select.basic', 'transfer', T0 + i);
      p = r.player;
      seen.push(...r.events.map((e) => e.kind));
    }
    expect(seen).toContain('level_up');
  });

  it('builds stats from independent passes only', () => {
    let p = fresh();
    p = pass(p, 'select.basic', 'debugging', T0).player;
    p = pass(p, 'select.basic', 'transfer', T0 + 1, { hintLevel: 4 }).player;
    const s = stats(Object.values(p.skills));
    expect(s.AGI).toBe(11);
    expect(s.PER).toBe(10);
  });
});

describe('planner', () => {
  it('starts at the weakest foundation with recognition, then asks for production', () => {
    let p = fresh();
    const first = planNext(p.skills.sql, T0)!;
    expect(first.competencyId).toBe('select.basic');
    expect(first.evidenceType).toBe('recognition');
    p = pass(p, 'select.basic', 'recognition', T0).player;
    expect(planNext(p.skills.sql, T0)!.evidenceType).toBe('production');
  });

  it('serves due retests first', () => {
    let p = fresh();
    p = pass(p, 'select.basic', 'production', T0).player;
    expect(planNext(p.skills.sql, T0 + DAY)!.retest).toBe(false);
    const plan = planNext(p.skills.sql, T0 + 2 * DAY)!;
    expect(plan).toMatchObject({ competencyId: 'select.basic', retest: true, reason: 'retest' });
  });

  it('steps back to a missing prerequisite after a diagnosed failure', () => {
    let p = fresh();
    p = recordResult(p, {
      packId: 'sql', competencyId: 'join.inner', type: 'production', score: 0.2, passed: false, hintLevel: 0,
      retest: false, cause: 'missing_prerequisite', missingPrerequisite: 'filter.where', questTitle: 'Q',
    }, T0).player;
    expect(planNext(p.skills.sql, T0)).toMatchObject({ competencyId: 'filter.where', reason: 'step_back' });
  });
});

describe('daily quest', () => {
  it('counts passes, completes, and issues a penalty after a missed day', () => {
    let p = fresh();
    const events: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = pass(p, 'select.basic', 'production', T0 + i);
      p = r.player;
      events.push(...r.events.map((e) => e.kind));
    }
    expect(events).toContain('daily_complete');
    expect(p.daily.streak).toBe(1);

    const nextDay = rollDaily(p, T0 + DAY);
    expect(nextDay.player.daily.penaltyPending).toBe(false);
    const skipped = rollDaily(nextDay.player, T0 + 2 * DAY);
    expect(skipped.player.daily.penaltyPending).toBe(true);
    expect(skipped.events.map((e) => e.kind)).toEqual(['penalty_issued']);
    expect(skipped.player.daily.streak).toBe(0);

    const plan = planNext(skipped.player.skills.sql, T0 + 2 * DAY, { forceRetest: true })!;
    expect(plan.retest).toBe(true);
    const cleared = pass(skipped.player, plan.competencyId, 'recall', T0 + 2 * DAY + 1, { retest: true });
    expect(cleared.events.map((e) => e.kind)).toContain('penalty_cleared');
    expect(cleared.player.daily.penaltyPending).toBe(false);
  });
});
